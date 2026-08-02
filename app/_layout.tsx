import '@/lib/font-web-guard-init';
import '@/lib/supabase-auth-guard-init';

import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { PortalProvider } from '@tamagui/portal';
import * as Font from 'expo-font';
import * as FileSystem from 'expo-file-system/legacy';
import * as Notifications from 'expo-notifications';
import { Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { Linking, Platform, Text as RNText, TextInput as RNTextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
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

// Configure notification handler globally so all push/local notifications
// display an alert, make a sound, and set a badge.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

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
  // Bottom navigation is only visible on root/main pages. Any child page
  // opened from Home/Services/Dashboard/Profile hides it and shows its own
  // PageHeader with a back button instead.
  const ROOT_NAV_SEGMENTS: string[][] = [
    [],
    ['index'],
    ['splash'],
    ['home'],
    ['(tabs)', 'index'],
    ['(tabs)', 'tracking'],
    ['(tabs)', 'properties'],
    ['(tabs)', 'home-service'],
    ['(tabs)', 'driver'],
    ['(tabs)', 'explore'],
    ['(tabs)', 'admin-history'],
  ];
  const hideNav =
    !ROOT_NAV_SEGMENTS.some((s) => s.length === segments.length && s.every((seg, i) => seg === segments[i]));
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? themes.dark : themes.light;

  // Listen for taps on download-complete notifications and open the file.
  const notifListenerRef = useRef<Notifications.Subscription | null>(null);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    notifListenerRef.current = Notifications.addNotificationResponseReceivedListener(
      async (response) => {
        try {
          const data = response.notification.request.content.data as Record<string, unknown>;
          const fileUri = data?.fileUri as string | undefined;
          if (!fileUri) return;
          if (Platform.OS === 'android') {
            const contentUri = await (FileSystem as any).getContentUriAsync(fileUri);
            await Linking.openURL(contentUri);
          } else {
            await Linking.openURL(fileUri);
          }
        } catch (e) {
          console.warn('[layout] Failed to open file from notification:', e);
        }
      }
    );
    return () => {
      notifListenerRef.current?.remove();
    };
  }, []);

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
        <Stack.Screen name="auth/profile" options={{ title: 'My Profile', headerShown: false }} />
        <Stack.Screen name="wallet/index" options={{ headerShown: false }} />
        <Stack.Screen name="wallet/add" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Payment History' }} />
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

const FONT_LOAD_TIMEOUT = 5000;

function AppLayout() {
  const colorScheme = useColorScheme();
  const [fontsLoaded, setFontsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) setFontsLoaded(true);
    }, FONT_LOAD_TIMEOUT);

    Font.loadAsync({
      'Times New Roman': require('../assets/fonts/times.ttf'),
      'Times New Roman Bold': require('../assets/fonts/timesbd.ttf'),
    })
      .then(() => { if (!cancelled) { clearTimeout(timer); setFontsLoaded(true); } })
      .catch(() => { if (!cancelled) { clearTimeout(timer); setFontsLoaded(true); } });

    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

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
class RootErrorBoundary extends React.Component<any, { hasError: boolean; errorMsg: string }> {
  state: { hasError: boolean; errorMsg: string } = { hasError: false, errorMsg: '' };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, _info: React.ErrorInfo) {
    const msg = error?.message || error?.toString() || 'Unknown error';
    this.setState({ errorMsg: msg });
    try { (typeof console !== 'undefined') && console.error('Root error:', msg); } catch {}
  }

  render() {
    if (this.state.hasError) {
      const err = this.state.errorMsg;
      return (
        <View style={{ flex: 1, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ alignItems: 'center', gap: 8 }}>
            <RNText style={{ fontSize: 20, fontWeight: '900', color: '#0B1F3A' }}>Something went wrong</RNText>
            {err ? (
              <RNText style={{ fontSize: 12, color: '#DC2626', textAlign: 'center', maxWidth: 360 }}>
                {err}
              </RNText>
            ) : null}
            <RNText style={{ fontSize: 14, color: '#475569', marginTop: 4 }}>
              We encountered a temporary issue. Reload to continue.
            </RNText>
            <TouchableOpacity
              onPress={() => { if (typeof window !== 'undefined') window.location.reload(); }}
              style={{
                backgroundColor: '#3B82F6', paddingHorizontal: 24, paddingVertical: 12,
                borderRadius: 8, marginTop: 8,
              }}>
              <RNText style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>Reload</RNText>
            </TouchableOpacity>
          </View>
        </View>
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
