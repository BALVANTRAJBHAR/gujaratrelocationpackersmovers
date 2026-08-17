import { FontAwesome } from '@expo/vector-icons';
import { useRouter, useSegments } from 'expo-router';
import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '@/constants/typography';
import { signOutSupabaseSafe } from '@/lib/supabase';
import { getDashboardRoute } from '@/lib/role-routing';
import { useSession } from '@/providers/session-provider';

const TABS = [
  { key: 'home', icon: 'home', label: 'Home' },
  { key: 'services', icon: 'list', label: 'Services' },
  { key: 'dashboard', icon: 'tachometer', label: 'Dashboard' },
  { key: 'profile', icon: 'user', label: 'Profile' },
];

const serviceItems = [
  { label: 'Shifting Services', route: '/book', icon: 'truck' },
  { label: 'Home Services', route: '/home-services/request', icon: 'wrench' },
  { label: 'Property Management', route: '/properties', icon: 'building' },
];

interface MobileBottomNavProps {
  theme: any;
  session?: any;
  onHomePress?: () => void;
  onDashboardPress?: () => void;
  onProfilePress?: () => void;
  onTrackPress?: () => void;
  onContactPress?: () => void;
  onLogout?: () => void;
  onLoginPress?: () => void;
}

export default function MobileBottomNav({
  theme,
  session,
  onHomePress,
  onDashboardPress,
  onProfilePress,
  onTrackPress,
  onContactPress,
  onLogout,
  onLoginPress,
}: MobileBottomNavProps) {
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const { profile } = useSession();
  const [activeTab, setActiveTab] = useState<string>('home');
  const [sheetOpen, setSheetOpen] = useState<string | null>(null);

  // Detect if we are already on /home to avoid duplicate navigation
  const segs = segments as any;
  const isOnHome =
    segs.length === 0 ||
    segs[0] === 'home' ||
    segs[0] === 'index' ||
    (segs[0] === '(tabs)' && (segs.length === 1 || segs[1] === 'index' || segs[1] === ''));

  const handleTabPress = (key: string) => {
    setActiveTab(key);
    if (key === 'home') {
      setSheetOpen(null);
      if (onHomePress) {
        onHomePress();
      } else if (!isOnHome) {
        // Use replace so home doesn't stack on top of itself
        router.replace(Platform.OS === 'web' ? ('/home' as any) : ('/(tabs)' as any));
      }
    } else if (key === 'services') {
      setSheetOpen(sheetOpen === 'services' ? null : 'services');
    } else if (key === 'dashboard') {
      setSheetOpen(null);
      try {
        if (!session) {
          router.push('/auth/login' as any);
        } else if (onDashboardPress) {
          onDashboardPress();
        } else {
          const role = profile?.role ?? session?.user?.user_metadata?.role ?? 'customer';
          const providerSubtype = session?.user?.user_metadata?.provider_subtype ?? '';
          const route = getDashboardRoute(role, providerSubtype, Platform.OS === 'web' ? 'web' : 'native');
          router.push(route as any);
        }
      } catch {
        // fallback: redirect to home if navigation fails
        router.replace(Platform.OS === 'web' ? ('/home' as any) : ('/(tabs)' as any));
      }
    } else if (key === 'profile') {
      setSheetOpen(sheetOpen === 'profile' ? null : 'profile');
    }
  };

  const handleServiceRoute = (route: string) => {
    setSheetOpen(null);
    setActiveTab('services');
    if (route === '/home-services/request' && !session) {
      router.push({ pathname: '/auth/login', params: { redirectTo: '/home-services/request' } } as any);
      return;
    }
    router.push(route as any);
  };

  const handleProfileAction = (action: string) => {
    setSheetOpen(null);
    if (action === 'profile') {
      if (!session) {
        onLoginPress ? onLoginPress() : router.push('/auth/login');
        return;
      }
      onProfilePress ? onProfilePress() : router.push('/auth/profile');
    } else if (action === 'track') {
      onTrackPress ? onTrackPress() : router.push('/(tabs)/tracking');
    } else if (action === 'refer') {
      router.push('/refer-and-earn');
    } else if (action === 'wallet') {
      router.push('/wallet');
    } else if (action === 'contact') {
      onContactPress ? onContactPress() : router.push('/support');
    } else if (action === 'logout') {
      setActiveTab('home');
      if (onLogout) {
        onLogout();
      } else {
        if (typeof window !== 'undefined') { signOutSupabaseSafe('/home'); } else { signOutSupabaseSafe().then(() => { router.replace('/home' as any); }); }
      }
    } else if (action === 'login') {
      onLoginPress ? onLoginPress() : router.push('/auth/login');
    }
  };

  const isDark = theme?.bg?.includes('0f') || theme?.bg?.includes('000');
  const sheetBg = theme.bgCard || theme.bgSecondary || '#FFFFFF';
  const overlayBg = 'rgba(0,0,0,0.4)';
  const activeColor = theme.primary || '#1F4E79';
  const inactiveColor = theme.textMuted || '#4A5568';

  return (
    <>
      {/* Bottom Sheet Overlay */}
      {sheetOpen ? (
        <Pressable style={[styles.overlay, Platform.OS !== 'web' && { position: 'absolute' }]} onPress={() => setSheetOpen(null)}>
          <View />
        </Pressable>
      ) : null}

      {/* Services Sheet */}
      {sheetOpen === 'services' ? (
        <YStack
          position={Platform.OS === 'web' ? 'fixed' : 'absolute'}
          bottom={54 + insets.bottom}
          left={0}
          right={0}
          backgroundColor={sheetBg}
          borderTopLeftRadius={18}
          borderTopRightRadius={18}
          paddingHorizontal={16}
          paddingTop={4}
          paddingBottom={8}
          shadowColor="#000"
          shadowOffset={{ width: 0, height: -4 }}
          shadowOpacity={0.1}
          shadowRadius={8}
          elevation={8}
          zIndex={1001}>
          <Text color={theme.text} fontWeight="900" fontSize={t(16)} marginBottom={8} style={{ fontFamily: APP_SERIF_FONT }}>
            Our Services
          </Text>
          {serviceItems.map((item) => (
            <Pressable key={item.route} onPress={() => handleServiceRoute(item.route)}>
              <YStack paddingVertical={14} borderBottomWidth={1} borderBottomColor={theme.border}>
                <XStack gap={12} alignItems="center">
                  <FontAwesome name={item.icon as any} size={22} color={theme.text} />
                  <Text color={theme.text} fontSize={t(15)} fontWeight="700" style={{ fontFamily: APP_SERIF_FONT }}>
                    {item.label}
                  </Text>
                </XStack>
              </YStack>
            </Pressable>
          ))}
        </YStack>
      ) : null}

        {/* Profile Sheet */}
      {sheetOpen === 'profile' ? (
        <YStack
          position={Platform.OS === 'web' ? 'fixed' : 'absolute'}
          bottom={54 + insets.bottom}
          left={0}
          right={0}
          backgroundColor={sheetBg}
          borderTopLeftRadius={18}
          borderTopRightRadius={18}
          paddingHorizontal={16}
          paddingTop={4}
          paddingBottom={8}
          shadowColor="#000"
          shadowOffset={{ width: 0, height: -4 }}
          shadowOpacity={0.1}
          shadowRadius={8}
          elevation={8}
          zIndex={1001}>
          {session ? (
            <>
              <Text color={theme.text} fontWeight="900" fontSize={t(16)} marginBottom={8} style={{ fontFamily: APP_SERIF_FONT }}>
                My Profile
              </Text>
              <Pressable onPress={() => handleProfileAction('profile')}>
                <YStack paddingVertical={14} borderBottomWidth={1} borderBottomColor={theme.border}>
                  <XStack gap={12} alignItems="center">
                    <FontAwesome name="user-circle" size={22} color={theme.text} />
                    <Text color={theme.text} fontSize={t(15)} fontWeight="700" style={{ fontFamily: APP_SERIF_FONT }}>Profile</Text>
                  </XStack>
                </YStack>
              </Pressable>
              <Pressable onPress={() => handleProfileAction('track')}>
                <YStack paddingVertical={14} borderBottomWidth={1} borderBottomColor={theme.border}>
                  <XStack gap={12} alignItems="center">
                    <FontAwesome name="map-marker" size={22} color={theme.text} />
                    <Text color={theme.text} fontSize={t(15)} fontWeight="700" style={{ fontFamily: APP_SERIF_FONT }}>Track Order</Text>
                  </XStack>
                </YStack>
              </Pressable>
              <Pressable onPress={() => handleProfileAction('refer')}>
                <YStack paddingVertical={14} borderBottomWidth={1} borderBottomColor={theme.border}>
                  <XStack gap={12} alignItems="center">
                    <FontAwesome name="gift" size={22} color="#F59E0B" />
                    <Text color="#F59E0B" fontSize={t(15)} fontWeight="700" style={{ fontFamily: APP_SERIF_FONT }}>Refer & Earn</Text>
                  </XStack>
                </YStack>
              </Pressable>
              <Pressable onPress={() => handleProfileAction('wallet')}>
                <YStack paddingVertical={14} borderBottomWidth={1} borderBottomColor={theme.border}>
                  <XStack gap={12} alignItems="center">
                    <FontAwesome name="credit-card" size={22} color={theme.text} />
                    <Text color={theme.text} fontSize={t(15)} fontWeight="700" style={{ fontFamily: APP_SERIF_FONT }}>Wallet</Text>
                  </XStack>
                </YStack>
              </Pressable>
              <Pressable onPress={() => handleProfileAction('contact')}>
                <YStack paddingVertical={14} borderBottomWidth={1} borderBottomColor={theme.border}>
                  <XStack gap={12} alignItems="center">
                    <FontAwesome name={"headset" as any} size={22} color={theme.text} />
                    <Text color={theme.text} fontSize={t(15)} fontWeight="700" style={{ fontFamily: APP_SERIF_FONT }}>Contact Us</Text>
                  </XStack>
                </YStack>
              </Pressable>
              <Pressable onPress={() => handleProfileAction('logout')}>
                <YStack paddingVertical={14}>
                  <XStack gap={12} alignItems="center">
                    <FontAwesome name="sign-out" size={22} color={theme.danger || '#DC2626'} />
                    <Text color={theme.danger || '#DC2626'} fontSize={t(15)} fontWeight="700" style={{ fontFamily: APP_SERIF_FONT }}>Sign Out</Text>
                  </XStack>
                </YStack>
              </Pressable>
            </>
          ) : (
            <>
              <Text color={theme.text} fontWeight="900" fontSize={t(16)} marginBottom={12} style={{ fontFamily: APP_SERIF_FONT }}>
                Account
              </Text>
              <Pressable onPress={() => handleProfileAction('login')}>
                <YStack paddingVertical={14} borderBottomWidth={1} borderBottomColor={theme.border}>
                  <XStack gap={12} alignItems="center">
                    <FontAwesome name="sign-in" size={22} color={theme.primary} />
                    <Text color={theme.primary} fontSize={t(15)} fontWeight="700" style={{ fontFamily: APP_SERIF_FONT }}>Sign In</Text>
                  </XStack>
                </YStack>
              </Pressable>
              <Pressable onPress={() => handleProfileAction('contact')}>
                <YStack paddingVertical={14}>
                  <XStack gap={12} alignItems="center">
                    <FontAwesome name={"headset" as any} size={22} color={theme.text} />
                    <Text color={theme.text} fontSize={t(15)} fontWeight="700" style={{ fontFamily: APP_SERIF_FONT }}>Contact Us</Text>
                  </XStack>
                </YStack>
              </Pressable>
            </>
          )}
        </YStack>
      ) : null}

      {/* Bottom Tab Bar */}
      <YStack
        position={Platform.OS === 'web' ? 'fixed' : 'absolute'}
        bottom={0}
        left={0}
        right={0}
        backgroundColor={theme.headerBg || theme.bg}
        paddingBottom={insets.bottom}
        borderTopWidth={1}
        borderTopColor={theme.border}
        zIndex={1000}>
        <XStack justifyContent="space-around" alignItems="center" paddingVertical={6}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key || (tab.key === 'services' && sheetOpen === 'services') || (tab.key === 'profile' && sheetOpen === 'profile');
            return (
              <Pressable key={tab.key} onPress={() => handleTabPress(tab.key)} style={styles.tabItem}>
                <YStack alignItems="center" gap={2}>
                  <FontAwesome
                    name={tab.icon as any}
                    size={22}
                    color={isActive ? activeColor : inactiveColor}
                  />
                  <Text
                    color={isActive ? activeColor : inactiveColor}
                    fontSize={t(10)}
                    fontWeight={isActive ? '800' : '600'}>
                    {tab.label}
                  </Text>
                </YStack>
              </Pressable>
            );
          })}
        </XStack>
      </YStack>
    </>
  );
}

const APP_SERIF_FONT = Platform.OS === 'web' ? "'Times New Roman', Times, serif" : 'Times New Roman';

const styles = StyleSheet.create({
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    zIndex: 999,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 2,
  },
});
