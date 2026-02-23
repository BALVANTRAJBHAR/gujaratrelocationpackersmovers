import { Redirect } from 'expo-router';
import React from 'react';
import { YStack } from 'tamagui';

import { useSession } from '@/providers/session-provider';
import HomeLandingScreen from '../home';

export default function HomeScreen() {
  const { session, loading } = useSession();

  if (loading) return <YStack flex={1} backgroundColor="#F8FAFC" />;

  if (!session?.user?.id) return <Redirect href="/auth/login" />;

  return <HomeLandingScreen />;
}
