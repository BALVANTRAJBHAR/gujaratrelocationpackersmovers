import '@/lib/font-web-guard-init';
import '@/lib/supabase-auth-guard-init';

import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { PortalProvider } from '@tamagui/portal';
import { useFonts } from 'expo-font';
import { Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { Platform, Text as RNText, TextInput as RNTextInput, useWindowDimensions } from 'react-native';
import 'react-native-reanimated';
import { TamaguiProvider } from 'tamagui';

import MobileBottomNav from '@/app/components/MobileBottomNav';
import { themes } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import '@/lib/driver-location-task';
import { installFontTimeoutGuard, preloadWebIconFonts } from '@/lib/font-web-guard';
import { installSupabaseAuthAbortGuard } from '@/lib/supabase-auth-guard';
import { ColorSchemeProvider } from '@/providers/color-scheme-provider';
import { SessionProvider, useSession } from '@/providers/session-provider';
import tamaguiConfig from '@/tamagui.config';

const appFontFamily = Platform.OS === 'web' ? "'Times New Roman', Times, serif" : 'Times New Roman';

function installDefaultTextFont() {
  const textDefaults = (RNText as any).defaultProps ?? {};
  (RNText as any).defaultProps = {
    ...textDefaults,
    style: [{ fontFamily: appFontFamily }, textDefaults.style],
  };

  const inputDefaults = (RNTextInput as any).defaultProps ?? {};
  (RNTextInput as any).defaultProps = {
    ...inputDefaults,
    style: [{ fontFamily: appFontFamily, fontSize: 15 }, inputDefaults.style],
  };
}

installDefaultTextFont();

export const unstable_settings = {
  anchor: '(tabs)',
};

function AppLayoutInner() {
  const { session } = useSession();
  const { width: screenWidth } = useWindowDimensions();
  const segments = useSegments();
  const isMobile = screenWidth <= 768;
  const hideNav =
    segments.length === 0 ||
    (segments[0] === 'auth') ||
    (segments[0] === 'book') ||
    (segments[0] === 'home-services' && segments[1] === 'request') ||
    (segments[0] === 'properties' && segments[1] === 'post') ||
    (segments[0] === 'properties' && segments[1] === 'my-properties');
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? themes.dark : themes.light;

  return (
    <>
      <Stack>
        {/* index = splash screen — no header */}
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="splash" options={{ headerShown: false }} />
        <Stack.Screen name="home" options={{ headerShown: false }} />
        <Stack.Screen name="support" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="notifications" options={{ headerShown: false }} />
        <Stack.Screen name="services/household-shifting" options={{ headerShown: false }} />
        <Stack.Screen name="services/[slug]" options={{ headerShown: false }} />
        <Stack.Screen name="home-services/request" options={{ headerShown: false }} />
        <Stack.Screen name="home-services/my-requests" options={{ headerShown: false }} />
        <Stack.Screen name="home-services/available-requests" options={{ headerShown: false }} />
        <Stack.Screen name="properties/index" options={{ headerShown: false }} />
        <Stack.Screen name="properties/post" options={{ headerShown: false }} />
        <Stack.Screen name="properties/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="properties/my-properties" options={{ headerShown: false }} />
        <Stack.Screen name="book/index" options={{ headerShown: false }} />
        <Stack.Screen name="privacy-policy" options={{ headerShown: false }} />
        <Stack.Screen name="terms-and-conditions" options={{ headerShown: false }} />
        <Stack.Screen name="auth/login" options={{ title: 'Sign In' }} />
        <Stack.Screen name="auth/register" options={{ title: 'Sign Up' }} />
        <Stack.Screen name="auth/profile" options={{ title: 'My Profile' }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        <Stack.Screen name="unauthorized" options={{ headerShown: false }} />
        <Stack.Screen name="admin/locations" options={{ headerShown: false }} />
        <Stack.Screen name="admin/staff-management" options={{ headerShown: false }} />
        <Stack.Screen name="ref/[code]" options={{ headerShown: false }} />
        <Stack.Screen name="refer-and-earn/index" options={{ headerShown: false }} />
      </Stack>
      {isMobile && !hideNav ? <MobileBottomNav theme={theme} session={session} /> : null}
    </>
  );
}

function AppLayout() {
  const colorScheme = useColorScheme();
  const [fontsLoaded] = useFonts({
    'Times New Roman': require('../assets/fonts/times.ttf'),
    'Times New Roman Bold': require('../assets/fonts/timesbd.ttf'),
  });

  useEffect(() => {
    const cleanupAuth = installSupabaseAuthAbortGuard();
    const cleanup = installFontTimeoutGuard();
    void preloadWebIconFonts();
    return () => {
      cleanupAuth();
      cleanup();
    };
  }, []);

  if (!fontsLoaded) return null;

  const statusTheme = colorScheme === 'dark' ? themes.dark : themes.light;

  return (
    <SessionProvider>
      <TamaguiProvider config={tamaguiConfig}>
        <PortalProvider>
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <AppLayoutInner />
            <StatusBar
              style={colorScheme === 'dark' ? 'light' : 'dark'}
              backgroundColor={statusTheme.headerBg}
              translucent={false}
            />
          </ThemeProvider>
        </PortalProvider>
      </TamaguiProvider>
    </SessionProvider>
  );
}
class RootErrorBoundary extends React.Component<any, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Unhandled error at root:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <YStack flex={1} backgroundColor="#F8FAFC" alignItems="center" justifyContent="center" padding={24}>
          <YStack gap="$3" alignItems="center">
            <Text fontSize={20} fontWeight="900">Something went wrong</Text>
            <Text fontSize={14} color="#475569">We encountered a temporary issue. Reload to continue.</Text>
            <Button onPress={() => (typeof window !== 'undefined' ? window.location.reload() : null)}>Reload</Button>
          </YStack>
        </YStack>
      );
    }
    return this.props.children;
  }
}

export default function RootLayout() {
  return (
    <ColorSchemeProvider>
      <RootErrorBoundary>
        <AppLayout />
      </RootErrorBoundary>
    </ColorSchemeProvider>
  );
}
