import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Button, Text, XStack, YStack } from 'tamagui';

import { themes } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';
import { useRouter } from 'expo-router';
import { t } from '@/constants/typography';

type PropBooking = {
  id: string;
  property_id: string;
  user_id: string;
  status: string;
  contact_name: string | null;
  contact_phone: string | null;
  created_at: string;
  properties: { title: string | null; price: number | null; city: string | null; locality: string | null } | null;
};

export default function PropertiesTabScreen() {
  const router = useRouter();
  const { session, profile } = useSession();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? themes.dark : themes.light;

  const role = (profile?.role ?? 'customer').toString().trim().toLowerCase();
  const providerSubtype = String((session?.user?.user_metadata as any)?.provider_subtype ?? '').trim().toLowerCase();

  const canUse = useMemo(() => {
    return Boolean(session?.user?.id) && role === 'provider' && providerSubtype === 'property_owner';
  }, [providerSubtype, role, session?.user?.id]);

  const [bookings, setBookings] = useState<PropBooking[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchBookings = async () => {
    if (!session?.user?.id) return;
    setBookingsLoading(true);
    try {
      const { data } = await supabase
        .from('property_bookings')
        .select('id, property_id, user_id, status, contact_name, contact_phone, created_at, properties(title, price, city, locality)')
        .eq('owner_user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(60);
      setBookings(((data as any) ?? []) as PropBooking[]);
    } catch { /* ignore */ } finally { setBookingsLoading(false); }
  };

  useEffect(() => {
    if (!canUse) return;
    void fetchBookings();
  }, [canUse]);

  useEffect(() => {
    if (canUse) return;
    router.replace('/home' as any);
  }, [canUse, router]);

  const handleUpdateStatus = async (bookingId: string, status: string) => {
    setBusyId(bookingId);
    try {
      await supabase.from('property_bookings').update({ status, updated_at: new Date().toISOString() }).eq('id', bookingId);
      try {
        await supabase.functions.invoke('send-property-notification', {
          body: {
            event_type: 'booking_status_changed',
            booking_id: bookingId,
            status,
            changed_by: 'owner',
          },
        });
      } catch { /* ignore notification failures */ }
      await fetchBookings();
    } catch { /* ignore */ } finally { setBusyId(null); }
  };

  const pageBg = theme.bg;
  const border = theme.border;
  const titleColor = theme.text;
  const muted = theme.textMuted;
  const panelBg = theme.bgCard;

  if (!canUse) return null;

  return (
    <View style={{ flex: 1, backgroundColor: pageBg }}>
      <YStack backgroundColor={theme.headerBg} padding={16} paddingTop={18} borderBottomWidth={1} borderBottomColor={border}>
        <Text color={titleColor} fontSize={t(18)} fontWeight="900">Properties</Text>
        <Text color={muted} fontSize={t(12)} fontWeight="600">Manage your property listings</Text>
      </YStack>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <YStack gap="$3">
          <YStack backgroundColor={panelBg} borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$2">
            <Text color={titleColor} fontWeight="900" fontSize={t(14)}>Quick Actions</Text>
            <XStack gap="$2" flexWrap="wrap">
              <Button backgroundColor="#1F4E79" color="#FFFFFF" hoverStyle={{ backgroundColor: '#1F4E79' }} pressStyle={{ backgroundColor: '#1F4E79' }} onPress={() => router.push('/properties/my-properties' as any)}>
                My Properties
              </Button>
              <Button backgroundColor={theme.success} color="#FFFFFF" onPress={() => router.push('/properties/post' as any)}>
                Post Property
              </Button>
              <Button backgroundColor={theme.bgCardSecondary} color="#FFFFFF" onPress={() => router.push('/properties' as any)}>
                Browse
              </Button>
            </XStack>
          </YStack>

          <YStack backgroundColor={panelBg} borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$2">
            <XStack justifyContent="space-between" alignItems="center">
              <Text color={titleColor} fontWeight="900" fontSize={t(14)}>Customer Bookings</Text>
              <Button size="$2" backgroundColor={theme.accent} color="#FFFFFF" borderRadius={10}
                onPress={fetchBookings} disabled={bookingsLoading}>
                {bookingsLoading ? 'Loading...' : 'Refresh'}
              </Button>
            </XStack>
            {!bookings.length && !bookingsLoading ? (
              <Text color={muted} fontSize={t(12)}>No booking requests yet.</Text>
            ) : null}
            {bookings.map((pb) => {
              const prop = pb.properties;
              const statusColor = pb.status === 'confirmed' ? theme.success : pb.status === 'cancelled' ? theme.danger : theme.warning;
              return (
                <YStack key={pb.id} backgroundColor={theme.bgCardSecondary} borderRadius={14} padding={12} gap="$2" borderWidth={1} borderColor={border}>
                  <XStack justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$2">
                    <YStack flex={1} gap={4}>
                      <Text color={titleColor} fontWeight="700" fontSize={t(13)}>{prop?.title ?? 'Property'}</Text>
                      <Text color={muted} fontSize={t(11)}>{[prop?.locality, prop?.city].filter(Boolean).join(', ') || '—'}</Text>
                      {pb.contact_name ? <Text color={muted} fontSize={t(11)}>From: {pb.contact_name}</Text> : null}
                    </YStack>
                    <Text color={statusColor} fontSize={t(11)} fontWeight="700" textTransform="uppercase">{pb.status}</Text>
                  </XStack>
                  <XStack gap="$2" flexWrap="wrap">
                    {pb.status === 'pending' ? (
                      <>
                        <Button size="$1" backgroundColor={theme.success} color="#FFFFFF" borderRadius={999}
                          disabled={busyId === pb.id}
                          onPress={() => handleUpdateStatus(pb.id, 'confirmed')}>Confirm</Button>
                        <Button size="$1" backgroundColor={theme.danger} color="#FFFFFF" borderRadius={999}
                          disabled={busyId === pb.id}
                          onPress={() => handleUpdateStatus(pb.id, 'cancelled')}>Reject</Button>
                      </>
                    ) : null}
                    <Button size="$1" backgroundColor={theme.bgCardSecondary} color={theme.text} borderRadius={999}
                      onPress={() => router.push({ pathname: '/properties/[id]', params: { id: pb.property_id } } as any)}>View</Button>
                  </XStack>
                </YStack>
              );
            })}
          </YStack>

          <YStack backgroundColor={panelBg} borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$2">
            <Text color={titleColor} fontWeight="900" fontSize={t(14)}>Tips</Text>
            <Text color={muted} fontSize={t(12)}>Keep photos clear and update pricing before publishing.</Text>
          </YStack>
        </YStack>
      </ScrollView>
    </View>
  );
}
