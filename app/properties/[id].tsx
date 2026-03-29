import React, { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { Button, Text, XStack, YStack } from 'tamagui';

import { supabase } from '@/lib/supabase';
import { useLocalSearchParams, useRouter } from 'expo-router';

type PropertyRow = {
  id: string;
  listing_type: string;
  property_type: string | null;
  title: string | null;
  description: string | null;
  price: number | null;
  deposit: number | null;
  maintenance: number | null;
  available_from: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  area_sqft: number | null;
  furnishing: string | null;
  parking: string | null;
  address_line1: string | null;
  address_line2: string | null;
  state: string | null;
  city: string | null;
  locality: string | null;
  pincode: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  status: string;
  created_at: string;
};

type UploadRow = {
  id: string;
  file_url: string;
  file_type: string;
  file_name: string | null;
  created_at: string;
};

export default function PropertyDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = String(params.id ?? '').trim();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [item, setItem] = useState<PropertyRow | null>(null);
  const [uploads, setUploads] = useState<UploadRow[]>([]);

  useEffect(() => {
    if (!id) return;
    let active = true;

    const run = async () => {
      setError(null);
      setLoading(true);
      try {
        const { data, error: fetchError } = await supabase
          .from('properties')
          .select(
            'id,listing_type,property_type,title,description,price,deposit,maintenance,available_from,bedrooms,bathrooms,area_sqft,furnishing,parking,address_line1,address_line2,state,city,locality,pincode,contact_name,contact_phone,status,created_at'
          )
          .eq('id', id)
          .maybeSingle();

        if (!active) return;
        if (fetchError) throw new Error(fetchError.message);

        setItem((data as any) as PropertyRow);

        const { data: up, error: upErr } = await supabase
          .from('property_uploads')
          .select('id,file_url,file_type,file_name,created_at')
          .eq('property_id', id)
          .order('created_at', { ascending: true })
          .limit(20);

        if (!active) return;
        if (upErr) {
          setUploads([]);
        } else {
          setUploads(((up as any) ?? []) as UploadRow[]);
        }
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : 'Failed to load property.');
      } finally {
        if (active) setLoading(false);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [id]);

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
              Property
            </Text>
            <Text color="#9CA3AF" fontSize={12} fontWeight="600">
              Details
            </Text>
          </YStack>
        </XStack>
      </YStack>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        {loading ? <Text color={muted}>Loading...</Text> : null}
        {error ? <Text color="#EF4444">{error}</Text> : null}

        {item ? (
          <YStack gap="$3">
            <YStack backgroundColor="#FFFFFF" borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$2">
              <Text color={titleColor} fontWeight="900" fontSize={16}>
                {item.title ?? 'Property'}
              </Text>
              <Text color={muted} fontSize={12}>
                {(item.locality ?? '') + (item.locality ? ', ' : '') + (item.city ?? '') + (item.city ? ', ' : '') + (item.state ?? '')}
              </Text>
              <Text color="#10B981" fontWeight="900" fontSize={16}>
                {item.price ? `₹${Number(item.price).toLocaleString('en-IN')}` : 'Price on request'}
              </Text>
              <Text color={muted} fontSize={12}>
                {item.bedrooms ? `${item.bedrooms}BHK` : ''} {item.bathrooms ? `• ${item.bathrooms} bath` : ''} {item.area_sqft ? `• ${item.area_sqft} sqft` : ''}
              </Text>
              {item.description ? <Text color={muted}>{item.description}</Text> : null}
            </YStack>

            <YStack backgroundColor={panelBg} borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$2">
              <Text color={titleColor} fontWeight="900">
                Contact
              </Text>
              <Text color={muted}>
                {item.contact_name ?? 'Owner'}
              </Text>
              <Text color={muted}>
                {item.contact_phone ?? '—'}
              </Text>
              {item.contact_phone ? (
                <XStack gap="$2" flexWrap="wrap">
                  <Button
                    backgroundColor="#10B981"
                    color="#0B0B12"
                    onPress={() => {
                      Linking.openURL(`tel:${item.contact_phone}`);
                    }}>
                    Call
                  </Button>
                  <Button
                    backgroundColor="#22C55E"
                    color="#0B0B12"
                    onPress={() => {
                      const digits = String(item.contact_phone ?? '').replace(/\D/g, '');
                      Linking.openURL(`https://wa.me/${digits}`);
                    }}>
                    WhatsApp
                  </Button>
                </XStack>
              ) : null}
            </YStack>

            <YStack backgroundColor="#FFFFFF" borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$2">
              <Text color={titleColor} fontWeight="900">
                Media
              </Text>
              {uploads.length ? (
                uploads.map((u) => {
                  const url = String(u.file_url ?? '').trim();
                  const label = u.file_name || u.file_type || 'File';
                  return (
                    <Pressable
                      key={u.id}
                      onPress={() => {
                        if (!url) return;
                        Linking.openURL(url);
                      }}>
                      <XStack
                        justifyContent="space-between"
                        alignItems="center"
                        paddingVertical={8}
                        paddingHorizontal={10}
                        borderRadius={10}
                        backgroundColor={panelBg}
                        borderWidth={1}
                        borderColor={border}
                        gap="$2">
                        <Text color={titleColor} fontSize={12} fontWeight="800" numberOfLines={1}>
                          {label}
                        </Text>
                        <Text color={muted} fontSize={11}>
                          Open
                        </Text>
                      </XStack>
                    </Pressable>
                  );
                })
              ) : (
                <Text color={muted}>No uploads.</Text>
              )}
            </YStack>
          </YStack>
        ) : null}
      </ScrollView>
    </View>
  );
}
