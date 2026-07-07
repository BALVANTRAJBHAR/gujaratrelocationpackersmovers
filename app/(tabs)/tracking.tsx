import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList } from 'react-native';
import { Button, H2, Input, Paragraph, Text, XStack, YStack } from 'tamagui';

import TrackingMap from '@/components/tracking-map';
import { themes } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getMapboxToken } from '@/lib/public-config';
import { playSound } from '@/lib/sounds';
import { supabase } from '@/lib/supabase';
import { t } from '@/constants/typography';

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

const STATUS_STEPS: { key: string; label: string }[] = [
  { key: 'not_started', label: 'Not started' },
  { key: 'pickup_reached', label: 'Picked up' },
  { key: 'in_transit', label: 'In transit' },
  { key: 'delivered', label: 'Delivered' },
];

export default function TrackingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ bookingId?: string }>();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? themes.dark : themes.light;
  const [locations, setLocations] = useState<DriverLocation[]>([]);
  const [bookingStatus, setBookingStatus] = useState<string | null>(null);
  const [mapboxToken, setMapboxToken] = useState<string>('');
  const [trackingId, setTrackingId] = useState('');
  const [pickupLat, setPickupLat] = useState<number | undefined>();
  const [pickupLng, setPickupLng] = useState<number | undefined>();
  const [dropLat, setDropLat] = useState<number | undefined>();
  const [dropLng, setDropLng] = useState<number | undefined>();
  const [pickupAddress, setPickupAddress] = useState('');
  const [dropAddress, setDropAddress] = useState('');

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
    if (!params.bookingId) return;

    const channel = supabase
      .channel(`driver-location-${params.bookingId}`)
      .on('broadcast', { event: 'location' }, (payload: any) => {
        const p: any = (payload as any)?.payload ?? {};
        const next: DriverLocation = {
          id: String(p.updated_at ?? Date.now()),
          booking_id: String(p.booking_id ?? params.bookingId),
          lat: typeof p.lat === 'number' ? p.lat : Number(p.lat ?? null),
          lng: typeof p.lng === 'number' ? p.lng : Number(p.lng ?? null),
          updated_at: String(p.updated_at ?? new Date().toISOString()),
        };
        setLocations((prev) => {
          const filtered = prev.filter((item) => item.id !== next.id);
          return [next, ...filtered].slice(0, 60);
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [params.bookingId]);

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

    const fetchBookingDetails = async () => {
      try {
        const { data, error } = await supabase
          .from('bookings')
          .select('pickup_lat, pickup_lng, drop_lat, drop_lng, pickup_address, drop_address')
          .eq('id', params.bookingId)
          .maybeSingle();
        if (!error && data) {
          if (data.pickup_lat != null) setPickupLat(Number(data.pickup_lat));
          if (data.pickup_lng != null) setPickupLng(Number(data.pickup_lng));
          if (data.drop_lat != null) setDropLat(Number(data.drop_lat));
          if (data.drop_lng != null) setDropLng(Number(data.drop_lng));
          if (data.pickup_address) setPickupAddress(String(data.pickup_address));
          if (data.drop_address) setDropAddress(String(data.drop_address));
        }
      } catch {
        // ignore
      }
    };

    const fetchBookingStatus = async () => {
      try {
        const resp = await supabase.functions.invoke('public-booking-status', {
          body: { booking_id: params.bookingId },
        });
        const status = String((resp as any)?.data?.status ?? '').trim();
        setBookingStatus(status || null);
      } catch {
        setBookingStatus(null);
      }
    };

    fetchBookingDetails();
    fetchBookingStatus();

    const subscription = supabase
      .channel('booking-status')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bookings', filter: `id=eq.${params.bookingId}` },
        (payload: any) => {
          const next = (payload as any).new as { status?: string | null };
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
    <YStack flex={1} backgroundColor={theme.bg} padding={24}>
      <YStack width="100%" maxWidth={maxContentWidth} alignSelf="center" gap="$3">
        <Text color={theme.accent} fontSize={t(12)} letterSpacing={2} textTransform="uppercase">
          Live tracking
        </Text>
        <H2 color={theme.text}>Driver signals</H2>
        <Paragraph color={theme.textMuted}>
          Realtime updates will appear here once driver starts the trip.
        </Paragraph>

        {!params.bookingId ? (
          <YStack
            backgroundColor={theme.bgCardSecondary}
            borderColor={theme.border}
            borderWidth={1}
            borderRadius={18}
            padding={14}
            gap="$2">
            <Text color={theme.text} fontSize={t(12)} fontWeight="700">
              Enter Tracking ID
            </Text>
            <Input
              value={trackingId}
              onChangeText={setTrackingId}
              placeholder="Paste booking / tracking ID"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Button
              backgroundColor={theme.accent}
              color="#FFFFFF"
              onPress={() => {
                const id = String(trackingId ?? '').trim();
                if (!id) return;
                setTrackingId('');
                router.push({ pathname: '/(tabs)/tracking', params: { bookingId: id } } as any);
              }}>
              Track Now
            </Button>
            <Text color={theme.textMuted} fontSize={t(11)}>
              Customer can share this Tracking ID to view live status and driver location.
            </Text>
          </YStack>
        ) : null}
        {params.bookingId ? (
          <Text color={theme.textMuted} fontSize={t(12)}>Tracking booking: {params.bookingId}</Text>
        ) : null}

        {params.bookingId ? (
          <YStack
            backgroundColor={theme.bgCardSecondary}
            borderColor={theme.border}
            borderWidth={1}
            borderRadius={18}
            padding={14}
            gap="$2">
            <Text color={theme.text} fontSize={t(12)} fontWeight="700">
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
                      fontSize={t(11)}
                      paddingHorizontal={10}
                      paddingVertical={6}
                      borderRadius={999}
                      backgroundColor={isActive ? theme.accent : theme.bgCardSecondary}
                      color={isActive ? '#FFFFFF' : theme.textMuted}>
                      {step.label}
                    </Text>
                    {idx !== STATUS_STEPS.length - 1 ? (
                      <Text color={theme.textMuted} fontSize={t(12)}>
                        —
                      </Text>
                    ) : null}
                  </XStack>
                );
              })}
            </XStack>
          </YStack>
        ) : null}

        <YStack height={260} borderRadius={18} overflow="hidden" backgroundColor={theme.bgCardSecondary}>
          <TrackingMap
            token={mapboxToken}
            latitude={mapLat}
            longitude={mapLng}
            hasLiveLocation={Boolean(latestLocation?.lat && latestLocation?.lng)}
            pickupLat={pickupLat}
            pickupLng={pickupLng}
            dropLat={dropLat}
            dropLng={dropLng}
            pickupAddress={pickupAddress}
            dropAddress={dropAddress}
          />
        </YStack>

        <FlatList
          data={displayedLocations}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ gap: 12, paddingTop: 8, paddingBottom: 24 }}
          renderItem={({ item }) => (
            <YStack backgroundColor={theme.bgCard} borderColor={theme.border} borderWidth={1} padding={16} borderRadius={16} gap="$1">
              <Text color={theme.text} fontSize={t(13)}>Booking: {item.booking_id}</Text>
              <Text color={theme.textMuted} fontSize={t(12)}>
                Lat: {item.lat ?? '—'}, Lng: {item.lng ?? '—'}
              </Text>
              <Text color={theme.textMuted} fontSize={t(11)}>
                {new Date(item.updated_at).toLocaleString()}
              </Text>
            </YStack>
          )}
        />
      </YStack>
    </YStack>
  );
}
