import React from 'react';
import { View } from 'react-native';
import { Button, Text, YStack } from 'tamagui';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { themes } from '@/constants/theme';

export default function UnauthorizedScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? themes.dark : themes.light;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
      <YStack gap="$4" alignItems="center" maxWidth={400}>
        <Text fontSize={64}>🔒</Text>
        <Text color={theme.text} fontSize={24} fontWeight="900" textAlign="center">Access Denied</Text>
        <Text color={theme.textMuted} fontSize={14} textAlign="center">
          You do not have permission to access this page. If you believe this is a mistake, please contact support.
        </Text>
        <Button
          backgroundColor={theme.accent}
          color="#FFFFFF"
          borderRadius={10}
          marginTop={12}
          onPress={() => router.replace('/home' as any)}>
          Go to Home
        </Button>
      </YStack>
    </View>
  );
}
