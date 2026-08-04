import { FontAwesome } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { t } from '@/constants/typography';

export default function EndOfResults({ theme, onUp }: { theme: any; onUp: () => void }) {
  const router = useRouter();
  return (
    <YStack alignItems="center" gap="$3" marginTop="auto" paddingTop={12} paddingBottom={0}>
      <Text color={theme.textMuted} fontSize={t(13)} fontWeight="700">End of Result</Text>
      <XStack gap="$2">
        <Pressable onPress={() => router.back()}>
          <YStack width={102} height={42} alignItems="center" justifyContent="center" borderRadius={12} backgroundColor={theme.bgCardSecondary} borderWidth={1} borderColor={theme.border}>
            <Text color={theme.text} fontWeight="800">Back</Text>
          </YStack>
        </Pressable>
        <Pressable onPress={onUp}>
          <XStack width={116} height={42} justifyContent="center" alignItems="center" gap={8} borderRadius={12} backgroundColor={theme.primary}>
            <FontAwesome name="chevron-up" size={13} color="#FFFFFF" />
            <Text color="#FFFFFF" fontWeight="800">Up</Text>
          </XStack>
        </Pressable>
      </XStack>
    </YStack>
  );
}
