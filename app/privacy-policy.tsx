import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Text, YStack } from 'tamagui';

import { themes } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function PrivacyPolicyScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? themes.dark : themes.light;

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 24, backgroundColor: theme.bg }}>
      <YStack gap="$4">
        <Pressable onPress={() => router.back()} style={{ alignSelf: 'flex-start' }}>
          <Text fontSize={14} fontWeight="800" color={theme.primary} style={{ fontFamily: 'Times New Roman' }}>
            {'← Back'}
          </Text>
        </Pressable>

        <YStack gap="$2">
          <Text fontSize={28} fontWeight="900" color={theme.text} style={{ fontFamily: 'Times New Roman' }}>
            Privacy Policy
          </Text>
          <Text fontSize={13} fontWeight="700" color={theme.textMuted} style={{ fontFamily: 'Times New Roman' }}>
            Last updated: January 2025
          </Text>
        </YStack>

        <View style={{ height: 1, backgroundColor: theme.border }} />

        <YStack gap="$4">
          <YStack gap="$2">
            <Text fontSize={18} fontWeight="900" color={theme.text} style={{ fontFamily: 'Times New Roman' }}>
              1. Information We Collect
            </Text>
            <Text fontSize={14} fontWeight="600" lineHeight={22} color={theme.textMuted} style={{ fontFamily: 'Times New Roman' }}>
              We may collect personal information such as your name, phone number, email address, pickup and drop locations,
              and service requirements when you use our services or submit a quote request.
            </Text>
          </YStack>

          <YStack gap="$2">
            <Text fontSize={18} fontWeight="900" color={theme.text} style={{ fontFamily: 'Times New Roman' }}>
              2. How We Use Your Information
            </Text>
            <Text fontSize={14} fontWeight="600" lineHeight={22} color={theme.textMuted} style={{ fontFamily: 'Times New Roman' }}>
              We use the collected information to provide relocation services, respond to enquiries, process bookings,
              coordinate pickups/deliveries, provide customer support, and improve our service experience.
            </Text>
          </YStack>

          <YStack gap="$2">
            <Text fontSize={18} fontWeight="900" color={theme.text} style={{ fontFamily: 'Times New Roman' }}>
              3. Data Security
            </Text>
            <Text fontSize={14} fontWeight="600" lineHeight={22} color={theme.textMuted} style={{ fontFamily: 'Times New Roman' }}>
              We take reasonable measures to protect your information. However, no method of transmission over the internet
              or electronic storage is completely secure.
            </Text>
          </YStack>

          <YStack gap="$2">
            <Text fontSize={18} fontWeight="900" color={theme.text} style={{ fontFamily: 'Times New Roman' }}>
              4. Contact Us
            </Text>
            <Text fontSize={14} fontWeight="600" lineHeight={22} color={theme.textMuted} style={{ fontFamily: 'Times New Roman' }}>
              If you have any questions about this Privacy Policy, please contact us at info@gujaratrelocation.com or call
              +91 9987963470.
            </Text>
          </YStack>
        </YStack>

        <View style={{ height: 10 }} />
      </YStack>
    </ScrollView>
  );
}
