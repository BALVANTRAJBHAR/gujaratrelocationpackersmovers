import React, { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, View } from 'react-native';
import { Button, Input, Text, XStack, YStack } from 'tamagui';

import { PropertyMediaGrid, uploadsToMediaItems } from '@/components/property-media-grid';
import { formatPropertyListingTitle } from '@/lib/properties/property-listing-label';
import { supabase } from '@/lib/supabase';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSession } from '@/providers/session-provider';
import { themes } from '@/constants/theme';

type PropertyRow = {
  id: string;
  owner_user_id: string;
  listing_type: string;
  property_category: string | null;
  ad_type: string | null;
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
  carpet_area_sqft: number | null;
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
  const colorScheme = useColorScheme(); const theme = colorScheme === 'dark' ? themes.dark : themes.light;
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = String(params.id ?? '').trim();
  const { session } = useSession();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [item, setItem] = useState<PropertyRow | null>(null);
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [bookMsg, setBookMsg] = useState('');
  const [bookingBusy, setBookingBusy] = useState(false);
  const [existingBooking, setExistingBooking] = useState<string | null>(null);

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
            'id,owner_user_id,listing_type,property_category,ad_type,property_type,title,description,price,deposit,maintenance,available_from,bedrooms,bathrooms,area_sqft,carpet_area_sqft,furnishing,parking,address_line1,address_line2,state,city,locality,pincode,contact_name,contact_phone,status,created_at'
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

  useEffect(() => {
    if (!id || !session?.user?.id) return;
    let active = true;
    const check = async () => {
      const { data } = await supabase
        .from('property_bookings')
        .select('id,status')
        .eq('property_id', id)
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (!active) return;
      if (data) setExistingBooking((data as any).id);
    };
    void check();
    return () => { active = false; };
  }, [id, session?.user?.id]);

  const handleBook = async () => {
    if (!session?.user?.id) { Alert.alert('Please sign in to book a property.'); return; }
    if (!item) return;
    if (item.owner_user_id === session.user.id) { Alert.alert('You cannot book your own property.'); return; }
    setBookingBusy(true);
    try {
      const phone = String((session?.user?.user_metadata as any)?.phone ?? '');
      const name = String((session?.user?.user_metadata as any)?.full_name || (session?.user?.user_metadata as any)?.name || '');
      const { error: insErr } = await supabase.from('property_bookings').insert({
        property_id: item.id,
        user_id: session.user.id,
        owner_user_id: item.owner_user_id,
        status: 'pending',
        message: bookMsg || null,
        contact_name: name || null,
        contact_phone: phone || null,
      });
      if (insErr) throw new Error(insErr.message);
      Alert.alert('Booking sent!', 'The property owner has been notified. You can track the status in your dashboard.');
      setBookMsg('');
      setExistingBooking('temp');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to book.');
    } finally {
      setBookingBusy(false);
    }
  };

  const handleCancelBooking = async () => {
    if (!existingBooking) return;
    setBookingBusy(true);
    try {
      const { error } = await supabase.from('property_bookings').update({ status: 'cancelled' }).eq('id', existingBooking);
      if (error) throw new Error(error.message);
      setExistingBooking(null);
      Alert.alert('Booking cancelled');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to cancel.');
    } finally {
      setBookingBusy(false);
    }
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
          <Button size="$3" chromeless color="#FFFFFF" position="absolute" left={0} onPress={() => router.back()}>
            ‹
          </Button>
          <YStack alignItems="center">
            <Text color="#FFFFFF" fontSize={16} fontWeight="800">
              Property
            </Text>
            <Text color={theme.textMuted} fontSize={12} fontWeight="600">
              Details
            </Text>
          </YStack>
        </XStack>
      </YStack>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        {loading ? <Text color={muted}>Loading...</Text> : null}
        {error ? <Text color={theme.danger}>{error}</Text> : null}

        {item ? (
          <YStack gap="$3">
            <YStack backgroundColor={theme.bgCard} borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$2">
              <Text color={titleColor} fontWeight="900" fontSize={16}>
                {formatPropertyListingTitle(item)}
              </Text>
              <Text color={muted} fontSize={12}>
                {(item.locality ?? '') + (item.locality ? ', ' : '') + (item.city ?? '') + (item.city ? ', ' : '') + (item.state ?? '')}
              </Text>
              <Text color={theme.success} fontWeight="900" fontSize={16}>
                {item.price ? `₹${Number(item.price).toLocaleString('en-IN')}` : 'Price on request'}
              </Text>
              <Text color={muted} fontSize={12}>
                {item.bedrooms ? `${item.bedrooms}BHK` : ''} {item.bathrooms ? `• ${item.bathrooms} bath` : ''} {item.area_sqft ? `• ${item.area_sqft} sqft` : ''}
              </Text>
              {item.description ? <Text color={muted}>{item.description}</Text> : null}
            </YStack>

            {session?.user?.id && item.owner_user_id !== session.user.id ? (
              <YStack backgroundColor={theme.bgSecondary} borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$2">
                <Text color={titleColor} fontWeight="900">Book this property</Text>
                <Text color={muted} fontSize={12}>
                  {existingBooking ? 'You have already sent a booking request.' : 'Send an inquiry to the owner.'}
                </Text>
                {existingBooking ? (
                  <Button
                    backgroundColor={theme.danger}
                    color="#FFFFFF"
                    disabled={bookingBusy}
                    onPress={handleCancelBooking}>
                    Cancel booking request
                  </Button>
                ) : (
                  <>
                    <Input
                      value={bookMsg}
                      onChangeText={setBookMsg}
                      placeholder="Optional message to the owner"
                      backgroundColor={theme.inputBg}
                      borderColor={border}
                      color={theme.inputText}
                    />
                    <Button
                      backgroundColor={theme.accent}
                      color="#FFFFFF"
                      disabled={bookingBusy}
                      onPress={handleBook}>
                      {bookingBusy ? 'Sending...' : 'Send inquiry'}
                    </Button>
                  </>
                )}
              </YStack>
            ) : null}

            <YStack backgroundColor={theme.bgSecondary} borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$2">
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
                    backgroundColor={theme.success}
                    color="#FFFFFF"
                    onPress={() => {
                      Linking.openURL(`tel:${item.contact_phone}`);
                    }}>
                    Call
                  </Button>
                  <Button
                    backgroundColor={theme.success}
                    color="#FFFFFF"
                    onPress={() => {
                      const digits = String(item.contact_phone ?? '').replace(/\D/g, '');
                      Linking.openURL(`https://wa.me/${digits}`);
                    }}>
                    WhatsApp
                  </Button>
                </XStack>
              ) : null}
            </YStack>

            <YStack backgroundColor={theme.bgCard} borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$2">
              <Text color={titleColor} fontWeight="900">
                Media
              </Text>
              <PropertyMediaGrid items={uploadsToMediaItems(uploads)} size={108} emptyText="No uploads." />
            </YStack>
          </YStack>
        ) : null}
      </ScrollView>
    </View>
  );
}
