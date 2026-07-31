import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, ActivityIndicator, Linking, Platform, Pressable, ScrollView, View } from 'react-native';
import { Button, Input, Text, XStack, YStack } from 'tamagui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { themes } from '@/constants/theme';
import { createRazorpayOrder, verifyRazorpaySignature } from '@/lib/razorpay';
import { calculateConvenienceFee } from '@/lib/payment-convenience-fee';
import { getRazorpayKeyId } from '@/lib/public-config';
import { t } from '@/constants/typography';
import { formatDateDDMMYYYY, formatDateTimeDDMMYYYY } from '@/lib/date-format';


type HomeServiceRequestRow = {
  id: string;
  booking_number?: number | null;
  service_key: string;
  customer_name: string | null;
  customer_phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
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
  after_service_payment_method: string | null;
  cash_paid_at: string | null;
  cancelled_at: string | null;
  provider_id: string | null;
  provider_name: string | null;
};

const HOME_SERVICE_PAYMENT = calculateConvenienceFee(150);

type HomeServiceUploadRow = {
  id: string;
  request_id: string;
  file_url: string;
  file_type: string;
  file_name: string | null;
  file_size: number | null;
  created_at: string;
};

const labelForService = (key: string) => {
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

const homeServiceRequestSelect =
  'id, booking_number, service_key, customer_name, customer_phone, address_line1, address_line2, state, city, locality, notes, preferred_date, preferred_time, status, created_at, payment_option, payment_status, advance_payment, after_service_payment_method, cash_paid_at, cancelled_at, provider_id, provider_name';

const homeServiceRequestBaseSelect =
  'id, booking_number, service_key, customer_name, customer_phone, address_line1, address_line2, state, city, locality, notes, preferred_date, preferred_time, status, created_at, provider_id, provider_name';

const homeServiceRequestMinimalSelect =
  'id, booking_number, service_key, customer_name, customer_phone, address_line1, address_line2, state, city, locality, notes, preferred_date, preferred_time, status, created_at';

const isMissingColumnError = (error: unknown, column: string) => {
  const message = String((error as any)?.message ?? error ?? '').toLowerCase();
  return message.includes(column);
};

const withDefaults = (rows: unknown) =>
  (((rows as any) ?? []) as any[]).map((row) => ({
    payment_option: null,
    payment_status: null,
    advance_payment: null,
    after_service_payment_method: null,
    cash_paid_at: null,
    cancelled_at: null,
    provider_id: null,
    provider_name: null,
    ...row,
  })) as HomeServiceRequestRow[];

export default function MyHomeServiceRequestsScreen() {
  const colorScheme = useColorScheme(); const theme = colorScheme === 'dark' ? themes.dark : themes.light;
  const router = useRouter();
  const { session } = useSession();
  const insets = useSafeAreaInsets();
  const shareHomePdf = async (data: any): Promise<boolean> => {
    try {
      const { shareHomeServicePdf } = await import('@/lib/generate-home-service-pdf');
      return await shareHomeServicePdf(data);
    } catch {
      return false;
    }
  };
  const downloadHomePdf = async (data: any): Promise<boolean> => {
    try {
      const { downloadHomeServicePdf } = await import('@/lib/generate-home-service-pdf');
      return await downloadHomeServicePdf(data);
    } catch {
      return false;
    }
  };

  const [pdfBusy, setPdfBusy] = useState<{ id: string; action: 'download' | 'share' } | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<HomeServiceRequestRow[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [uploadsBusyId, setUploadsBusyId] = useState<string | null>(null);
  const [uploadsByRequest, setUploadsByRequest] = useState<Record<string, HomeServiceUploadRow[]>>({});

  const [searchText, setSearchText] = useState('');

  const fetchSeqRef = useRef(0);

  const filteredItems = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return items;
    return items.filter((x) => {
      const label = labelForService(x.service_key ?? '').toLowerCase();
      const status = String(x.status ?? '').toLowerCase();
      const loc = `${x.locality ?? ''} ${x.city ?? ''} ${x.state ?? ''}`.toLowerCase();
      return label.includes(q) || status.includes(q) || loc.includes(q);
    });
  }, [items, searchText]);

  const fetchRequests = async () => {
    if (!session?.user?.id) {
      router.replace('/auth/login' as any);
      return;
    }

    setError(null);
    setLoading(true);

    const seq = ++fetchSeqRef.current;

    const trySelect = async (select: string): Promise<{ data: any; error: any }> => {
      return supabase
        .from('home_service_requests')
        .select(select)
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(60);
    };

    try {
      let { data, error: fetchError } = await trySelect(homeServiceRequestSelect);

      if (fetchError && (isMissingColumnError(fetchError, 'payment_option') || isMissingColumnError(fetchError, 'payment_status') || isMissingColumnError(fetchError, 'advance_payment'))) {
        const fallback = await trySelect(homeServiceRequestBaseSelect);
        data = fallback.data;
        fetchError = fallback.error;
      }

      if (fetchError && (isMissingColumnError(fetchError, 'provider_id') || isMissingColumnError(fetchError, 'provider_name'))) {
        const fallback = await trySelect(homeServiceRequestMinimalSelect);
        data = fallback.data;
        fetchError = fallback.error;
      }

      if (seq !== fetchSeqRef.current) return;

      if (fetchError) {
        setError(fetchError.message);
        return;
      }

      setItems(withDefaults(data));
    } catch (e) {
      if (seq !== fetchSeqRef.current) return;
      setError(e instanceof Error ? e.message : 'Failed to load requests.');
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false);
    }
  };

  const fetchUploads = async (requestId: string) => {
    if (!requestId) return;
    setUploadsBusyId(requestId);
    try {
      const { data, error: fetchError } = await supabase
        .from('home_service_uploads')
        .select('id, request_id, file_url, file_type, file_name, file_size, created_at')
        .eq('request_id', requestId)
        .order('created_at', { ascending: false });

      if (fetchError) {
        setError(fetchError.message);
        return;
      }

      setUploadsByRequest((prev) => ({ ...prev, [requestId]: ((data as any) ?? []) as HomeServiceUploadRow[] }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load uploads.');
    } finally {
      setUploadsBusyId(null);
    }
  };

  useFocusEffect(
    useCallback(() => {
      void fetchRequests();
      return () => {
        fetchSeqRef.current += 1;
      };
    }, [session?.user?.id])
  );

  const pageBg = theme.bg;
  const panelBg = theme.bgSecondary;
  const panelBgStrong = theme.bgCard;
  const border = theme.border;
  const titleColor = theme.text;
  const muted = theme.textMuted;

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { total: items.length };
    for (const r of items) {
      const s = String(r.status ?? 'pending');
      counts[s] = (counts[s] ?? 0) + 1;
      if (r.payment_status === 'paid') counts.paid = (counts.paid ?? 0) + 1;
      else if (r.payment_status === 'pending') counts.unpaid = (counts.unpaid ?? 0) + 1;
    }
    return counts;
  }, [items]);

  const handlePayOnline = async (r: HomeServiceRequestRow) => {
    try {
      const order = await createRazorpayOrder({
        amount: Math.round(HOME_SERVICE_PAYMENT.finalPayable * 100),
        currency: 'INR',
        receipt: `hs_pst_${Date.now()}`,
        notes: { request_id: r.id, purpose: 'home_service_after_payment' },
      });

      const razorpayKeyId = await getRazorpayKeyId();
      if (!razorpayKeyId) {
        Alert.alert('Error', 'Payment gateway not configured.');
        return;
      }

      const RazorpayCheckout = require('react-native-razorpay').default;
      let paymentData: any;
      if (Platform.OS === 'web') {
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        await new Promise<void>((resolve, reject) => {
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Failed to load Razorpay'));
          document.body.appendChild(script);
        });
        const Razorpay = (window as any).Razorpay;
        paymentData = await new Promise((resolve, reject) => {
          const rz = new Razorpay({
            key: razorpayKeyId,
            amount: order.amount,
            currency: order.currency,
            name: 'PackersMovers',
            description: 'Home Service Payment',
            order_id: order.id,
            prefill: { name: r.customer_name ?? '', contact: r.customer_phone ?? '' },
            theme: { color: '#1F4E79' },
            handler: (resp: any) => resolve(resp),
            modal: { ondismiss: () => reject(new Error('Payment cancelled')) },
          });
          rz.open();
        });
      } else {
        paymentData = await RazorpayCheckout.open({
          key: razorpayKeyId,
          amount: order.amount,
          currency: order.currency,
          name: 'PackersMovers',
          description: 'Home Service Payment',
          order_id: order.id,
          prefill: { name: r.customer_name ?? '', contact: r.customer_phone ?? '' },
          theme: { color: '#1F4E79' },
        });
      }

      const valid = await verifyRazorpaySignature({
        order_id: order.id,
        payment_id: paymentData.razorpay_payment_id,
        signature: paymentData.razorpay_signature,
      });

      if (!valid) {
        Alert.alert('Error', 'Payment verification failed.');
        return;
      }

      await supabase.from('payments').insert({
        booking_id: null,
        user_id: session?.user?.id,
        amount: HOME_SERVICE_PAYMENT.finalPayable,
        status: 'paid',
        razorpay_order_id: order.id,
        razorpay_payment_id: paymentData.razorpay_payment_id,
        metadata: {
          request_id: r.id,
          purpose: 'home_service_after_payment',
          razorpay_signature: paymentData.razorpay_signature,
          booking_total: HOME_SERVICE_PAYMENT.bookingTotal,
          convenience_fee: HOME_SERVICE_PAYMENT.convenienceFee,
          final_payable: HOME_SERVICE_PAYMENT.finalPayable,
        },
      });

      await supabase
        .from('home_service_requests')
        .update({
          payment_status: 'paid',
          after_service_payment_method: 'online',
          advance_payment: HOME_SERVICE_PAYMENT.finalPayable,
        })
        .eq('id', r.id);

      Alert.alert('Paid', 'Payment successful!');
      await fetchRequests();
    } catch (e: any) {
      const msg = e?.message ?? 'Payment failed.';
      Alert.alert('Error', msg.toLowerCase().includes('cancel') ? 'Payment cancelled.' : msg);
    }
  };

  const handlePayCash = async (r: HomeServiceRequestRow) => {
    await supabase
      .from('home_service_requests')
      .update({ after_service_payment_method: 'cash' })
      .eq('id', r.id);
    Alert.alert('Cash Payment', 'Please pay the provider directly in cash after service.');
    await fetchRequests();
  };

  const handleCancel = async (r: HomeServiceRequestRow) => {
    const scheduleStr = r.preferred_date && r.preferred_time ? `${r.preferred_date} ${r.preferred_time}` : '';
    let oneHourBefore = false;
    if (scheduleStr) {
      const parts = r.preferred_date!.split('/');
      const timeParts = r.preferred_time!.split(':');
      if (parts.length === 3 && timeParts.length >= 2) {
        const sched = new Date(
          Number(parts[2]),
          Number(parts[1]) - 1,
          Number(parts[0]),
          Number(timeParts[0]),
          Number(timeParts[1])
        );
        const now = new Date();
        oneHourBefore = sched.getTime() - now.getTime() > 3600000;
      }
    }

    const message = oneHourBefore
      ? 'Cancel this request? No charge as it is more than 1 hour before the scheduled time.'
      : 'Cancel this request? A minimum charge of ₹150 will be paid to the provider for their travel.';

    Alert.alert('Cancel Request', message, [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, Cancel',
        style: 'destructive',
        onPress: async () => {
          const updates: any = {
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
            cancel_reason: 'Cancelled by customer',
          };
          if (!oneHourBefore && r.provider_id) {
            updates.payment_status = 'cancelled_with_charge';
          } else {
            updates.payment_status = 'cancelled_free';
          }
          await supabase.from('home_service_requests').update(updates).eq('id', r.id);
          Alert.alert('Cancelled', oneHourBefore ? 'Request cancelled successfully.' : 'Request cancelled. ₹150 will be charged.');
          await fetchRequests();
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: pageBg }}>
      <YStack backgroundColor="#1F4E79" padding={16} paddingTop={16 + insets.top}>
        <XStack alignItems="center" justifyContent="center" position="relative">
          <Button
            size="$3"
            chromeless
            color="#FFFFFF"
            position="absolute"
            left={0}
            fontSize={36}
            fontWeight="900"
            onPress={() => {
              router.back();
            }}>
            ‹
          </Button>
          <YStack alignItems="center">
            <Text color="#FFFFFF" fontSize={t(16)} fontWeight="800">
              My Home Service Requests
            </Text>
            <Text color={theme.textMuted} fontSize={t(12)} fontWeight="600">
              Track your requests
            </Text>
          </YStack>
        </XStack>
      </YStack>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <YStack gap="$3">
          <XStack gap="$2" flexWrap="wrap">
            <YStack backgroundColor={theme.bgCard} borderRadius={12} padding={10} minWidth={70} alignItems="center" borderWidth={1} borderColor={theme.border}>
              <Text color={theme.text} fontWeight="900" fontSize={t(16)}>{statusCounts.total ?? 0}</Text>
              <Text color={theme.textMuted} fontSize={t(10)}>Total</Text>
            </YStack>
            <YStack backgroundColor={theme.bgCard} borderRadius={12} padding={10} minWidth={70} alignItems="center" borderWidth={1} borderColor={theme.border}>
              <Text color={theme.warning} fontWeight="900" fontSize={t(16)}>{statusCounts.pending ?? 0}</Text>
              <Text color={theme.textMuted} fontSize={t(10)}>Pending</Text>
            </YStack>
            <YStack backgroundColor={theme.bgCard} borderRadius={12} padding={10} minWidth={70} alignItems="center" borderWidth={1} borderColor={theme.border}>
              <Text color={theme.success} fontWeight="900" fontSize={t(16)}>{statusCounts.completed ?? 0}</Text>
              <Text color={theme.textMuted} fontSize={t(10)}>Completed</Text>
            </YStack>
            <YStack backgroundColor={theme.bgCard} borderRadius={12} padding={10} minWidth={70} alignItems="center" borderWidth={1} borderColor={theme.border}>
              <Text color={theme.danger} fontWeight="900" fontSize={t(16)}>{statusCounts.cancelled ?? 0}</Text>
              <Text color={theme.textMuted} fontSize={t(10)}>Cancelled</Text>
            </YStack>
            <YStack backgroundColor={theme.bgCard} borderRadius={12} padding={10} minWidth={70} alignItems="center" borderWidth={1} borderColor={theme.border}>
              <Text color={theme.success} fontWeight="900" fontSize={t(16)}>{statusCounts.paid ?? 0}</Text>
              <Text color={theme.textMuted} fontSize={t(10)}>Paid</Text>
            </YStack>
            <YStack backgroundColor={theme.bgCard} borderRadius={12} padding={10} minWidth={70} alignItems="center" borderWidth={1} borderColor={theme.border}>
              <Text color={theme.warning} fontWeight="900" fontSize={t(16)}>{statusCounts.unpaid ?? 0}</Text>
              <Text color={theme.textMuted} fontSize={t(10)}>Unpaid</Text>
            </YStack>
          </XStack>

          <XStack gap="$2" flexWrap="wrap" alignItems="center">
            <Input
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Search by service/status/city"
              backgroundColor={theme.inputBg}
              borderColor={theme.inputBorder}
              color={theme.inputText}
              flexGrow={1}
              minWidth={220}
            />
            <Button backgroundColor={theme.success} color="#FFFFFF" onPress={() => router.push('/home-services/request' as any)}>
              New Request
            </Button>
          </XStack>

          {loading ? <Text color={muted}>Loading...</Text> : null}
          {error ? <Text color={theme.danger}>{error}</Text> : null}

          {filteredItems.map((r) => {
            const isOpen = openId === r.id;
            const statusText = String(r.status ?? 'pending').replaceAll('_', ' ');
            const statusColor =
              r.status === 'completed'
                ? theme.success
                : r.status === 'cancelled'
                  ? theme.danger
                  : r.status === 'assigned'
                    ? theme.info
                    : theme.warning;

            return (
              <YStack
                key={r.id}
                backgroundColor={panelBgStrong}
                borderRadius={16}
                padding={14}
                borderWidth={1}
                borderColor={border}
                gap="$2">
                <XStack justifyContent="space-between" alignItems="center" gap="$2" flexWrap="wrap">
                  <YStack flex={1} gap={4}>
                    <Text color={titleColor} fontWeight="900" fontSize={t(14)} numberOfLines={1}>
                      {labelForService(r.service_key)}
                    </Text>
                    <Text color={muted} fontSize={t(12)} numberOfLines={2}>
                      {r.locality || r.city || r.state ? `${r.locality ?? ''}${r.locality ? ', ' : ''}${r.city ?? ''}${r.city ? ', ' : ''}${r.state ?? ''}` : 'Location not provided'}
                    </Text>
                    <Text color={muted} fontSize={t(11)}>
                      Created: {formatDateTimeDDMMYYYY(r.created_at)}
                    </Text>
                  </YStack>

                  <YStack alignItems="flex-end" gap={6}>
                    <Text color={statusColor} fontSize={t(12)} fontWeight="800">
                      {statusText}
                    </Text>
                    <XStack gap={6} alignItems="center">
                      {(r.status === 'completed' && (r.payment_status === 'paid' || r.after_service_payment_method)) ? (
                        <Button
                          size="$2"
                          backgroundColor={theme.primary || '#1F4E79'}
                          color="#FFFFFF"
                          borderRadius={10}
                          paddingHorizontal={10}
                          disabled={!!pdfBusy}
                          onPress={async () => {
                            setPdfBusy({ id: r.id, action: 'share' });
                            try {
                              const ok = await shareHomePdf(r as any);
                              if (!ok) Alert.alert('Error', 'Failed to share PDF. Please try again.');
                            } catch { Alert.alert('Error', 'Failed to share report.'); }
                            finally { setPdfBusy(null); }
                          }}>
                          {pdfBusy?.id === r.id && pdfBusy.action === 'share'
                            ? <ActivityIndicator size="small" color="#FFFFFF" />
                            : 'Share PDF'}
                        </Button>
                      ) : null}
                      <Button
                        size="$2"
                        backgroundColor={panelBg}
                        color={titleColor}
                        borderRadius={10}
                        onPress={async () => {
                          const next = isOpen ? null : r.id;
                          setOpenId(next);
                          if (next) await fetchUploads(r.id);
                        }}>
                        {isOpen ? 'Hide' : 'Details'}
                      </Button>
                    </XStack>
                  </YStack>
                </XStack>

                {isOpen ? (
                  <YStack backgroundColor={panelBg} borderRadius={14} padding={12} gap={10} borderWidth={1} borderColor={border}>
                    <YStack gap={6}>
                      <Text color={titleColor} fontWeight="800" fontSize={t(12)}>
                        Contact
                      </Text>
                      <Text color={muted} fontSize={t(12)}>
                        {r.customer_name ?? '—'} • {r.customer_phone ?? '—'}
                      </Text>
                    </YStack>

                    <YStack gap={6}>
                      <Text color={titleColor} fontWeight="800" fontSize={t(12)}>
                        Address
                      </Text>
                      <Text color={muted} fontSize={t(12)}>
                        {r.address_line1 ?? '—'}
                        {r.address_line2 ? `, ${r.address_line2}` : ''}
                      </Text>
                    </YStack>

                    <YStack gap={6}>
                      <Text color={titleColor} fontWeight="800" fontSize={t(12)}>
                        Preferred slot
                      </Text>
                      <Text color={muted} fontSize={t(12)}>
                        {(r.preferred_date ? formatDateDDMMYYYY(r.preferred_date) : '—') + (r.preferred_time ? ` • ${r.preferred_time}` : '')}
                      </Text>
                    </YStack>

                    {r.notes ? (
                      <YStack gap={6}>
                        <Text color={titleColor} fontWeight="800" fontSize={t(12)}>
                          Notes
                        </Text>
                        <Text color={muted} fontSize={t(12)}>
                          {r.notes}
                        </Text>
                      </YStack>
                    ) : null}

                    <YStack gap={6}>
                      <XStack alignItems="center" justifyContent="space-between" gap="$2">
                        <Text color={titleColor} fontWeight="800" fontSize={t(12)}>
                          Uploads
                        </Text>
                        <Button
                          size="$2"
                          backgroundColor={theme.border}
                          color={theme.text}
                          borderRadius={10}
                          disabled={uploadsBusyId === r.id}
                          onPress={() => void fetchUploads(r.id)}>
                          Refresh
                        </Button>
                      </XStack>

                      {(uploadsByRequest[r.id] ?? []).length ? (
                        (uploadsByRequest[r.id] ?? []).map((u) => {
                          const url = String(u.file_url ?? '').trim();
                          const label = u.file_name || u.file_type || 'File';
                          return (
                            <Pressable
                              key={u.id}
                              onPress={() => {
                                if (!url) return;
                                Linking.openURL(url);
                              }}>
                              <XStack
                                justifyContent="space-between"
                                alignItems="center"
                                paddingVertical={8}
                                paddingHorizontal={10}
                                borderRadius={10}
                                backgroundColor={theme.bgCard}
                                borderWidth={1}
                                borderColor={border}
                                gap="$2">
                                <YStack flex={1} gap={2}>
                                  <Text color={titleColor} fontSize={t(12)} fontWeight="700" numberOfLines={1}>
                                    {label}
                                  </Text>
                                  <Text color={muted} fontSize={t(11)} numberOfLines={1}>
                                    {u.file_type}
                                  </Text>
                                </YStack>
                                <Text color={muted} fontSize={t(11)}>
                                  Open
                                </Text>
                              </XStack>
                            </Pressable>
                          );
                        })
                      ) : (
                        <Text color={muted} fontSize={t(12)}>
                          No uploads.
                        </Text>
                      )}
                    </YStack>

                    {(r.status === 'completed' && (r.payment_status === 'paid' || r.after_service_payment_method)) ? (
                      <Button
                        size="$2"
                        backgroundColor={theme.primary || '#1F4E79'}
                        color="#FFFFFF"
                        borderRadius={10}
                        disabled={!!pdfBusy}
                        onPress={async () => {
                          setPdfBusy({ id: r.id, action: 'download' });
                          try {
                            const ok = await downloadHomePdf(r as any);
                            if (!ok) Alert.alert('Error', 'Failed to generate PDF. Please try again.');
                          } catch { Alert.alert('Error', 'Failed to generate report.'); }
                          finally { setPdfBusy(null); }
                        }}>
                        {pdfBusy?.id === r.id && pdfBusy.action === 'download'
                          ? <ActivityIndicator size="small" color="#FFFFFF" />
                          : 'Download Report'}
                      </Button>
                    ) : null}

                    {r.status === 'pending' && r.payment_option === 'after_service' ? (
                      <YStack gap={6}>
                        <Text color={titleColor} fontWeight="800" fontSize={t(12)}>
                          Payment
                        </Text>
                        <XStack justifyContent="space-between" gap="$2">
                          <Text color={muted} fontSize={t(12)}>Convenience Fee</Text>
                          <Text color={titleColor} fontSize={t(12)}>₹{HOME_SERVICE_PAYMENT.convenienceFee.toFixed(2)}</Text>
                        </XStack>
                        <XStack justifyContent="space-between" gap="$2">
                          <Text color={titleColor} fontWeight="800" fontSize={t(12)}>Final Payable</Text>
                          <Text color={titleColor} fontWeight="800" fontSize={t(12)}>₹{HOME_SERVICE_PAYMENT.finalPayable.toFixed(2)}</Text>
                        </XStack>
                        <XStack gap="$2" flexWrap="wrap">
                          <Button
                            size="$2"
                            backgroundColor={theme.success}
                            color="#FFFFFF"
                            onPress={() => void handlePayOnline(r)}>
                            Pay Online
                          </Button>
                          <Button
                            size="$2"
                            backgroundColor={theme.warning}
                            color="#FFFFFF"
                            onPress={() => void handlePayCash(r)}>
                            Pay with Cash
                          </Button>
                        </XStack>
                      </YStack>
                    ) : null}

                    {r.status === 'pending' ? (
                      <Button
                        size="$2"
                        backgroundColor={theme.danger}
                        color="#FFFFFF"
                        onPress={() => void handleCancel(r)}>
                        Cancel Request
                      </Button>
                    ) : null}

                    {r.status === 'cancelled' && r.payment_status === 'cancelled_with_charge' ? (
                      <Text color={theme.danger} fontSize={t(12)} fontWeight="800">
                        ₹150 charge applied (cancelled within 1 hour of schedule).
                      </Text>
                    ) : null}
                  </YStack>
                ) : null}
              </YStack>
            );
          })}

          {!loading && !filteredItems.length ? <Text color={muted}>No requests yet.</Text> : null}
        </YStack>
      </ScrollView>

      <YStack position="absolute" bottom={0} left={0} right={0} backgroundColor={theme.headerBg} padding={14} paddingBottom={14 + insets.bottom} borderTopWidth={1} borderTopColor={theme.border}>
        <XStack gap="$2" justifyContent="space-between" alignItems="center" flexWrap="wrap">
          <Button backgroundColor={theme.border} color={theme.text} onPress={() => router.replace('/home' as any)}>
            Home
          </Button>
          <Button backgroundColor={theme.success} color="#FFFFFF" onPress={() => router.push('/home-services/request' as any)}>
            New Request
          </Button>
        </XStack>
      </YStack>
    </View>
  );
}
