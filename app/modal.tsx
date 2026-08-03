import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuthGuard } from '@/lib/auth-guard';
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList } from 'react-native';
import { Button, H2, Paragraph, Text, XStack, YStack } from 'tamagui';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { themes } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { t } from '@/constants/typography';
import { formatDateTimeDDMMYYYY } from '@/lib/date-format';
import { sharePaymentReceiptPdf, type ReceiptBooking } from '@/lib/generate-payment-receipt-pdf';

type Payment = {
  id: string;
  booking_id: string | null;
  amount: number | null;
  status: string | null;
  razorpay_payment_id: string | null;
  created_at: string;
};

function ModalGuard() {
  const router = useRouter();
  const authGuard = useAuthGuard();
  const params = useLocalSearchParams<{ bookingId?: string }>();

  useEffect(() => {
    if (authGuard.isLoading) return;
    if (!authGuard.isAuthenticated || authGuard.error === 'not_authenticated') {
      router.replace('/auth/login' as any);
    } else if (authGuard.error === 'forbidden') {
      router.replace('/unauthorized' as any);
    }
  }, [authGuard.isLoading, authGuard.isAuthenticated, authGuard.error, router]);
  if (authGuard.isLoading || !authGuard.isAuthenticated || authGuard.error) return null;

  return <ModalScreenInner bookingId={params.bookingId} />;
}

export default function ModalScreen() {
  return <ModalGuard />;
}

function ModalScreenInner({ bookingId }: { bookingId?: string }) {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = colorScheme === 'dark' ? themes.dark : themes.light;
  const pageBg = theme.bg;
  const cardBg = theme.bgCardSecondary;
  const titleColor = theme.text;
  const muted = theme.textMuted;
  const text = theme.text;
  const idleBtnBg = theme.border;
  const idleBtnText = theme.text;
  const activeBtnBg = theme.accent;
  const activeBtnText = '#FFFFFF';
  const [payments, setPayments] = useState<Payment[]>([]);
  const [booking, setBooking] = useState<ReceiptBooking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'pending' | 'failed'>('all');

  const paidStatuses = useMemo(() => new Set(['captured', 'paid']), []);
  const filteredPayments = useMemo(() => {
    if (statusFilter === 'all') return payments;
    if (statusFilter === 'paid') {
      return payments.filter((payment) => paidStatuses.has(payment.status ?? ''));
    }
    return payments.filter((payment) => (payment.status ?? '') === statusFilter);
  }, [paidStatuses, payments, statusFilter]);

  const totalPaid = useMemo(() => {
    return payments
      .filter((payment) => paidStatuses.has(payment.status ?? ''))
      .reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0);
  }, [paidStatuses, payments]);

  const handleShareReceipt = async (payment: Payment) => {
    try {
      if (!booking) return;
      const ok = await sharePaymentReceiptPdf(booking as ReceiptBooking, payment as any);
      if (!ok) setError('Failed to share receipt PDF.');
    } catch (err) {
      console.error('[handleShareReceipt] Failed:', err);
      setError('Failed to share receipt PDF.');
    }
  };

  useEffect(() => {
    if (!bookingId) return;

    const fetchPayments = async () => {
      setLoading(true);
      setError(null);
      const { data, error: fetchError } = await supabase
        .from('payments')
        .select('id, booking_id, amount, status, razorpay_payment_id, created_at')
        .eq('booking_id', bookingId)
        .order('created_at', { ascending: false });

      if (fetchError) {
        setError(fetchError.message);
      } else {
        setPayments((data ?? []) as Payment[]);
      }
      setLoading(false);
    };

    const fetchBooking = async () => {
      const { data, error: fetchError } = await supabase
        .from('bookings')
        .select('id, booking_number, pickup_address, drop_address, distance_km, status, payment_status, estimated_price, advance_amount, remaining_amount, scheduled_date, scheduled_time, labor_count, fare_breakdown, pickup_floor, drop_floor, pickup_lift_available, drop_lift_available, items_description, created_at')
        .eq('id', bookingId)
        .maybeSingle();
      if (!fetchError) {
        setBooking((data ?? null) as ReceiptBooking | null);
      }
    };

    fetchPayments();
    fetchBooking();
  }, [bookingId]);

  const handleClose = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/bookings' as any);
    }
  };

  return (
    <YStack flex={1} backgroundColor={pageBg} padding={24} gap="$3" paddingBottom={64}>
      <Text color={activeBtnBg} fontSize={t(12)} letterSpacing={2} textTransform="uppercase">
        Booking transactions
      </Text>
      <H2 color={titleColor}>Payment History</H2>
      <Paragraph color={muted}>Booking: {bookingId ?? '—'}</Paragraph>
      <XStack gap="$2" flexWrap="wrap">
        {[
          { label: 'All', value: 'all', count: payments.length },
          { label: 'Paid', value: 'paid', count: payments.filter((p) => paidStatuses.has(p.status ?? '')).length },
          { label: 'Pending', value: 'pending', count: payments.filter((p) => (p.status ?? '') === 'pending').length },
          { label: 'Failed', value: 'failed', count: payments.filter((p) => (p.status ?? '') === 'failed').length },
        ].map((filter) => (
          <Button
            key={filter.value}
            size="$2"
            backgroundColor={statusFilter === filter.value ? activeBtnBg : idleBtnBg}
            color={statusFilter === filter.value ? activeBtnText : idleBtnText}
            borderRadius={999}
            onPress={() => setStatusFilter(filter.value as typeof statusFilter)}>
            {filter.label} ({filter.count})
          </Button>
        ))}
      </XStack>
      <YStack backgroundColor={cardBg} padding={16} borderRadius={16}>
        <Text color={muted} fontSize={t(12)}>Total paid</Text>
        <Text color={titleColor} fontSize={t(18)} fontWeight="700">₹{totalPaid.toFixed(2)}</Text>
      </YStack>

      {loading ? <Text color={muted}>Loading...</Text> : null}
      {error ? <Text color={theme.danger}>{error}</Text> : null}

      <FlatList
        data={filteredPayments}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ gap: 12, paddingTop: 8, paddingBottom: 24 }}
        renderItem={({ item }) => (
          <YStack backgroundColor={cardBg} padding={16} borderRadius={16} gap="$1">
            <Text color={text} fontSize={t(13)}>Status: {item.status ?? 'pending'}</Text>
            <Text color={muted} fontSize={t(12)}>Amount: ₹{Number(item.amount ?? 0).toFixed(2)}</Text>
            <Text color={muted} fontSize={t(12)}>Payment ID: {item.razorpay_payment_id ?? '—'}</Text>
            <Text color={muted} fontSize={t(11)}>
              {formatDateTimeDDMMYYYY(item.created_at)}
            </Text>
            <Button
              size="$2"
              backgroundColor={idleBtnBg}
              color={idleBtnText}
              borderRadius={10}
              onPress={() => handleShareReceipt(item)}>
              Share receipt
            </Button>
          </YStack>
        )}
      />

      <Button
        backgroundColor={idleBtnBg}
        color={idleBtnText}
        borderRadius={12}
        marginTop={8}
        onPress={handleClose}>
        Back
      </Button>
    </YStack>
  );
}
