import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Platform, ScrollView } from 'react-native';
import { Button, H2, Input, Paragraph, Spinner, Text, XStack, YStack } from 'tamagui';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';

type ConversationRow = {
  id: string;
  user_id: string | null;
  booking_id: string | null;
  status: string | null;
  created_at: string;
  updated_at: string | null;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  user_id: string | null;
  sender: string;
  message: string;
  created_at: string;
};

const GUIDED_OPTIONS: Array<{ label: string; prompt: string }> = [
  {
    label: 'Track booking',
    prompt: 'I want to track my booking. What should I do?'
  },
  {
    label: 'Reschedule',
    prompt: 'I want to reschedule my booking. What is the process?'
  },
  {
    label: 'Cancel booking',
    prompt: 'I want to cancel my booking. What is the policy and steps?'
  },
  {
    label: 'Payment issue',
    prompt: 'I have a payment issue. Please guide me.'
  },
  {
    label: 'Driver not responding',
    prompt: 'My driver is not responding. What should I do?'
  },
];

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export default function SupportChatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ bookingId?: string }>();
  const { session } = useSession();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const pageBg = isDark ? '#0B0B12' : '#FFFFFF';
  const panelBg = isDark ? '#0F172A' : '#F3F4F6';
  const panelBgStrong = isDark ? '#111827' : '#FFFFFF';
  const border = isDark ? '#1F2937' : '#E5E7EB';
  const titleColor = isDark ? '#F9FAFB' : '#111827';
  const muted = isDark ? '#9CA3AF' : '#6B7280';
  const accent = '#F97316';

  const bookingIdRaw = String(params.bookingId ?? '').trim();
  const bookingId = isUuid(bookingIdRaw) ? bookingIdRaw : '';

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversation, setConversation] = useState<ConversationRow | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [text, setText] = useState('');
  const listRef = useRef<FlatList<MessageRow> | null>(null);

  const fetchConversation = useCallback(async () => {
    if (!session?.user?.id) return;

    setError(null);
    setLoading(true);
    try {
      let q = supabase
        .from('support_conversations')
        .select('id, user_id, booking_id, status, created_at, updated_at')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (bookingId) {
        q = q.eq('booking_id', bookingId);
      }

      const { data, error: fetchError } = await q;
      if (fetchError) {
        setError(fetchError.message);
        setConversation(null);
        return;
      }

      const existing = (data?.[0] ?? null) as any;
      if (existing?.id) {
        setConversation(existing as ConversationRow);
        return;
      }

      const insertPayload: Record<string, unknown> = {
        user_id: session.user.id,
        status: 'open',
        updated_at: new Date().toISOString(),
      };
      if (bookingId) insertPayload.booking_id = bookingId;

      const { data: created, error: createError } = await supabase
        .from('support_conversations')
        .insert(insertPayload)
        .select('id, user_id, booking_id, status, created_at, updated_at')
        .limit(1);

      if (createError) {
        setError(createError.message);
        setConversation(null);
        return;
      }

      setConversation((created?.[0] ?? null) as any);
    } finally {
      setLoading(false);
    }
  }, [bookingId, session?.user?.id]);

  const fetchMessages = useCallback(async () => {
    if (!conversation?.id) return;
    setError(null);
    const { data, error: fetchError } = await supabase
      .from('support_messages')
      .select('id, conversation_id, user_id, sender, message, created_at')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: true })
      .limit(200);

    if (fetchError) {
      setError(fetchError.message);
      setMessages([]);
      return;
    }

    setMessages((data ?? []) as any);
  }, [conversation?.id]);

  useEffect(() => {
    if (!session?.user?.id) return;
    void fetchConversation();
  }, [fetchConversation, session?.user?.id]);

  useEffect(() => {
    if (!conversation?.id) return;
    void fetchMessages();
  }, [conversation?.id, fetchMessages]);

  const sendMessage = useCallback(
    async (messageOverride?: string) => {
      const next = String(messageOverride ?? text).trim();
      if (!next) return;
      if (!session?.user?.id) {
        Alert.alert('Login required', 'Please login to use support chat.');
        router.replace('/auth/login');
        return;
      }
      if (!conversation?.id) {
        await fetchConversation();
        return;
      }

      setError(null);
      setLoading(true);
      try {
        const { error: fnError } = await supabase.functions.invoke('support-ai', {
          body: {
            conversation_id: conversation.id,
            message: next,
            booking_id: bookingId || undefined,
          },
        });

        if (fnError) {
          setError(fnError.message);
          return;
        }

        setText('');
        await fetchMessages();
        setTimeout(() => {
          try {
            (listRef.current as any)?.scrollToEnd?.({ animated: true });
          } catch {
            // ignore
          }
        }, 60);
      } finally {
        setLoading(false);
      }
    },
    [bookingId, conversation?.id, fetchConversation, fetchMessages, router, session?.user?.id, text]
  );

  const renderedMessages = useMemo(() => {
    const items = messages ?? [];
    if (items.length) return items;
    return [];
  }, [messages]);

  return (
    <YStack flex={1} backgroundColor={pageBg}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 60 } as any}>
        <YStack gap="$4" width="100%" maxWidth={980} alignSelf="center">
          <YStack gap="$1">
            <Text color={accent} fontSize={12} letterSpacing={2} textTransform="uppercase">
              AI Support
            </Text>
            <H2 color={titleColor}>Help & Chat</H2>
            <Paragraph color={muted}>
              Select a quick query, or type your message. If urgent, use WhatsApp/Call from Support screen.
            </Paragraph>
            {bookingId ? (
              <Text color={muted} fontSize={12}>
                Booking: {bookingId}
              </Text>
            ) : null}
          </YStack>

          <YStack backgroundColor={panelBg} borderColor={border} borderWidth={1} borderRadius={18} padding={14} gap="$2">
            <Text color={titleColor} fontWeight="800">
              Quick options
            </Text>
            <XStack gap="$2" flexWrap="wrap">
              {GUIDED_OPTIONS.map((opt) => (
                <Button
                  key={opt.label}
                  size="$3"
                  backgroundColor={panelBgStrong}
                  borderColor={border}
                  borderWidth={1}
                  color={titleColor}
                  disabled={loading}
                  onPress={() => void sendMessage(opt.prompt)}>
                  {opt.label}
                </Button>
              ))}
            </XStack>
          </YStack>

          {error ? (
            <YStack backgroundColor={panelBg} borderColor={border} borderWidth={1} borderRadius={18} padding={14} gap="$1">
              <Text color={titleColor} fontWeight="800">
                Error
              </Text>
              <Text color={muted} fontSize={12}>
                {error}
              </Text>
            </YStack>
          ) : null}

          <YStack backgroundColor={panelBgStrong} borderColor={border} borderWidth={1} borderRadius={18} padding={14} gap="$2">
            <XStack alignItems="center" justifyContent="space-between">
              <Text color={titleColor} fontWeight="800">
                Conversation
              </Text>
              <Button
                size="$2"
                backgroundColor={panelBg}
                borderColor={border}
                borderWidth={1}
                color={titleColor}
                disabled={loading}
                onPress={() => void fetchMessages()}>
                Refresh
              </Button>
            </XStack>

            <FlatList
              ref={(r) => {
                listRef.current = r;
              }}
              data={renderedMessages}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              contentContainerStyle={{ gap: 10, paddingVertical: 10 } as any}
              ListEmptyComponent={
                <Text color={muted} fontSize={12}>
                  No messages yet. Start by selecting a quick option.
                </Text>
              }
              renderItem={({ item }) => {
                const isUser = String(item.sender) === 'user';
                return (
                  <YStack
                    alignSelf={isUser ? 'flex-end' : 'flex-start'}
                    backgroundColor={isUser ? accent : panelBg}
                    borderColor={border}
                    borderWidth={1}
                    borderRadius={16}
                    padding={12}
                    maxWidth="92%">
                    <Text color={isUser ? '#0B0B12' : titleColor} fontSize={13}>
                      {item.message}
                    </Text>
                    <Text color={isUser ? '#0B0B12' : muted} fontSize={10} opacity={0.85} paddingTop={6}>
                      {new Date(item.created_at).toLocaleString()}
                    </Text>
                  </YStack>
                );
              }}
            />

            <XStack gap="$2" alignItems="flex-end" paddingTop={8} flexWrap="wrap">
              <Input
                flex={1}
                value={text}
                onChangeText={setText}
                placeholder="Type your message..."
                placeholderTextColor={muted}
                multiline
                numberOfLines={3}
                backgroundColor={panelBgStrong}
                borderColor={border}
                color={titleColor}
              />
              <Button backgroundColor={accent} color="#0B0B12" onPress={() => void sendMessage()} disabled={loading}>
                {loading ? 'Sending…' : 'Send'}
              </Button>
              {loading ? <Spinner color={accent} /> : null}
            </XStack>

            <Text color={muted} fontSize={11} paddingTop={8}>
              AI responses may be incorrect. For urgent help, use WhatsApp/Call.
            </Text>
          </YStack>
        </YStack>
      </ScrollView>
    </YStack>
  );
}
