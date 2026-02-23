import { useFocusEffect } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Platform, Pressable, Share, ToastAndroid } from 'react-native';
import RazorpayCheckout from 'react-native-razorpay';
import { Button, H2, Input, Text, XStack, YStack } from 'tamagui';

import DateTimePicker from '@/components/AppDateTimePicker';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getRazorpayKeyId } from '@/lib/public-config';
import { createRazorpayOrder, verifyRazorpaySignature } from '@/lib/razorpay';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';
import { useLocalSearchParams, useRouter } from 'expo-router';

const STATUS_COLORS: Record<string, string> = {
  not_started: '#94A3B8',
  pickup_reached: '#FACC15',
  in_transit: '#22C55E',
  delivered: '#10B981',
};

const PAYMENT_COLORS: Record<string, string> = {
  paid: '#10B981',
  pending: '#F97316',
  failed: '#EF4444',
};

const STATUS_STEPS: Array<{ key: string; label: string }> = [
  { key: 'not_started', label: 'Start' },
  { key: 'pickup_reached', label: 'Pickup reached' },
  { key: 'in_transit', label: 'In Transit' },
  { key: 'delivered', label: 'Delivered' },
];

const normalizeStepperStatus = (status: string | null) => {
  const s = String(status ?? '').trim();
  if (!s) return null;
  if (s === 'pending' || s === 'assigned') return 'not_started';
  return s;
};

type Booking = {
  id: string;
  pickup_address: string | null;
  drop_address: string | null;
  distance_km: number | null;
  status: string | null;
  payment_status: string | null;
  driver_id: string | null;
  driver: { name: string | null }[] | null;
  pickup_otp?: string | null;
  delivery_otp?: string | null;
  pickup_verified_at?: string | null;
  delivered_verified_at?: string | null;
  estimated_price: number | null;
  advance_amount: number | null;
  remaining_amount: number | null;
  created_at: string;
  updated_at?: string | null;
};

type Payment = {
  id: string;
  booking_id: string | null;
  amount: number | null;
  status: string | null;
  razorpay_payment_id: string | null;
  created_at: string;
};

