import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, View } from 'react-native';
import { Button, H2, Paragraph, Text, XStack, YStack } from 'tamagui';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { supabase } from '@/lib/supabase';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSession } from '@/providers/session-provider';

type NotificationRow = {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: string | null;
  booking_id: string | null;
  status: string | null;
  data: any;
  created_at: string;
  read_at: string | null;
};

export default function NotificationsScreen() {
  const { session } = useSession();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const pageBg = isDark ? '#0B0B12' : '#FFFFFF';
  const panelBg = isDark ? '#111827' : '#F8FAFC';
  const border = isDark ? '#1F2937' : '#E5E7EB';
  const muted = isDark ? '#94A3B8' : '#64748B';
  const text = isDark ? '#FFFFFF' : '#0F172A';

  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const userId = session?.user?.id ?? '';

  const fetchNotifications = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('id,user_id,title,body,type,booking_id,status,data,created_at,read_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) return;
      setItems((data as any) ?? []);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel('notifications-inbox')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => {
          void fetchNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchNotifications, userId]);

  const unreadCount = useMemo(() => items.filter((n) => !n.read_at).length, [items]);

  const markRead = async (id: string) => {
    try {
      await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
    } catch {
      // ignore
    }
  };

  const markAllRead = async () => {
    if (!userId) return;
    if (!unreadCount) return;

    Alert.alert('Mark all as read?', `You have ${unreadCount} unread notifications.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Mark all',
        style: 'default',
        onPress: async () => {
          try {
            await supabase
              .from('notifications')
              .update({ read_at: new Date().toISOString() })
              .eq('user_id', userId)
              .is('read_at', null);
          } catch {
            // ignore
          }
        },
      },
    ]);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchNotifications();
    setRefreshing(false);
  };

  return (
    <YStack flex={1} backgroundColor={pageBg} padding={16} gap="$3">
      <XStack alignItems="center" justifyContent="space-between">
        <XStack alignItems="center" gap="$2">
          <IconSymbol name="bell.fill" size={24} color={text} />
          <H2 color={text}>Notifications</H2>
        </XStack>
        <Button onPress={markAllRead} disabled={!unreadCount} backgroundColor={panelBg} borderWidth={1} borderColor={border}>
          <Text color={text}>Mark all read</Text>
        </Button>
      </XStack>

      <Paragraph color={muted}>
        Unread: {unreadCount}
      </Paragraph>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingBottom: 40 } as any}
        ListEmptyComponent={
          <YStack padding={16} borderRadius={12} backgroundColor={panelBg} borderWidth={1} borderColor={border}>
            <Text color={muted}>{loading ? 'Loading…' : 'No notifications yet.'}</Text>
          </YStack>
        }
        renderItem={({ item }) => {
          const isUnread = !item.read_at;
          return (
            <Pressable
              onPress={() => {
                if (isUnread) void markRead(item.id);
              }}>
              <YStack
                marginBottom={10}
                padding={12}
                borderRadius={12}
                backgroundColor={panelBg}
                borderWidth={1}
                borderColor={isUnread ? '#28b467ff' : border}
                gap="$1">
                <XStack alignItems="center" justifyContent="space-between" gap="$2">
                  <Text fontSize={14} fontWeight={isUnread ? '700' : '600'} color={text} flex={1}>
                    {item.title}
                  </Text>
                  {isUnread ? (
                    <View style={{ width: 8, height: 8, borderRadius: 99, backgroundColor: '#28b467ff' }} />
                  ) : null}
                </XStack>
                <Text color={muted}>{item.body}</Text>
                <Text color={muted} fontSize={12}>
                  {new Date(item.created_at).toLocaleString()}
                </Text>
              </YStack>
            </Pressable>
          );
        }}
      />
    </YStack>
  );
}
