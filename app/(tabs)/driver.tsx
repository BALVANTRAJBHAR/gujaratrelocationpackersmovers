import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Linking, Modal, Platform, ScrollView, Pressable } from 'react-native';
import { Button, H2, Input, Paragraph, Spinner, Text, XStack, YStack } from 'tamagui';

import { themes } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { hasLiveLocationTrackingStarted, startDriverLiveLocation, stopDriverLiveLocation } from '@/lib/driver-location-task';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';
import { useRouter } from 'expo-router';
import { useAuthGuard } from '@/lib/auth-guard';
import { t } from '@/constants/typography';
import FeedbackPopup from '@/components/FeedbackPopup';
import { FontAwesome5 } from '@expo/vector-icons';

function DriverGuard() {
  const router = useRouter();
  const authGuard = useAuthGuard(['driver']);
  const { profile, session } = useSession();

  useEffect(() => {
    if (authGuard.isLoading) return;
    if (!authGuard.isAuthenticated || authGuard.error === 'not_authenticated') {
      router.replace('/auth/login' as any);
    } else if (authGuard.error === 'forbidden') {
      router.replace('/unauthorized' as any);
    }
  }, [authGuard.isLoading, authGuard.isAuthenticated, authGuard.error, router]);
  if (authGuard.isLoading || !authGuard.isAuthenticated || authGuard.error) return null;

  return <DriverScreenInner profile={profile} session={session} />;
}

export default function DriverScreen() {
  return <DriverGuard />;
}

