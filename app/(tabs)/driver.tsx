import * as Location from 'expo-location';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Platform, ScrollView } from 'react-native';
import { Button, H2, Input, Paragraph, Text, XStack, YStack } from 'tamagui';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';

const STATUS_LABELS: Record<string, string> = {
  not_started: 'Not started',
  assigned: 'Assigned',
  pickup_reached: 'Pickup reached',
  in_transit: 'In Transit',
  delivered: 'Delivered',
};

type Booking = {
  id: string;
  pickup_address: string | null;
  drop_address: string | null;
  status: string | null;
  user_id: string | null;
  driver_id: string | null;
  pickup_otp?: string | null;
  delivery_otp?: string | null;
  pickup_verified_at?: string | null;
  delivered_verified_at?: string | null;
  created_at: string | null;
};

type OtpModalState =
  | null
  | {
      bookingId: string;
      title: string;
      expectedOtp: string;
      updatePayload: Record<string, unknown>;
    };

type OtpKind = 'pickup' | 'delivery';

export default function DriverScreen() {
  const { session, profile } = useSession();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const pageBg = isDark ? '#0B0B12' : '#FFFFFF';
  const panelBg = isDark ? '#111827' : '#F3F4F6';
  const panelBgStrong = isDark ? '#0F172A' : '#FFFFFF';
  const border = isDark ? '#1F2937' : '#E5E7EB';
  const titleColor = isDark ? '#F9FAFB' : '#111827';
  const muted = isDark ? '#9CA3AF' : '#6B7280';
  const idleBtnBg = isDark ? '#111827' : '#E5E7EB';
  const idleBtnText = isDark ? '#E5E7EB' : '#111827';
  const activeBtnBg = '#F97316';
  const activeBtnText = '#0B0B12';
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trackingBookingId, setTrackingBookingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'not_started' | 'assigned' | 'pickup_reached' | 'in_transit' | 'delivered'
  >('all');
  const [otpModal, setOtpModal] = useState<OtpModalState>(null);
  const [otpValue, setOtpValue] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isDriverView = (profile?.role ?? '') === 'driver';

  const upcomingBookings = useMemo(() => {
    return bookings.filter(
      (booking) => booking.status !== 'delivered' && booking.status !== 'cancelled'
    );
  }, [bookings]);

  const attendedBookings = useMemo(() => {
    return bookings.filter((booking) => booking.status === 'delivered');
  }, [bookings]);

  const filteredUpcoming = useMemo(() => {
    if (statusFilter === 'all') return upcomingBookings;
    return upcomingBookings.filter((booking) => booking.status === statusFilter);
  }, [statusFilter, upcomingBookings]);

  const fetchBookings = async () => {
    if (!['driver', 'staff', 'admin'].includes(profile?.role ?? '')) return;
    setError(null);
    setLoading(true);
    let query = supabase
      .from('bookings')
      .select(
        'id, pickup_address, drop_address, status, user_id, driver_id, pickup_otp, delivery_otp, pickup_verified_at, delivered_verified_at, created_at'
      )
      .order('created_at', { ascending: false });

    if (profile?.role === 'driver' && session?.user?.id) query = query.eq('driver_id', session.user.id);

    const { data, error: fetchError } = await query;

    if (fetchError) {
      setError(fetchError.message);
      setLoading(false);
      return;
    }

    setBookings(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchBookings();
  }, [profile?.role]);

  useEffect(() => {
    if (trackingBookingId) return;
    const active = (bookings ?? []).find((b) => b.status === 'in_transit');
    if (!active?.id) return;
    startLiveTracking(active.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings, trackingBookingId]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const sendStatusPush = async (bookingId: string, status: string) => {
    try {
      await supabase.functions.invoke('send-booking-status-push', {
        body: { booking_id: bookingId, status },
      });
    } catch {
      // ignore push failures
    }
  };

  const updateStatus = async (bookingId: string, status: string) => {
    setLoading(true);
    const { error: updateError } = await supabase
      .from('bookings')
      .update({ status })
      .eq('id', bookingId);

    if (updateError) {
      setError(updateError.message);
    }
    await fetchBookings();
  };

  const openOtpModal = (next: NonNullable<OtpModalState>) => {
    setOtpValue('');
    setOtpModal(next);
  };

  const confirmOtpModal = async () => {
    if (!otpModal) return;
    setError(null);
    setLoading(true);

    const entered = String(otpValue ?? '').trim();
    if (!entered) {
      setError('Please enter OTP.');
      setLoading(false);
      return;
    }
    if (entered !== String(otpModal.expectedOtp)) {
      setError('Invalid OTP.');
      setLoading(false);
      return;
    }

    const { error: updateError } = await supabase
      .from('bookings')
      .update(otpModal.updatePayload)
      .eq('id', otpModal.bookingId);

    if (updateError) {
      setError(updateError.message);
    }
    await sendStatusPush(otpModal.bookingId, String(otpModal.updatePayload.status ?? ''));
    setOtpModal(null);
    setOtpValue('');
    await fetchBookings();
    setLoading(false);
  };

  const markPickupReached = async (booking: Booking) => {
    setError(null);
    setLoading(true);
    try {
      const expected = String(booking.pickup_otp ?? '').trim();
      if (!expected) {
        throw new Error('Pickup OTP not found for this booking. Please ask admin to regenerate OTP.');
      }
      openOtpModal({
        bookingId: booking.id,
        title: 'Enter Pickup OTP',
        expectedOtp: expected,
        updatePayload: {
          status: 'pickup_reached',
          pickup_verified_at: new Date().toISOString(),
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to resend pickup OTP.');
    } finally {
      setLoading(false);
    }
  };

  const markDelivered = async (booking: Booking) => {
    setError(null);
    setLoading(true);
    try {
      const expected = String(booking.delivery_otp ?? '').trim();
      if (!expected) {
        throw new Error('Delivery OTP not found for this booking. Please ask admin to regenerate OTP.');
      }
      openOtpModal({
        bookingId: booking.id,
        title: 'Enter Delivery OTP',
        expectedOtp: expected,
        updatePayload: {
          status: 'delivered',
          delivered_verified_at: new Date().toISOString(),
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to resend delivery OTP.');
    } finally {
      setLoading(false);
    }
  };

  const markInTransit = async (booking: Booking) => {
    setError(null);
    setLoading(true);
    const { error: updateError } = await supabase
      .from('bookings')
      .update({ status: 'in_transit' })
      .eq('id', booking.id);

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    await sendStatusPush(booking.id, 'in_transit');
    await fetchBookings();
    setLoading(false);
    await startLiveTracking(booking.id);
  };

  const pushLocation = async (bookingId: string) => {
    if (!session?.user?.id) return;
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setError('Location permission denied.');
      return;
    }

    const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    const lat = current.coords.latitude;
    const lng = current.coords.longitude;

    const { error: insertError } = await supabase.from('driver_locations').insert({
      booking_id: bookingId,
      driver_id: session.user.id,
      lat,
      lng,
    });

    if (insertError) {
      setError(insertError.message);
    }
  };

  const startLiveTracking = async (bookingId: string) => {
    setError(null);
    setTrackingBookingId(bookingId);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    await pushLocation(bookingId);
    intervalRef.current = setInterval(() => {
      pushLocation(bookingId);
    }, 5000);
  };

  const stopLiveTracking = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    intervalRef.current = null;
    setTrackingBookingId(null);
  };

  return (
    <YStack flex={1} backgroundColor={pageBg}>
      <ScrollView style={{ flex: 1 } as any} contentContainerStyle={{ padding: 24, paddingBottom: 60, gap: 16 } as any}>
        <XStack justifyContent="space-between" alignItems="center">
          <YStack gap="$1">
            <Text color={activeBtnBg} fontSize={12} letterSpacing={2} textTransform="uppercase">
              Driver
            </Text>
            <H2 color={titleColor}>Upcoming & attended moves</H2>
            <Paragraph color={muted}>
              Track upcoming assignments and past attended moves in one place.
            </Paragraph>
          </YStack>
          <Button
            size="$2"
            backgroundColor={idleBtnBg}
            color={idleBtnText}
            borderRadius={10}
            onPress={fetchBookings}>
            Refresh
          </Button>
        </XStack>

        {profile?.role && !['driver'].includes(profile.role) ? (
          <YStack backgroundColor={panelBg} padding={20} borderRadius={18} gap="$2" borderWidth={1} borderColor={border}>
            <Text color={titleColor} fontWeight="700">Driver access only</Text>
            <Text color={muted} fontSize={12}>
              Complete your profile as a driver to access this module.
            </Text>
          </YStack>
        ) : (
          <>
          {isDriverView ? (
            <YStack backgroundColor={panelBgStrong} padding={16} borderRadius={16} gap="$1" borderWidth={1} borderColor={border}>
              <Text color={titleColor} fontWeight="700">Verification status</Text>
              <Text color={muted} fontSize={12}>
                {profile?.driver_status ?? 'pending'}
              </Text>
            </YStack>
          ) : null}
          <XStack gap="$2" flexWrap="wrap">
            {[
              { label: 'All', value: 'all' },
              { label: 'Not started', value: 'not_started' },
              { label: 'Assigned', value: 'assigned' },
              { label: 'Pickup reached', value: 'pickup_reached' },
              { label: 'Transit', value: 'in_transit' },
              { label: 'Delivered', value: 'delivered' },
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
          <XStack gap="$2" flexWrap="wrap">
            <YStack backgroundColor={panelBgStrong} borderRadius={14} padding={12} gap="$1" minWidth={140} borderWidth={1} borderColor={border}>
              <Text color={muted} fontSize={11}>Upcoming</Text>
              <Text color={titleColor} fontWeight="700" fontSize={16}>
                {upcomingBookings.length}
              </Text>
            </YStack>
            <YStack backgroundColor={panelBgStrong} borderRadius={14} padding={12} gap="$1" minWidth={140} borderWidth={1} borderColor={border}>
              <Text color={muted} fontSize={11}>Attended</Text>
              <Text color={titleColor} fontWeight="700" fontSize={16}>
                {attendedBookings.length}
              </Text>
            </YStack>
          </XStack>
          {loading ? <Text color="#94A3B8">Loading...</Text> : null}
          {error ? <Text color="#FCA5A5">{error}</Text> : null}

          {otpModal ? (
            <YStack
              backgroundColor="#0F172A"
              borderColor="#1F2937"
              borderWidth={1}
              borderRadius={18}
              padding={16}
              gap="$2">
              <Text color="#F9FAFB" fontWeight="800">
                {otpModal.title}
              </Text>
              <Text color="#94A3B8" fontSize={12}>
                Ask customer for OTP and enter it here.
              </Text>
              <Input
                value={otpValue}
                onChangeText={setOtpValue}
                placeholder="Enter OTP"
                keyboardType={Platform.OS === 'web' ? (undefined as any) : 'number-pad'}
                backgroundColor="#111827"
                borderColor="#1F2937"
                color="#E5E7EB"
              />
              <XStack gap="$2" justifyContent="flex-end" flexWrap="wrap">
                <Button
                  size="$2"
                  backgroundColor="#111827"
                  color="#E5E7EB"
                  borderRadius={10}
                  onPress={() => {
                    setOtpModal(null);
                    setOtpValue('');
                  }}>
                  Cancel
                </Button>
                <Button
                  size="$2"
                  backgroundColor="#F97316"
                  color="#0B0B12"
                  borderRadius={10}
                  onPress={confirmOtpModal}
                  disabled={loading}>
                  Verify
                </Button>
              </XStack>
            </YStack>
          ) : null}

          <YStack gap="$3">
            <Text color="#F9FAFB" fontWeight="700">Upcoming bookings</Text>
            <FlatList
              data={filteredUpcoming}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              contentContainerStyle={{ gap: 12, paddingBottom: 12 }}
              renderItem={({ item }) => (
                <YStack backgroundColor="#111827" borderRadius={18} padding={16} gap="$2">
                  <Text color="#F9FAFB" fontWeight="700" fontSize={14}>
                    {item.pickup_address ?? 'Pickup'} → {item.drop_address ?? 'Drop'}
                  </Text>
                  <Text color="#94A3B8" fontSize={12}>
                    Status: {STATUS_LABELS[item.status ?? ''] ?? String(item.status ?? '—')}
                  </Text>
                  {item.created_at ? (
                    <Text color="#6B7280" fontSize={11}>
                      Created: {new Date(item.created_at).toLocaleString()}
                    </Text>
                  ) : null}

                  <XStack gap="$2" flexWrap="wrap">
                    <Button
                      size="$2"
                      backgroundColor="#FACC15"
                      color="#0B0B12"
                      borderRadius={10}
                      onPress={() => markPickupReached(item)}
                      disabled={loading || Boolean(item.pickup_verified_at)}>
                      Pickup reached
                    </Button>
                    <Button
                      size="$2"
                      backgroundColor="#22C55E"
                      color="#0B0B12"
                      borderRadius={10}
                      onPress={() => markInTransit(item)}
                      disabled={loading || item.status !== 'pickup_reached'}>
                      In Transit
                    </Button>
                    <Button
                      size="$2"
                      backgroundColor="#10B981"
                      color="#0B0B12"
                      borderRadius={10}
                      onPress={() => markDelivered(item)}
                      disabled={loading || item.status !== 'in_transit'}>
                      Delivered
                    </Button>
                    {trackingBookingId === item.id ? (
                      <Button
                        size="$2"
                        backgroundColor="#EF4444"
                        color="#0B0B12"
                        borderRadius={10}
                        onPress={stopLiveTracking}
                        disabled={loading}>
                        Stop GPS
                      </Button>
                    ) : null}
                  </XStack>
                </YStack>
              )}
            />
          </YStack>

          <YStack gap="$3">
            <Text color="#F9FAFB" fontWeight="700">Attended bookings</Text>
            <FlatList
              data={attendedBookings}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              contentContainerStyle={{ gap: 12, paddingBottom: 32 }}
              renderItem={({ item }) => (
                <YStack backgroundColor="#111827" borderRadius={18} padding={16} gap="$2">
                  <Text color="#F9FAFB" fontWeight="700" fontSize={14}>
                    {item.pickup_address ?? 'Pickup'} → {item.drop_address ?? 'Drop'}
                  </Text>
                  <Text color="#94A3B8" fontSize={12}>
                    Status: {STATUS_LABELS[item.status ?? 'delivered'] ?? item.status}
                  </Text>
                  {item.created_at ? (
                    <Text color="#6B7280" fontSize={11}>
                      Completed: {new Date(item.created_at).toLocaleString()}
                    </Text>
                  ) : null}
                </YStack>
              )}
            />
          </YStack>
        </>
      )}
      </ScrollView>
    </YStack>
  );
}
