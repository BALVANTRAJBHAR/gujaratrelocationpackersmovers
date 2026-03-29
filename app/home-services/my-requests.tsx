import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, View } from 'react-native';
import { Button, Input, Text, XStack, YStack } from 'tamagui';

import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';
import { useRouter } from 'expo-router';

type HomeServiceRequestRow = {
  id: string;
  service_key: string;
  customer_name: string | null;
  customer_phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  state: string | null;
  city: string | null;
  locality: string | null;
  notes: string | null;
  preferred_date: string | null;
  preferred_time: string | null;
  status: string | null;
  created_at: string;
};

type HomeServiceUploadRow = {
  id: string;
  request_id: string;
  file_url: string;
  file_type: string;
  file_name: string | null;
  file_size: number | null;
  created_at: string;
};

const labelForService = (key: string) => {
  const k = String(key ?? '').toLowerCase();
  if (k === 'ac') return 'AC';
  if (k === 'carpenter') return 'Carpenter';
  if (k === 'electrician') return 'Electrician';
  if (k === 'plumber') return 'Plumber';
  if (k === 'pest') return 'Pest Control';
  if (k === 'cleaning') return 'Deep Cleaning';
  if (k === 'painting') return 'Painting';
  return key;
};

export default function MyHomeServiceRequestsScreen() {
  const router = useRouter();
  const { session } = useSession();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<HomeServiceRequestRow[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [uploadsBusyId, setUploadsBusyId] = useState<string | null>(null);
  const [uploadsByRequest, setUploadsByRequest] = useState<Record<string, HomeServiceUploadRow[]>>({});

  const [searchText, setSearchText] = useState('');

  const fetchSeqRef = useRef(0);

  const filteredItems = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return items;
    return items.filter((x) => {
      const label = labelForService(x.service_key ?? '').toLowerCase();
      const status = String(x.status ?? '').toLowerCase();
      const loc = `${x.locality ?? ''} ${x.city ?? ''} ${x.state ?? ''}`.toLowerCase();
      return label.includes(q) || status.includes(q) || loc.includes(q);
    });
  }, [items, searchText]);

  const fetchRequests = async () => {
    if (!session?.user?.id) {
      router.replace('/auth/login' as any);
      return;
    }

    setError(null);
    setLoading(true);

    const seq = ++fetchSeqRef.current;

    try {
      const { data, error: fetchError } = await supabase
        .from('home_service_requests')
        .select(
          'id, service_key, customer_name, customer_phone, address_line1, address_line2, state, city, locality, notes, preferred_date, preferred_time, status, created_at'
        )
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(60);

      if (seq !== fetchSeqRef.current) return;

      if (fetchError) {
        setError(fetchError.message);
        return;
      }

      setItems(((data as any) ?? []) as HomeServiceRequestRow[]);
    } catch (e) {
      if (seq !== fetchSeqRef.current) return;
      setError(e instanceof Error ? e.message : 'Failed to load requests.');
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false);
    }
  };

  const fetchUploads = async (requestId: string) => {
    if (!requestId) return;
    setUploadsBusyId(requestId);
    try {
      const { data, error: fetchError } = await supabase
        .from('home_service_uploads')
        .select('id, request_id, file_url, file_type, file_name, file_size, created_at')
        .eq('request_id', requestId)
        .order('created_at', { ascending: false });

      if (fetchError) {
        setError(fetchError.message);
        return;
      }

      setUploadsByRequest((prev) => ({ ...prev, [requestId]: ((data as any) ?? []) as HomeServiceUploadRow[] }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load uploads.');
    } finally {
      setUploadsBusyId(null);
    }
  };

  useFocusEffect(
    useCallback(() => {
      void fetchRequests();
      return () => {
        fetchSeqRef.current += 1;
      };
    }, [session?.user?.id])
  );

  const pageBg = '#FFFFFF';
  const panelBg = '#F8FAFC';
  const panelBgStrong = '#FFFFFF';
  const border = '#E5E7EB';
  const titleColor = '#0F172A';
  const muted = '#64748B';

  return (
    <View style={{ flex: 1, backgroundColor: pageBg }}>
      <YStack backgroundColor="#1F4E79" padding={16} paddingTop={18}>
        <XStack alignItems="center" justifyContent="center" position="relative">
          <Button
            size="$3"
            chromeless
            color="#FFFFFF"
            position="absolute"
            left={0}
            onPress={() => {
              router.back();
            }}>
            ‹
          </Button>
          <YStack alignItems="center">
            <Text color="#FFFFFF" fontSize={16} fontWeight="800">
              My Home Service Requests
            </Text>
            <Text color="#CFE3F4" fontSize={12} fontWeight="600">
              Track your requests
            </Text>
          </YStack>
        </XStack>
      </YStack>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <YStack gap="$3">
          <XStack gap="$2" flexWrap="wrap" alignItems="center">
            <Input
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Search by service/status/city"
              backgroundColor="#FFFFFF"
              borderColor={border}
              color={titleColor}
              flexGrow={1}
              minWidth={220}
            />
            <Button backgroundColor="#10B981" color="#0B0B12" onPress={() => router.push('/home-services/request' as any)}>
              New Request
            </Button>
          </XStack>

          {loading ? <Text color={muted}>Loading...</Text> : null}
          {error ? <Text color="#EF4444">{error}</Text> : null}

          {filteredItems.map((r) => {
            const isOpen = openId === r.id;
            const statusText = String(r.status ?? 'pending').replaceAll('_', ' ');
            const statusColor =
              r.status === 'completed'
                ? '#10B981'
                : r.status === 'cancelled'
                  ? '#EF4444'
                  : r.status === 'assigned'
                    ? '#3B82F6'
                    : '#F59E0B';

            return (
              <YStack
                key={r.id}
                backgroundColor={panelBgStrong}
                borderRadius={16}
                padding={14}
                borderWidth={1}
                borderColor={border}
                gap="$2">
                <XStack justifyContent="space-between" alignItems="center" gap="$2" flexWrap="wrap">
                  <YStack flex={1} gap={4}>
                    <Text color={titleColor} fontWeight="900" fontSize={14} numberOfLines={1}>
                      {labelForService(r.service_key)}
                    </Text>
                    <Text color={muted} fontSize={12} numberOfLines={2}>
                      {r.locality || r.city || r.state ? `${r.locality ?? ''}${r.locality ? ', ' : ''}${r.city ?? ''}${r.city ? ', ' : ''}${r.state ?? ''}` : 'Location not provided'}
                    </Text>
                    <Text color={muted} fontSize={11}>
                      Created: {new Date(r.created_at).toLocaleString()}
                    </Text>
                  </YStack>

                  <YStack alignItems="flex-end" gap={6}>
                    <Text color={statusColor} fontSize={12} fontWeight="800">
                      {statusText}
                    </Text>
                    <Button
                      size="$2"
                      backgroundColor={panelBg}
                      color={titleColor}
                      borderRadius={10}
                      onPress={async () => {
                        const next = isOpen ? null : r.id;
                        setOpenId(next);
                        if (next) await fetchUploads(r.id);
                      }}>
                      {isOpen ? 'Hide' : 'Details'}
                    </Button>
                  </YStack>
                </XStack>

                {isOpen ? (
                  <YStack backgroundColor={panelBg} borderRadius={14} padding={12} gap={10} borderWidth={1} borderColor={border}>
                    <YStack gap={6}>
                      <Text color={titleColor} fontWeight="800" fontSize={12}>
                        Contact
                      </Text>
                      <Text color={muted} fontSize={12}>
                        {r.customer_name ?? '—'} • {r.customer_phone ?? '—'}
                      </Text>
                    </YStack>

                    <YStack gap={6}>
                      <Text color={titleColor} fontWeight="800" fontSize={12}>
                        Address
                      </Text>
                      <Text color={muted} fontSize={12}>
                        {r.address_line1 ?? '—'}
                        {r.address_line2 ? `, ${r.address_line2}` : ''}
                      </Text>
                    </YStack>

                    <YStack gap={6}>
                      <Text color={titleColor} fontWeight="800" fontSize={12}>
                        Preferred slot
                      </Text>
                      <Text color={muted} fontSize={12}>
                        {(r.preferred_date ?? '—') + (r.preferred_time ? ` • ${r.preferred_time}` : '')}
                      </Text>
                    </YStack>

                    {r.notes ? (
                      <YStack gap={6}>
                        <Text color={titleColor} fontWeight="800" fontSize={12}>
                          Notes
                        </Text>
                        <Text color={muted} fontSize={12}>
                          {r.notes}
                        </Text>
                      </YStack>
                    ) : null}

                    <YStack gap={6}>
                      <XStack alignItems="center" justifyContent="space-between" gap="$2">
                        <Text color={titleColor} fontWeight="800" fontSize={12}>
                          Uploads
                        </Text>
                        <Button
                          size="$2"
                          backgroundColor="#E5E7EB"
                          color="#111827"
                          borderRadius={10}
                          disabled={uploadsBusyId === r.id}
                          onPress={() => void fetchUploads(r.id)}>
                          Refresh
                        </Button>
                      </XStack>

                      {(uploadsByRequest[r.id] ?? []).length ? (
                        (uploadsByRequest[r.id] ?? []).map((u) => {
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
                                backgroundColor="#FFFFFF"
                                borderWidth={1}
                                borderColor={border}
                                gap="$2">
                                <YStack flex={1} gap={2}>
                                  <Text color={titleColor} fontSize={12} fontWeight="700" numberOfLines={1}>
                                    {label}
                                  </Text>
                                  <Text color={muted} fontSize={11} numberOfLines={1}>
                                    {u.file_type}
                                  </Text>
                                </YStack>
                                <Text color={muted} fontSize={11}>
                                  Open
                                </Text>
                              </XStack>
                            </Pressable>
                          );
                        })
                      ) : (
                        <Text color={muted} fontSize={12}>
                          No uploads.
                        </Text>
                      )}
                    </YStack>
                  </YStack>
                ) : null}
              </YStack>
            );
          })}

          {!loading && !filteredItems.length ? <Text color={muted}>No requests yet.</Text> : null}
        </YStack>
      </ScrollView>

      <YStack position="absolute" bottom={0} left={0} right={0} backgroundColor="#FFFFFF" padding={14} borderTopWidth={1} borderTopColor="#E5E7EB">
        <XStack gap="$2" justifyContent="space-between" alignItems="center" flexWrap="wrap">
          <Button backgroundColor="#E5E7EB" color="#111827" onPress={() => router.replace('/home' as any)}>
            Home
          </Button>
          <Button backgroundColor="#10B981" color="#0B0B12" onPress={() => router.push('/home-services/request' as any)}>
            New Request
          </Button>
        </XStack>
      </YStack>
    </View>
  );
}
