import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { Button, Input, Text, XStack, YStack } from 'tamagui';

import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';
import { useRouter } from 'expo-router';
import { useAuthGuard } from '@/lib/auth-guard';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { themes } from '@/constants/theme';
import { t } from '@/constants/typography';

type AvailableRequest = {
  id: string;
  service_key: string;
  customer_name: string | null;
  customer_phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  locality: string | null;
  city: string | null;
  state: string | null;
  notes: string | null;
  preferred_date: string | null;
  preferred_time: string | null;
  status: string | null;
  created_at: string;
  provider_id: string | null;
  provider_name: string | null;
  provider_accepted_at: string | null;
  payment_option: string | null;
  after_service_payment_method: string | null;
  cash_paid_at: string | null;
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
  return key;
};

export default function AvailableRequestsScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? themes.dark : themes.light;
  const router = useRouter();
  const authGuard = useAuthGuard();
  useEffect(() => {
    if (authGuard.isLoading) return;
    if (!authGuard.isAuthenticated || authGuard.error === 'not_authenticated') {
      router.replace('/auth/login' as any);
    } else if (authGuard.error === 'forbidden') {
      router.replace('/unauthorized' as any);
    }
  }, [authGuard.isLoading, authGuard.isAuthenticated, authGuard.error, router]);
  if (authGuard.isLoading || !authGuard.isAuthenticated || authGuard.error) return null;
  const { session } = useSession();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<AvailableRequest[]>([]);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'accepted'>('pending');

  const profile = session?.user?.user_metadata as Record<string, any> | null;
  const providerId = session?.user?.id ?? '';

  const fetchRequests = useCallback(async () => {
    if (!providerId) return;
    setError(null);
    setLoading(true);
    try {
      const { data: providerServices, error: provErr } = await supabase
        .from('home_service_providers')
        .select('service_key, state, city')
        .eq('user_id', providerId)
        .eq('is_active', true);

      if (provErr) { setError(provErr.message); setLoading(false); return; }
      if (!providerServices?.length) {
        setItems([]);
        setLoading(false);
        return;
      }

      const serviceKeys = [...new Set(providerServices.map((p) => p.service_key))];
      const states = [...new Set(providerServices.map((p) => p.state))];
      const cities = [...new Set(providerServices.map((p) => p.city))];

      let query = supabase
        .from('home_service_requests')
        .select('*')
        .in('service_key', serviceKeys)
        .in('state', states)
        .in('city', cities)
        .order('created_at', { ascending: false });

      if (statusFilter === 'pending') {
        query = query.is('provider_id', null).in('status', ['pending', 'submitted']);
      } else {
        query = query.not('provider_id', 'is', null);
      }

      query = query.neq('user_id', providerId);

      const { data, error: fetchError } = await query;
      if (fetchError) { setError(fetchError.message); return; }
      setItems((data as any) ?? []);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load requests.');
    } finally {
      setLoading(false);
    }
  }, [providerId, statusFilter]);

  useEffect(() => {
    void fetchRequests();
  }, [fetchRequests]);

  const acceptRequest = async (requestId: string) => {
    setAcceptingId(requestId);
    setError(null);
    try {
      const res = await supabase.functions.invoke('accept-home-service-request', {
        body: { request_id: requestId, provider_id: providerId },
      });
      const data = res as any;
      if (data?.error) {
        setError(String(data.error));
        return;
      }
      Alert.alert('Accepted!', 'You have accepted this service request.', [
        { text: 'OK', onPress: () => void fetchRequests() },
      ]);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to accept request.');
    } finally {
      setAcceptingId(null);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchRequests();
    setRefreshing(false);
  };

  const confirmCashPayment = async (requestId: string) => {
    Alert.alert(
      'Confirm Cash Payment',
      'Have you received the cash payment from the customer?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Payment Received',
          onPress: async () => {
            try {
              await supabase
                .from('home_service_requests')
                .update({
                  cash_paid_at: new Date().toISOString(),
                  cash_paid_by_provider_id: providerId,
                  payment_status: 'paid',
                  status: 'completed',
                })
                .eq('id', requestId);
              Alert.alert('Confirmed', 'Cash payment recorded.');
              void fetchRequests();
            } catch (e: any) {
              setError(e?.message ?? 'Failed to confirm payment.');
            }
          },
        },
      ]
    );
  };

  const pageBg = theme.bg;
  const border = theme.border;
  const titleColor = theme.text;
  const muted = theme.textMuted;
  const panelBg = theme.bgCard;

  return (
    <View style={{ flex: 1, backgroundColor: pageBg }}>
      <YStack backgroundColor={theme.headerBg} padding={16} paddingTop={18} borderBottomWidth={1} borderBottomColor={border}>
        <XStack alignItems="center" gap="$2">
          <Button chromeless color={titleColor} onPress={() => router.back()}>‹ Back</Button>
          <Text color={titleColor} fontSize={t(18)} fontWeight="900">
            Available Requests
          </Text>
        </XStack>
      </YStack>

      <XStack gap="$2" padding={12} borderBottomWidth={1} borderBottomColor={border}>
        <Button
          flex={1}
          backgroundColor={statusFilter === 'pending' ? '#1F4E79' : theme.bgSecondary}
          color={statusFilter === 'pending' ? '#FFFFFF' : theme.text}
          onPress={() => setStatusFilter('pending')}>
          Pending
        </Button>
        <Button
          flex={1}
          backgroundColor={statusFilter === 'accepted' ? '#1F4E79' : theme.bgSecondary}
          color={statusFilter === 'accepted' ? '#FFFFFF' : theme.text}
          onPress={() => setStatusFilter('accepted')}>
          My Accepted
        </Button>
      </XStack>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {error ? (
          <YStack backgroundColor={theme.danger} borderRadius={12} padding={12} marginBottom={12}>
            <Text color="#FFFFFF" fontWeight="800">{error}</Text>
          </YStack>
        ) : null}

        {loading ? (
          <Text color={muted} textAlign="center">Loading...</Text>
        ) : !items.length ? (
          <YStack backgroundColor={panelBg} borderRadius={12} padding={24} borderWidth={1} borderColor={border} alignItems="center">
            <Text color={muted} textAlign="center">No requests found in your service area.</Text>
          </YStack>
        ) : null}

        <YStack gap="$3">
          {items.map((req) => (
            <YStack key={req.id} backgroundColor={panelBg} borderRadius={14} padding={14} borderWidth={1} borderColor={border} gap="$2">
              <XStack alignItems="center" justifyContent="space-between">
                <Text color={titleColor} fontWeight="900" fontSize={t(14)}>
                  {labelForService(req.service_key)}
                </Text>
                <Text color={muted} fontSize={t(11)}>
                  {new Date(req.created_at).toLocaleDateString()}
                </Text>
              </XStack>

              <Text color={muted} fontSize={t(12)}>
                {req.customer_name ? `${req.customer_name} · ` : ''}
                {req.locality}{req.locality ? ', ' : ''}{req.city}{req.city ? ', ' : ''}{req.state}
              </Text>

              {req.preferred_date ? (
                <Text color={titleColor} fontSize={t(12)}>Preferred: {req.preferred_date}{req.preferred_time ? `, ${req.preferred_time}` : ''}</Text>
              ) : null}

              {req.notes ? (
                <Text color={muted} fontSize={t(11)} numberOfLines={2}>{req.notes}</Text>
              ) : null}

              {statusFilter === 'accepted' && req.provider_name ? (
                <YStack gap="$2">
                  <Text color={theme.success} fontSize={t(12)} fontWeight="700">Accepted by you</Text>
                  {req.after_service_payment_method === 'cash' && !req.cash_paid_at ? (
                    <Button
                      backgroundColor="#22C55E"
                      color="#FFFFFF"
                      onPress={() => void confirmCashPayment(req.id)}>
                      Confirm Cash Payment
                    </Button>
                  ) : null}
                  {req.cash_paid_at ? (
                    <Text color={theme.success} fontSize={t(12)} fontWeight="700">✓ Cash received</Text>
                  ) : null}
                </YStack>
              ) : null}

              {statusFilter === 'pending' ? (
                <Button
                  backgroundColor="#1F4E79"
                  color="#FFFFFF"
                  disabled={acceptingId === req.id}
                  onPress={() => void acceptRequest(req.id)}>
                  {acceptingId === req.id ? 'Accepting...' : 'Accept Request'}
                </Button>
              ) : null}
            </YStack>
          ))}
        </YStack>
      </ScrollView>
    </View>
  );
}
