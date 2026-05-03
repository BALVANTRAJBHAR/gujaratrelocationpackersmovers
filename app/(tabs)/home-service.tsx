import React, { useEffect, useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { Button, Text, XStack, YStack } from 'tamagui';

import { useSession } from '@/providers/session-provider';
import { useRouter } from 'expo-router';

export default function HomeServiceTabScreen() {
  const router = useRouter();
  const { session, profile } = useSession();

  const role = (profile?.role ?? 'customer').toString().trim().toLowerCase();
  const providerSubtype = String((session?.user?.user_metadata as any)?.provider_subtype ?? '').trim().toLowerCase();

  const canUse = useMemo(() => {
    return Boolean(session?.user?.id) && role === 'provider' && providerSubtype === 'home_service';
  }, [providerSubtype, role, session?.user?.id]);

  useEffect(() => {
    if (canUse) return;
    router.replace('/home' as any);
  }, [canUse, router]);

  const pageBg = '#0B0B12';
  const border = '#1F2937';
  const titleColor = '#F9FAFB';
  const muted = '#9CA3AF';
  const panelBg = '#111827';

  return (
    <View style={{ flex: 1, backgroundColor: pageBg }}>
      <YStack backgroundColor="#111827" padding={16} paddingTop={18} borderBottomWidth={1} borderBottomColor={border}>
        <Text color={titleColor} fontSize={18} fontWeight="900">
          Home Service
        </Text>
        <Text color={muted} fontSize={12} fontWeight="600">
          Manage and track home service requests
        </Text>
      </YStack>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <YStack gap="$3">
          <YStack backgroundColor={panelBg} borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$2">
            <Text color={titleColor} fontWeight="900" fontSize={14}>
              Quick Actions
            </Text>
            <XStack gap="$2" flexWrap="wrap">
              <Button backgroundColor="#1F4E79" color="#FFFFFF" onPress={() => router.push('/home-services/my-requests' as any)}>
                My Requests
              </Button>
              <Button backgroundColor="#10B981" color="#0B0B12" onPress={() => router.push('/home-services/request' as any)}>
                New Request
              </Button>
            </XStack>
          </YStack>

          <YStack backgroundColor={panelBg} borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$2">
            <Text color={titleColor} fontWeight="900" fontSize={14}>
              Notes
            </Text>
            <Text color={muted} fontSize={12}>
              Keep your contact details correct for faster assignment.
            </Text>
          </YStack>
        </YStack>
      </ScrollView>
    </View>
  );
}
