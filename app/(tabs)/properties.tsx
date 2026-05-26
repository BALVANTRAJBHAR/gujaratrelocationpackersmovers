import React, { useEffect, useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { Button, Text, XStack, YStack } from 'tamagui';

import { themes } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSession } from '@/providers/session-provider';
import { useRouter } from 'expo-router';

export default function PropertiesTabScreen() {
  const router = useRouter();
  const { session, profile } = useSession();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? themes.dark : themes.light;

  const role = (profile?.role ?? 'customer').toString().trim().toLowerCase();
  const providerSubtype = String((session?.user?.user_metadata as any)?.provider_subtype ?? '').trim().toLowerCase();

  const canUse = useMemo(() => {
    return Boolean(session?.user?.id) && role === 'provider' && providerSubtype === 'property_owner';
  }, [providerSubtype, role, session?.user?.id]);

  useEffect(() => {
    if (canUse) return;
    router.replace('/home' as any);
  }, [canUse, router]);

  const pageBg = theme.bg;
  const border = theme.border;
  const titleColor = theme.text;
  const muted = theme.textMuted;
  const panelBg = theme.bgCard;

  return (
    <View style={{ flex: 1, backgroundColor: pageBg }}>
      <YStack backgroundColor={theme.headerBg} padding={16} paddingTop={18} borderBottomWidth={1} borderBottomColor={border}>
        <Text color={titleColor} fontSize={18} fontWeight="900">
          Properties
        </Text>
        <Text color={muted} fontSize={12} fontWeight="600">
          Manage your property listings
        </Text>
      </YStack>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <YStack gap="$3">
          <YStack backgroundColor={panelBg} borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$2">
            <Text color={titleColor} fontWeight="900" fontSize={14}>
              Quick Actions
            </Text>
            <XStack gap="$2" flexWrap="wrap">
              <Button backgroundColor="#1F4E79" color="#FFFFFF" hoverStyle={{ backgroundColor: '#1F4E79' }} pressStyle={{ backgroundColor: '#1F4E79' }} onPress={() => router.push('/properties/my-properties' as any)}>
                My Properties
              </Button>
              <Button backgroundColor={theme.success} color="#FFFFFF" onPress={() => router.push('/properties/post' as any)}>
                Post Property
              </Button>
              <Button backgroundColor={theme.bgCardSecondary} color="#FFFFFF" onPress={() => router.push('/properties' as any)}>
                Browse
              </Button>
            </XStack>
          </YStack>

          <YStack backgroundColor={panelBg} borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$2">
            <Text color={titleColor} fontWeight="900" fontSize={14}>
              Tips
            </Text>
            <Text color={muted} fontSize={12}>
              Keep photos clear and update pricing before publishing.
            </Text>
          </YStack>
        </YStack>
      </ScrollView>
    </View>
  );
}
