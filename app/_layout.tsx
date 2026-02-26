import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { PortalProvider } from '@tamagui/portal';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { TamaguiProvider } from 'tamagui';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { ColorSchemeProvider } from '@/providers/color-scheme-provider';
import { SessionProvider } from '@/providers/session-provider';
import tamaguiConfig from '@/tamagui.config';

export const unstable_settings = {
  anchor: '(tabs)',
};

function AppLayout() {
  const colorScheme = useColorScheme();

  return (
    <SessionProvider>
      <TamaguiProvider config={tamaguiConfig}>
        <PortalProvider>
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <Stack>
              <Stack.Screen name="splash" options={{ headerShown: false }} />
              <Stack.Screen name="home" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="notifications" options={{ headerShown: false }} />
              <Stack.Screen name="services/household-shifting" options={{ headerShown: false }} />
              <Stack.Screen name="services/[slug]" options={{ headerShown: false }} />
              <Stack.Screen name="book/index" options={{ headerShown: false }} />
              <Stack.Screen name="privacy-policy" options={{ headerShown: false }} />
              <Stack.Screen name="terms-and-conditions" options={{ headerShown: false }} />
              <Stack.Screen name="auth/login" options={{ title: 'Login' }} />
              <Stack.Screen name="auth/profile" options={{ title: 'Profile' }} />
              <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
            </Stack>
            <StatusBar style="auto" />
          </ThemeProvider>
        </PortalProvider>
      </TamaguiProvider>
    </SessionProvider>
  );
}

export default function RootLayout() {
  return (
    <ColorSchemeProvider>
      <AppLayout />
    </ColorSchemeProvider>
  );
}
