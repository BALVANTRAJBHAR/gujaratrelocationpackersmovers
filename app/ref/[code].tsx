import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, YStack } from 'tamagui';

export default function ReferralRedirect() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();

  useEffect(() => {
    const ref = String(code ?? '').trim().toUpperCase();
    if (ref) {
      router.replace(`/auth/login?ref=${encodeURIComponent(ref)}`);
    } else {
      router.replace('/auth/login');
    }
  }, [code, router]);

  return (
    <YStack flex={1} alignItems="center" justifyContent="center">
      <ActivityIndicator size="large" />
    </YStack>
  );
}
