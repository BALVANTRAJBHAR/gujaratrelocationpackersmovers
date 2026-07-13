import { useFocusEffect } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system/legacy';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Linking, Modal, Platform, Pressable, ScrollView, Share, ToastAndroid } from 'react-native';
import { Button, H2, Input, Text, XStack, YStack } from 'tamagui';

import { themes } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getRazorpayKeyId } from '@/lib/public-config';
import { createRazorpayOrder, verifyRazorpaySignature } from '@/lib/razorpay';
import { supabase } from '@/lib/supabase';

import { useSession } from '@/providers/session-provider';
import { useLocalSearchParams, useRouter } from 'expo-router';
import MobileDatePicker from '@/components/MobileDatePicker';
import { t } from '@/constants/typography';

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

const STATUS_STEPS: { key: string; label: string }[] = [
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
  scheduled_date?: string | null;
  scheduled_time?: string | null;
  labor_count?: number | null;
  fare_breakdown?: Record<string, any> | null;
  pickup_floor?: string | null;
  drop_floor?: string | null;
  pickup_lift_available?: boolean | null;
  drop_lift_available?: boolean | null;
  items_description?: string | null;
  vehicle_type_name?: string | null;
};

type Payment = {
  id: string;
  booking_id: string | null;
  amount: number | null;
  status: string | null;
  razorpay_payment_id: string | null;
  created_at: string;
};

type HomeServiceRow = {
  id: string;
  service_key: string;
  customer_name: string | null;
  customer_phone: string | null;
  state: string | null;
  city: string | null;
  locality: string | null;
  notes: string | null;
  preferred_date: string | null;
  preferred_time: string | null;
  status: string | null;
  created_at: string;
  payment_option: string | null;
  payment_status: string | null;
  advance_payment: number | null;
  provider_name: string | null;
};

const homeServiceRequestSelect =
  'id, service_key, customer_name, customer_phone, state, city, locality, notes, preferred_date, preferred_time, status, created_at, payment_option, payment_status, advance_payment, provider_name';

const homeServiceRequestBaseSelect =
  'id, service_key, customer_name, customer_phone, state, city, locality, notes, preferred_date, preferred_time, status, created_at, provider_name';

const isMissingHomeServicePaymentColumnError = (error: unknown) => {
  const message = String((error as any)?.message ?? error ?? '').toLowerCase();
  return message.includes('payment_option') || message.includes('payment_status') || message.includes('advance_payment');
};

const withHomeServicePaymentDefaults = (rows: unknown) =>
  (((rows as any) ?? []) as any[]).map((row) => ({
    payment_option: null,
    payment_status: null,
    advance_payment: null,
    ...row,
  })) as HomeServiceRow[];

type PropertyBookingRow = {
  id: string;
  property_id: string;
  status: string;
  message: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  created_at: string;
  properties: { title: string | null; price: number | null; city: string | null; locality: string | null } | null;
};

type PropertyRow = {
  id: string;
  listing_type: string;
  property_type: string | null;
  title: string | null;
  price: number | null;
  state: string | null;
  city: string | null;
  locality: string | null;
  status: string;
  created_at: string;
};

const homeServiceLabel = (key: string) => {
  const k = String(key ?? '').toLowerCase();
  if (k === 'ac') return 'AC';
  if (k === 'carpenter') return 'Carpenter';
  if (k === 'electrician') return 'Electrician';
  if (k === 'plumber') return 'Plumber';
  if (k === 'pest') return 'Pest Control';
  if (k === 'cleaning') return 'Deep Cleaning';
  if (k === 'painting') return 'Painting';
  if (k === 'ro') return 'RO Service';
  return key;
};

const STATUS_COLORS_HS: Record<string, string> = {
  pending: '#F97316',
  assigned: '#3B82F6',
  completed: '#10B981',
  cancelled: '#EF4444',
  paid: '#10B981',
};

