import React, { useEffect, useState } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, View } from 'react-native';
import { Button, Input, Text, XStack, YStack } from 'tamagui';

import { rewardReferralOnBooking } from '@/lib/wallet';
import { PropertyMediaGrid, uploadsToMediaItems } from '@/components/property-media-grid';
import { formatPropertyListingTitle } from '@/lib/properties/property-listing-label';
import { supabase } from '@/lib/supabase';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSession } from '@/providers/session-provider';
import { themes } from '@/constants/theme';
import MobileDatePicker from '@/components/MobileDatePicker';

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

type MeetingRow = {
  id: string;
  meeting_date: string;
  meeting_time: string;
  status: string;
  message: string | null;
};

function MobileTimePicker({ value, onChange, open, onClose }: {
  value: Date | null;
  onChange: (d: Date) => void;
  open: boolean;
  onClose: () => void;
}) {
  const base = value ?? new Date();
  const h = base.getHours();
  const m = base.getMinutes();
  const pick = (nh: number, nm: number) => {
    const d = new Date(base);
    d.setHours(nh, nm, 0, 0);
    onChange(d);
    onClose();
  };
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <YStack flex={1} justifyContent="center" alignItems="center" backgroundColor="rgba(0,0,0,0.5)">
        <YStack backgroundColor="#FFF" borderRadius={16} padding={20} width="90%" maxWidth={360} gap={14}>
          <Text fontWeight="800" fontSize={18} color="#000">Choose a time</Text>
          <XStack justifyContent="center" alignItems="center" gap={16}>
            <YStack alignItems="center" gap={8}>
              <Pressable onPress={() => pick((h + 1) % 24, m)}><Text fontSize={22} color="#1F4E79" fontWeight="700">▲</Text></Pressable>
              <Text fontWeight="800" fontSize={22} color="#000">{String(h).padStart(2, '0')}</Text>
              <Pressable onPress={() => pick((h + 23) % 24, m)}><Text fontSize={22} color="#1F4E79" fontWeight="700">▼</Text></Pressable>
            </YStack>
            <Text fontSize={20} color="#666">:</Text>
            <YStack alignItems="center" gap={8}>
              <Pressable onPress={() => pick(h, (m + 15) % 60)}><Text fontSize={22} color="#1F4E79" fontWeight="700">▲</Text></Pressable>
              <Text fontWeight="800" fontSize={22} color="#000">{String(m).padStart(2, '0')}</Text>
              <Pressable onPress={() => pick(h, (m + 45) % 60)}><Text fontSize={22} color="#1F4E79" fontWeight="700">▼</Text></Pressable>
            </YStack>
          </XStack>
          <Pressable onPress={onClose}><Text color="#1F4E79" fontWeight="700" textAlign="center">Cancel</Text></Pressable>
        </YStack>
      </YStack>
    </Modal>
  );
}

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
  const [following, setFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [followBusy, setFollowBusy] = useState(false);
  const [meetingDate, setMeetingDate] = useState<Date | null>(null);
  const [meetingTime, setMeetingTime] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [meetingMsg, setMeetingMsg] = useState('');
  const [meetingBusy, setMeetingBusy] = useState(false);
  const [myMeeting, setMyMeeting] = useState<MeetingRow | null>(null);
  const [isOwner, setIsOwner] = useState(false);

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
      setIsOwner(item?.owner_user_id === session.user.id);
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

  useEffect(() => {
    if (!id) return;
    let active = true;
    const run = async () => {
      try {
        const { count } = await supabase
          .from('property_followers')
          .select('user_id', { count: 'exact', head: true })
          .eq('property_id', id);
        if (active) setFollowersCount(Number(count ?? 0));
      } catch { /* ignore */ }
    };
    void run();
    return () => { active = false; };
  }, [id, following]);

  useEffect(() => {
    if (!id || !session?.user?.id || !item) return;
    let active = true;
    const run = async () => {
      try {
        const { data: follow } = await supabase
          .from('property_followers')
          .select('user_id')
          .eq('property_id', id)
          .eq('user_id', session.user.id)
          .maybeSingle();
        if (active) setFollowing(Boolean(follow));

        const { data: meeting } = await supabase
          .from('property_meetings')
          .select('id, meeting_date, meeting_time, status, message')
          .eq('property_id', id)
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (active) setMyMeeting((meeting as MeetingRow) ?? null);
      } catch { /* ignore */ }
    };
    void run();
    return () => { active = false; };
  }, [id, session?.user?.id, item?.owner_user_id]);

  const handleToggleFollow = async () => {
    if (!session?.user?.id) { Alert.alert('Please sign in to follow this property.'); return; }
    if (!item) return;
    setFollowBusy(true);
    try {
      if (following) {
        const { error } = await supabase
          .from('property_followers')
          .delete()
          .eq('property_id', item.id)
          .eq('user_id', session.user.id);
        if (error) throw new Error(error.message);
        setFollowing(false);
      } else {
        const { error } = await supabase
          .from('property_followers')
          .insert({ property_id: item.id, user_id: session.user.id });
        if (error) throw new Error(error.message);
        setFollowing(true);
        const name = String((session?.user?.user_metadata as any)?.full_name || (session?.user?.user_metadata as any)?.name || 'A customer');
        try {
          await supabase.functions.invoke('send-property-notification', {
            body: {
              event_type: 'property_followed',
              property_id: item.id,
              property_title: item.title,
              owner_user_id: item.owner_user_id,
              follower_name: name,
              follow_action: 'followed',
            },
          });
        } catch { /* ignore notification failures */ }
      }
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to update follow.');
    } finally {
      setFollowBusy(false);
    }
  };

  const handleScheduleMeeting = async () => {
    if (!session?.user?.id) { Alert.alert('Please sign in to schedule a visit.'); return; }
    if (!item) return;
    if (!meetingDate || !meetingTime) {
      Alert.alert('Select a date and time for the visit.');
      return;
    }
    setMeetingBusy(true);
    try {
      const yyyy = meetingDate.getFullYear();
      const mm = String(meetingDate.getMonth() + 1).padStart(2, '0');
      const dd = String(meetingDate.getDate()).padStart(2, '0');
      const meetingDateStr = `${yyyy}-${mm}-${dd}`;
      const meetingTimeStr = `${String(meetingTime.getHours()).padStart(2, '0')}:${String(meetingTime.getMinutes()).padStart(2, '0')}:00`;
      const phone = String((session?.user?.user_metadata as any)?.phone ?? '');
      const name = String((session?.user?.user_metadata as any)?.full_name || (session?.user?.user_metadata as any)?.name || '');

      const { data: meetingData, error: insErr } = await supabase.from('property_meetings').insert({
        property_id: item.id,
        owner_user_id: item.owner_user_id,
        user_id: session.user.id,
        meeting_date: meetingDateStr,
        meeting_time: meetingTimeStr,
        message: meetingMsg || null,
        contact_name: name || null,
        contact_phone: phone || null,
        status: 'pending',
      }).select('id, meeting_date, meeting_time, status, message').maybeSingle();
      if (insErr) throw new Error(insErr.message);

      try {
        await supabase.functions.invoke('send-property-notification', {
          body: {
            event_type: 'meeting_scheduled',
            property_id: item.id,
            property_title: item.title,
            owner_user_id: item.owner_user_id,
            user_id: session.user.id,
            contact_name: name || 'Customer',
            meeting_date: meetingDateStr,
            meeting_time: meetingTimeStr.slice(0, 5),
            send_email: true,
          },
        });
      } catch { /* ignore notification failures */ }

      setMyMeeting((meetingData as MeetingRow) ?? null);
      setMeetingMsg('');
      setMeetingDate(null);
      setMeetingTime(null);
      Alert.alert('Meeting requested!', 'The owner has been notified. You will get an update when they confirm.');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to schedule meeting.');
    } finally {
      setMeetingBusy(false);
    }
  };

  const handleCancelMeeting = async () => {
    if (!myMeeting || !session?.user?.id) return;
    if (!item) return;
    setMeetingBusy(true);
    try {
      const { error } = await supabase
        .from('property_meetings')
        .update({ status: 'cancelled' })
        .eq('id', myMeeting.id);
      if (error) throw new Error(error.message);
      try {
        await supabase.functions.invoke('send-property-notification', {
          body: {
            event_type: 'meeting_status_changed',
            property_id: item.id,
            property_title: item.title,
            meeting_id: myMeeting.id,
            status: 'cancelled',
            owner_user_id: item.owner_user_id,
            user_id: session.user.id,
            contact_name: String((session?.user?.user_metadata as any)?.full_name || (session?.user?.user_metadata as any)?.name || 'Customer'),
            changed_by: 'customer',
            send_email: false,
          },
        });
      } catch { /* ignore notification failures */ }
      setMyMeeting({ ...myMeeting, status: 'cancelled' });
      Alert.alert('Meeting cancelled');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to cancel meeting.');
    } finally {
      setMeetingBusy(false);
    }
  };

  const handleBook = async () => {
    if (!session?.user?.id) { Alert.alert('Please sign in to book a property.'); return; }
    if (!item) return;
    if (item.owner_user_id === session.user.id) { Alert.alert('You cannot book your own property.'); return; }
    setBookingBusy(true);
    try {
      const phone = String((session?.user?.user_metadata as any)?.phone ?? '');
      const name = String((session?.user?.user_metadata as any)?.full_name || (session?.user?.user_metadata as any)?.name || '');
      const { data: bookingData, error: insErr } = await supabase.from('property_bookings').insert({
        property_id: item.id,
        user_id: session.user.id,
        owner_user_id: item.owner_user_id,
        status: 'pending',
        message: bookMsg || null,
        contact_name: name || null,
        contact_phone: phone || null,
      }).select('id').maybeSingle();
      if (insErr) throw new Error(insErr.message);
      const bookingId = String((bookingData as any)?.id ?? '').trim();

      try {
        await rewardReferralOnBooking(session.user.id, item.id);
      } catch {
        // ignore referral reward failures
      }

      if (bookingId) {
        try {
          await supabase.functions.invoke('send-property-notification', {
            body: {
              event_type: 'property_booked',
              property_id: item.id,
              property_title: item.title,
              owner_user_id: item.owner_user_id,
              user_id: session.user.id,
              booking_id: bookingId,
              contact_name: name,
              contact_phone: phone,
            },
          });
        } catch {
          // ignore notification failures
        }
      }

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
      try {
        await supabase.functions.invoke('send-property-notification', {
          body: {
            event_type: 'booking_status_changed',
            booking_id: existingBooking,
            status: 'cancelled',
            changed_by: 'customer',
          },
        });
      } catch {
        // ignore notification failures
      }
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
                <XStack justifyContent="space-between" alignItems="center">
                  <Text color={titleColor} fontWeight="900">Subscribe</Text>
                  <Text color={muted} fontSize={12}>{followersCount} follower{followersCount === 1 ? '' : 's'}</Text>
                </XStack>
                <Text color={muted} fontSize={12}>
                  {following
                    ? 'You are following this property. You will get updates when it changes.'
                    : 'Follow this property for free to get notified on price/status changes.'}
                </Text>
                <Button
                  backgroundColor={following ? theme.bgCardSecondary : theme.accent}
                  color={following ? theme.text : '#FFFFFF'}
                  disabled={followBusy}
                  onPress={handleToggleFollow}>
                  <Text color={following ? theme.text : '#FFFFFF'} fontWeight="800">
                    {followBusy ? 'Please wait...' : following ? 'Unfollow' : 'Follow property'}
                  </Text>
                </Button>
              </YStack>
            ) : null}

            {session?.user?.id && item.owner_user_id !== session.user.id ? (
              <YStack backgroundColor={theme.bgSecondary} borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$2">
                <Text color={titleColor} fontWeight="900">Schedule a visit</Text>
                {myMeeting ? (
                  <YStack gap="$2">
                    <Text color={muted} fontSize={12}>
                      Meeting: {String(myMeeting.meeting_date ?? '')} at {String(myMeeting.meeting_time ?? '').slice(0, 5)} • Status: <Text color={myMeeting.status === 'confirmed' ? theme.success : myMeeting.status === 'rejected' || myMeeting.status === 'cancelled' ? theme.danger : theme.text} fontWeight="800">{myMeeting.status}</Text>
                    </Text>
                    {myMeeting.status === 'pending' ? (
                      <Button backgroundColor={theme.danger} color="#FFFFFF" disabled={meetingBusy} onPress={handleCancelMeeting}>
                        Cancel meeting request
                      </Button>
                    ) : null}
                  </YStack>
                ) : (
                  <YStack gap="$2">
                    <Text color={muted} fontSize={12}>
                      Pick a preferred date and time. The owner will confirm your visit.
                    </Text>
                    <XStack gap="$2" flexWrap="wrap">
                      <Button flex={1} minWidth={140} backgroundColor={theme.bgCardSecondary} color={theme.text} onPress={() => setShowDatePicker(true)}>
                        <Text color={theme.text} fontWeight="700">{meetingDate ? meetingDate.toLocaleDateString('en-IN') : 'Select date'}</Text>
                      </Button>
                      <Button flex={1} minWidth={140} backgroundColor={theme.bgCardSecondary} color={theme.text} onPress={() => setShowTimePicker(true)}>
                        <Text color={theme.text} fontWeight="700">{meetingTime ? meetingTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'Select time'}</Text>
                      </Button>
                    </XStack>
                    <Input
                      value={meetingMsg}
                      onChangeText={setMeetingMsg}
                      placeholder="Optional message for the owner"
                      backgroundColor={theme.inputBg}
                      borderColor={border}
                      color={theme.inputText}
                    />
                    <Button backgroundColor={theme.accent} color="#FFFFFF" disabled={meetingBusy} onPress={handleScheduleMeeting}>
                      <Text color="#FFFFFF" fontWeight="800">{meetingBusy ? 'Requesting...' : 'Request meeting'}</Text>
                    </Button>
                  </YStack>
                )}
              </YStack>
            ) : null}

            {isOwner ? (
              <YStack backgroundColor={theme.bgSecondary} borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$2">
                <Text color={titleColor} fontWeight="900">Followers</Text>
                <Text color={muted} fontSize={12}>
                  {followersCount} people follow this listing.
                </Text>
              </YStack>
            ) : null}

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

      <MobileDatePicker value={meetingDate ?? new Date()} minDate={new Date()} open={showDatePicker} onClose={() => setShowDatePicker(false)} onChange={(d) => setMeetingDate(d)} />
      <MobileTimePicker value={meetingTime} open={showTimePicker} onClose={() => setShowTimePicker(false)} onChange={(d) => setMeetingTime(d)} />
    </View>
  );
}
