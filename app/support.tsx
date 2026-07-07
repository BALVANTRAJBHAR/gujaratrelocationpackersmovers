import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, Linking, Platform, ScrollView } from 'react-native';
import { Button, H2, Input, Paragraph, Text, XStack, YStack } from 'tamagui';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { themes } from '@/constants/theme';
import { useSession } from '@/providers/session-provider';
import { t } from '@/constants/typography';

export default function SupportScreen() {
  const params = useLocalSearchParams<{ bookingId?: string }>();
  const router = useRouter();
  const { profile, session } = useSession();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? themes.dark : themes.light;

  const [message, setMessage] = useState('');

  const bookingId = String(params.bookingId ?? '').trim();

  const defaultMessage = useMemo(() => {
    const name = profile?.name ?? session?.user?.email ?? 'Customer';
    const base = `Hi Gujarat Relocation Packers & Movers, I need help.`;
    const parts: string[] = [base, `Name: ${name}`];
    if (bookingId) parts.push(`Booking ID: ${bookingId}`);
    return parts.join('\n');
  }, [bookingId, profile?.name, session?.user?.email]);

  const supportPhoneE164 = '+919987963470';
  const supportPhoneDigits = '919987963470';

  const openUrl = async (url: string) => {
    try {
      if (Platform.OS === 'web') {
        window.open(url, '_blank', 'noopener,noreferrer');
        return;
      }
      const can = await Linking.canOpenURL(url);
      if (!can) {
        Alert.alert('Cannot open', 'Your device cannot open this link.');
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert('Failed', 'Could not open support link.');
    }
  };

  const onWhatsApp = async () => {
    const text = (message.trim() || defaultMessage).trim();
    const url = `https://wa.me/${supportPhoneDigits}?text=${encodeURIComponent(text)}`;
    await openUrl(url);
  };

  const onCall = async () => {
    await openUrl(`tel:${supportPhoneE164}`);
  };

  const onEmail = async () => {
    const subject = bookingId ? `Support request (Booking ${bookingId})` : 'Support request';
    const body = (message.trim() || defaultMessage).trim();
    await openUrl(`mailto:gujaratrelocationpackersmovers@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  };

  return (
    <YStack flex={1} backgroundColor={theme.bg}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 60 } as any}>
        <YStack gap="$4" width="100%" maxWidth={900} alignSelf="center">
          <YStack gap="$1">
            <Text color={theme.accent} fontSize={t(12)} letterSpacing={2} textTransform="uppercase">
              Support
            </Text>
            <H2 color={theme.text}>Chat with us</H2>
            <Paragraph color={theme.textMuted}>
              Send a WhatsApp message, call, or email—our team will help you quickly.
            </Paragraph>
            {bookingId ? (
              <Text color={theme.textMuted} fontSize={t(12)}>
                Booking: {bookingId}
              </Text>
            ) : null}
          </YStack>

          <YStack backgroundColor={theme.bgCard} borderColor={theme.border} borderWidth={1} borderRadius={18} padding={16} gap="$2">
            <Text color={theme.text} fontWeight="800">
              In-app AI support
            </Text>
            <Text color={theme.textMuted} fontSize={t(12)}>
              Use quick options or type your question to get instant guidance.
            </Text>
            <XStack>
              <Button backgroundColor={theme.accent} color="#FFFFFF" onPress={() => router.push({ pathname: '/support-chat', params: bookingId ? { bookingId } : {} } as any)}>
                Open AI Chat
              </Button>
            </XStack>
          </YStack>

          <YStack backgroundColor={theme.bgSecondary} borderColor={theme.border} borderWidth={1} borderRadius={18} padding={16} gap="$2">
            <Text color={theme.text} fontWeight="800">
              Message
            </Text>
            <Text color={theme.textMuted} fontSize={t(12)}>
              You can keep this blank—default details will be included.
            </Text>
            <Input
              value={message}
              onChangeText={setMessage}
              placeholder={defaultMessage}
              placeholderTextColor={theme.textMuted}
              multiline
              numberOfLines={5}
              backgroundColor={theme.bgCard}
              borderColor={theme.border}
              color={theme.text}
              padding={12}
              borderRadius={14}
            />

            <XStack gap="$2" flexWrap="wrap" paddingTop={4}>
              <Button backgroundColor={theme.accent} color="#FFFFFF" onPress={() => void onWhatsApp()}>
                WhatsApp
              </Button>
              <Button backgroundColor={theme.bgCard} borderColor={theme.border} borderWidth={1} color={theme.text} onPress={() => void onCall()}>
                Call
              </Button>
              <Button backgroundColor={theme.bgCard} borderColor={theme.border} borderWidth={1} color={theme.text} onPress={() => void onEmail()}>
                Email
              </Button>
            </XStack>
          </YStack>

          <YStack backgroundColor={theme.bgCard} borderColor={theme.border} borderWidth={1} borderRadius={18} padding={16} gap="$2">
            <Text color={theme.text} fontWeight="800">
              Tip
            </Text>
            <Text color={theme.textMuted} fontSize={t(12)}>
              If your booking is assigned, the driver can update status and you can track movement in the Tracking tab.
            </Text>
          </YStack>
        </YStack>
      </ScrollView>
    </YStack>
  );
}
