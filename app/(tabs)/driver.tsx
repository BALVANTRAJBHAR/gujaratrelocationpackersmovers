import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Linking, Platform, ScrollView } from 'react-native';
import { Button, H2, Paragraph, Spinner, Text, XStack, YStack } from 'tamagui';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { hasLiveLocationTrackingStarted, startDriverLiveLocation, stopDriverLiveLocation } from '@/lib/driver-location-task';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';

export default function DriverScreen() {
  const { profile, session } = useSession();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const pageBg = isDark ? '#0B0B12' : '#FFFFFF';
  const panelBg = isDark ? '#111827' : '#F3F4F6';
  const panelBgStrong = isDark ? '#0F172A' : '#FFFFFF';
  const border = isDark ? '#1F2937' : '#E5E7EB';
  const titleColor = isDark ? '#F9FAFB' : '#111827';
  const muted = isDark ? '#9CA3AF' : '#6B7280';
  const accent = '#F97316';

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  const [filter, setFilter] = useState<'upcoming' | 'completed'>('upcoming');
  const [busyBookingId, setBusyBookingId] = useState<string | null>(null);
  const [trackingBookingId, setTrackingBookingId] = useState<string | null>(null);
  const [trackingEnabled, setTrackingEnabled] = useState(false);

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
          'id, pickup_address, pickup_lat, pickup_lng, drop_address, drop_lat, drop_lng, distance_km, status, payment_status, driver_id, pickup_otp, delivery_otp, pickup_verified_at, delivered_verified_at, scheduled_at, created_at, updated_at, user:users!user_id(name, phone)'
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
    return s === 'assigned' || s === 'pending' || s === 'not_started' || s === '';
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

  const updateStatus = async (bookingId: string, status: 'pickup_reached' | 'in_transit' | 'delivered') => {
    if (!session?.user?.id) return;
    if (!isDriver) return;
    setError(null);
    setBusyBookingId(bookingId);
    try {
      const payload: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
      if (status === 'pickup_reached') payload.pickup_verified_at = new Date().toISOString();
      if (status === 'delivered') payload.delivered_verified_at = new Date().toISOString();

      const { error: updateError } = await supabase
        .from('bookings')
        .update(payload)
        .eq('id', bookingId)
        .eq('driver_id', session.user.id);

      if (updateError) {
        setError(updateError.message);
        return;
      }

      if (status === 'delivered') {
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
          body: { booking_id: bookingId, status },
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

  const onPressPickupReached = async (booking: any) => {
    const ok = await confirmOtpIfNeeded(
      'Confirm pickup reached',
      'Make sure you have verified the pickup OTP with customer, then continue to update status.'
    );
    if (!ok) return;
    await updateStatus(String(booking.id), 'pickup_reached');
  };

  const onPressInTransit = async (booking: any) => {
    await updateStatus(String(booking.id), 'in_transit');
  };

  const onPressDelivered = async (booking: any) => {
    const ok = await confirmOtpIfNeeded(
      'Confirm delivered',
      'Make sure you have verified the delivery OTP with customer, then continue to update status.'
    );
    if (!ok) return;
    await updateStatus(String(booking.id), 'delivered');
  };

  return (
    <YStack flex={1} backgroundColor={pageBg}>
      <ScrollView style={{ flex: 1 } as any} contentContainerStyle={{ padding: 24, paddingBottom: 60, gap: 16 } as any}>
        <XStack justifyContent="space-between" alignItems="center">
          <YStack gap="$1">
            <Text color={accent} fontSize={12} letterSpacing={2} textTransform="uppercase">
              Driver
            </Text>
            <H2 color={titleColor}>Upcoming & attended moves</H2>
            <Paragraph color={muted}>
              Track upcoming assignments and past attended moves in one place.
            </Paragraph>
          </YStack>
        </XStack>

        {profile?.role && !['driver'].includes(profile.role) ? (
          <YStack backgroundColor={panelBg} padding={20} borderRadius={18} gap="$2" borderWidth={1} borderColor={border}>
            <Text color={titleColor} fontWeight="700">Driver access only</Text>
            <Text color={muted} fontSize={12}>
              Complete your profile as a driver to access this module.
            </Text>
          </YStack>
        ) : (
          <YStack gap="$3">
            <XStack gap="$2" alignItems="center" justifyContent="space-between" flexWrap="wrap">
              <XStack gap="$2" flexWrap="wrap">
                <Button
                  size="$3"
                  backgroundColor={filter === 'upcoming' ? accent : panelBg}
                  color={filter === 'upcoming' ? '#0B0B12' : titleColor}
                  borderColor={border}
                  borderWidth={1}
                  onPress={() => setFilter('upcoming')}>
                  Upcoming
                </Button>
                <Button
                  size="$3"
                  backgroundColor={filter === 'completed' ? accent : panelBg}
                  color={filter === 'completed' ? '#0B0B12' : titleColor}
                  borderColor={border}
                  borderWidth={1}
                  onPress={() => setFilter('completed')}>
                  Completed
                </Button>
              </XStack>

              <Button
                size="$3"
                backgroundColor={panelBgStrong}
                color={titleColor}
                borderColor={border}
                borderWidth={1}
                onPress={() => void fetchDriverBookings()}
                disabled={loading}>
                Refresh
              </Button>
            </XStack>

            {error ? (
              <YStack backgroundColor={panelBg} padding={14} borderRadius={16} borderWidth={1} borderColor={border}>
                <Text color={titleColor} fontWeight="700">Error</Text>
                <Text color={muted} fontSize={12}>
                  {error}
                </Text>
              </YStack>
            ) : null}

            {loading ? (
              <YStack backgroundColor={panelBgStrong} padding={16} borderRadius={16} gap="$2" borderWidth={1} borderColor={border}>
                <XStack gap="$2" alignItems="center">
                  <Spinner color={accent} />
                  <Text color={muted} fontSize={12}>
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
                <YStack backgroundColor={panelBgStrong} padding={16} borderRadius={16} gap="$2" borderWidth={1} borderColor={border}>
                  <Text color={titleColor} fontWeight="700">
                    No bookings
                  </Text>
                  <Text color={muted} fontSize={12}>
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
                  <YStack backgroundColor={panelBgStrong} padding={16} borderRadius={16} gap="$2" borderWidth={1} borderColor={border}>
                    <XStack justifyContent="space-between" alignItems="flex-start" gap="$2" flexWrap="wrap">
                      <YStack flex={1} gap="$1">
                        <Text color={titleColor} fontWeight="700">
                          Booking #{String(item.id).slice(0, 8).toUpperCase()}
                        </Text>
                        <Text color={muted} fontSize={12}>
                          {customerName}{customerPhone ? ` · ${customerPhone}` : ''}
                        </Text>
                      </YStack>

                      <Text color={muted} fontSize={12}>
                        Status: {status || '—'}
                      </Text>
                    </XStack>

                    <YStack gap="$1">
                      <Text color={muted} fontSize={12}>
                        Pickup: {item.pickup_address ?? '—'}
                      </Text>
                      <Text color={muted} fontSize={12}>
                        Drop: {item.drop_address ?? '—'}
                      </Text>
                    </YStack>

                    <XStack gap="$2" flexWrap="wrap" alignItems="center">
                      <Button
                        size="$3"
                        backgroundColor={panelBg}
                        color={titleColor}
                        borderColor={border}
                        borderWidth={1}
                        disabled={isBusy}
                        onPress={() => void openDirections(navigateToPickupUrl)}>
                        Navigate pickup
                      </Button>
                      <Button
                        size="$3"
                        backgroundColor={panelBg}
                        color={titleColor}
                        borderColor={border}
                        borderWidth={1}
                        disabled={isBusy}
                        onPress={() => void openDirections(navigateToDropUrl)}>
                        Navigate drop
                      </Button>
                    </XStack>

                    <XStack gap="$2" flexWrap="wrap" alignItems="center">
                      {isTrackingThis ? (
                        <Button
                          size="$3"
                          backgroundColor={accent}
                          color="#0B0B12"
                          borderColor={border}
                          borderWidth={1}
                          disabled={isBusy}
                          onPress={() => void onPressStopTracking()}>
                          Stop live tracking
                        </Button>
                      ) : (
                        <Button
                          size="$3"
                          backgroundColor={canTrack ? accent : panelBg}
                          color={canTrack ? '#0B0B12' : muted}
                          borderColor={border}
                          borderWidth={1}
                          disabled={!canTrack || isBusy}
                          onPress={() => void onPressStartTracking(bookingId)}>
                          Start live tracking
                        </Button>
                      )}
                    </XStack>

                    <XStack gap="$2" flexWrap="wrap" alignItems="center">
                      <Button
                        size="$3"
                        backgroundColor={canSetPickupReached(status) ? accent : panelBg}
                        color={canSetPickupReached(status) ? '#0B0B12' : muted}
                        borderColor={border}
                        borderWidth={1}
                        disabled={!canSetPickupReached(status) || isBusy}
                        onPress={() => void onPressPickupReached(item)}>
                        {isBusy && canSetPickupReached(status) ? 'Updating…' : 'Pickup reached'}
                      </Button>

                      <Button
                        size="$3"
                        backgroundColor={canSetInTransit(status) ? accent : panelBg}
                        color={canSetInTransit(status) ? '#0B0B12' : muted}
                        borderColor={border}
                        borderWidth={1}
                        disabled={!canSetInTransit(status) || isBusy}
                        onPress={() => void onPressInTransit(item)}>
                        {isBusy && canSetInTransit(status) ? 'Updating…' : 'In transit'}
                      </Button>

                      <Button
                        size="$3"
                        backgroundColor={canSetDelivered(status) ? accent : panelBg}
                        color={canSetDelivered(status) ? '#0B0B12' : muted}
                        borderColor={border}
                        borderWidth={1}
                        disabled={!canSetDelivered(status) || isBusy}
                        onPress={() => void onPressDelivered(item)}>
                        {isBusy && canSetDelivered(status) ? 'Updating…' : 'Delivered'}
                      </Button>
                    </XStack>
                  </YStack>
                );
              }}
            />
          </YStack>
        )}
      </ScrollView>
    </YStack>
  );
}
