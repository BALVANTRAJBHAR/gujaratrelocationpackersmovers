import React from 'react';
import { ScrollView } from 'react-native';
import { H2, Paragraph, Text, XStack, YStack } from 'tamagui';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSession } from '@/providers/session-provider';

export default function DriverScreen() {
  const { profile } = useSession();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const pageBg = isDark ? '#0B0B12' : '#FFFFFF';
  const panelBg = isDark ? '#111827' : '#F3F4F6';
  const panelBgStrong = isDark ? '#0F172A' : '#FFFFFF';
  const border = isDark ? '#1F2937' : '#E5E7EB';
  const titleColor = isDark ? '#F9FAFB' : '#111827';
  const muted = isDark ? '#9CA3AF' : '#6B7280';
  const accent = '#F97316';

  return (
    <YStack flex={1} backgroundColor={pageBg}>
      <ScrollView style={{ flex: 1 } as any} contentContainerStyle={{ padding: 24, paddingBottom: 60, gap: 16 } as any}>
        <XStack justifyContent="space-between" alignItems="center">
          <YStack gap="$1">
            <Text color={accent} fontSize={12} letterSpacing={2} textTransform="uppercase">
              Driver
            </Text>
            <H2 color={titleColor}>Upcoming & attended moves</H2>
            <Paragraph color={muted}>
              Track upcoming assignments and past attended moves in one place.
            </Paragraph>
          </YStack>
        </XStack>

        {profile?.role && !['driver'].includes(profile.role) ? (
          <YStack backgroundColor={panelBg} padding={20} borderRadius={18} gap="$2" borderWidth={1} borderColor={border}>
            <Text color={titleColor} fontWeight="700">Driver access only</Text>
            <Text color={muted} fontSize={12}>
              Complete your profile as a driver to access this module.
            </Text>
          </YStack>
        ) : (
          <YStack backgroundColor={panelBgStrong} padding={16} borderRadius={16} gap="$2" borderWidth={1} borderColor={border}>
            <Text color={titleColor} fontWeight="700">
              Driver dashboard
            </Text>
            <Text color={muted} fontSize={12}>
              This screen is kept minimal.
            </Text>
          </YStack>
        )}
      </ScrollView>
    </YStack>
  );
}
