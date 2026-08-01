import { FontAwesome5 } from '@expo/vector-icons';
import Head from 'expo-router/head';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Linking, Platform, Pressable, ScrollView, Share, View } from 'react-native';
import { Button, Text, XStack, YStack } from 'tamagui';

import { themes } from '@/constants/theme';
import { t } from '@/constants/typography';
import { REFER_SEO } from '@/constants/seo';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSession } from '@/providers/session-provider';

export default function ReferAndEarnScreen() {
  const router = useRouter();
  const { session } = useSession();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? themes.dark : themes.light;

  const userId = session?.user?.id || '';
  const referralLink = `https://gujaratrelocationpackers.com/auth/login?ref=${userId}`;
  const shareMsg = `Get ₹500 cashback on GR Packers! Sign up using this link: ${referralLink}`;

  const [toast, setToast] = useState<string | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (message: string) => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      setToast(message);
      Animated.timing(toastOpacity, { toValue: 1, duration: 180, useNativeDriver: Platform.OS !== 'web' }).start();
      toastTimer.current = setTimeout(() => {
        Animated.timing(toastOpacity, { toValue: 0, duration: 250, useNativeDriver: Platform.OS !== 'web' }).start(
          () => setToast(null)
        );
      }, 2000);
    },
    [toastOpacity]
  );

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const copyToClipboard = useCallback(
    async (text: string, successMessage: string) => {
      let copied = false;
      try {
        if (Platform.OS === 'web') {
          try {
            if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
              await navigator.clipboard.writeText(text);
              copied = true;
            }
          } catch {
            copied = false;
          }
          if (!copied) {
            try {
              const textArea = document.createElement('textarea');
              textArea.value = text;
              textArea.style.position = 'fixed';
              textArea.style.opacity = '0';
              document.body.appendChild(textArea);
              textArea.focus();
              textArea.select();
              copied = document.execCommand('copy');
              document.body.removeChild(textArea);
            } catch {
              copied = false;
            }
          }
        } else {
          await Clipboard.setStringAsync(text);
          copied = true;
        }
      } catch {
        copied = false;
      }
      showToast(copied ? successMessage : 'Copy failed. Try again.');
    },
    [showToast]
  );

  const openShareUrl = useCallback((url: string) => {
    if (Platform.OS === 'web') {
      window.open(url, '_blank', 'noopener');
    } else {
      void Linking.openURL(url).catch(() => {
        // fallback: open in browser
        void Linking.openURL('https://www.google.com').catch(() => {});
      });
    }
  }, []);

  const shareOnInstagram = useCallback(async () => {
    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        try {
          await navigator.share({ title: 'Refer & Earn', text: shareMsg });
          return;
        } catch {
          // user cancelled or unsupported → fall back to copy + open
        }
      }
      await copyToClipboard(shareMsg, 'Message copied! Paste it in Instagram.');
      window.open('https://www.instagram.com/', '_blank', 'noopener');
      return;
    }
    try {
      const result = await Share.share({ message: shareMsg, title: 'Refer & Earn' });
      if (result.action === Share.sharedAction) return;
    } catch {
      // share sheet unavailable → fall back to copy + open app
    }
    await copyToClipboard(shareMsg, 'Message copied! Paste it in Instagram.');
    try {
      await Linking.openURL('instagram://app');
    } catch {
      void Linking.openURL('https://www.instagram.com/').catch(() => {});
    }
  }, [copyToClipboard, shareMsg]);

  return (
    <>
      <Head>
        <title>{REFER_SEO.title}</title>
        <meta name="description" content={REFER_SEO.description} />
        <meta property="og:title" content={REFER_SEO.title} />
        <meta property="og:description" content={REFER_SEO.description} />
      </Head>
      <View style={{ flex: 1, backgroundColor: theme.bg }}>
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
              Share your referral link with friends. When they sign up and complete their first booking, you both get ₹500!
            </Text>
          </YStack>

          {/* How it works */}
          <YStack backgroundColor={theme.bgCard} borderRadius={22} padding={20} borderWidth={1} borderColor={theme.border} gap="$4">
            <Text fontSize={t(16)} fontWeight="900" color={theme.text}>How it works</Text>
            <YStack gap="$3">
              {[
                { step: '1', title: 'Share your link', desc: 'Share your unique referral link with friends via WhatsApp, Facebook, or Instagram.' },
                { step: '2', title: 'Friend signs up', desc: 'Your friend clicks your link and creates an account.' },
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

          {/* Referral Link Display */}
          <YStack backgroundColor={theme.bgCard} borderRadius={22} padding={20} borderWidth={1} borderColor={theme.border} gap="$3" alignItems="center">
            <Text color={theme.textMuted} fontSize={t(13)}>Your Referral Link</Text>
            <Text fontSize={t(14)} fontWeight="700" color={theme.primary} textAlign="center" selectable numberOfLines={3}>
              {userId ? referralLink : 'Login to get your referral link'}
            </Text>
            <Text color={theme.textMuted} fontSize={t(13)} textAlign="center">
              Share this link with your friends to earn rewards!
            </Text>
          </YStack>

          {/* Share Buttons */}
          <YStack gap="$2">
            <XStack gap="$2">
              <Button
                flex={1} backgroundColor="#25D366" color="#FFFFFF" borderRadius={12} fontWeight="700" paddingVertical={14} minHeight={48}
                onPress={() => {
                  const url = `https://wa.me/?text=${encodeURIComponent(shareMsg)}`;
                  openShareUrl(url);
                }}>
                <XStack gap={10} alignItems="center" justifyContent="center">
                  <FontAwesome5 name="whatsapp" size={18} color="#FFFFFF" />
                  <Text color="#FFFFFF" fontWeight="700" fontSize={t(14)}>WhatsApp</Text>
                </XStack>
              </Button>
              <Button
                flex={1} backgroundColor="#1877F2" color="#FFFFFF" borderRadius={12} fontWeight="700" paddingVertical={14} minHeight={48}
                onPress={() => {
                  const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(referralLink)}&quote=${encodeURIComponent(shareMsg)}`;
                  openShareUrl(url);
                }}>
                <XStack gap={10} alignItems="center" justifyContent="center">
                  <FontAwesome5 name="facebook-f" size={18} color="#FFFFFF" />
                  <Text color="#FFFFFF" fontWeight="700" fontSize={t(14)}>Facebook</Text>
                </XStack>
              </Button>
            </XStack>
            <XStack gap="$2">
              <Button
                flex={1} backgroundColor="#E4405F" color="#FFFFFF" borderRadius={12} fontWeight="700" paddingVertical={14} minHeight={48}
                onPress={() => {
                  void shareOnInstagram();
                }}>
                <XStack gap={10} alignItems="center" justifyContent="center">
                  <FontAwesome5 name="instagram" size={18} color="#FFFFFF" />
                  <Text color="#FFFFFF" fontWeight="700" fontSize={t(14)}>Instagram</Text>
                </XStack>
              </Button>
              <Button
                flex={1} backgroundColor={theme.bgSecondary} color={theme.text} borderRadius={12} fontWeight="700" paddingVertical={14} minHeight={48}
                borderWidth={1} borderColor={theme.border}
                onPress={() => {
                  void copyToClipboard(referralLink, 'Link copied');
                }}>
                <XStack gap={10} alignItems="center" justifyContent="center">
                  <FontAwesome5 name="link" size={18} color={theme.text} />
                  <Text color={theme.text} fontWeight="700" fontSize={t(14)}>Copy Link</Text>
                </XStack>
              </Button>
            </XStack>
          </YStack>

          {/* Terms */}
          <Text color={theme.textMuted} fontSize={t(12)} textAlign="center">
            ₹500 credited per referred friend who completes their first booking. Terms apply.
          </Text>
        </YStack>
        </ScrollView>
        {toast ? (
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              bottom: 60,
              left: 0,
              right: 0,
              alignItems: 'center',
              opacity: toastOpacity,
            }}>
            <View
              style={{
                backgroundColor: 'rgba(15, 23, 42, 0.92)',
                paddingHorizontal: 20,
                paddingVertical: 12,
                borderRadius: 999,
                maxWidth: '85%',
              }}>
              <Text color="#FFFFFF" fontWeight="700" fontSize={t(13)} textAlign="center">
                {toast}
              </Text>
            </View>
          </Animated.View>
        ) : null}
      </View>
    </>
  );
}
