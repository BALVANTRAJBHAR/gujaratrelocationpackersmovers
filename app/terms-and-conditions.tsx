import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Text, YStack } from 'tamagui';

import { themes } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { t } from '@/constants/typography';

export default function TermsAndConditionsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? themes.dark : themes.light;

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 24, backgroundColor: theme.bg }}>
      <YStack gap="$4">
        <Pressable onPress={() => router.back()} style={{ alignSelf: 'flex-start' }}>
          <Text fontSize={t(14)} fontWeight="800" color={theme.primary} style={{ fontFamily: 'Times New Roman' }}>
            {'← Back'}
          </Text>
        </Pressable>

        <YStack gap="$2">
          <Text fontSize={t(28)} fontWeight="900" color={theme.text} style={{ fontFamily: 'Times New Roman' }}>
            Terms & Conditions
          </Text>
          <Text fontSize={t(13)} fontWeight="700" color={theme.textMuted} style={{ fontFamily: 'Times New Roman' }}>
            Last updated: January 2025
          </Text>
        </YStack>

        <View style={{ height: 1, backgroundColor: theme.border }} />

        <YStack gap="$4">
          <YStack gap="$2">
            <Text fontSize={t(18)} fontWeight="900" color={theme.text} style={{ fontFamily: 'Times New Roman' }}>
              1. Booking & Payment
            </Text>
            <Text fontSize={t(14)} fontWeight="600" lineHeight={22} color={theme.textMuted} style={{ fontFamily: 'Times New Roman' }}>
              Bookings may require an advance payment to confirm. The remaining balance is payable upon successful delivery
              of goods. Cancellation charges may apply depending on timing and work completed.
            </Text>
          </YStack>

          <YStack gap="$2">
            <Text fontSize={t(18)} fontWeight="900" color={theme.text} style={{ fontFamily: 'Times New Roman' }}>
              2. Liability
            </Text>
            <Text fontSize={t(14)} fontWeight="600" lineHeight={22} color={theme.textMuted} style={{ fontFamily: 'Times New Roman' }}>
              We take utmost care during packing and transportation. However, liability for damage may be limited and is
              subject to declared value and applicable terms.
            </Text>
          </YStack>

          <YStack gap="$2">
            <Text fontSize={t(18)} fontWeight="900" color={theme.text} style={{ fontFamily: 'Times New Roman' }}>
              3. Service Delivery
            </Text>
            <Text fontSize={t(14)} fontWeight="600" lineHeight={22} color={theme.textMuted} style={{ fontFamily: 'Times New Roman' }}>
              Service schedules depend on availability, distance, and operational constraints. Delays due to weather,
              traffic, strikes, government restrictions, or other force majeure events may occur.
            </Text>
          </YStack>

          <YStack gap="$2">
            <Text fontSize={t(18)} fontWeight="900" color={theme.text} style={{ fontFamily: 'Times New Roman' }}>
              4. Customer Responsibilities
            </Text>
            <Text fontSize={t(14)} fontWeight="600" lineHeight={22} color={theme.textMuted} style={{ fontFamily: 'Times New Roman' }}>
              Customers must provide accurate pickup/delivery details, ensure access to premises, and declare fragile or
              valuable items before packing.
            </Text>
          </YStack>

          <YStack gap="$2">
            <Text fontSize={t(18)} fontWeight="900" color={theme.text} style={{ fontFamily: 'Times New Roman' }}>
              5. Contact
            </Text>
            <Text fontSize={t(14)} fontWeight="600" lineHeight={22} color={theme.textMuted} style={{ fontFamily: 'Times New Roman' }}>
              For queries regarding these Terms, contact info@gujaratrelocation.com or call +91 9987963470.
            </Text>
          </YStack>
        </YStack>

        <View style={{ height: 10 }} />
      </YStack>
    </ScrollView>
  );
}
