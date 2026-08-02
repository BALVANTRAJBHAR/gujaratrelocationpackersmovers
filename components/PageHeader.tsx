import { FontAwesome5 } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Platform, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';

import { themes } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { t } from '@/constants/typography';

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  dark?: boolean;
  right?: React.ReactNode;
};

export default function PageHeader({ title, subtitle, onBack, dark = false, right }: PageHeaderProps) {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? themes.dark : themes.light;
  const insets = useSafeAreaInsets();

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/home' as any);
    }
  };

  const bg = dark ? '#1F4E79' : (theme.headerBg ?? theme.bgSecondary ?? theme.bg);
  const fg = dark ? '#FFFFFF' : theme.text;
  const subFg = dark ? 'rgba(255,255,255,0.75)' : theme.textMuted;
  const iconBg = dark ? 'rgba(255,255,255,0.18)' : theme.border;

  return (
    <YStack
      backgroundColor={bg}
      paddingTop={Platform.OS === 'android' ? insets.top : Platform.OS === 'web' ? 0 : insets.top}
      borderBottomWidth={1}
      borderBottomColor={dark ? 'rgba(255,255,255,0.15)' : theme.border}>
      <XStack
        minHeight={52}
        alignItems="center"
        justifyContent="center"
        position="relative"
        paddingHorizontal={12}>
        <Pressable
          onPress={handleBack}
          hitSlop={8}
          style={{
            position: 'absolute',
            left: 12,
            top: 0,
            bottom: 0,
            justifyContent: 'center',
            alignItems: 'center',
          }}>
          <YStack
            width={34}
            height={34}
            borderRadius={17}
            alignItems="center"
            justifyContent="center"
            backgroundColor={iconBg}>
            <FontAwesome5 name="arrow-left" size={16} color={fg} />
          </YStack>
        </Pressable>

        <YStack minWidth={0} alignItems="center" flexShrink={1}>
          <Text
            color={fg}
            fontSize={t(16)}
            fontWeight="800"
            numberOfLines={1}
            style={{ fontFamily: Platform.OS === 'web' ? "'Times New Roman', Times, serif" : 'Times New Roman' }}>
            {title}
          </Text>
          {subtitle ? (
            <Text color={subFg} fontSize={t(11)} fontWeight="600" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </YStack>

        {right ? (
          <XStack position="absolute" right={12} alignItems="center" gap="$2">
            {right}
          </XStack>
        ) : null}
      </XStack>
    </YStack>
  );
}