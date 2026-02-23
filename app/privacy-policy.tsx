import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Text, YStack } from 'tamagui';

export default function PrivacyPolicyScreen() {
  const router = useRouter();

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 24 }}>
      <YStack gap="$4">
        <Pressable onPress={() => router.back()} style={{ alignSelf: 'flex-start' }}>
          <Text fontSize={14} fontWeight="800" style={{ fontFamily: 'Georgia' }}>
            {'← Back'}
          </Text>
        </Pressable>

        <YStack gap="$2">
          <Text fontSize={28} fontWeight="900" style={{ fontFamily: 'Georgia' }}>
            Privacy Policy
          </Text>
          <Text fontSize={13} fontWeight="700" opacity={0.75} style={{ fontFamily: 'Georgia' }}>
            Last updated: January 2025
          </Text>
        </YStack>

        <View style={{ height: 1, backgroundColor: 'rgba(148, 163, 184, 0.35)' }} />

        <YStack gap="$4">
          <YStack gap="$2">
            <Text fontSize={18} fontWeight="900" style={{ fontFamily: 'Georgia' }}>
              1. Information We Collect
            </Text>
            <Text fontSize={14} fontWeight="600" lineHeight={22} style={{ fontFamily: 'Georgia' }}>
              We may collect personal information such as your name, phone number, email address, pickup and drop locations,
              and service requirements when you use our services or submit a quote request.
            </Text>
          </YStack>

          <YStack gap="$2">
            <Text fontSize={18} fontWeight="900" style={{ fontFamily: 'Georgia' }}>
              2. How We Use Your Information
            </Text>
            <Text fontSize={14} fontWeight="600" lineHeight={22} style={{ fontFamily: 'Georgia' }}>
              We use the collected information to provide relocation services, respond to enquiries, process bookings,
              coordinate pickups/deliveries, provide customer support, and improve our service experience.
            </Text>
          </YStack>

          <YStack gap="$2">
            <Text fontSize={18} fontWeight="900" style={{ fontFamily: 'Georgia' }}>
              3. Data Security
            </Text>
            <Text fontSize={14} fontWeight="600" lineHeight={22} style={{ fontFamily: 'Georgia' }}>
              We take reasonable measures to protect your information. However, no method of transmission over the internet
              or electronic storage is completely secure.
            </Text>
          </YStack>

          <YStack gap="$2">
            <Text fontSize={18} fontWeight="900" style={{ fontFamily: 'Georgia' }}>
              4. Contact Us
            </Text>
            <Text fontSize={14} fontWeight="600" lineHeight={22} style={{ fontFamily: 'Georgia' }}>
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
