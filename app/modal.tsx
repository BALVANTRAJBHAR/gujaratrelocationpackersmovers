import * as FileSystem from 'expo-file-system';
import * as Print from 'expo-print';
import { Link, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Share } from 'react-native';
import { Button, H2, Paragraph, Text, XStack, YStack } from 'tamagui';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';

type Payment = {
  id: string;
  booking_id: string | null;
  amount: number | null;
  status: string | null;
  razorpay_payment_id: string | null;
  created_at: string;
};

export default function ModalScreen() {
  const params = useLocalSearchParams<{ bookingId?: string }>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const pageBg = isDark ? '#0B0B12' : '#FFFFFF';
  const cardBg = isDark ? '#111827' : '#F3F4F6';
  const titleColor = isDark ? '#F9FAFB' : '#111827';
  const muted = isDark ? '#9CA3AF' : '#6B7280';
  const text = isDark ? '#E5E7EB' : '#111827';
  const idleBtnBg = isDark ? '#111827' : '#E5E7EB';
  const idleBtnText = isDark ? '#E5E7EB' : '#111827';
  const activeBtnBg = '#F97316';
  const activeBtnText = '#0B0B12';
  const [payments, setPayments] = useState<Payment[]>([]);
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
    const receiptHtml = `
      <html>
        <body style="font-family: Arial, sans-serif; padding: 24px;">
          <h2>Payment Receipt</h2>
          <p><strong>Status:</strong> ${payment.status ?? 'pending'}</p>
          <p><strong>Amount:</strong> ₹${Number(payment.amount ?? 0).toFixed(2)}</p>
          <p><strong>Payment ID:</strong> ${payment.razorpay_payment_id ?? '—'}</p>
          <p><strong>Date:</strong> ${new Date(payment.created_at).toLocaleString()}</p>
        </body>
      </html>
    `;

    try {
      const { uri } = await Print.printToFileAsync({ html: receiptHtml });
      const safeId = payment.id.replace(/[^a-z0-9]/gi, '_');
      const baseDir = (FileSystem as any).documentDirectory || (FileSystem as any).cacheDirectory || '';
      const targetUri = `${baseDir}receipt_${safeId}.pdf`;
      await FileSystem.copyAsync({ from: uri, to: targetUri });
      await Share.share({ url: targetUri, title: 'Payment Receipt' });
    } catch (err) {
      setError('Failed to generate receipt PDF.');
    }
  };

  useEffect(() => {
    const bookingId = params.bookingId;
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

    fetchPayments();
  }, [params.bookingId]);

  return (
    <YStack flex={1} backgroundColor={pageBg} padding={24} gap="$3">
      <Text color={activeBtnBg} fontSize={12} letterSpacing={2} textTransform="uppercase">
        Payment history
      </Text>
      <H2 color={titleColor}>All transactions</H2>
      <Paragraph color={muted}>Booking: {params.bookingId ?? '—'}</Paragraph>
      <XStack gap="$2" flexWrap="wrap">
        {[
          { label: 'All', value: 'all' },
          { label: 'Paid', value: 'paid' },
          { label: 'Pending', value: 'pending' },
          { label: 'Failed', value: 'failed' },
        ].map((filter) => (
          <Button
            key={filter.value}
            size="$2"
            backgroundColor={statusFilter === filter.value ? activeBtnBg : idleBtnBg}
            color={statusFilter === filter.value ? activeBtnText : idleBtnText}
            borderRadius={999}
            onPress={() => setStatusFilter(filter.value as typeof statusFilter)}>
            {filter.label}
          </Button>
        ))}
      </XStack>
      <YStack backgroundColor={cardBg} padding={16} borderRadius={16}>
        <Text color={muted} fontSize={12}>Total paid</Text>
        <Text color={titleColor} fontSize={18} fontWeight="700">₹{totalPaid.toFixed(2)}</Text>
      </YStack>

      {loading ? <Text color={muted}>Loading...</Text> : null}
      {error ? <Text color="#FCA5A5">{error}</Text> : null}

      <FlatList
        data={filteredPayments}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ gap: 12, paddingTop: 8, paddingBottom: 24 }}
        renderItem={({ item }) => (
          <YStack backgroundColor={cardBg} padding={16} borderRadius={16} gap="$1">
            <Text color={text} fontSize={13}>Status: {item.status ?? 'pending'}</Text>
            <Text color={muted} fontSize={12}>Amount: ₹{Number(item.amount ?? 0).toFixed(2)}</Text>
            <Text color={muted} fontSize={12}>Payment ID: {item.razorpay_payment_id ?? '—'}</Text>
            <Text color={muted} fontSize={11}>
              {new Date(item.created_at).toLocaleString()}
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

      <Link href="/" dismissTo asChild>
        <Button backgroundColor={idleBtnBg} color={idleBtnText} borderRadius={12}>
          Close
        </Button>
      </Link>
    </YStack>
  );
}
