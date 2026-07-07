import React from 'react';
import { ScrollView } from 'react-native';
import { Button, H2, Paragraph, Text, XStack, YStack } from 'tamagui';

import { themes } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useRouter } from 'expo-router';
import { t } from '@/constants/typography';

export default function ExploreScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? themes.dark : themes.light;
  return (
    <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }} style={{ backgroundColor: theme.bg }}>
      <YStack gap="$4">
        <YStack gap="$1">
          <Text color={theme.accent} fontSize={t(12)} letterSpacing={2} textTransform="uppercase">
            Explore
          </Text>
          <H2 color={theme.text}>Services & support</H2>
          <Paragraph color={theme.textMuted}>
            Everything you need for a premium move—before, during, and after.
          </Paragraph>
        </YStack>

        <XStack gap="$3" flexWrap="wrap">
          {[
            { title: 'Home shifting', body: 'Verified crew, packing, loading, unloading.' },
            { title: 'Office relocation', body: 'Weekend moves, safe IT equipment handling.' },
            { title: 'Packing services', body: 'Bubble wrap, cartons, fragile handling.' },
            { title: 'Live tracking', body: 'Realtime driver location while trip is running.' },
          ].map((card) => (
            <YStack
              key={card.title}
              backgroundColor={theme.bgCard}
              borderRadius={18}
              padding={16}
              gap="$2"
              minWidth={260}
              flexGrow={1}
              flexBasis={260}
              borderWidth={1}
              borderColor={theme.border}>
              <Text color={theme.text} fontSize={t(15)} fontWeight="800">
                {card.title}
              </Text>
              <Text color={theme.textMuted} fontSize={t(12)} lineHeight={16}>
                {card.body}
              </Text>
            </YStack>
          ))}
        </XStack>

        <YStack backgroundColor={theme.bgCard} borderRadius={18} padding={18} gap="$2" borderWidth={1} borderColor={theme.border}>
          <Text color={theme.text} fontWeight="800">
            Need help?
          </Text>
          <Text color={theme.textMuted} fontSize={t(12)} lineHeight={16}>
            Open the Contact section on Home for call/email support.
          </Text>
          <XStack paddingTop={8}>
            <Button backgroundColor={theme.accent} color="#FFFFFF" onPress={() => router.push('/support' as any)}>
              Open Support Chat
            </Button>
          </XStack>
        </YStack>
      </YStack>
    </ScrollView>
  );
}
