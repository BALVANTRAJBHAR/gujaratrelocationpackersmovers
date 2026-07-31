import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, View } from 'react-native';
import { Button, H2, Paragraph, Text, XStack, YStack } from 'tamagui';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { supabase } from '@/lib/supabase';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { themes } from '@/constants/theme';
import { useSession } from '@/providers/session-provider';
import { useRouter } from 'expo-router';
  import { useAuthGuard } from '@/lib/auth-guard';
  import { t } from '@/constants/typography';
  import { formatDateTimeDDMMYYYY } from '@/lib/date-format';

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

function NotificationsGuard() {
  const router = useRouter();
  const authGuard = useAuthGuard();
  const { session } = useSession();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? themes.dark : themes.light;

  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    if (authGuard.isLoading) return;
    if (!authGuard.isAuthenticated || authGuard.error === 'not_authenticated') {
      router.replace('/auth/login' as any);
    } else if (authGuard.error === 'forbidden') {
      router.replace('/unauthorized' as any);
    }
  }, [authGuard.isLoading, authGuard.isAuthenticated, authGuard.error, router]);
  if (authGuard.isLoading || !authGuard.isAuthenticated || authGuard.error) return null;

  return <NotificationsScreenInner session={session} />;
}

export default function NotificationsScreen() {
  return <NotificationsGuard />;
}

function NotificationsScreenInner({ session }: { session: any }) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? themes.dark : themes.light;

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
    <YStack flex={1} backgroundColor={theme.bg} padding={16} gap="$3">
      <XStack alignItems="center" justifyContent="space-between">
        <XStack alignItems="center" gap="$2">
          <IconSymbol name="bell.fill" size={24} color={theme.text} />
          <H2 color={theme.text}>Notifications</H2>
        </XStack>
        <Button onPress={markAllRead} disabled={!unreadCount} backgroundColor={theme.bgSecondary} borderWidth={1} borderColor={theme.border}>
          <Text color={theme.text}>Mark all read</Text>
        </Button>
      </XStack>

      <Paragraph color={theme.textMuted}>
        Unread: {unreadCount}
      </Paragraph>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingBottom: 40 } as any}
        ListEmptyComponent={
          <YStack padding={16} borderRadius={12} backgroundColor={theme.bgSecondary} borderWidth={1} borderColor={theme.border}>
            <Text color={theme.textMuted}>{loading ? 'Loading…' : 'No notifications yet.'}</Text>
          </YStack>
        }
        renderItem={({ item }) => {
          const isUnread = !item.read_at;
          return (
            <Pressable
              onPress={() => {
                if (isUnread) void markRead(item.id);
                if (item.type === 'home_service_request_available') {
                  router.push('/home-services/available-requests' as any);
                } else if (item.type === 'provider_accepted') {
                  router.push('/home-services/my-requests' as any);
                } else if (item.type === 'booking_status' || item.type === 'booking_otp') {
                  router.push('/(tabs)/bookings' as any);
                }
              }}>
              <YStack
                marginBottom={10}
                padding={12}
                borderRadius={12}
                backgroundColor={theme.bgSecondary}
                borderWidth={1}
                borderColor={isUnread ? theme.success : theme.border}
                gap="$1">
                <XStack alignItems="center" justifyContent="space-between" gap="$2">
                  <Text fontSize={t(14)} fontWeight={isUnread ? '700' : '600'} color={theme.text} flex={1}>
                    {item.title}
                  </Text>
                  {isUnread ? (
                    <View style={{ width: 8, height: 8, borderRadius: 99, backgroundColor: theme.success }} />
                  ) : null}
                </XStack>
                <Text color={theme.textMuted}>{item.body}</Text>
                <Text color={theme.textMuted} fontSize={t(12)}>
                  {formatDateTimeDDMMYYYY(item.created_at)}
                </Text>
              </YStack>
            </Pressable>
          );
        }}
      />
    </YStack>
  );
}