export default function BookingsScreen() {
  const router = useRouter();
  const { session, loading } = useSession();
  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace('/auth/login?redirectTo=/(tabs)/bookings' as any);
    }
  }, [loading, session, router]);
  if (loading || !session) return null;
  return <BookingsContent />;
}

function BookingsContent() {
  const router = useRouter();
  const params = useLocalSearchParams<{ toastBookingId?: string }>();
  const sharePdf = async (data: any) => {
    try {
      const { shareBookingPdf } = await import('@/lib/generate-booking-pdf');
      await shareBookingPdf(data);
    } catch {}
  };
  const { session, profile } = useSession();
  const colorScheme = useColorScheme();
  const [activeTab, setActiveTab] = useState<'shifting' | 'home_services' | 'properties'>('shifting');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorBookings, setErrorBookings] = useState<string | null>(null);
  const [paymentInfo, setPaymentInfo] = useState<Record<string, string>>({});
  const [paymentHistory, setPaymentHistory] = useState<Record<string, Payment[]>>({});
  const [statusFilter, setStatusFilter] = useState<'all' | 'not_started' | 'pickup_reached' | 'in_transit' | 'delivered'>('all');
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
  const [homeServiceItems, setHomeServiceItems] = useState<HomeServiceRow[]>([]);
  const [hsSearch, setHsSearch] = useState('');
  const [propertyBookings, setPropertyBookings] = useState<PropertyBookingRow[]>([]);
  const [myProperties, setMyProperties] = useState<PropertyRow[]>([]);
  const [propertySection, setPropertySection] = useState<'booked' | 'my_listings'>('booked');
  const [pbBusyId, setPbBusyId] = useState<string | null>(null);
  const fetchSeqRef = useRef(0);
  const theme = colorScheme === 'dark' ? themes.dark : themes.light;

  const role = String(profile?.role ?? 'customer').toLowerCase().trim();
  const providerSubtype = String((session?.user?.user_metadata as any)?.provider_subtype ?? '').toLowerCase().trim();

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
                fontSize={t(12)}
                paddingHorizontal={10}
                paddingVertical={6}
                borderRadius={999}
                backgroundColor={isActive ? theme.accent : theme.bgCardSecondary}
                color={isActive ? '#FFFFFF' : theme.textMuted}>
                {step.label}
              </Text>
              {idx !== STATUS_STEPS.length - 1 ? (
                <Text color={theme.textMuted} fontSize={t(13)}>
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
    setErrorBookings(null);

    const seq = ++fetchSeqRef.current;

    const run = async () =>
      await supabase
        .from('bookings')
        .select(
          'id, pickup_address, drop_address, distance_km, status, payment_status, driver_id, pickup_otp, delivery_otp, pickup_verified_at, delivered_verified_at, estimated_price, advance_amount, remaining_amount, created_at, updated_at, scheduled_date, scheduled_time, labor_count, fare_breakdown, pickup_floor, drop_floor, pickup_lift_available, drop_lift_available, items_description'
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
      setErrorBookings(msg === 'timeout' ? 'Booking loading timeout. Please check internet and try again.' : msg);
      return;
    }

    if (seq !== fetchSeqRef.current) return;

    const { data, error: fetchError } = resp as { data: any; error: any };

    if (fetchError) {
      if (!String(fetchError.message ?? '').includes('AbortError')) {
        setErrorBookings(fetchError.message);
      }
      return;
    }

    setBookings((data ?? []) as any);
  };

  const fetchHomeServiceRequests = async () => {
    if (!session?.user?.id) return;
    try {
      let { data, error: fetchError } = await supabase
        .from('home_service_requests')
        .select(homeServiceRequestSelect)
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(60);
      if (fetchError && isMissingHomeServicePaymentColumnError(fetchError)) {
        const fallback = await supabase
          .from('home_service_requests')
          .select(homeServiceRequestBaseSelect)
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(60);
        data = fallback.data;
        fetchError = fallback.error;
      }
      if (fetchError) return;
      setHomeServiceItems(withHomeServicePaymentDefaults(data));
    } catch {
      // ignore
    }
  };

  const fetchPropertyBookings = async () => {
    if (!session?.user?.id) return;
    try {
      const isOwner = role === 'provider' && providerSubtype === 'property_owner';
      let query = supabase
        .from('property_bookings')
        .select('id, property_id, status, message, contact_name, contact_phone, created_at, properties(title, price, city, locality)');
      if (role === 'admin') {
        // admins see all
      } else if (isOwner) {
        query = query.eq('owner_user_id', session.user.id);
      } else {
        query = query.eq('user_id', session.user.id);
      }
      const { data, error: fetchError } = await query.order('created_at', { ascending: false }).limit(60);
      if (fetchError) return;
      setPropertyBookings(((data as any) ?? []) as PropertyBookingRow[]);
    } catch {
      // ignore
    }
  };

  const fetchMyProperties = async () => {
    if (!session?.user?.id) return;
    try {
      const { data, error: fetchError } = await supabase
        .from('properties')
        .select('id, listing_type, property_type, title, price, state, city, locality, status, created_at')
        .eq('owner_user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(60);
      if (fetchError) return;
      setMyProperties(((data as any) ?? []) as PropertyRow[]);
    } catch {
      // ignore
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (!session?.user?.id) return;
      setLoading(true);
      const run = async () => {
        await Promise.all([fetchBookings(), fetchHomeServiceRequests(), fetchPropertyBookings(), fetchMyProperties()]);
      };
      void run().finally(() => setLoading(false));
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
    setErrorBookings(null);
    setLoading(true);
    const payload: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    const nextRescheduleDate = rescheduleOverride ?? rescheduleDate;
    if (status === 'rescheduled' && !nextRescheduleDate) {
      setErrorBookings('Please provide reschedule date (YYYY-MM-DD).');
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
      setErrorBookings(updateError.message);
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
        setErrorBookings(paymentError.message);
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
        name: 'Gujarat Relocation PackersMovers',
        description: 'Advance payment',
        order_id: order.id,
        prefill: {
          name: 'Customer',
        },
        theme: { color: theme.accent },
      };

      const RazorpayCheckout = (await import('react-native-razorpay')).default;
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

  const renderShiftingSection = () => (
    <>
      <YStack gap="$2" alignItems="center">
        <H2 color={theme.text} textAlign="center">Your active moves</H2>
      </YStack>
      <YStack gap="$2">
        <XStack gap="$2" flexWrap="wrap" alignItems="center">
          {Platform.OS === 'web' ? (
            <YStack
              backgroundColor={theme.bgCardSecondary}
              borderColor={theme.border}
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
                  color: theme.inputText,
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
                backgroundColor={theme.bgCardSecondary}
                borderColor={theme.border}
                color={theme.inputText}
              />
            </Pressable>
          )}
          {Platform.OS === 'web' ? (
            <YStack
              backgroundColor={theme.bgCardSecondary}
              borderColor={theme.border}
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
                  color: theme.inputText,
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
                backgroundColor={theme.bgCardSecondary}
                borderColor={theme.border}
                color={theme.inputText}
              />
            </Pressable>
          )}
          <Input
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search pickup/drop"
            backgroundColor={theme.bgCardSecondary}
            borderColor={theme.border}
            color={theme.inputText}
            minWidth={220}
            flexGrow={2}
            flexBasis={220}
          />
          <Button
            size="$2"
            backgroundColor={theme.bgCardSecondary}
            color={theme.text}
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
              backgroundColor={statusFilter === item.value ? theme.accent : theme.bgCardSecondary}
              color={statusFilter === item.value ? '#FFFFFF' : theme.inputText}
              borderRadius={999}
              onPress={() => setStatusFilter(item.value as typeof statusFilter)}>
              {item.label}
            </Button>
          )}
        />
        <MobileDatePicker value={startPickerValue} open={startDatePickerOpen} onClose={() => setStartDatePickerOpen(false)} onChange={(d) => { setStartDate(formatDate(d)); }} />
        <MobileDatePicker value={endPickerValue} open={endDatePickerOpen} onClose={() => setEndDatePickerOpen(false)} onChange={(d) => { setEndDate(formatDate(d)); }} />
      </YStack>
      {loading ? (
        <Text color={theme.textMuted}>Loading bookings...</Text>
      ) : errorBookings ? (
        <Text color="#FCA5A5">{errorBookings}</Text>
      ) : !filteredBookings.length ? (
        <YStack backgroundColor={theme.bgCardSecondary} borderRadius={18} padding={16} gap="$2" borderWidth={1} borderColor={theme.border}>
          <Text color={theme.text} fontWeight="800" fontSize={t(15)}>No moves found</Text>
          <Text color={theme.textMuted} fontSize={t(13)}>Try adjusting filters or create a new booking.</Text>
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
          <YStack backgroundColor={theme.bgCardSecondary} borderRadius={18} padding={16} gap="$2" borderWidth={1} borderColor={theme.border}>
            <XStack justifyContent="space-between" alignItems="center">
              <Text color={theme.text} fontWeight="700" fontSize={t(15)}>
                {item.pickup_address ?? 'Pickup'} → {item.drop_address ?? 'Drop'}
              </Text>
              <Text color={STATUS_COLORS[item.status ?? 'pending'] ?? theme.accent} fontSize={t(13)} textTransform="uppercase">
                {item.status ?? 'pending'}
              </Text>
            </XStack>
            {renderStatusStepper(item.status)}
            <XStack justifyContent="space-between" alignItems="center">
              <Text color={theme.textMuted} fontSize={t(13)}>Payment</Text>
              <Text color={PAYMENT_COLORS[item.payment_status ?? 'pending'] ?? theme.accent} fontSize={t(13)} textTransform="uppercase">
                {item.payment_status ?? 'pending'}
              </Text>
            </XStack>
            <XStack justifyContent="space-between" alignItems="center">
              <Text color={theme.textMuted} fontSize={t(13)}>Paid</Text>
              <Text color={theme.inputText} fontSize={t(13)} fontWeight="700">₹{Number(item.advance_amount ?? 0).toFixed(2)}</Text>
            </XStack>
            <XStack justifyContent="space-between" alignItems="center">
              <Text color={theme.textMuted} fontSize={t(13)}>Updated</Text>
              <Text color={theme.inputText} fontSize={t(13)}>
                {item.updated_at ? new Date(item.updated_at).toLocaleString() : new Date(item.created_at).toLocaleString()}
              </Text>
            </XStack>
            {item.driver_id ? (
              <XStack justifyContent="space-between" alignItems="center">
                <Text color={theme.textMuted} fontSize={t(13)}>Driver</Text>
                <Text color={theme.inputText} fontSize={t(13)}>{item.driver?.[0]?.name ?? 'Assigned'}</Text>
              </XStack>
            ) : null}
            {!item.pickup_verified_at && item.pickup_otp ? (
              <XStack justifyContent="space-between" alignItems="center">
                <Text color={theme.textMuted} fontSize={t(13)}>Pickup OTP</Text>
                <Text color={theme.inputText} fontSize={t(13)} fontWeight="700">{String(item.pickup_otp)}</Text>
              </XStack>
            ) : null}
            {item.pickup_verified_at && !item.delivered_verified_at && item.delivery_otp ? (
              <XStack justifyContent="space-between" alignItems="center">
                <Text color={theme.textMuted} fontSize={t(13)}>Delivery OTP</Text>
                <Text color={theme.inputText} fontSize={t(13)} fontWeight="700">{String(item.delivery_otp)}</Text>
              </XStack>
            ) : null}
            <XStack gap="$2" flexWrap="wrap">
              <Button size="$2" backgroundColor={theme.bgCardSecondary} color={theme.text} borderRadius={10}
                onPress={() => router.push({ pathname: '/(tabs)/tracking', params: { bookingId: item.id } } as any)}>Track</Button>
              <Button size="$2" backgroundColor={theme.bgCardSecondary} color={theme.text} borderRadius={10}
                onPress={async () => {
                  try { await Share.share({ message: `Tracking ID: ${String(item.id)}\n\nOpen the app and go to Track, then paste this ID to see live status and driver location.` }); }
                  catch { if (Platform.OS === 'android') ToastAndroid.show('Unable to share right now.', ToastAndroid.SHORT); }
                }}>Share ID</Button>
              <Button size="$2" backgroundColor={theme.accent} color="#FFFFFF" borderRadius={10}
                onPress={async () => {
                  try {
                    const ok = await sharePdf({
                      id: item.id,
                      pickup_address: item.pickup_address,
                      drop_address: item.drop_address,
                      distance_km: item.distance_km,
                      estimated_price: item.estimated_price,
                      advance_amount: item.advance_amount,
                      remaining_amount: item.remaining_amount,
                      status: item.status,
                      payment_status: item.payment_status,
                      scheduled_date: item.scheduled_date ?? null,
                      scheduled_time: item.scheduled_time ?? null,
                      labor_count: item.labor_count ?? null,
                      pickup_floor: item.pickup_floor ?? null,
                      drop_floor: item.drop_floor ?? null,
                      pickup_lift_available: item.pickup_lift_available ?? null,
                      drop_lift_available: item.drop_lift_available ?? null,
                      items_description: item.items_description ?? null,
                      fare_breakdown: item.fare_breakdown ?? null,
                      created_at: item.created_at,
                    });
                    if (!ok) Alert.alert('Error', 'Failed to generate PDF. Please try again.');
                  } catch { Alert.alert('Error', 'Failed to generate report.'); }
                }}>Download Report</Button>
              {item.status !== 'cancelled' && item.status !== 'rescheduled' ? (
                <>
                  <Button size="$2" backgroundColor={theme.danger} color="#FFFFFF" borderRadius={10}
                    onPress={() => confirmBookingUpdate(item.id, 'cancelled')}>Cancel</Button>
                  <Button size="$2" backgroundColor={theme.accent} color={'#FFFFFF'} borderRadius={10}
                    onPress={() => confirmBookingUpdate(item.id, 'rescheduled')}>Reschedule</Button>
                </>
              ) : null}
            </XStack>
            {item.status !== 'cancelled' && item.status !== 'rescheduled' ? (
              <>
                <Button size="$2" backgroundColor={theme.accent} color={'#FFFFFF'} borderRadius={10}
                  onPress={() => handleCreateOrder(item.id, Number(item.advance_amount ?? 500))}>Pay Advance</Button>
                <Button size="$2" backgroundColor={theme.bgCardSecondary} color={theme.text} borderRadius={10}
                  onPress={() => handleCreateOrder(item.id, Number(item.estimated_price ?? item.remaining_amount ?? 500))}>Pay Full</Button>
              </>
            ) : null}
            {paymentInfo[item.id] ? <Text color={theme.textMuted} fontSize={t(13)}>{paymentInfo[item.id]}</Text> : null}
            {paymentHistory[item.id]?.length ? (
              <YStack gap="$1">
                <Text color={theme.textMuted} fontSize={t(13)}>Payment history</Text>
                {paymentHistory[item.id].slice(0, 2).map((payment) => (
                  <Text key={payment.id} color={theme.inputText} fontSize={t(12)}>
                    {payment.status ?? 'pending'} • ₹{Number(payment.amount ?? 0).toFixed(2)} • {new Date(payment.created_at).toLocaleString()}
                  </Text>
                ))}
                <Button size="$2" backgroundColor={theme.bgCardSecondary} color={theme.text} borderRadius={10}
                  onPress={() => router.push({ pathname: '/modal', params: { bookingId: item.id } } as any)}>View all</Button>
              </YStack>
            ) : null}
          </YStack>
        )}
      />
      <MobileDatePicker value={reschedulePickerValue} open={!!reschedulePickerBookingId} onClose={() => setReschedulePickerBookingId(null)} onChange={(d) => {
        const bookingId = reschedulePickerBookingId;
        setReschedulePickerBookingId(null);
        const iso = d.toISOString();
        setRescheduleDate(iso);
        void updateBookingStatus(bookingId, 'rescheduled', iso);
      }} />
    </>
  );

  const renderHomeServicesSection = () => {
    const filtered = homeServiceItems.filter((x) => {
      const q = hsSearch.trim().toLowerCase();
      if (!q) return true;
      return homeServiceLabel(x.service_key ?? '').toLowerCase().includes(q)
        || String(x.status ?? '').toLowerCase().includes(q)
        || `${x.locality ?? ''} ${x.city ?? ''}`.toLowerCase().includes(q);
    });
    return (
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <YStack gap="$3">
          <H2 color={theme.text}>Home Service Requests</H2>
          <Input
            value={hsSearch}
            onChangeText={setHsSearch}
            placeholder="Search by service, status, or location"
            backgroundColor={theme.bgCardSecondary}
            borderColor={theme.border}
            color={theme.inputText}
          />
          {loading ? <Text color={theme.textMuted}>Loading...</Text> : null}
          {!filtered.length && !loading ? (
            <YStack backgroundColor={theme.bgCardSecondary} borderRadius={18} padding={16} borderWidth={1} borderColor={theme.border}>
              <Text color={theme.text} fontWeight="800">No requests found</Text>
              <Text color={theme.textMuted} fontSize={t(13)}>Request a home service from the Home Services tab.</Text>
            </YStack>
          ) : null}
          {filtered.map((r) => {
            const statusColor = STATUS_COLORS_HS[r.status ?? 'pending'] ?? theme.warning;
            const slot = `${r.preferred_date ?? '—'}${r.preferred_time ? ` • ${r.preferred_time}` : ''}`;
            const loc = [r.locality, r.city, r.state].filter(Boolean).join(', ') || '—';
            return (
              <YStack key={r.id} backgroundColor={theme.bgCardSecondary} borderRadius={18} padding={16} gap="$2" borderWidth={1} borderColor={theme.border}>
                <XStack justifyContent="space-between" alignItems="center">
                  <Text color={theme.text} fontWeight="700" fontSize={t(15)}>{homeServiceLabel(r.service_key ?? '')}</Text>
                  <Text color={statusColor} fontSize={t(13)} fontWeight="700" textTransform="uppercase">{r.status ?? 'pending'}</Text>
                </XStack>
                <Text color={theme.textMuted} fontSize={t(13)}>Location: {loc}</Text>
                <Text color={theme.textMuted} fontSize={t(13)}>Slot: {slot}</Text>
                {r.notes ? <Text color={theme.textMuted} fontSize={t(13)}>Notes: {r.notes}</Text> : null}
                {r.provider_name ? <Text color={theme.textMuted} fontSize={t(13)}>Provider: {r.provider_name}</Text> : null}
                {r.payment_option ? <Text color={theme.textMuted} fontSize={t(13)}>Payment: {r.payment_option}</Text> : null}
              </YStack>
            );
          })}
        </YStack>
      </ScrollView>
    );
  };

  const renderPropertiesSection = () => {
    const isOwner = role === 'provider' && providerSubtype === 'property_owner';
    const canToggle = role === 'customer' || isOwner;
    const tabs = [];
    const showBooked = propertySection === 'booked';
    const showListings = propertySection === 'my_listings';
    if (canToggle) {
      if (role === 'customer') tabs.push({ label: 'Booked / Inquired', value: 'booked' });
      if (role === 'customer') tabs.push({ label: 'My Properties', value: 'my_listings' });
      if (isOwner) tabs.push({ label: 'My Listings', value: 'my_listings' });
      if (isOwner) tabs.push({ label: 'Customer Bookings', value: 'booked' });
    }
    const handleCancelBooking = async (bookingId: string) => {
      setPbBusyId(bookingId);
      try {
        await supabase.from('property_bookings').update({ status: 'cancelled' }).eq('id', bookingId);
        await fetchPropertyBookings();
      } catch { /* ignore */ } finally { setPbBusyId(null); }
    };
    return (
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <YStack gap="$3">
          <H2 color={theme.text}>Properties</H2>
          {canToggle && tabs.length > 1 ? (
            <XStack gap="$2" flexWrap="wrap">
              {tabs.map((tab) => (
                <Button key={tab.value} size="$2"
                  backgroundColor={propertySection === tab.value ? theme.accent : theme.bgCardSecondary}
                  color={propertySection === tab.value ? '#FFFFFF' : theme.text} borderRadius={999}
                  onPress={() => setPropertySection(tab.value as typeof propertySection)}>{tab.label}</Button>              
              ))}
            </XStack>
          ) : null}
          {loading ? <Text color={theme.textMuted}>Loading...</Text> : null}
          {showBooked ? (
            <>
              {!propertyBookings.length && !loading ? (
                <YStack backgroundColor={theme.bgCardSecondary} borderRadius={18} padding={16} borderWidth={1} borderColor={theme.border}>
                  <Text color={theme.text} fontWeight="800">No bookings yet</Text>
                  <Text color={theme.textMuted} fontSize={t(13)}>Browse properties and send an inquiry.</Text>
                </YStack>
              ) : null}
              {propertyBookings.map((pb) => {
                const prop = pb.properties;
                const statusColor = STATUS_COLORS_HS[pb.status] ?? theme.warning;
                return (
                  <YStack key={pb.id} backgroundColor={theme.bgCardSecondary} borderRadius={18} padding={16} gap="$2" borderWidth={1} borderColor={theme.border}>
                    <XStack justifyContent="space-between" alignItems="center">
                      <YStack flex={1} gap={4}>
                        <Text color={theme.text} fontWeight="700" fontSize={t(15)}>{prop?.title ?? 'Property'}</Text>
                        <Text color={theme.textMuted} fontSize={t(13)}>
                          {[prop?.locality, prop?.city].filter(Boolean).join(', ') || '—'}
                        </Text>
                        {prop?.price != null ? (
                          <Text color={theme.success} fontWeight="600" fontSize={t(14)}>₹{Number(prop.price).toLocaleString('en-IN')}</Text>
                        ) : null}
                      </YStack>
                      <YStack alignItems="flex-end" gap={6}>
                        <Text color={statusColor} fontSize={t(13)} fontWeight="700" textTransform="uppercase">{pb.status}</Text>
                        <Text color={theme.textMuted} fontSize={t(12)}>{new Date(pb.created_at).toLocaleDateString()}</Text>
                      </YStack>
                    </XStack>
                    {(role === 'customer' || role === 'admin') && pb.status === 'pending' ? (
                      <XStack gap="$2">
                        <Button size="$2" backgroundColor={theme.danger} color="#FFFFFF" borderRadius={10}
                          disabled={pbBusyId === pb.id}
                          onPress={() => handleCancelBooking(pb.id)}>Cancel</Button>
                        <Button size="$2" backgroundColor={theme.accent} color="#FFFFFF" borderRadius={10}
                          onPress={() => router.push({ pathname: '/properties/[id]', params: { id: pb.property_id } } as any)}>View</Button>
                      </XStack>
                    ) : null}
                    {isOwner && pb.status === 'pending' ? (
                      <XStack gap="$2">
                        <Button size="$2" backgroundColor={theme.success} color="#FFFFFF" borderRadius={10}
                          disabled={pbBusyId === pb.id}
                          onPress={async () => {
                            setPbBusyId(pb.id);
                            try {
                              await supabase.from('property_bookings').update({ status: 'confirmed' }).eq('id', pb.id);
                              await fetchPropertyBookings();
                            } catch { /* ignore */ } finally { setPbBusyId(null); }
                          }}>Confirm</Button>
                        <Button size="$2" backgroundColor={theme.danger} color="#FFFFFF" borderRadius={10}
                          disabled={pbBusyId === pb.id}
                          onPress={() => handleCancelBooking(pb.id)}>Reject</Button>
                      </XStack>
                    ) : null}
                  </YStack>
                );
              })}
            </>
          ) : null}
          {showListings ? (
            <>
              <XStack gap="$2" flexWrap="wrap">
                <Button size="$2" backgroundColor={theme.accent} color="#FFFFFF" borderRadius={10}
                  onPress={() => router.push('/properties/post' as any)}>Post Property</Button>
              </XStack>
              {!myProperties.length && !loading ? (
                <YStack backgroundColor={theme.bgCardSecondary} borderRadius={18} padding={16} borderWidth={1} borderColor={theme.border}>
                  <Text color={theme.text} fontWeight="800">No properties listed</Text>
                  <Text color={theme.textMuted} fontSize={t(13)}>Post your first property listing.</Text>
                </YStack>
              ) : null}
              {myProperties.map((p) => (
                <YStack key={p.id} backgroundColor={theme.bgCardSecondary} borderRadius={18} padding={16} gap="$2" borderWidth={1} borderColor={theme.border}>
                  <XStack justifyContent="space-between" alignItems="center">
                    <YStack flex={1} gap={4}>
                      <Text color={theme.text} fontWeight="700" fontSize={t(15)}>{p.title ?? 'Property'}</Text>
                      <Text color={theme.textMuted} fontSize={t(13)}>{[p.locality, p.city, p.state].filter(Boolean).join(', ') || '—'}</Text>
                      {p.price != null ? <Text color={theme.success} fontWeight="600" fontSize={t(14)}>₹{Number(p.price).toLocaleString('en-IN')}</Text> : null}
                    </YStack>
                    <Text color={p.status === 'published' ? theme.success : theme.warning} fontSize={t(13)} fontWeight="700" textTransform="uppercase">{p.status}</Text>
                  </XStack>
                  <XStack gap="$2">
                    <Button size="$2" backgroundColor={theme.bgCardSecondary} color={theme.text} borderRadius={10}
                      onPress={() => router.push({ pathname: '/properties/[id]', params: { id: p.id } } as any)}>View</Button>
                    <Button size="$2" backgroundColor={theme.accent} color="#FFFFFF" borderRadius={10}
                      onPress={() => router.push('/properties/post' as any)}>Edit</Button>
                  </XStack>
                </YStack>
              ))}
            </>
          ) : null}
        </YStack>
      </ScrollView>
    );
  };

  return (
    <YStack flex={1} backgroundColor={theme.bg} padding={24}>
      <YStack width="100%" maxWidth={1100} alignSelf="center" gap="$4" flex={1} style={{ minHeight: 0 }}>
        <XStack gap="$2" flexWrap="wrap" justifyContent="center" marginBottom={8}>
          <Button size="$2"
            backgroundColor={activeTab === 'shifting' ? theme.accent : theme.bgCardSecondary}
            color={activeTab === 'shifting' ? '#FFFFFF' : theme.text} borderRadius={999}
            onPress={() => setActiveTab('shifting')}>Shifting</Button>
          <Button size="$2"
            backgroundColor={activeTab === 'home_services' ? theme.accent : theme.bgCardSecondary}
            color={activeTab === 'home_services' ? '#FFFFFF' : theme.text} borderRadius={999}
            onPress={() => setActiveTab('home_services')}>Home Services</Button>
          <Button size="$2"
            backgroundColor={activeTab === 'properties' ? theme.accent : theme.bgCardSecondary}
            color={activeTab === 'properties' ? '#FFFFFF' : theme.text} borderRadius={999}
            onPress={() => setActiveTab('properties')}>Properties</Button>
        </XStack>
        {activeTab === 'shifting' ? renderShiftingSection() : null}
        {activeTab === 'home_services' ? renderHomeServicesSection() : null}
        {activeTab === 'properties' ? renderPropertiesSection() : null}
      </YStack>
    </YStack>
  );
}
