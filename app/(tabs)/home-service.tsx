import React, { useEffect, useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { Button, Text, XStack, YStack } from 'tamagui';

import { themes } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSession } from '@/providers/session-provider';
import { useRouter } from 'expo-router';
import { t } from '@/constants/typography';

export default function HomeServiceTabScreen() {
  const router = useRouter();
  const { session, profile } = useSession();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? themes.dark : themes.light;

  const role = (profile?.role ?? 'customer').toString().trim().toLowerCase();
  const providerSubtype = String((session?.user?.user_metadata as any)?.provider_subtype ?? '').trim().toLowerCase();

  const canUse = useMemo(() => {
    return Boolean(session?.user?.id) && role === 'provider' && providerSubtype === 'home_service';
  }, [providerSubtype, role, session?.user?.id]);

  useEffect(() => {
    if (canUse) return;
    router.replace('/home' as any);
  }, [canUse, router]);

  const pageBg = theme.bg;
  const border = theme.border;
  const titleColor = theme.text;
  const muted = theme.textMuted;
  const panelBg = theme.bgCard;

  return (
    <View style={{ flex: 1, backgroundColor: pageBg }}>
      <YStack backgroundColor={theme.headerBg} padding={16} paddingTop={18} borderBottomWidth={1} borderBottomColor={border}>
        <Text color={titleColor} fontSize={t(19)} fontWeight="900">
          Home Service
        </Text>
        <Text color={muted} fontSize={t(13)} fontWeight="600">
          Manage and track home service requests
        </Text>
      </YStack>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <YStack gap="$3">
          <YStack backgroundColor={panelBg} borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$2">
            <Text color={titleColor} fontWeight="900" fontSize={t(15)}>
              Quick Actions
            </Text>
            <XStack gap="$2" flexWrap="wrap">
              <Button backgroundColor="#1F4E79" color="#FFFFFF" onPress={() => router.push('/home-services/available-requests' as any)}>
                Available Requests
              </Button>
              <Button backgroundColor={theme.bgSecondary} color={theme.text} borderWidth={1} borderColor={border} onPress={() => router.push('/home-services/my-requests' as any)}>
                My Requests
              </Button>
              <Button backgroundColor={theme.success} color="#FFFFFF" onPress={() => router.push('/home-services/request' as any)}>
                New Request
              </Button>
            </XStack>
          </YStack>

          <YStack backgroundColor={panelBg} borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$2">
            <Text color={titleColor} fontWeight="900" fontSize={t(15)}>
              Notes
            </Text>
            <Text color={muted} fontSize={t(13)}>
              Keep your contact details correct for faster assignment.
            </Text>
          </YStack>
        </YStack>
      </ScrollView>
    </View>
  );
}
