import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { Button, Text, XStack, YStack } from 'tamagui';

import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';
import { useRouter } from 'expo-router';

type PropertyRow = {
  id: string;
  listing_type: string;
  property_type: string | null;
  title: string | null;
  price: number | null;
  state: string | null;
  city: string | null;
  locality: string | null;
  status: string;
  created_at: string;
};

export default function MyPropertiesScreen() {
  const router = useRouter();
  const { session } = useSession();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<PropertyRow[]>([]);

  const userId = session?.user?.id ?? '';

  const canUse = useMemo(() => {
    return Boolean(userId);
  }, [userId]);

  const load = async () => {
    if (!userId) return;

    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('properties')
        .select('id,listing_type,property_type,title,price,state,city,locality,status,created_at')
        .eq('owner_user_id', userId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (fetchError) throw new Error(fetchError.message);
      setItems(((data as any) ?? []) as PropertyRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load your properties.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canUse) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUse]);

  useEffect(() => {
    if (canUse) return;
    router.replace({ pathname: '/auth/login', params: { redirectTo: '/properties/my-properties' } } as any);
  }, [canUse, router]);

  const updateStatus = async (id: string, nextStatus: 'draft' | 'published') => {
    if (!id) return;

    try {
      setLoading(true);
      const { error: updateError } = await supabase.from('properties').update({ status: nextStatus }).eq('id', id);
      if (updateError) throw new Error(updateError.message);
      await load();
    } catch (e) {
      Alert.alert('Failed', e instanceof Error ? e.message : 'Could not update status.');
    } finally {
      setLoading(false);
    }
  };

  const pageBg = '#FFFFFF';
  const border = '#E5E7EB';
  const titleColor = '#0F172A';
  const muted = '#64748B';
  const panelBg = '#F8FAFC';

  return (
    <View style={{ flex: 1, backgroundColor: pageBg }}>
      <YStack backgroundColor="#111827" padding={16} paddingTop={18}>
        <XStack alignItems="center" justifyContent="center" position="relative">
          <Button size="$3" chromeless color="#FFFFFF" position="absolute" left={0} onPress={() => router.back()}>
            ‹
          </Button>
          <YStack alignItems="center">
            <Text color="#FFFFFF" fontSize={16} fontWeight="800">
              My Properties
            </Text>
            <Text color="#9CA3AF" fontSize={12} fontWeight="600">
              Manage your listings
            </Text>
          </YStack>
        </XStack>
      </YStack>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <YStack gap="$3">
          <XStack gap="$2" flexWrap="wrap" justifyContent="space-between" alignItems="center">
            <Button backgroundColor="#10B981" color="#0B0B12" onPress={() => void load()} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </Button>
            <Button backgroundColor="#1F4E79" color="#FFFFFF" onPress={() => router.push('/properties/post' as any)}>
              Post New
            </Button>
          </XStack>

          {error ? <Text color="#EF4444">{error}</Text> : null}
          {loading && !items.length ? <Text color={muted}>Loading…</Text> : null}

          {items.map((p) => {
            const location = `${p.locality ? `${p.locality}, ` : ''}${p.city ?? ''}${p.city ? ', ' : ''}${p.state ?? ''}`.trim();
            const status = String(p.status ?? '').trim().toLowerCase();

            return (
              <YStack key={p.id} backgroundColor="#FFFFFF" borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$2">
                <XStack justifyContent="space-between" alignItems="flex-start" gap="$2">
                  <YStack flex={1} gap="$1">
                    <Text color={titleColor} fontWeight="900" fontSize={14} numberOfLines={1}>
                      {p.title ?? 'Property'}
                    </Text>
                    <Text color={muted} fontSize={12} numberOfLines={1}>
                      {location || '—'}
                    </Text>
                  </YStack>
                  <YStack alignItems="flex-end" gap="$1">
                    <Text color={status === 'published' ? '#10B981' : '#F59E0B'} fontWeight="900" fontSize={12}>
                      {status ? status.toUpperCase() : '—'}
                    </Text>
                    <Text color={muted} fontSize={11}>
                      {String(p.listing_type ?? '').toUpperCase()}
                    </Text>
                  </YStack>
                </XStack>

                <XStack justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$2">
                  <Text color="#10B981" fontWeight="900">
                    {p.price ? `₹${Number(p.price).toLocaleString('en-IN')}` : 'Price on request'}
                  </Text>

                  <XStack gap="$2" flexWrap="wrap">
                    <Pressable
                      onPress={() => {
                        router.push({ pathname: '/properties/[id]', params: { id: p.id } } as any);
                      }}>
                      <Text color="#2563EB" fontWeight="900" fontSize={12}>
                        View
                      </Text>
                    </Pressable>

                    {status === 'published' ? (
                      <Pressable
                        onPress={() => {
                          Alert.alert('Unpublish?', 'This will hide your property from public search.', [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Unpublish', style: 'destructive', onPress: () => void updateStatus(p.id, 'draft') },
                          ]);
                        }}>
                        <Text color="#EF4444" fontWeight="900" fontSize={12}>
                          Unpublish
                        </Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        onPress={() => {
                          Alert.alert('Publish?', 'This will make your property visible in search.', [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Publish', onPress: () => void updateStatus(p.id, 'published') },
                          ]);
                        }}>
                        <Text color="#10B981" fontWeight="900" fontSize={12}>
                          Publish
                        </Text>
                      </Pressable>
                    )}
                  </XStack>
                </XStack>

                <YStack backgroundColor={panelBg} borderRadius={12} padding={10} borderWidth={1} borderColor={border}>
                  <Text color={muted} fontSize={11}>
                    Created: {new Date(p.created_at).toLocaleString()}
                  </Text>
                </YStack>
              </YStack>
            );
          })}

          {!loading && !items.length ? <Text color={muted}>No properties yet. Tap “Post New”.</Text> : null}
        </YStack>
      </ScrollView>
    </View>
  );
}
