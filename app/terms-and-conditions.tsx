import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Text, YStack } from 'tamagui';

export default function TermsAndConditionsScreen() {
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
            Terms & Conditions
          </Text>
          <Text fontSize={13} fontWeight="700" opacity={0.75} style={{ fontFamily: 'Georgia' }}>
            Last updated: January 2025
          </Text>
        </YStack>

        <View style={{ height: 1, backgroundColor: 'rgba(148, 163, 184, 0.35)' }} />

        <YStack gap="$4">
          <YStack gap="$2">
            <Text fontSize={18} fontWeight="900" style={{ fontFamily: 'Georgia' }}>
              1. Booking & Payment
            </Text>
            <Text fontSize={14} fontWeight="600" lineHeight={22} style={{ fontFamily: 'Georgia' }}>
              Bookings may require an advance payment to confirm. The remaining balance is payable upon successful delivery
              of goods. Cancellation charges may apply depending on timing and work completed.
            </Text>
          </YStack>

          <YStack gap="$2">
            <Text fontSize={18} fontWeight="900" style={{ fontFamily: 'Georgia' }}>
              2. Liability
            </Text>
            <Text fontSize={14} fontWeight="600" lineHeight={22} style={{ fontFamily: 'Georgia' }}>
              We take utmost care during packing and transportation. However, liability for damage may be limited and is
              subject to declared value and applicable terms.
            </Text>
          </YStack>

          <YStack gap="$2">
            <Text fontSize={18} fontWeight="900" style={{ fontFamily: 'Georgia' }}>
              3. Service Delivery
            </Text>
            <Text fontSize={14} fontWeight="600" lineHeight={22} style={{ fontFamily: 'Georgia' }}>
              Service schedules depend on availability, distance, and operational constraints. Delays due to weather,
              traffic, strikes, government restrictions, or other force majeure events may occur.
            </Text>
          </YStack>

          <YStack gap="$2">
            <Text fontSize={18} fontWeight="900" style={{ fontFamily: 'Georgia' }}>
              4. Customer Responsibilities
            </Text>
            <Text fontSize={14} fontWeight="600" lineHeight={22} style={{ fontFamily: 'Georgia' }}>
              Customers must provide accurate pickup/delivery details, ensure access to premises, and declare fragile or
              valuable items before packing.
            </Text>
          </YStack>

          <YStack gap="$2">
            <Text fontSize={18} fontWeight="900" style={{ fontFamily: 'Georgia' }}>
              5. Contact
            </Text>
            <Text fontSize={14} fontWeight="600" lineHeight={22} style={{ fontFamily: 'Georgia' }}>
              For queries regarding these Terms, contact info@gujaratrelocation.com or call +91 9987963470.
            </Text>
          </YStack>
        </YStack>

        <View style={{ height: 10 }} />
      </YStack>
    </ScrollView>
  );
}
