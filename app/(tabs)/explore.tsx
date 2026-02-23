import React from 'react';
import { ScrollView } from 'react-native';
import { H2, Paragraph, Text, XStack, YStack } from 'tamagui';

export default function ExploreScreen() {
  return (
    <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }} style={{ backgroundColor: '#0B0B12' }}>
      <YStack gap="$4">
        <YStack gap="$1">
          <Text color="#F97316" fontSize={12} letterSpacing={2} textTransform="uppercase">
            Explore
          </Text>
          <H2 color="#F9FAFB">Services & support</H2>
          <Paragraph color="#9CA3AF">
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
              backgroundColor="#111827"
              borderRadius={18}
              padding={16}
              gap="$2"
              minWidth={260}
              flexGrow={1}
              flexBasis={260}
              borderWidth={1}
              borderColor="#1F2937">
              <Text color="#F9FAFB" fontSize={15} fontWeight="800">
                {card.title}
              </Text>
              <Text color="#9CA3AF" fontSize={12} lineHeight={16}>
                {card.body}
              </Text>
            </YStack>
          ))}
        </XStack>

        <YStack backgroundColor="#0F172A" borderRadius={18} padding={18} gap="$2" borderWidth={1} borderColor="#1F2937">
          <Text color="#F9FAFB" fontWeight="800">
            Need help?
          </Text>
          <Text color="#9CA3AF" fontSize={12} lineHeight={16}>
            Open the Contact section on Home for call/email support.
          </Text>
        </YStack>
      </YStack>
    </ScrollView>
  );
}
