import { useRouter } from 'expo-router';
import React from 'react';
import { Linking, Platform, Pressable, ScrollView } from 'react-native';
import { Button, Text, XStack, YStack } from 'tamagui';

import { themes } from '@/constants/theme';
import { t } from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSession } from '@/providers/session-provider';

export default function ReferAndEarnScreen() {
  const router = useRouter();
  const { profile } = useSession();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? themes.dark : themes.light;

  const referralCode = profile?.referral_code || '------';
  const shareMsg = `Use my referral code ${referralCode} to get ₹500 cashback on GR Packers! Download now: https://grpackersmovers.com/ref/${referralCode}`;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }}>
      <YStack padding={24} gap="$4" minHeight="100%">
        <XStack alignItems="center" justifyContent="space-between">
          <Text fontSize={t(22)} fontWeight="900" color={theme.text}>Refer & Earn</Text>
          <Pressable onPress={() => router.back()}>
            <Text color={theme.info} fontWeight="700">Back</Text>
          </Pressable>
        </XStack>

        {/* Hero */}
        <YStack backgroundColor={theme.bgCard} borderRadius={22} padding={20} borderWidth={1} borderColor={theme.border} gap="$3" alignItems="center">
          <Text fontSize={t(32)}>🎉</Text>
          <Text fontSize={t(20)} fontWeight="900" color={theme.text} textAlign="center">Refer a Friend & Earn ₹500</Text>
          <Text color={theme.textMuted} fontSize={t(14)} textAlign="center">
            Share your referral code with friends. When they sign up and complete their first booking, you both get ₹500!
          </Text>
        </YStack>

        {/* How it works */}
        <YStack backgroundColor={theme.bgCard} borderRadius={22} padding={20} borderWidth={1} borderColor={theme.border} gap="$4">
          <Text fontSize={t(16)} fontWeight="900" color={theme.text}>How it works</Text>
          <YStack gap="$3">
            {[
              { step: '1', title: 'Share your code', desc: 'Share your unique referral code with friends via WhatsApp, Facebook, or Instagram.' },
              { step: '2', title: 'Friend signs up', desc: 'Your friend clicks your referral link and creates an account.' },
              { step: '3', title: 'Complete a booking', desc: 'Your friend completes any service — shifting, home service, property post, or buy/rent.' },
              { step: '4', title: 'You both earn ₹500', desc: '₹500 is credited to your wallet and your friend\'s wallet instantly!' },
            ].map((item) => (
              <XStack key={item.step} gap="$3" alignItems="flex-start">
                <YStack width={32} height={32} borderRadius={16} backgroundColor="#1F4E79" alignItems="center" justifyContent="center">
                  <Text color="#FFFFFF" fontWeight="900" fontSize={t(14)}>{item.step}</Text>
                </YStack>
                <YStack flex={1} gap="$1">
                  <Text fontWeight="800" color={theme.text} fontSize={t(15)}>{item.title}</Text>
                  <Text color={theme.textMuted} fontSize={t(13)}>{item.desc}</Text>
                </YStack>
              </XStack>
            ))}
          </YStack>
        </YStack>

        {/* Referral Code */}
        <YStack backgroundColor={theme.bgCard} borderRadius={22} padding={20} borderWidth={1} borderColor={theme.border} gap="$3" alignItems="center">
          <Text color={theme.textMuted} fontSize={t(13)}>Your Referral Code</Text>
          <Text fontSize={t(28)} fontWeight="900" color={theme.primary} letterSpacing={4}>
            {referralCode}
          </Text>
          <Text color={theme.textMuted} fontSize={t(13)} textAlign="center">
            Share this code with your friends to earn rewards!
          </Text>
        </YStack>

        {/* Share Buttons */}
        <YStack gap="$2">
          <XStack gap="$2">
            <Button
              flex={1} backgroundColor="#25D366" color="#FFFFFF" borderRadius={12} fontWeight="700" paddingVertical={14} minHeight={48}
              onPress={() => {
                const url = `https://wa.me/?text=${encodeURIComponent(shareMsg)}`;
                if (Platform.OS === 'web') window.open(url, '_blank');
                else Linking.openURL(url);
              }}>
              WhatsApp
            </Button>
            <Button
              flex={1} backgroundColor="#1877F2" color="#FFFFFF" borderRadius={12} fontWeight="700" paddingVertical={14} minHeight={48}
              onPress={() => {
                const url = `https://www.facebook.com/sharer/sharer.php?quote=${encodeURIComponent(shareMsg)}`;
                if (Platform.OS === 'web') window.open(url, '_blank');
              }}>
              Facebook
            </Button>
          </XStack>
          <XStack gap="$2">
            <Button
              flex={1} backgroundColor="#E4405F" color="#FFFFFF" borderRadius={12} fontWeight="700" paddingVertical={14} minHeight={48}
              onPress={() => {
                if (Platform.OS === 'web') {
                  navigator.clipboard.writeText(shareMsg);
                  alert('Referral link copied! Share on Instagram!');
                }
              }}>
              Instagram
            </Button>
            <Button
              flex={1} backgroundColor={theme.bgSecondary} color={theme.text} borderRadius={12} fontWeight="700" paddingVertical={14} minHeight={48}
              borderWidth={1} borderColor={theme.border}
              onPress={() => {
                if (Platform.OS === 'web') navigator.clipboard.writeText(shareMsg);
              }}>
              Copy Link
            </Button>
          </XStack>
        </YStack>

        {/* Terms */}
        <Text color={theme.textMuted} fontSize={t(12)} textAlign="center">
          ₹500 credited per referred friend who completes their first booking. Terms apply.
        </Text>
      </YStack>
    </ScrollView>
  );
}
