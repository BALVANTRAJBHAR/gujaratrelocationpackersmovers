import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList } from 'react-native';
import { H2, Paragraph, Text, XStack, YStack } from 'tamagui';

import TrackingMap from '@/components/tracking-map';
import { getMapboxToken } from '@/lib/public-config';
import { playSound } from '@/lib/sounds';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';

type DriverLocation = {
  id: string;
  booking_id: string;
  lat: number | null;
  lng: number | null;
  updated_at: string;
};

type BookingStatusRow = {
  status: string | null;
};

const STATUS_STEPS: Array<{ key: string; label: string }> = [
  { key: 'not_started', label: 'Not started' },
  { key: 'pickup_reached', label: 'Picked up' },
  { key: 'in_transit', label: 'In transit' },
  { key: 'delivered', label: 'Delivered' },
];

export default function TrackingScreen() {
  const params = useLocalSearchParams<{ bookingId?: string }>();
  const { session } = useSession();
  const [locations, setLocations] = useState<DriverLocation[]>([]);
  const [bookingStatus, setBookingStatus] = useState<string | null>(null);
  const [mapboxToken, setMapboxToken] = useState<string>('');

  const maxContentWidth = 1100;

  const latestLocation = useMemo(() => {
    if (!params.bookingId) return locations[0];
    return locations.find((item) => item.booking_id === params.bookingId) ?? locations[0];
  }, [locations, params.bookingId]);

  const displayedLocations = useMemo(() => {
    if (!params.bookingId) return locations;
    return (locations ?? []).filter((item) => item.booking_id === params.bookingId);
  }, [locations, params.bookingId]);

  const mapLat = latestLocation?.lat ?? 19.076;
  const mapLng = latestLocation?.lng ?? 72.877;

  useEffect(() => {
    if (!session?.user?.id) return;

    const subscription = supabase
      .channel('driver-locations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_locations' }, (payload) => {
        const next = payload.new as DriverLocation;
        setLocations((prev) => {
          const filtered = prev.filter((item) => item.id !== next.id);
          return [next, ...filtered];
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [session?.user?.id]);

  useEffect(() => {
    let cancelled = false;
    getMapboxToken()
      .then((t) => {
        if (!cancelled) setMapboxToken(t);
      })
      .catch(() => {
        if (!cancelled) setMapboxToken('');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!params.bookingId) return;

    const fetchBookingStatus = async () => {
      const { data } = await supabase
        .from('bookings')
        .select('status')
        .eq('id', params.bookingId)
        .maybeSingle();
      setBookingStatus((data as BookingStatusRow | null)?.status ?? null);
    };

    fetchBookingStatus();

    const subscription = supabase
      .channel('booking-status')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bookings', filter: `id=eq.${params.bookingId}` },
        (payload) => {
          const next = payload.new as { status?: string | null };
          const nextStatus = next.status ?? null;
          if (nextStatus) setBookingStatus(nextStatus);

          if (nextStatus === 'pickup_reached') {
            playSound(require('@/assets/sounds/pickup.mp3'));
          }
          if (nextStatus === 'delivered') {
            playSound(require('@/assets/sounds/delivered.mp3'));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [params.bookingId]);

  return (
    <YStack flex={1} backgroundColor="#0B0B12" padding={24}>
      <YStack width="100%" maxWidth={maxContentWidth} alignSelf="center" gap="$3">
        <Text color="#F97316" fontSize={12} letterSpacing={2} textTransform="uppercase">
          Live tracking
        </Text>
        <H2 color="#F9FAFB">Driver signals</H2>
        <Paragraph color="#9CA3AF">
          Realtime updates will appear here once driver starts the trip.
        </Paragraph>
        {params.bookingId ? (
          <Text color="#94A3B8" fontSize={12}>Tracking booking: {params.bookingId}</Text>
        ) : null}

        {params.bookingId ? (
          <YStack
            backgroundColor="#0F172A"
            borderColor="#1F2937"
            borderWidth={1}
            borderRadius={18}
            padding={14}
            gap="$2">
            <Text color="#E5E7EB" fontSize={12} fontWeight="700">
              Status
            </Text>
            <XStack gap="$2" flexWrap="wrap" alignItems="center">
              {STATUS_STEPS.map((step, idx) => {
                const statusIndex = STATUS_STEPS.findIndex((s) => s.key === bookingStatus);
                const stepIndex = idx;
                const isActive = statusIndex >= stepIndex && statusIndex !== -1;
                return (
                  <XStack key={step.key} alignItems="center" gap="$2">
                    <Text
                      fontSize={11}
                      paddingHorizontal={10}
                      paddingVertical={6}
                      borderRadius={999}
                      backgroundColor={isActive ? '#F97316' : '#111827'}
                      color={isActive ? '#0B0B12' : '#94A3B8'}>
                      {step.label}
                    </Text>
                    {idx !== STATUS_STEPS.length - 1 ? (
                      <Text color="#374151" fontSize={12}>
                        —
                      </Text>
                    ) : null}
                  </XStack>
                );
              })}
            </XStack>
          </YStack>
        ) : null}

        <YStack height={260} borderRadius={18} overflow="hidden" backgroundColor="#0F172A">
          <TrackingMap
            token={mapboxToken}
            latitude={mapLat}
            longitude={mapLng}
            hasLiveLocation={Boolean(latestLocation?.lat && latestLocation?.lng)}
          />
        </YStack>

        <FlatList
          data={displayedLocations}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ gap: 12, paddingTop: 8, paddingBottom: 24 }}
          renderItem={({ item }) => (
            <YStack backgroundColor="#111827" padding={16} borderRadius={16} gap="$1">
              <Text color="#E5E7EB" fontSize={13}>Booking: {item.booking_id}</Text>
              <Text color="#94A3B8" fontSize={12}>
                Lat: {item.lat ?? '—'}, Lng: {item.lng ?? '—'}
              </Text>
              <Text color="#6B7280" fontSize={11}>
                {new Date(item.updated_at).toLocaleString()}
              </Text>
            </YStack>
          )}
        />
      </YStack>
    </YStack>
  );
}
