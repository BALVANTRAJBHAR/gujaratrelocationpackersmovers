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
import { formatDateDDMMYYYY } from '@/lib/date-format';
import FeedbackPopup from '@/components/FeedbackPopup';

type AvailableRequest = {
  id: string;
  user_id: string | null;
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
  payment_status: string | null;
  complete_otp: string | null;
  complete_otp_verified_at: string | null;
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

function AvailableRequestsGuard() {
  const router = useRouter();
  const authGuard = useAuthGuard();
  const { session } = useSession();

  useEffect(() => {
    if (authGuard.isLoading) return;
    if (!authGuard.isAuthenticated || authGuard.error === 'not_authenticated') {
      router.replace('/auth/login' as any);
    } else if (authGuard.error === 'forbidden') {
      router.replace('/unauthorized' as any);
    }
  }, [authGuard.isLoading, authGuard.isAuthenticated, authGuard.error, router]);
  if (authGuard.isLoading || !authGuard.isAuthenticated || authGuard.error) return null;

  return <AvailableRequestsInner session={session} />;
}

export default function AvailableRequestsScreen() {
  return <AvailableRequestsGuard />;
}

function AvailableRequestsInner({ session }: { session: any }) {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? themes.dark : themes.light;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<AvailableRequest[]>([]);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'accepted'>('pending');
  const [workDoneBusyId, setWorkDoneBusyId] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [cashPaidBusyId, setCashPaidBusyId] = useState<string | null>(null);
  const [otpDrafts, setOtpDrafts] = useState<Record<string, string>>({});
  const [feedbackTarget, setFeedbackTarget] = useState<AvailableRequest | null>(null);

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

  const generateOtp = () => String(Math.floor(1000 + Math.random() * 9000));

  const sendCompletionOtp = async (req: AvailableRequest) => {
    if (req.complete_otp) return;
    setError(null);
    setWorkDoneBusyId(req.id);
    try {
      const res = await supabase.functions.invoke('complete-home-service', {
        body: { request_id: req.id, action: 'work_done' },
      });
      const data = res as any;
      if (data?.error) {
        setError(String(data.error));
        return;
      }
      try {
        await supabase.functions.invoke('send-home-service-notification', {
          body: { request_id: req.id, type: 'otp', otp: String(data?.otp ?? generateOtp()) },
        });
      } catch {
        // ignore notification failures
      }
      Alert.alert('Work done', 'Completion OTP has been sent to the customer. Ask them to share the OTP, then verify to complete the service.');
      void fetchRequests();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to mark work done.');
    } finally {
      setWorkDoneBusyId(null);
    }
  };

  const verifyAndComplete = async (req: AvailableRequest) => {
    setError(null);
    const entered = String(otpDrafts[req.id] ?? '').trim();
    if (entered.length !== 4) {
      setError('Enter the 4-digit OTP given by the customer.');
      return;
    }
    setCompletingId(req.id);
    try {
      const res = await supabase.functions.invoke('complete-home-service', {
        body: { request_id: req.id, action: 'verify_complete', otp: entered },
      });
      const data = res as any;
      if (data?.error) {
        setError(String(data.error ?? 'Incorrect OTP. Please ask the customer for the correct code.'));
        return;
      }

      try {
        await supabase.functions.invoke('send-home-service-notification', {
          body: { request_id: req.id, status: 'completed', send_email: true },
        });
      } catch {
        // ignore notification failures
      }

      setFeedbackTarget(req);
      void fetchRequests();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to complete service.');
    } finally {
      setCompletingId(null);
    }
  };

  const markCashReceived = async (req: AvailableRequest) => {
    setError(null);
    setCashPaidBusyId(req.id);
    try {
      const res = await supabase.functions.invoke('mark-remaining-cash', {
        body: { request_id: req.id },
      });
      const data = res as any;
      if (data?.error) {
        setError(String(data.error));
        return;
      }
      Alert.alert('Cash received', 'Service payment marked as received in cash.', [
        { text: 'OK', onPress: () => void fetchRequests() },
      ]);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to mark cash received.');
    } finally {
      setCashPaidBusyId(null);
    }
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
          <Button
            chromeless
            color={titleColor}
            fontSize={22}
            fontWeight="900"
            onPress={() => router.back()}>
            ‹ Back
          </Button>
          <Text color={titleColor} fontSize={t(18)} fontWeight="900">
            Available Requests
          </Text>
        </XStack>
      </YStack>

      <XStack gap="$2" padding={12} borderBottomWidth={1} borderBottomColor={border}>
        <Button
          flex={1}
          backgroundColor={statusFilter === 'pending' ? '#1F4E79' : theme.bgSecondary}
          onPress={() => setStatusFilter('pending')}>
          <Text color={statusFilter === 'pending' ? '#FFFFFF' : theme.text} fontWeight="700">
            Pending
          </Text>
        </Button>
        <Button
          flex={1}
          backgroundColor={statusFilter === 'accepted' ? '#1F4E79' : theme.bgSecondary}
          onPress={() => setStatusFilter('accepted')}>
          <Text color={statusFilter === 'accepted' ? '#FFFFFF' : theme.text} fontWeight="700">
            My Accepted
          </Text>
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
                  {formatDateDDMMYYYY(req.created_at)}
                </Text>
              </XStack>

              <Text color={muted} fontSize={t(12)}>
                {req.customer_name ? `${req.customer_name} · ` : ''}
                {req.locality}{req.locality ? ', ' : ''}{req.city}{req.city ? ', ' : ''}{req.state}
              </Text>

              {req.preferred_date ? (
                <Text color={titleColor} fontSize={t(12)}>Preferred: {req.preferred_date ? formatDateDDMMYYYY(req.preferred_date) : ''}{req.preferred_time ? `, ${req.preferred_time}` : ''}</Text>
              ) : null}

              {req.notes ? (
                <Text color={muted} fontSize={t(11)} numberOfLines={2}>{req.notes}</Text>
              ) : null}

              {statusFilter === 'accepted' && req.provider_name ? (
                <YStack gap="$2">
                  <Text color={theme.success} fontSize={t(12)} fontWeight="700">
                    Accepted by {req.provider_id === providerId ? 'you' : (req.provider_name ?? 'provider')}
                  </Text>

                  {req.provider_id === providerId ? (
                    req.status === 'completed' ? (
                      <>
                        <Text color={theme.success} fontSize={t(13)} fontWeight="800">✓ Service completed</Text>
                        {req.cash_paid_at ? (
                          <Text color={theme.success} fontSize={t(12)} fontWeight="700">✓ Cash received</Text>
                        ) : null}
                        {!req.cash_paid_at && req.payment_status !== 'paid' ? (
                          <>
                            <Text color={muted} fontSize={t(11)}>
                              Customer still needs to pay. If the customer paid you in cash, mark it received below.
                            </Text>
                            <Button
                              backgroundColor="#22C55E"
                              color="#FFFFFF"
                              disabled={cashPaidBusyId === req.id}
                              onPress={() => void markCashReceived(req)}>
                              {cashPaidBusyId === req.id ? 'Marking...' : 'Mark cash as received'}
                            </Button>
                          </>
                        ) : null}
                      </>
                    ) : !req.complete_otp ? (
                      <>
                        {req.after_service_payment_method === 'cash' && !req.cash_paid_at ? (
                          <Text color={muted} fontSize={t(11)}>
                            Customer will pay in cash after service. Mark work done to generate the completion OTP.
                          </Text>
                        ) : null}
                        <Button
                          backgroundColor="#1F4E79"
                          color="#FFFFFF"
                          disabled={workDoneBusyId === req.id}
                          onPress={() => void sendCompletionOtp(req)}>
                          {workDoneBusyId === req.id ? 'Sending OTP...' : 'Mark Work Done'}
                        </Button>
                      </>
                    ) : !req.complete_otp_verified_at ? (
                      <>
                        <Text color={theme.warning} fontSize={t(12)} fontWeight="700">
                          Ask the customer for the completion OTP, then verify below.
                        </Text>
                        <Input
                          value={otpDrafts[req.id] ?? ''}
                          onChangeText={(v) =>
                            setOtpDrafts((prev) => ({ ...prev, [req.id]: v.replace(/\D/g, '').slice(0, 4) }))
                          }
                          placeholder="Enter 4-digit OTP"
                          keyboardType="number-pad"
                          backgroundColor={theme.inputBg}
                          borderColor={theme.inputBorder}
                          color={theme.inputText}
                          textAlign="center"
                          fontSize={t(16)}
                          fontWeight="800"
                        />
                        <Button
                          backgroundColor="#22C55E"
                          color="#FFFFFF"
                          disabled={completingId === req.id}
                          onPress={() => void verifyAndComplete(req)}>
                          {completingId === req.id ? 'Completing...' : 'Verify OTP & Complete Service'}
                        </Button>
                      </>
                    ) : (
                      <Text color={theme.success} fontSize={t(13)} fontWeight="800">✓ Service completed</Text>
                    )
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

      <FeedbackPopup
        open={!!feedbackTarget}
        title="Rate the customer"
        subtitle={`How was your experience with ${feedbackTarget?.customer_name ?? 'the customer'}?`}
        toUserId={feedbackTarget?.user_id ?? null}
        homeServiceRequestId={feedbackTarget?.id ?? null}
        tags={['Good customer', 'Bad customer', 'Asked for water', 'On time', 'Rude']}
        onClose={() => setFeedbackTarget(null)}
      />
    </View>
  );
}
