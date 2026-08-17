import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from 'react-native';
import { Button, Text, XStack, YStack } from 'tamagui';

import { FontAwesome5 } from '@expo/vector-icons';
import { PropertyMediaGrid, uploadsToMediaItems, type PropertyMediaItem } from '@/components/property-media-grid';
import { formatPropertyListingTitle } from '@/lib/properties/property-listing-label';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { themes } from '@/constants/theme';
import { t } from '@/constants/typography';
import { formatDateTimeDDMMYYYY } from '@/lib/date-format';

type PropertyRow = {
  id: string;
  listing_type: string;
  property_category: string | null;
  ad_type: string | null;
  property_type: string | null;
  title: string | null;
  price: number | null;
  bedrooms: number | null;
  area_sqft: number | null;
  state: string | null;
  city: string | null;
  locality: string | null;
  status: string;
  created_at: string;
};

type UploadRow = {
  id: string;
  property_id: string;
  file_url: string;
  file_type: string | null;
};

export default function MyPropertiesScreen() {
  const colorScheme = useColorScheme(); const theme = colorScheme === 'dark' ? themes.dark : themes.light;
  const router = useRouter();
  const { session } = useSession();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<PropertyRow[]>([]);
  const [mediaByPropertyId, setMediaByPropertyId] = useState<Record<string, PropertyMediaItem[]>>({});

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
        .select(
          'id,listing_type,property_category,ad_type,property_type,title,price,bedrooms,area_sqft,state,city,locality,status,created_at'
        )
        .eq('owner_user_id', userId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (fetchError) throw new Error(fetchError.message);

      const rows = ((data as any) ?? []) as PropertyRow[];
      setItems(rows);

      const ids = rows.map((r) => r.id).filter(Boolean);
      if (!ids.length) {
        setMediaByPropertyId({});
        return;
      }

      const { data: uploads, error: upErr } = await supabase
        .from('property_uploads')
        .select('id,property_id,file_url,file_type')
        .in('property_id', ids)
        .order('created_at', { ascending: true });

      if (upErr) {
        setMediaByPropertyId({});
        return;
      }

      const grouped: Record<string, PropertyMediaItem[]> = {};
      for (const u of ((uploads as UploadRow[]) ?? [])) {
        const pid = String(u.property_id ?? '').trim();
        if (!pid) continue;
        if (!grouped[pid]) grouped[pid] = [];
        grouped[pid].push(...uploadsToMediaItems([u]));
      }
      setMediaByPropertyId(grouped);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load your properties.');
      setItems([]);
      setMediaByPropertyId({});
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

  const unpublish = async (id: string) => {
    if (!id) return;

    try {
      setLoading(true);
      const { error: updateError } = await supabase.from('properties').update({ status: 'draft' }).eq('id', id);
      if (updateError) throw new Error(updateError.message);
      await load();
    } catch (e) {
      Alert.alert('Failed', e instanceof Error ? e.message : 'Could not unpublish.');
    } finally {
      setLoading(false);
    }
  };

  const openEditWizard = (id: string) => {
    router.push({ pathname: '/properties/post', params: { editId: id } } as any);
  };

  const pageBg = theme.bg;
  const border = theme.border;
  const titleColor = theme.text;
  const muted = theme.textMuted;
  const panelBg = theme.bgSecondary;

  return (
    <View style={{ flex: 1, backgroundColor: pageBg }}>
      <YStack backgroundColor={theme.primary} padding={16} paddingTop={18}>
        <XStack alignItems="center" justifyContent="center" position="relative">
          <Button
            size="$3"
            chromeless
            color="#FFFFFF"
            position="absolute"
            left={0}
            fontSize={36}
            fontWeight="900"
            onPress={() => router.back()}>
            ‹
          </Button>
          <YStack alignItems="center">
            <Text color="#FFFFFF" fontSize={t(16)} fontWeight="800">
              My Properties
            </Text>
            <Text color={theme.textMuted} fontSize={t(12)} fontWeight="600">
              Manage your listings
            </Text>
          </YStack>
        </XStack>
      </YStack>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <YStack gap="$3">
          <Text color={muted} fontSize={t(12)}>
            Published listings appear in search. Draft listings are hidden until you review all steps and publish.
          </Text>

          <XStack gap="$2" flexWrap="wrap" justifyContent="space-between" alignItems="center">
            <Button backgroundColor={theme.success} color="#FFFFFF" onPress={() => void load()} disabled={loading}>
              {loading ? <ActivityIndicator size="small" color="#FFFFFF" /> : <FontAwesome5 name="sync" size={14} color="#FFFFFF" />}
            </Button>
            <Button backgroundColor="#1F4E79" color="#FFFFFF" hoverStyle={{ backgroundColor: '#1F4E79' }} pressStyle={{ backgroundColor: '#1F4E79' }} onPress={() => router.push('/properties/post' as any)}>
              Post New
            </Button>
          </XStack>

          {error ? <Text color={theme.danger}>{error}</Text> : null}
          {loading && !items.length ? <Text color={muted}>Loading…</Text> : null}

          {items.map((p) => {
            const location = `${p.locality ? `${p.locality}, ` : ''}${p.city ?? ''}${p.city ? ', ' : ''}${p.state ?? ''}`.trim();
            const status = String(p.status ?? '').trim().toLowerCase();
            const isPublished = status === 'published';
            const cardMedia = mediaByPropertyId[p.id] ?? [];
            const listingTitle = formatPropertyListingTitle(p);

            return (
              <YStack key={p.id} backgroundColor={theme.bgCard} borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$2">
                <XStack justifyContent="space-between" alignItems="flex-start" gap="$2">
                  <YStack flex={1} gap="$1">
                    <Text color={titleColor} fontWeight="900" fontSize={t(14)} numberOfLines={2}>
                      {listingTitle}
                    </Text>
                    <Text color={muted} fontSize={t(12)} numberOfLines={1}>
                      {location || '—'}
                    </Text>
                  </YStack>
                  <YStack alignItems="flex-end" gap="$1">
                    <Text color={isPublished ? theme.success : theme.warning} fontWeight="900" fontSize={t(12)}>
                      {isPublished ? 'PUBLISHED' : 'DRAFT'}
                    </Text>
                    <Text color={muted} fontSize={t(11)}>
                      {String(p.listing_type ?? '').toUpperCase()}
                    </Text>
                    <Text color={muted} fontSize={t(10)} textAlign="right">
                      {isPublished ? 'Visible in search' : 'Hidden from search'}
                    </Text>
                  </YStack>
                </XStack>

                {cardMedia.length ? (
                  <PropertyMediaGrid items={cardMedia} size={72} />
                ) : null}

                <XStack justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$2">
                  <Text color={theme.success} fontWeight="900">
                    {p.price ? `₹${Number(p.price).toLocaleString('en-IN')}` : 'Price on request'}
                  </Text>

                  <XStack gap="$2" flexWrap="wrap">
                    <Pressable
                      onPress={() => {
                        router.push({ pathname: '/properties/[id]', params: { id: p.id } } as any);
                      }}>
                      <Text color={theme.info} fontWeight="900" fontSize={t(12)}>
                        View
                      </Text>
                    </Pressable>

                    <Pressable onPress={() => openEditWizard(p.id)}>
                      <Text color={theme.info} fontWeight="900" fontSize={t(12)}>
                        Edit
                      </Text>
                    </Pressable>

                    {isPublished ? (
                      <Pressable
                        onPress={() => {
                          Alert.alert(
                            'Unpublish listing?',
                            'This will hide the property from search. You can edit all steps and publish again anytime.',
                            [
                              { text: 'Cancel', style: 'cancel' },
                              {
                                text: 'Unpublish',
                                style: 'destructive',
                                onPress: () => void unpublish(p.id),
                              },
                            ]
                          );
                        }}>
                        <Text color={theme.danger} fontWeight="900" fontSize={t(12)}>
                          Unpublish
                        </Text>
                      </Pressable>
                    ) : (
                      <Pressable onPress={() => openEditWizard(p.id)}>
                        <Text color={theme.success} fontWeight="900" fontSize={t(12)}>
                          Edit & Publish
                        </Text>
                      </Pressable>
                    )}
                  </XStack>
                </XStack>

                <YStack backgroundColor={panelBg} borderRadius={12} padding={10} borderWidth={1} borderColor={border}>
                  <Text color={muted} fontSize={t(11)}>
                    Created: {formatDateTimeDDMMYYYY(p.created_at)}
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
