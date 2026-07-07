import { FontAwesome } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '@/constants/typography';

const TABS = [
  { key: 'home', icon: 'home', label: 'Home' },
  { key: 'services', icon: 'list', label: 'Services' },
  { key: 'dashboard', icon: 'tachometer', label: 'Dashboard' },
  { key: 'profile', icon: 'user', label: 'Profile' },
];

const serviceItems = [
  { label: 'Shifting Services', route: '/book' },
  { label: 'Home Services', route: '/home-services/request' },
  { label: 'Property Management', route: '/properties' },
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
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<string>('home');
  const [sheetOpen, setSheetOpen] = useState<string | null>(null);

  const handleTabPress = (key: string) => {
    setActiveTab(key);
    if (key === 'home') {
      setSheetOpen(null);
      onHomePress ? onHomePress() : router.push('/home');
    } else if (key === 'services') {
      setSheetOpen(sheetOpen === 'services' ? null : 'services');
    } else if (key === 'dashboard') {
      setSheetOpen(null);
      if (!session) {
        router.push('/auth/login?redirectTo=/(tabs)/bookings');
      } else {
        onDashboardPress ? onDashboardPress() : router.push('/(tabs)/bookings');
      }
    } else if (key === 'profile') {
      setSheetOpen(sheetOpen === 'profile' ? null : 'profile');
    }
  };

  const handleServiceRoute = (route: string) => {
    setSheetOpen(null);
    setActiveTab('services');
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
    } else if (action === 'contact') {
      onContactPress ? onContactPress() : router.push('/home');
    } else if (action === 'logout') {
      setActiveTab('home');
      onLogout ? onLogout() : null;
    } else if (action === 'login') {
      onLoginPress ? onLoginPress() : router.push('/auth/login');
    }
  };

  const isDark = theme?.bg?.includes('0f') || theme?.bg?.includes('000');
  const sheetBg = theme.bgCard || theme.bgSecondary || '#FFFFFF';
  const overlayBg = 'rgba(0,0,0,0.4)';
  const activeColor = theme.primary || '#1F4E79';
  const inactiveColor = theme.textMuted || '#94A3B8';

  return (
    <>
      {/* Bottom Sheet Overlay */}
      {sheetOpen ? (
        <Pressable style={styles.overlay} onPress={() => setSheetOpen(null)}>
          <View />
        </Pressable>
      ) : null}

      {/* Services Sheet */}
      {sheetOpen === 'services' ? (
        <YStack
          position="absolute"
          bottom={52 + insets.bottom}
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
          shadowOpacity={0.15}
          shadowRadius={12}
          elevation={12}
          zIndex={1001}>
          <Text color={theme.text} fontWeight="900" fontSize={t(16)} marginBottom={8} style={{ fontFamily: APP_SERIF_FONT }}>
            Our Services
          </Text>
          {serviceItems.map((item) => (
            <Pressable key={item.route} onPress={() => handleServiceRoute(item.route)}>
              <YStack paddingVertical={14} borderBottomWidth={1} borderBottomColor={theme.border}>
                <Text color={theme.text} fontSize={t(15)} fontWeight="700" style={{ fontFamily: APP_SERIF_FONT }}>
                  {item.label}
                </Text>
              </YStack>
            </Pressable>
          ))}
          <XStack justifyContent="center" marginTop={8}>
            <Pressable onPress={() => setSheetOpen(null)}>
              <Text color={theme.textMuted} fontSize={t(13)}>Close</Text>
            </Pressable>
          </XStack>
        </YStack>
      ) : null}

      {/* Profile Sheet */}
      {sheetOpen === 'profile' ? (
        <YStack
          position="absolute"
          bottom={52 + insets.bottom}
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
          shadowOpacity={0.15}
          shadowRadius={12}
          elevation={12}
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
              <Pressable onPress={() => handleProfileAction('contact')}>
                <YStack paddingVertical={14} borderBottomWidth={1} borderBottomColor={theme.border}>
                  <XStack gap={12} alignItems="center">
                    <FontAwesome name="headset" size={22} color={theme.text} />
                    <Text color={theme.text} fontSize={t(15)} fontWeight="700" style={{ fontFamily: APP_SERIF_FONT }}>Contact Us</Text>
                  </XStack>
                </YStack>
              </Pressable>
              <Pressable onPress={() => handleProfileAction('logout')}>
                <YStack paddingVertical={14}>
                  <XStack gap={12} alignItems="center">
                    <FontAwesome name="sign-out" size={22} color={theme.danger || '#DC2626'} />
                    <Text color={theme.danger || '#DC2626'} fontSize={t(15)} fontWeight="700" style={{ fontFamily: APP_SERIF_FONT }}>Logout</Text>
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
                    <Text color={theme.primary} fontSize={t(15)} fontWeight="700" style={{ fontFamily: APP_SERIF_FONT }}>Login</Text>
                  </XStack>
                </YStack>
              </Pressable>
              <Pressable onPress={() => handleProfileAction('contact')}>
                <YStack paddingVertical={14}>
                  <XStack gap={12} alignItems="center">
                    <FontAwesome name="headset" size={22} color={theme.text} />
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
        position="absolute"
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
    position: 'absolute',
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