export default function BookingsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ toastBookingId?: string }>();
  const { session } = useSession();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const pageBg = isDark ? '#0B0B12' : '#FFFFFF';
  const panelBg = isDark ? '#111827' : '#F3F4F6';
  const border = isDark ? '#1F2937' : '#E5E7EB';
  const titleColor = isDark ? '#F9FAFB' : '#111827';
  const muted = isDark ? '#94A3B8' : '#6B7280';
  const inputText = isDark ? '#E5E7EB' : '#111827';
  const idleBtnBg = isDark ? '#111827' : '#E5E7EB';
  const idleBtnText = isDark ? '#E5E7EB' : '#111827';
  const activeBtnBg = '#F97316';
  const activeBtnText = '#0B0B12';

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paymentInfo, setPaymentInfo] = useState<Record<string, string>>({});
  const [paymentHistory, setPaymentHistory] = useState<Record<string, Payment[]>>({});
  const [statusFilter, setStatusFilter] = useState<'all' | 'not_started' | 'pickup_reached' | 'in_transit' | 'delivered'>(
    'all'
  );
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [reschedulePickerBookingId, setReschedulePickerBookingId] = useState<string | null>(null);
  const [reschedulePickerValue, setReschedulePickerValue] = useState<Date>(new Date());
  const [startDatePickerOpen, setStartDatePickerOpen] = useState(false);
  const [endDatePickerOpen, setEndDatePickerOpen] = useState(false);
  const [startPickerValue, setStartPickerValue] = useState<Date>(new Date());
  const [endPickerValue, setEndPickerValue] = useState<Date>(new Date());
  const [searchText, setSearchText] = useState('');

  const fetchSeqRef = useRef(0);

  const withTimeout = async <T,>(promise: Promise<T>, ms: number) => {
    let t: any;
    const timeoutPromise = new Promise<T>((_resolve, reject) => {
      t = setTimeout(() => reject(new Error('timeout')), ms);
    });
    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (t) clearTimeout(t);
    }
  };

  const formatDate = (d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const renderStatusStepper = (status: string | null) => {
    const current = normalizeStepperStatus(status);
    const statusIndex = STATUS_STEPS.findIndex((s) => s.key === current);
    return (
      <XStack gap="$2" flexWrap="wrap" alignItems="center">
        {STATUS_STEPS.map((step, idx) => {
          const isActive = statusIndex >= idx && statusIndex !== -1;
          return (
            <XStack key={step.key} alignItems="center" gap="$2">
              <Text
                fontSize={11}
                paddingHorizontal={10}
                paddingVertical={6}
                borderRadius={999}
                backgroundColor={isActive ? activeBtnBg : panelBg}
                color={isActive ? activeBtnText : muted}>
                {step.label}
              </Text>
              {idx !== STATUS_STEPS.length - 1 ? (
                <Text color={muted} fontSize={12}>
                  —
                </Text>
              ) : null}
            </XStack>
          );
        })}
      </XStack>
    );
  };

  const filteredBookings = useMemo(() => {
    let items = bookings;
    items = items.filter((booking) => booking.status !== 'cancelled' && booking.status !== 'rescheduled');
    if (statusFilter !== 'all') {
      items = items.filter((booking) => normalizeStepperStatus(booking.status) === statusFilter);
    }
    if (startDate) {
      const start = new Date(`${startDate}T00:00:00.000Z`).getTime();
      items = items.filter((booking) => new Date(booking.created_at).getTime() >= start);
    }
    if (endDate) {
      const end = new Date(`${endDate}T23:59:59.999Z`).getTime();
      items = items.filter((booking) => new Date(booking.created_at).getTime() <= end);
    }
    if (searchText) {
      const search = searchText.toLowerCase();
      items = items.filter(
        (booking) =>
          booking.pickup_address?.toLowerCase().includes(search) ||
          booking.drop_address?.toLowerCase().includes(search)
      );
    }
    return items;
  }, [bookings, endDate, searchText, startDate, statusFilter]);

  const fetchBookings = async () => {
    if (!session?.user?.id) return;
    setError(null);

    const seq = ++fetchSeqRef.current;

    const run = async () =>
      await supabase
        .from('bookings')
        .select(
          'id, pickup_address, drop_address, distance_km, status, payment_status, driver_id, pickup_otp, delivery_otp, pickup_verified_at, delivered_verified_at, estimated_price, advance_amount, remaining_amount, created_at, updated_at'
        )
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(60);

    let resp: any;
    try {
      resp = await withTimeout(run(), 15000);
    } catch (e: any) {
      if (seq !== fetchSeqRef.current) return;
      const msg = String(e?.message ?? '');
      setError(msg === 'timeout' ? 'Booking loading timeout. Please check internet and try again.' : msg);
      return;
    }

    if (seq !== fetchSeqRef.current) return;

    const { data, error: fetchError } = resp as { data: any; error: any };

    if (fetchError) {
      if (!String(fetchError.message ?? '').includes('AbortError')) {
        setError(fetchError.message);
      }
      return;
    }

    setBookings((data ?? []) as any);
  };

  useFocusEffect(
    useCallback(() => {
      if (!session?.user?.id) return;
      setLoading(true);
      fetchBookings().finally(() => setLoading(false));
    }, [session?.user?.id])
  );

  useEffect(() => {
    const id = String(params.toastBookingId ?? '').trim();
    if (!id) return;
    if (Platform.OS === 'android') {
      ToastAndroid.show(`Booking confirmed: ${id}`, ToastAndroid.LONG);
    } else {
      Alert.alert('Booking confirmed', `Booking ID: ${id}`);
    }
    try {
      (router as any)?.setParams?.({ toastBookingId: undefined });
    } catch {
      // ignore
    }
  }, [params.toastBookingId, router]);

  const confirmBookingUpdate = (bookingId: string, status: 'cancelled' | 'rescheduled') => {
    if (status === 'rescheduled' && Platform.OS === 'web') {
      try {
        const nextDate = window.prompt('Reschedule date (YYYY-MM-DD)') ?? '';
        if (!nextDate) return;
        setRescheduleDate(nextDate);
        void updateBookingStatus(bookingId, status, nextDate);
        return;
      } catch {
        // ignore
      }
    }

    if (status === 'rescheduled' && Platform.OS !== 'web') {
      setReschedulePickerBookingId(bookingId);
      setReschedulePickerValue(new Date());
      return;
    }

    const title = status === 'cancelled' ? 'Cancel booking?' : 'Reschedule booking?';
    const message =
      status === 'cancelled'
        ? 'This will cancel your booking. You can create a new booking any time.'
        : 'This will update your booking date. Continue?';
    Alert.alert(title, message, [
      { text: 'No', style: 'cancel' },
      { text: 'Yes', style: 'destructive', onPress: () => updateBookingStatus(bookingId, status) },
    ]);
  };

  const updateBookingStatus = async (
    bookingId: string,
    status: 'cancelled' | 'rescheduled',
    rescheduleOverride?: string
  ) => {
    if (!session?.user?.id) return;
    setError(null);
    setLoading(true);
    const payload: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    const nextRescheduleDate = rescheduleOverride ?? rescheduleDate;
    if (status === 'rescheduled' && !nextRescheduleDate) {
      setError('Please provide reschedule date (YYYY-MM-DD).');
      setLoading(false);
      return;
    }
    if (status === 'rescheduled') payload.reschedule_date = nextRescheduleDate;

    const { error: updateError } = await supabase
      .from('bookings')
      .update(payload)
      .eq('id', bookingId)
      .eq('user_id', session.user.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      try {
        await supabase.functions.invoke('send-booking-status-push', {
          body: { booking_id: bookingId, status },
        });
      } catch {
        // ignore
      }
      await fetchBookings();
    }
    setLoading(false);
  };

  const createBookingsCsvFile = async () => {
    if (!filteredBookings.length) return;
    const headers = ['pickup', 'drop', 'distance_km', 'status', 'payment_status', 'created_at'];
    const rows = filteredBookings.map((booking) => [
      booking.pickup_address ?? '',
      booking.drop_address ?? '',
      booking.distance_km ?? '',
      booking.status ?? '',
      booking.payment_status ?? '',
      booking.created_at ?? '',
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    if (Platform.OS === 'web') {
      try {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `user-bookings-${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
      return;
    }

    const baseDir = (FileSystem as any).documentDirectory || (FileSystem as any).cacheDirectory || '';
    const uri = `${baseDir}user-bookings-${Date.now()}.csv`;
    await FileSystem.writeAsStringAsync(uri, csv, { encoding: 'utf8' as any });
    return uri;
  };

  const exportBookingsCsv = async () => {
    const uri = await createBookingsCsvFile();
    if (!uri) return;
    await Share.share({ url: uri, title: 'Your bookings report' });
  };

  const fetchPayments = async (bookingIds: string[]) => {
    if (!bookingIds.length) {
      setPaymentHistory({});
      return;
    }
    const { data, error: paymentError } = await supabase
      .from('payments')
      .select('id, booking_id, amount, status, razorpay_payment_id, created_at')
      .in('booking_id', bookingIds)
      .order('created_at', { ascending: false });

    if (paymentError) {
      if (!String(paymentError.message ?? '').includes('AbortError')) {
        setError(paymentError.message);
      }
      return;
    }

    const grouped: Record<string, Payment[]> = {};
    (data ?? []).forEach((payment) => {
      if (!payment.booking_id) return;
      if (!grouped[payment.booking_id]) grouped[payment.booking_id] = [];
      grouped[payment.booking_id].push(payment as Payment);
    });

    setPaymentHistory(grouped);
  };

  const handleCreateOrder = async (bookingId: string, amountRupees: number) => {
    try {
      setPaymentInfo((prev) => ({ ...prev, [bookingId]: 'Creating order…' }));
      const order = await createRazorpayOrder({
        amount: Math.round(amountRupees * 100),
        currency: 'INR',
        booking_id: bookingId,
      });

      const razorpayKeyId = await getRazorpayKeyId();

      const options = {
        key: razorpayKeyId,
        amount: order.amount,
        currency: order.currency,
        name: 'PackersMovers',
        description: 'Advance payment',
        order_id: order.id,
        prefill: {
          name: 'Customer',
        },
        theme: { color: '#F97316' },
      };

      const paymentData = await RazorpayCheckout.open(options);

      const valid = await verifyRazorpaySignature({
        order_id: order.id,
        payment_id: paymentData.razorpay_payment_id,
        signature: paymentData.razorpay_signature,
      });

      if (!valid) {
        setPaymentInfo((prev) => ({ ...prev, [bookingId]: 'Payment verification failed' }));
        return;
      }

      await supabase.from('payments').insert({
        booking_id: bookingId,
        user_id: session?.user?.id,
        amount: (order.amount ?? 0) / 100,
        status: 'paid',
        razorpay_order_id: order.id,
        razorpay_payment_id: paymentData.razorpay_payment_id,
        error: null,
        metadata: { razorpay_signature: paymentData.razorpay_signature },
      });

      await supabase.from('bookings').update({ payment_status: 'paid' }).eq('id', bookingId);

      setPaymentInfo((prev) => ({ ...prev, [bookingId]: `Paid ${paymentData.razorpay_payment_id}` }));
    } catch (err) {
      setPaymentInfo((prev) => ({ ...prev, [bookingId]: 'Payment cancelled/failed' }));
    }
  };

  useEffect(() => {
    if (!session?.user?.id) return;
    const channel = supabase
      .channel(`bookings-user-${session.user.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bookings', filter: `user_id=eq.${session.user.id}` },
        (payload) => {
          const next: any = (payload as any).new;
          const prev: any = (payload as any).old;
          const nextStatus = String(next?.status ?? '');
          const prevStatus = String(prev?.status ?? '');
          if (nextStatus && nextStatus !== prevStatus && (nextStatus === 'cancelled' || nextStatus === 'rescheduled')) {
            Alert.alert('Booking updated', `Your booking was ${nextStatus}.`);
          }
          void fetchBookings();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  useEffect(() => {
    const bookingIds = bookings.map((booking) => booking.id);
    if (!bookingIds.length) return;
    fetchPayments(bookingIds);
  }, [bookings]);

  return (
    <YStack flex={1} backgroundColor={pageBg} padding={24}>
      <YStack width="100%" maxWidth={1100} alignSelf="center" gap="$4" flex={1} style={{ minHeight: 0 }}>
        <YStack gap="$2" alignItems="center">
          <H2 color={titleColor} textAlign="center">Your active moves</H2>
        </YStack>

        <YStack gap="$2">
          <XStack gap="$2" flexWrap="wrap" alignItems="center">
            {Platform.OS === 'web' ? (
              <YStack
                backgroundColor={panelBg}
                borderColor={border}
                borderWidth={1}
                borderRadius={10}
                paddingHorizontal={12}
                paddingVertical={10}
                minWidth={170}
                flexGrow={1}
                flexBasis={170}>
                <input
                  value={startDate}
                  onChange={(e) => setStartDate((e.target as any).value)}
                  type="date"
                  style={{
                    width: '100%',
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: inputText,
                    outline: 'none',
                  }}
                />
              </YStack>
            ) : (
              <Pressable
                onPress={() => {
                  setStartPickerValue(startDate ? new Date(`${startDate}T00:00:00.000Z`) : new Date());
                  setStartDatePickerOpen(true);
                }}
                style={{ flexGrow: 1, flexBasis: 170, minWidth: 170 } as any}>
                <Input
                  value={startDate}
                  editable={false}
                  pointerEvents="none"
                  placeholder="Start date"
                  backgroundColor={panelBg}
                  borderColor={border}
                  color={inputText}
                />
              </Pressable>
            )}

            {Platform.OS === 'web' ? (
              <YStack
                backgroundColor={panelBg}
                borderColor={border}
                borderWidth={1}
                borderRadius={10}
                paddingHorizontal={12}
                paddingVertical={10}
                minWidth={170}
                flexGrow={1}
                flexBasis={170}>
                <input
                  value={endDate}
                  onChange={(e) => setEndDate((e.target as any).value)}
                  type="date"
                  style={{
                    width: '100%',
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: inputText,
                    outline: 'none',
                  }}
                />
              </YStack>
            ) : (
              <Pressable
                onPress={() => {
                  setEndPickerValue(endDate ? new Date(`${endDate}T00:00:00.000Z`) : new Date());
                  setEndDatePickerOpen(true);
                }}
                style={{ flexGrow: 1, flexBasis: 170, minWidth: 170 } as any}>
                <Input
                  value={endDate}
                  editable={false}
                  pointerEvents="none"
                  placeholder="End date"
                  backgroundColor={panelBg}
                  borderColor={border}
                  color={inputText}
                />
              </Pressable>
            )}
            <Input
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Search pickup/drop"
              backgroundColor={panelBg}
              borderColor={border}
              color={inputText}
              minWidth={220}
              flexGrow={2}
              flexBasis={220}
            />
            <Button
              size="$2"
              backgroundColor={idleBtnBg}
              color={idleBtnText}
              borderRadius={10}
              onPress={exportBookingsCsv}
              disabled={!filteredBookings.length}>
              Download report
            </Button>
          </XStack>

          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={[
              { label: 'All', value: 'all' },
              { label: 'Not started', value: 'not_started' },
              { label: 'Pickup reached', value: 'pickup_reached' },
              { label: 'Transit', value: 'in_transit' },
              { label: 'Delivered', value: 'delivered' },
            ]}
            keyExtractor={(item) => item.value}
            contentContainerStyle={{ gap: 8, paddingTop: 6, paddingBottom: 4 } as any}
            renderItem={({ item }) => (
              <Button
                size="$2"
                backgroundColor={statusFilter === item.value ? '#F97316' : panelBg}
                color={statusFilter === item.value ? '#0B0B12' : inputText}
                borderRadius={999}
                onPress={() => setStatusFilter(item.value as typeof statusFilter)}>
                {item.label}
              </Button>
            )}
          />

          {startDatePickerOpen ? (
            <DateTimePicker
              value={startPickerValue}
              mode="date"
              onChange={(_event, selected) => {
                if (!selected) {
                  setStartDatePickerOpen(false);
                  return;
                }
                setStartDate(formatDate(selected));
                setStartDatePickerOpen(false);
              }}
            />
          ) : null}

          {endDatePickerOpen ? (
            <DateTimePicker
              value={endPickerValue}
              mode="date"
              onChange={(_event, selected) => {
                if (!selected) {
                  setEndDatePickerOpen(false);
                  return;
                }
                setEndDate(formatDate(selected));
                setEndDatePickerOpen(false);
              }}
            />
          ) : null}

        </YStack>

        {loading ? (
          <Text color={muted}>Loading bookings...</Text>
        ) : error ? (
          <Text color="#FCA5A5">{error}</Text>
        ) : !filteredBookings.length ? (
          <YStack backgroundColor={panelBg} borderRadius={18} padding={16} gap="$2" borderWidth={1} borderColor={border}>
            <Text color={titleColor} fontWeight="800" fontSize={14}>
              No moves found
            </Text>
            <Text color={muted} fontSize={12}>
              Try adjusting filters or create a new booking.
            </Text>
          </YStack>
        ) : null}

        <FlatList
          data={filteredBookings}
          keyExtractor={(item) => item.id}
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
          contentContainerStyle={{ gap: 12, paddingBottom: 120 }}
          renderItem={({ item }) => (
            <YStack backgroundColor={panelBg} borderRadius={18} padding={16} gap="$2" borderWidth={1} borderColor={border}>
              <XStack justifyContent="space-between" alignItems="center">
                <Text color={titleColor} fontWeight="700" fontSize={14}>
                  {item.pickup_address ?? 'Pickup'} → {item.drop_address ?? 'Drop'}
                </Text>
                <Text
                  color={STATUS_COLORS[item.status ?? 'pending'] ?? '#F97316'}
                  fontSize={12}
                  textTransform="uppercase">
                  {item.status ?? 'pending'}
                </Text>
              </XStack>

              {renderStatusStepper(item.status)}

              <XStack justifyContent="space-between" alignItems="center">
                <Text color={muted} fontSize={12}>Payment</Text>
                <Text
                  color={PAYMENT_COLORS[item.payment_status ?? 'pending'] ?? '#F97316'}
                  fontSize={12}
                  textTransform="uppercase">
                  {item.payment_status ?? 'pending'}
                </Text>
              </XStack>
              <XStack justifyContent="space-between" alignItems="center">
                <Text color={muted} fontSize={12}>Paid</Text>
                <Text color={inputText} fontSize={12} fontWeight="700">
                  ₹{Number(item.advance_amount ?? 0).toFixed(2)}
                </Text>
              </XStack>
              <XStack justifyContent="space-between" alignItems="center">
                <Text color={muted} fontSize={12}>Updated</Text>
                <Text color={inputText} fontSize={12}>
                  {item.updated_at ? new Date(item.updated_at).toLocaleString() : new Date(item.created_at).toLocaleString()}
                </Text>
              </XStack>
              {item.driver_id ? (
                <XStack justifyContent="space-between" alignItems="center">
                  <Text color={muted} fontSize={12}>Driver</Text>
                  <Text color={inputText} fontSize={12}>
                    {item.driver?.[0]?.name ?? 'Assigned'}
                  </Text>
                </XStack>
              ) : null}

              {!item.pickup_verified_at && item.pickup_otp ? (
                <XStack justifyContent="space-between" alignItems="center">
                  <Text color={muted} fontSize={12}>Pickup OTP</Text>
                  <Text color={inputText} fontSize={12} fontWeight="700">
                    {String(item.pickup_otp)}
                  </Text>
                </XStack>
              ) : null}
              {item.pickup_verified_at && !item.delivered_verified_at && item.delivery_otp ? (
                <XStack justifyContent="space-between" alignItems="center">
                  <Text color={muted} fontSize={12}>Delivery OTP</Text>
                  <Text color={inputText} fontSize={12} fontWeight="700">
                    {String(item.delivery_otp)}
                  </Text>
                </XStack>
              ) : null}

              <XStack gap="$2" flexWrap="wrap">
                <Button
                  size="$2"
                  backgroundColor={idleBtnBg}
                  color={idleBtnText}
                  borderRadius={10}
                  onPress={() =>
                    router.push({
                      pathname: '/(tabs)/tracking',
                      params: { bookingId: item.id },
                    } as any)
                  }>
                  Track
                </Button>
                {item.status !== 'cancelled' && item.status !== 'rescheduled' ? (
                  <>
                    <Button
                      size="$2"
                      backgroundColor="#EF4444"
                      color="#0B0B12"
                      borderRadius={10}
                      onPress={() => confirmBookingUpdate(item.id, 'cancelled')}>
                      Cancel
                    </Button>
                    <Button
                      size="$2"
                      backgroundColor={activeBtnBg}
                      color={activeBtnText}
                      borderRadius={10}
                      onPress={() => confirmBookingUpdate(item.id, 'rescheduled')}>
                      Reschedule
                    </Button>
                  </>
                ) : null}
              </XStack>
              {item.status !== 'cancelled' && item.status !== 'rescheduled' ? (
                <>
                  <Button
                    size="$2"
                    backgroundColor={activeBtnBg}
                    color={activeBtnText}
                    borderRadius={10}
                    onPress={() => handleCreateOrder(item.id, Number(item.advance_amount ?? 500))}>
                    Pay Advance
                  </Button>
                  <Button
                    size="$2"
                    backgroundColor={idleBtnBg}
                    color={idleBtnText}
                    borderRadius={10}
                    onPress={() => handleCreateOrder(item.id, Number(item.estimated_price ?? item.remaining_amount ?? 500))}>
                    Pay Full
                  </Button>
                </>
              ) : null}
              {paymentInfo[item.id] ? (
                <Text color={muted} fontSize={12}>{paymentInfo[item.id]}</Text>
              ) : null}
              {paymentHistory[item.id]?.length ? (
                <YStack gap="$1">
                  <Text color={muted} fontSize={12}>Payment history</Text>
                  {paymentHistory[item.id].slice(0, 2).map((payment) => (
                    <Text key={payment.id} color={inputText} fontSize={11}>
                      {payment.status ?? 'pending'} • ₹{Number(payment.amount ?? 0).toFixed(2)} • {new Date(
                        payment.created_at
                      ).toLocaleString()}
                    </Text>
                  ))}
                  <Button
                    size="$2"
                    backgroundColor={idleBtnBg}
                    color={idleBtnText}
                    borderRadius={10}
                    onPress={() =>
                      router.push({
                        pathname: '/modal',
                        params: { bookingId: item.id },
                      } as any)
                    }>
                    View all
                  </Button>
                </YStack>
              ) : null}
            </YStack>
        )}
      />
      {reschedulePickerBookingId ? (
        <DateTimePicker
          value={reschedulePickerValue}
          mode="datetime"
          onChange={(_event, selected) => {
            if (!selected) {
              setReschedulePickerBookingId(null);
              return;
            }
            const bookingId = reschedulePickerBookingId;
            setReschedulePickerBookingId(null);
            const iso = selected.toISOString();
            setRescheduleDate(iso);
            void updateBookingStatus(bookingId, 'rescheduled', iso);
          }}
        />
      ) : null}
      </YStack>
    </YStack>
  );
}