function DriverScreenInner({ profile, session }: { profile: any; session: any }) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? themes.dark : themes.light;
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  const [filter, setFilter] = useState<'upcoming' | 'completed'>('upcoming');
  const [busyBookingId, setBusyBookingId] = useState<string | null>(null);
  const [trackingBookingId, setTrackingBookingId] = useState<string | null>(null);
  const [trackingEnabled, setTrackingEnabled] = useState(false);
  const [otpVerifyTarget, setOtpVerifyTarget] = useState<{ bookingId: string; kind: 'pickup' | 'delivery' } | null>(null);
  const [otpDraft, setOtpDraft] = useState('');
  const [otpBusy, setOtpBusy] = useState(false);
  const [feedbackTargetId, setFeedbackTargetId] = useState<string | null>(null);

  const feedbackTarget = useMemo(
    () => bookings.find((b) => String(b.id) === feedbackTargetId) ?? null,
    [bookings, feedbackTargetId]
  );

  useEffect(() => {
    const check = async () => {
      if (!session?.user?.id || !bookings.length || feedbackTargetId) return;
      const candidate = bookings.find((b) => b.status === 'delivered' && (b as any)?.user_id);
      if (!candidate) return;
      const { data } = await supabase
        .from('feedback')
        .select('id')
        .eq('from_user_id', session.user.id)
        .eq('booking_id', String(candidate.id))
        .maybeSingle();
      if (!data) setFeedbackTargetId(String(candidate.id));
    };
    void check();
  }, [bookings, feedbackTargetId, session?.user?.id]);

  const fetchSeqRef = useRef(0);

  const isDriver = profile?.role === 'driver';

  const fetchDriverBookings = useCallback(async () => {
    const userId = session?.user?.id;
    if (!userId || !isDriver) return;
    setError(null);
    setLoading(true);
    const seq = ++fetchSeqRef.current;

    try {
      const { data, error: fetchError } = await supabase
        .from('bookings')
        .select(
          'id, user_id, booking_number, pickup_address, pickup_lat, pickup_lng, drop_address, drop_lat, drop_lng, distance_km, status, payment_status, driver_id, pickup_verified_at, delivered_verified_at, scheduled_at, created_at, updated_at, advance_amount, remaining_amount, remaining_paid_at, remaining_paid_method, user:users!user_id(name, phone)'
        )
        .eq('driver_id', userId)
        .order('created_at', { ascending: false })
        .limit(80);

      if (seq !== fetchSeqRef.current) return;
      if (fetchError) {
        setError(fetchError.message);
        setBookings([]);
        return;
      }
      setBookings((data ?? []) as any[]);
    } catch (e: any) {
      if (seq !== fetchSeqRef.current) return;
      setError(String(e?.message ?? e ?? 'Failed to load driver bookings.'));
      setBookings([]);
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false);
    }
  }, [isDriver, session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id) return;
    if (!isDriver) return;
    void fetchDriverBookings();
  }, [fetchDriverBookings, isDriver, session?.user?.id]);

  useEffect(() => {
    let cancelled = false;
    hasLiveLocationTrackingStarted()
      .then((started) => {
        if (!cancelled) setTrackingEnabled(Boolean(started));
      })
      .catch(() => {
        if (!cancelled) setTrackingEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isCompletedStatus = (status: string | null) => {
    const s = String(status ?? '').trim();
    return s === 'delivered' || s === 'cancelled';
  };

  const buildDirectionsUrl = (args: {
    originLat?: number | null;
    originLng?: number | null;
    originAddress?: string | null;
    destLat?: number | null;
    destLng?: number | null;
    destAddress?: string | null;
  }) => {
    const base = 'https://www.google.com/maps/dir/?api=1';
    const originLat = typeof args.originLat === 'number' ? args.originLat : null;
    const originLng = typeof args.originLng === 'number' ? args.originLng : null;
    const destLat = typeof args.destLat === 'number' ? args.destLat : null;
    const destLng = typeof args.destLng === 'number' ? args.destLng : null;

    const origin =
      originLat != null && originLng != null
        ? `${originLat},${originLng}`
        : args.originAddress
          ? args.originAddress
          : '';
    const destination =
      destLat != null && destLng != null
        ? `${destLat},${destLng}`
        : args.destAddress
          ? args.destAddress
          : '';

    const params: string[] = [];
    if (origin) params.push(`origin=${encodeURIComponent(origin)}`);
    if (destination) params.push(`destination=${encodeURIComponent(destination)}`);
    params.push('travelmode=driving');
    return `${base}&${params.join('&')}`;
  };

  const openDirections = async (url: string) => {
    try {
      if (Platform.OS === 'web') {
        window.open(url, '_blank', 'noopener,noreferrer');
        return;
      }
      const can = await Linking.canOpenURL(url);
      if (!can) {
        setError('Unable to open Google Maps.');
        return;
      }
      await Linking.openURL(url);
    } catch (e: any) {
      setError(String(e?.message ?? 'Unable to open navigation.'));
    }
  };

  const filteredBookings = useMemo(() => {
    if (filter === 'completed') return bookings.filter((b) => isCompletedStatus(b.status));
    return bookings.filter((b) => !isCompletedStatus(b.status));
  }, [bookings, filter]);

  const canSetPickupReached = (status: string | null) => {
    const s = String(status ?? '').trim();
    return (
      s === 'assigned' ||
      s === 'accepted' ||
      s === 'pending' ||
      s === 'confirmed' ||
      s === 'not_started' ||
      s === ''
    );
  };

  const canSetInTransit = (status: string | null) => {
    const s = String(status ?? '').trim();
    return s === 'pickup_reached';
  };

  const canSetDelivered = (status: string | null) => {
    const s = String(status ?? '').trim();
    return s === 'in_transit';
  };

  const confirmOtpIfNeeded = async (title: string, message: string) => {
    if (Platform.OS === 'web') {
      try {
        const ok = window.confirm(`${title}\n\n${message}`);
        return ok;
      } catch {
        return true;
      }
    }

    return await new Promise<boolean>((resolve) => {
      Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Continue', style: 'default', onPress: () => resolve(true) },
      ]);
    });
  };

  const updateStatus = async (bookingId: string, status: 'accepted' | 'in_transit') => {
    if (!session?.user?.id) return;
    if (!isDriver) return;
    setError(null);
    setBusyBookingId(bookingId);
    try {
      const { error: updateError } = await supabase
        .from('bookings')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', bookingId)
        .eq('driver_id', session.user.id);

      if (updateError) {
        setError(updateError.message);
        return;
      }

      try {
        await supabase.functions.invoke('send-booking-status-push', {
          body: { booking_id: bookingId, status, send_email: false },
        });
      } catch {
        // ignore
      }

      await fetchDriverBookings();
    } finally {
      setBusyBookingId(null);
    }
  };

  const canTrackBooking = (status: string | null) => {
    const s = String(status ?? '').trim();
    return s !== 'delivered' && s !== 'cancelled';
  };

  const onPressStartTracking = async (bookingId: string) => {
    setError(null);
    try {
      await startDriverLiveLocation({ bookingId });
      setTrackingBookingId(bookingId);
      setTrackingEnabled(true);
    } catch (e: any) {
      setTrackingEnabled(false);
      setTrackingBookingId(null);
      setError(String(e?.message ?? e ?? 'Unable to start live tracking.'));
    }
  };

  const onPressStopTracking = async () => {
    setError(null);
    try {
      await stopDriverLiveLocation();
      setTrackingEnabled(false);
      setTrackingBookingId(null);
    } catch (e: any) {
      setError(String(e?.message ?? e ?? 'Unable to stop live tracking.'));
    }
  };

  const canAcceptBooking = (status: string | null) => {
    const s = String(status ?? '').trim();
    return s === 'assigned';
  };

  const onPressAccept = async (booking: any) => {
    const ok = await confirmOtpIfNeeded(
      'Accept booking',
      'Are you sure you want to accept this booking? You will be responsible for the pickup and delivery.'
    );
    if (!ok) return;
    await updateStatus(String(booking.id), 'accepted');
  };

  const onPressPickupReached = async (booking: any) => {
    setOtpVerifyTarget({ bookingId: String(booking.id), kind: 'pickup' });
    setOtpDraft('');
  };

  const onPressInTransit = async (booking: any) => {
    await updateStatus(String(booking.id), 'in_transit');
  };

  const onPressDelivered = async (booking: any) => {
    setOtpVerifyTarget({ bookingId: String(booking.id), kind: 'delivery' });
    setOtpDraft('');
  };

  const onPressMarkRemainingCash = async (booking: any) => {
    const remaining = Number(booking.remaining_amount ?? 0);
    if (remaining <= 0) return;
    const ok = await confirmOtpIfNeeded(
      'Mark remaining as cash received',
      `Have you received ₹${remaining.toFixed(2)} in cash from the customer? This will mark the remaining amount as paid.`
    );
    if (!ok) return;
    setError(null);
    setBusyBookingId(String(booking.id));
    try {
      const res = await supabase.functions.invoke('mark-remaining-cash', {
        body: { booking_id: String(booking.id) },
      });
      const data = res as any;
      if (data?.error) {
        setError(String(data.error));
        return;
      }
      Alert.alert('Cash received', `₹${remaining.toFixed(2)} remaining amount marked as paid in cash.`);
      await fetchDriverBookings();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to mark cash received.');
    } finally {
      setBusyBookingId(null);
    }
  };

  const submitOtpVerify = async () => {
    const target = otpVerifyTarget;
    if (!target) return;
    setError(null);
    const code = otpDraft.replace(/\D/g, '').slice(0, 4);
    if (code.length !== 4) {
      setError(`Enter the 4-digit ${target.kind === 'pickup' ? 'pickup' : 'delivery'} OTP given by the customer.`);
      return;
    }
    setOtpBusy(true);
    setBusyBookingId(target.bookingId);
    try {
      const res = await supabase.functions.invoke('driver-verify-booking-otp', {
        body: { booking_id: target.bookingId, otp_kind: target.kind, otp: code },
      });
      const data = res as any;
      if (data?.error) {
        setError(String(data.error));
        return;
      }

      const succeeded = data?.ok === true;
      if (!succeeded) {
        setError('OTP verification failed.');
        return;
      }

      if (target.kind === 'delivery') {
        try {
          await stopDriverLiveLocation();
          setTrackingEnabled(false);
          setTrackingBookingId(null);
        } catch {
          // ignore
        }
      }

      try {
        await supabase.functions.invoke('send-booking-status-push', {
          body: {
            booking_id: target.bookingId,
            status: target.kind === 'pickup' ? 'pickup_reached' : 'delivered',
            send_email: target.kind === 'delivery',
          },
        });
      } catch {
        // ignore
      }

      setOtpVerifyTarget(null);
      setOtpDraft('');
      await fetchDriverBookings();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to verify OTP.');
    } finally {
      setOtpBusy(false);
      setBusyBookingId(null);
    }
  };

  return (
    <YStack flex={1} backgroundColor={theme.bg}>
      <ScrollView style={{ flex: 1 } as any} contentContainerStyle={{ padding: 24, paddingBottom: 60, gap: 16 } as any}>
        <XStack justifyContent="space-between" alignItems="center">
          <YStack gap="$1">
            <Text color={theme.accent} fontSize={t(13)} letterSpacing={2} textTransform="uppercase">
              Driver
            </Text>
            <H2 color={theme.text}>Upcoming & attended moves</H2>
            <Paragraph color={theme.textMuted}>
              Track upcoming assignments and past attended moves in one place.
            </Paragraph>
          </YStack>
        </XStack>

        {profile?.role && !['driver'].includes(profile.role) ? (
          <YStack backgroundColor={theme.bgCardSecondary} padding={20} borderRadius={18} gap="$2" borderWidth={1} borderColor={theme.border}>
            <Text color={theme.text} fontWeight="700">Driver access only</Text>
            <Text color={theme.textMuted} fontSize={t(13)}>
              Complete your profile as a driver to access this module.
            </Text>
          </YStack>
        ) : (
          <YStack gap="$3">
            <XStack gap="$2" alignItems="center" justifyContent="space-between" flexWrap="wrap">
              {(() => {
                const completedCount = bookings.filter((b) => isCompletedStatus(b.status)).length;
                const upcomingCount = bookings.length - completedCount;
                return (
                  <XStack gap="$2" flexWrap="wrap">
                    <Button
                      size="$3"
                      backgroundColor={filter === 'upcoming' ? theme.accent : theme.bgCardSecondary}
                      borderColor={theme.border}
                      borderWidth={1}
                      onPress={() => setFilter('upcoming')}>
                      <Text color={filter === 'upcoming' ? '#FFFFFF' : theme.text} fontWeight="700">
                        {`Upcoming (${upcomingCount})`}
                      </Text>
                    </Button>
                    <Button
                      size="$3"
                      backgroundColor={filter === 'completed' ? theme.accent : theme.bgCardSecondary}
                      borderColor={theme.border}
                      borderWidth={1}
                      onPress={() => setFilter('completed')}>
                      <Text color={filter === 'completed' ? '#FFFFFF' : theme.text} fontWeight="700">
                        {`Completed (${completedCount})`}
                      </Text>
                    </Button>
                  </XStack>
                );
              })()}

              <Button
                size="$3"
                backgroundColor={theme.bgCard}
                color={theme.text}
                borderColor={theme.border}
                borderWidth={1}
                onPress={() => void fetchDriverBookings()}
                disabled={loading}>
                <FontAwesome5 name="sync" size={14} color={theme.text} />
              </Button>
            </XStack>

            {error ? (
              <YStack backgroundColor={theme.bgCardSecondary} padding={14} borderRadius={16} borderWidth={1} borderColor={theme.border}>
                <Text color={theme.text} fontWeight="700">Error</Text>
                <Text color={theme.textMuted} fontSize={t(13)}>
                  {error}
                </Text>
              </YStack>
            ) : null}

            {loading ? (
              <YStack backgroundColor={theme.bgCard} padding={16} borderRadius={16} gap="$2" borderWidth={1} borderColor={theme.border}>
                <XStack gap="$2" alignItems="center">
                  <Spinner color={theme.accent} />
                  <Text color={theme.textMuted} fontSize={t(13)}>
                    Loading assignments...
                  </Text>
                </XStack>
              </YStack>
            ) : null}

            <FlatList
              data={filteredBookings}
              keyExtractor={(item) => String(item.id)}
              scrollEnabled={false}
              contentContainerStyle={{ gap: 12, paddingBottom: 24 } as any}
              ListEmptyComponent={
                <YStack backgroundColor={theme.bgCard} padding={16} borderRadius={16} gap="$2" borderWidth={1} borderColor={theme.border}>
                  <Text color={theme.text} fontWeight="700">
                    No bookings
                  </Text>
                  <Text color={theme.textMuted} fontSize={t(13)}>
                    {filter === 'upcoming'
                      ? 'No upcoming assignments found.'
                      : 'No completed moves found.'}
                  </Text>
                </YStack>
              }
              renderItem={({ item }) => {
                const status = String(item.status ?? '').trim();
                const isBusy = busyBookingId === String(item.id);
                const user = (item.user?.[0] ?? item.user ?? null) as any;
                const customerName = user?.name ?? 'Customer';
                const customerPhone = user?.phone ?? null;
                const bookingId = String(item.id);
                const canTrack = canTrackBooking(status);
                const isTrackingThis = trackingEnabled && (trackingBookingId ? trackingBookingId === bookingId : true);

                const pickupLat = typeof item.pickup_lat === 'number' ? item.pickup_lat : Number(item.pickup_lat ?? null);
                const pickupLng = typeof item.pickup_lng === 'number' ? item.pickup_lng : Number(item.pickup_lng ?? null);
                const dropLat = typeof item.drop_lat === 'number' ? item.drop_lat : Number(item.drop_lat ?? null);
                const dropLng = typeof item.drop_lng === 'number' ? item.drop_lng : Number(item.drop_lng ?? null);

                const navigateToPickupUrl = buildDirectionsUrl({
                  destLat: Number.isFinite(pickupLat) ? pickupLat : null,
                  destLng: Number.isFinite(pickupLng) ? pickupLng : null,
                  destAddress: item.pickup_address ?? null,
                });

                const navigateToDropUrl = buildDirectionsUrl({
                  originLat: Number.isFinite(pickupLat) ? pickupLat : null,
                  originLng: Number.isFinite(pickupLng) ? pickupLng : null,
                  originAddress: item.pickup_address ?? null,
                  destLat: Number.isFinite(dropLat) ? dropLat : null,
                  destLng: Number.isFinite(dropLng) ? dropLng : null,
                  destAddress: item.drop_address ?? null,
                });

                return (
                  <YStack backgroundColor={theme.bgCard} padding={16} borderRadius={16} gap="$2" borderWidth={1} borderColor={theme.border}>
                    <XStack justifyContent="space-between" alignItems="flex-start" gap="$2" flexWrap="wrap">
                      <YStack flex={1} gap="$1">
                        <Text color={theme.text} fontWeight="700">
                          Booking #{(item as any).booking_number ? `GRS${(item as any).booking_number}` : String(item.id).slice(0, 8).toUpperCase()}
                        </Text>
                        <XStack gap={4} alignItems="center" flexWrap="wrap">
                          <Text color={theme.textMuted} fontSize={t(13)}>
                            {customerName}
                          </Text>
                          {customerPhone ? (
                            <>
                              <Text color={theme.textMuted} fontSize={t(13)}> · </Text>
                              <Pressable onPress={() => Linking.openURL(`tel:${customerPhone}`)}>
                                <Text color="#3B82F6" fontWeight="700" fontSize={t(13)} style={{ textDecorationLine: 'underline' }}>
                                  {customerPhone}
                                </Text>
                              </Pressable>
                            </>
                          ) : null}
                        </XStack>
                      </YStack>

                      <Text color={theme.textMuted} fontSize={t(13)}>
                        Status: {status || '—'}
                      </Text>
                    </XStack>

                    <YStack gap="$1">
                      <Text color={theme.textMuted} fontSize={t(13)}>
                        Pickup: {item.pickup_address ?? '—'}
                      </Text>
                      <Text color={theme.textMuted} fontSize={t(13)}>
                        Drop: {item.drop_address ?? '—'}
                      </Text>
                    </YStack>

                    <XStack gap="$2" flexWrap="wrap" alignItems="center">
                      <Button
                        size="$3"
                        backgroundColor={theme.bgCardSecondary}
                        color={theme.text}
                        borderColor={theme.border}
                        borderWidth={1}
                        disabled={isBusy}
                        onPress={() => void openDirections(navigateToPickupUrl)}>
                        Navigate pickup
                      </Button>
                      <Button
                        size="$3"
                        backgroundColor={theme.bgCardSecondary}
                        color={theme.text}
                        borderColor={theme.border}
                        borderWidth={1}
                        disabled={isBusy}
                        onPress={() => void openDirections(navigateToDropUrl)}>
                        Navigate drop
                      </Button>
                      <Button
                        size="$3"
                        backgroundColor={theme.bgCardSecondary}
                        color={theme.text}
                        borderColor={theme.border}
                        borderWidth={1}
                        disabled={isBusy}
                        onPress={() => router.push({ pathname: '/(tabs)/tracking', params: { bookingId } } as any)}>
                        Live map
                      </Button>
                    </XStack>

                    <XStack gap="$2" flexWrap="wrap" alignItems="center">
                      {isTrackingThis ? (
                        <Button
                          size="$3"
                          backgroundColor={theme.accent}
                          color="#FFFFFF"
                          borderColor={theme.border}
                          borderWidth={1}
                          disabled={isBusy}
                          onPress={() => void onPressStopTracking()}>
                          Stop live tracking
                        </Button>
                      ) : (
                        <Button
                          size="$3"
                          backgroundColor={canTrack ? theme.accent : theme.bgCardSecondary}
                          color={canTrack ? '#FFFFFF' : theme.textMuted}
                          borderColor={theme.border}
                          borderWidth={1}
                          disabled={!canTrack || isBusy}
                          onPress={() => void onPressStartTracking(bookingId)}>
                          Start live tracking
                        </Button>
                      )}
                    </XStack>

                    <XStack gap="$2" flexWrap="wrap" alignItems="center">
                      {canAcceptBooking(status) ? (
                        <Button
                          size="$3"
                          backgroundColor={theme.accent}
                          color="#FFFFFF"
                          borderColor={theme.border}
                          borderWidth={1}
                          disabled={isBusy}
                          onPress={() => void onPressAccept(item)}>
                          {isBusy ? 'Updating…' : 'Accept booking'}
                        </Button>
                      ) : null}

                      <Button
                        size="$3"
                        backgroundColor={canSetPickupReached(status) ? theme.accent : theme.bgCardSecondary}
                        color={canSetPickupReached(status) ? '#FFFFFF' : theme.textMuted}
                        borderColor={theme.border}
                        borderWidth={1}
                        disabled={!canSetPickupReached(status) || isBusy}
                        onPress={() => void onPressPickupReached(item)}>
                        {isBusy && canSetPickupReached(status) ? 'Updating…' : 'Pickup reached'}
                      </Button>

                      <Button
                        size="$3"
                        backgroundColor={canSetInTransit(status) ? theme.accent : theme.bgCardSecondary}
                        color={canSetInTransit(status) ? '#FFFFFF' : theme.textMuted}
                        borderColor={theme.border}
                        borderWidth={1}
                        disabled={!canSetInTransit(status) || isBusy}
                        onPress={() => void onPressInTransit(item)}>
                        {isBusy && canSetInTransit(status) ? 'Updating…' : 'In transit'}
                      </Button>

                      <Button
                        size="$3"
                        backgroundColor={canSetDelivered(status) ? theme.accent : theme.bgCardSecondary}
                        color={canSetDelivered(status) ? '#FFFFFF' : theme.textMuted}
                        borderColor={theme.border}
                        borderWidth={1}
                        disabled={!canSetDelivered(status) || isBusy}
                        onPress={() => void onPressDelivered(item)}>
                        {isBusy && canSetDelivered(status) ? 'Updating…' : 'Delivered'}
                      </Button>
                    </XStack>

                    {(() => {
                      const remaining = Number(item.remaining_amount ?? 0);
                      const remainingPaidAt = item.remaining_paid_at;
                      const remainingMethod = item.remaining_paid_method;
                      if (status !== 'delivered' || remaining <= 0) return null;
                      if (remainingPaidAt) {
                        return (
                          <YStack gap="$1" backgroundColor={theme.bgCardSecondary} borderRadius={12} padding={12} borderWidth={1} borderColor={theme.border}>
                            <XStack justifyContent="space-between">
                              <Text color={theme.textMuted} fontSize={t(13)}>Remaining</Text>
                              <Text color={theme.success} fontSize={t(13)} fontWeight="700">₹{remaining.toFixed(2)} • {remainingMethod === 'cash' ? 'Cash received' : 'Paid online'}</Text>
                            </XStack>
                          </YStack>
                        );
                      }
                      return (
                        <YStack gap="$1" backgroundColor={theme.bgCardSecondary} borderRadius={12} padding={12} borderWidth={1} borderColor={theme.border}>
                          <XStack justifyContent="space-between">
                            <Text color={theme.textMuted} fontSize={t(13)}>Remaining due</Text>
                            <Text color={theme.warning} fontSize={t(13)} fontWeight="700">₹{remaining.toFixed(2)}</Text>
                          </XStack>
                          <Text color={theme.textMuted} fontSize={t(11)}>
                            Collect this amount in cash from the customer after delivery, then mark it below.
                          </Text>
                          <Button
                            size="$2"
                            backgroundColor={theme.success}
                            color="#FFFFFF"
                            disabled={isBusy}
                            onPress={() => void onPressMarkRemainingCash(item)}>
                            {isBusy ? 'Marking…' : 'Mark remaining as cash received'}
                          </Button>
                        </YStack>
                      );
                    })()}
                  </YStack>
                );
              }}
            />
          </YStack>
        )}
      </ScrollView>

      <Modal visible={!!otpVerifyTarget} transparent animationType="fade" onRequestClose={() => setOtpVerifyTarget(null)}>
        <YStack flex={1} justifyContent="center" alignItems="center" backgroundColor="rgba(0,0,0,0.5)" padding={16}>
          <YStack backgroundColor={colorScheme === 'dark' ? theme.bgCard : '#FFFFFF'} borderRadius={16} padding={20} width="100%" maxWidth={400} gap={4}>
            <Text color={theme.text} fontWeight="900" fontSize={17} textAlign="center">
              {otpVerifyTarget?.kind === 'pickup' ? 'Verify pickup OTP' : 'Verify delivery OTP'}
            </Text>
            <Text color={theme.textMuted} fontSize={12.5} textAlign="center">
              Ask the customer for the 4-digit {otpVerifyTarget?.kind === 'pickup' ? 'pickup' : 'delivery'} OTP shown on their booking, then enter it here.
            </Text>
            <Input
              value={otpDraft}
              onChangeText={(v) => setOtpDraft(v.replace(/\D/g, '').slice(0, 4))}
              placeholder="Enter 4-digit OTP"
              keyboardType="number-pad"
              backgroundColor={theme.inputBg}
              borderColor={theme.inputBorder}
              color={theme.inputText}
              textAlign="center"
              fontSize={t(18)}
              fontWeight="800"
              marginTop={14}
            />
            <YStack gap={8} marginTop={14}>
              <Button
                backgroundColor={theme.accent}
                color="#FFFFFF"
                disabled={otpBusy || otpDraft.length !== 4}
                opacity={otpBusy || otpDraft.length !== 4 ? 0.5 : 1}
                onPress={() => void submitOtpVerify()}>
                <Text color="#FFFFFF" fontWeight="800">{otpBusy ? 'Verifying...' : otpVerifyTarget?.kind === 'pickup' ? 'Verify & Mark Pickup Reached' : 'Verify & Mark Delivered'}</Text>
              </Button>
              <Button
                backgroundColor={theme.bgCardSecondary}
                color={theme.text}
                disabled={otpBusy}
                onPress={() => setOtpVerifyTarget(null)}>
                <Text color={theme.text} fontWeight="700">Cancel</Text>
              </Button>
            </YStack>
          </YStack>
        </YStack>
      </Modal>

      <FeedbackPopup
        open={!!feedbackTarget}
        title="Rate the customer"
        subtitle={`How was the experience with ${(() => {
          const tgt = feedbackTarget;
          const user = tgt?.user?.[0] ?? tgt?.user ?? null;
          return (user as any)?.name ?? 'the customer';
        })()}?`}
        toUserId={feedbackTarget ? String((feedbackTarget as any)?.user_id ?? '') : null}
        bookingId={feedbackTarget ? String(feedbackTarget.id) : null}
        tags={['Good customer', 'Bad customer', 'Asked for water', 'On time', 'Rude']}
        onClose={() => setFeedbackTargetId(null)}
      />
    </YStack>
  );
}
