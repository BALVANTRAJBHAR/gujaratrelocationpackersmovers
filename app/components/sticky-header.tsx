import { FontAwesome } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { t } from '@/constants/typography';
import { signOutSupabaseSafe } from '@/lib/supabase';
import {
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image, Text, XStack, YStack } from 'tamagui';


const { width: screenWidth } = Dimensions.get('window');
const APP_SERIF_FONT = Platform.OS === 'web' ? "'Times New Roman', Times, serif" : 'Times New Roman';
const menuItems = ['Home', 'Services', 'Track', 'Contact'];

// Icon mapping for desktop menu items
const MENU_ICONS: Record<string, string> = {
  Home: 'home',
  Services: 'list',
  Track: 'map-marker',
  Contact: 'phone',
};

const serviceSubMenuItems = [
  { label: 'Shifting Services', route: '/book', icon: 'truck' },
  { label: 'Home Services', route: '/home-services/request', icon: 'wrench' },
  { label: 'Property Management', route: '/properties', icon: 'building' },
];

interface StickyHeaderProps {
  theme: any;
  isSmallScreen?: boolean;
  isDarkMode?: boolean;
  toggleTheme?: () => void;
  session?: any;
  unreadCount?: number;
  canManage?: boolean;
  MaterialIcons?: any;
  onHomePress?: () => void;
  onServicesPress?: () => void;
  onTrackPress?: () => void;
  onContactPress?: () => void;
  onDashboardPress?: () => void;
  onProfilePress?: () => void;
  onLogout?: () => void;
  onLoginPress?: () => void;
}

/** Shared button shell for desktop menu items */
function MenuBtn({
  id,
  hovered,
  setHovered,
  onPress,
  children,
  theme,
}: {
  id: string;
  hovered: string | null;
  setHovered: (v: string | null) => void;
  onPress: () => void;
  children: React.ReactNode;
  theme: any;
}) {
  return (
    <Pressable
      onHoverIn={Platform.OS === 'web' ? () => setHovered(id) : undefined}
      onHoverOut={Platform.OS === 'web' ? () => setHovered(null) : undefined}
      onPress={onPress}>
      <YStack
        paddingHorizontal={18}
        paddingVertical={12}
        borderRadius={14}
        backgroundColor={theme.menuBg}
        borderWidth={1}
        borderColor={hovered === id ? '#FBBF24' : 'rgba(255,255,255,0.12)'}
        shadowColor={theme.shadow}
        shadowOffset={{ width: 0, height: 3 }}
        shadowOpacity={0.12}
        shadowRadius={6}
        elevation={3}
        flexDirection="row"
        alignItems="center"
        gap={6}
        style={hovered === id ? { boxShadow: '0 0 10px 3px rgba(251, 191, 36, 0.5)' } as any : undefined}>
        {children}
      </YStack>
    </Pressable>
  );
}

export default function StickyHeader({
  theme,
  isSmallScreen: _isSmallScreen,
  isDarkMode,
  toggleTheme,
  session,
  unreadCount = 0,
  canManage = false,
  MaterialIcons,
  onHomePress,
  onServicesPress,
  onTrackPress,
  onContactPress,
  onDashboardPress,
  onProfilePress,
  onLogout,
  onLoginPress,
}: StickyHeaderProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const handleLogin = () => (onLoginPress ? onLoginPress() : router.push('/auth/login'));
  const handleLogoutClick = async () => {
    if (onLogout) {
      onLogout();
    } else {
      await signOutSupabaseSafe();
      router.replace('/home');
    }
  };
  const isSmallScreen = _isSmallScreen ?? screenWidth <= 768;
  const [headerHovered, setHeaderHovered] = React.useState<string | null>(null);
  const [servicesOpen, setServicesOpen] = React.useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const handleMenuPress = (item: string) => {
    if (item === 'Services') {
      setServicesOpen((prev) => !prev);
      return;
    }
    setMobileMenuOpen(false);
    setServicesOpen(false);
    if (item === 'Home') {
      onHomePress ? onHomePress() : router.push('/home');
    } else if (item === 'Track') {
      if (onTrackPress) {
        onTrackPress();
      } else if (!session?.user?.id) {
        router.push({ pathname: '/auth/login', params: { redirectTo: '/(tabs)/tracking' } } as any);
      } else {
        router.push('/(tabs)/tracking');
      }
    } else if (item === 'Contact') {
      onContactPress ? onContactPress() : router.push('/support');
    }
  };

  const handleServicesItemPress = (route: string) => {
    setServicesOpen(false);
    setMobileMenuOpen(false);
    router.push(route as any);
  };

  const menuTextColor = theme.menuText;
  const menuFontSize = t(15);

  return (
    <>
      <View
        style={[
          styles.stickyHeader,
          {
            backgroundColor: theme.headerBg,
            borderBottomColor: theme.border,
            shadowColor: theme.shadow,
            paddingTop: Platform.OS === 'android' ? insets.top : 0,
          },
        ]}
        pointerEvents="box-none">
        <XStack
          alignItems="center"
          gap="$3"
          flexWrap="wrap"
          justifyContent="space-between"
          paddingHorizontal={isSmallScreen ? 14 : 24}
          // ← 10% height reduction: was 10/12, now 9/11
          paddingVertical={isSmallScreen ? 9 : 11}>
          <XStack
            alignItems="center"
            gap={isSmallScreen ? '$2' : '$2.5'}
            flexShrink={1}
            minWidth={0}
            maxWidth={isSmallScreen ? '58%' : 250}>
            <Image
              source={require('../../assets/images/PackersMoversLogo.png')}
              // ← 10% reduction: was 46/57, now 42/52
              style={[styles.logo, isSmallScreen && styles.logoMobile]}
            />
            <YStack flexShrink={1} minWidth={0}>
              <Text
                color={theme.text}
                fontSize={isSmallScreen ? t(13) : t(17)}
                fontWeight="900"
                lineHeight={isSmallScreen ? 15 : 19}
                numberOfLines={1}
                letterSpacing={0.4}
                fontFamily={APP_SERIF_FONT}>
                GUJARAT
              </Text>
              <Text
                color={theme.text}
                fontSize={isSmallScreen ? t(13) : t(17)}
                fontWeight="900"
                lineHeight={isSmallScreen ? 15 : 19}
                numberOfLines={1}
                letterSpacing={0.4}
                fontFamily={APP_SERIF_FONT}>
                RELOCATION
              </Text>
            </YStack>
          </XStack>

          {!isSmallScreen ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.menuRow}>
              <XStack gap="$2" alignItems="center" flexWrap="wrap">
                {menuItems.map((item) => (
                  <View key={item} style={{ position: 'relative' }}>
                    <MenuBtn id={item} hovered={headerHovered} setHovered={setHeaderHovered} onPress={() => handleMenuPress(item)} theme={theme}>
                      <FontAwesome name={MENU_ICONS[item] as any} size={14} color={menuTextColor} />
                      <Text
                        color={menuTextColor}
                        fontSize={menuFontSize}
                        fontWeight="700"
                        letterSpacing={0.3}
                        style={{ fontFamily: APP_SERIF_FONT, textDecorationLine: 'none' }}>
                        {item}
                      </Text>
                    </MenuBtn>
                    {item === 'Services' && servicesOpen ? (
                      <View
                        style={[
                          styles.servicesDropdown,
                          { backgroundColor: theme.bgCard, borderColor: theme.border },
                        ]}>
                        {serviceSubMenuItems.map((sub) => (
                          <Pressable
                            key={sub.label}
                            onPress={() => handleServicesItemPress(sub.route)}
                            onHoverIn={Platform.OS === 'web' ? () => setHeaderHovered(sub.label) : undefined}
                            onHoverOut={Platform.OS === 'web' ? () => setHeaderHovered(null) : undefined}>
                            <YStack
                              paddingHorizontal={18}
                              paddingVertical={12}
                              backgroundColor={headerHovered === sub.label ? theme.menuBg : 'transparent'}
                              borderRadius={10}>
                              <XStack gap={10} alignItems="center">
                                <FontAwesome name={sub.icon as any} size={14} color={theme.text} />
                                <Text
                                  color={theme.text}
                                  fontSize={t(14)}
                                  fontWeight="600"
                                  style={{ fontFamily: APP_SERIF_FONT }}>
                                  {sub.label}
                                </Text>
                              </XStack>
                            </YStack>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                  </View>
                ))}

                {toggleTheme ? (
                  <MenuBtn id="theme" hovered={headerHovered} setHovered={setHeaderHovered} onPress={toggleTheme} theme={theme}>
                    <Text fontSize={menuFontSize} style={{ textDecorationLine: 'none' }}>
                      {isDarkMode ? '\u2600\uFE0F' : '\uD83C\uDF19'}
                    </Text>
                  </MenuBtn>
                ) : null}

                {!session ? (
                  <MenuBtn id="signin" hovered={headerHovered} setHovered={setHeaderHovered} onPress={handleLogin} theme={theme}>
                    <FontAwesome name="sign-in" size={14} color={menuTextColor} />
                    <Text color={menuTextColor} fontSize={menuFontSize} fontWeight="800" style={{ fontFamily: APP_SERIF_FONT, textDecorationLine: 'none' }}>
                      Sign In
                    </Text>
                  </MenuBtn>
                ) : (
                  <MenuBtn id="logout" hovered={headerHovered} setHovered={setHeaderHovered} onPress={handleLogoutClick} theme={theme}>
                    <FontAwesome name="sign-out" size={14} color={menuTextColor} />
                    <Text color={menuTextColor} fontSize={menuFontSize} fontWeight="700" style={{ fontFamily: APP_SERIF_FONT, textDecorationLine: 'none' }}>
                      Logout
                    </Text>
                  </MenuBtn>
                )}

                {session && canManage ? (
                  <Pressable
                    onHoverIn={Platform.OS === 'web' ? () => setHeaderHovered('notif') : undefined}
                    onHoverOut={Platform.OS === 'web' ? () => setHeaderHovered(null) : undefined}
                    onPress={() => router.push('/notifications' as any)}>
                    <YStack
                      paddingHorizontal={16}
                      paddingVertical={12}
                      borderRadius={14}
                      backgroundColor={theme.menuBg}
                      borderWidth={1}
                      borderColor={headerHovered === 'notif' ? '#FBBF24' : 'rgba(255,255,255,0.12)'}
                      shadowColor={theme.shadow}
                      shadowOffset={{ width: 0, height: 3 }}
                      shadowOpacity={0.12}
                      shadowRadius={6}
                      elevation={3}
                      alignItems="center"
                      justifyContent="center"
                      style={headerHovered === 'notif' ? { boxShadow: '0 0 10px 3px rgba(251, 191, 36, 0.5)' } as any : undefined}>
                      <View style={{ position: 'relative', width: 22, height: 22 } as any}>
                        <FontAwesome name="bell" size={18} color={theme.menuText} />
                        {unreadCount > 0 ? (
                          <View
                            style={{
                              position: 'absolute',
                              top: -6,
                              right: -8,
                              minWidth: 16,
                              height: 16,
                              borderRadius: 99,
                              backgroundColor: '#EF4444',
                              paddingHorizontal: 4,
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}>
                            <Text color="#FFFFFF" fontSize={t(10)} fontWeight="700">
                              {unreadCount > 99 ? '99+' : String(unreadCount)}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </YStack>
                  </Pressable>
                ) : null}

                {session && onDashboardPress ? (
                  <MenuBtn id="dashboard" hovered={headerHovered} setHovered={setHeaderHovered} onPress={onDashboardPress} theme={theme}>
                    <FontAwesome name="tachometer" size={14} color={menuTextColor} />
                    <Text color={menuTextColor} fontSize={menuFontSize} fontWeight="700" style={{ fontFamily: APP_SERIF_FONT, textDecorationLine: 'none' }}>
                      Dashboard
                    </Text>
                  </MenuBtn>
                ) : null}

                {session && onProfilePress ? (
                  <MenuBtn id="profile" hovered={headerHovered} setHovered={setHeaderHovered} onPress={onProfilePress} theme={theme}>
                    <FontAwesome name="user" size={14} color={menuTextColor} />
                    <Text color={menuTextColor} fontSize={menuFontSize} fontWeight="700" style={{ fontFamily: APP_SERIF_FONT }}>
                      Profile
                    </Text>
                  </MenuBtn>
                ) : null}
              </XStack>
            </ScrollView>
          ) : (
            <XStack gap="$2" alignItems="center">
              {toggleTheme ? (
                <Pressable
                  onHoverIn={Platform.OS === 'web' ? () => setHeaderHovered('mtheme') : undefined}
                  onHoverOut={Platform.OS === 'web' ? () => setHeaderHovered(null) : undefined}
                  onPress={toggleTheme}>
                  <YStack
                    paddingHorizontal={12}
                    paddingVertical={8}
                    borderRadius={12}
                    backgroundColor={theme.menuBg}
                    borderWidth={1}
                    borderColor={headerHovered === 'mtheme' ? '#FBBF24' : 'rgba(255,255,255,0.12)'}
                    shadowColor={theme.shadow}
                    shadowOffset={{ width: 0, height: 3 }}
                    shadowOpacity={0.12}
                    shadowRadius={6}
                    elevation={3}
                    alignItems="center"
                    justifyContent="center"
                    style={headerHovered === 'mtheme' ? { boxShadow: '0 0 10px 3px rgba(251, 191, 36, 0.5)' } as any : undefined}>
                    <Text fontSize={t(13)} style={{ textDecorationLine: 'none' }}>
                      {isDarkMode ? '\u2600\uFE0F' : '\uD83C\uDF19'}
                    </Text>
                  </YStack>
                </Pressable>
              ) : null}

              {session && canManage ? (
                <Pressable
                  onHoverIn={Platform.OS === 'web' ? () => setHeaderHovered('mnotif') : undefined}
                  onHoverOut={Platform.OS === 'web' ? () => setHeaderHovered(null) : undefined}
                  onPress={() => router.push('/notifications' as any)}>
                  <YStack
                    paddingHorizontal={12}
                    paddingVertical={8}
                    borderRadius={12}
                    backgroundColor={theme.menuBg}
                    borderWidth={1}
                    borderColor={headerHovered === 'mnotif' ? '#FBBF24' : 'rgba(255,255,255,0.12)'}
                    shadowColor={theme.shadow}
                    shadowOffset={{ width: 0, height: 3 }}
                    shadowOpacity={0.12}
                    shadowRadius={6}
                    elevation={3}
                    alignItems="center"
                    justifyContent="center"
                    style={headerHovered === 'mnotif' ? { boxShadow: '0 0 10px 3px rgba(251, 191, 36, 0.5)' } as any : undefined}>
                    <View style={{ position: 'relative', width: 22, height: 22 } as any}>
                      <FontAwesome name="bell" size={18} color={theme.menuText} />
                      {unreadCount > 0 ? (
                        <View
                          style={{
                            position: 'absolute',
                            top: -6,
                            right: -8,
                            minWidth: 16,
                            height: 16,
                            borderRadius: 99,
                            backgroundColor: '#EF4444',
                            paddingHorizontal: 4,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}>
                          <Text color="#FFFFFF" fontSize={t(10)} fontWeight="700">
                            {unreadCount > 99 ? '99+' : String(unreadCount)}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </YStack>
                </Pressable>
              ) : null}

              {!session ? (
                <Pressable onPress={handleLogin}>
                  <YStack
                    paddingHorizontal={12}
                    paddingVertical={8}
                    borderRadius={12}
                    backgroundColor={theme.menuBg}
                    borderWidth={1}
                    borderColor={headerHovered === 'mlogin' ? '#FBBF24' : 'rgba(255,255,255,0.12)'}
                    shadowColor={theme.shadow}
                    shadowOffset={{ width: 0, height: 3 }}
                    shadowOpacity={0.12}
                    shadowRadius={6}
                    elevation={3}
                    alignItems="center"
                    justifyContent="center"
                    style={headerHovered === 'mlogin' ? { boxShadow: '0 0 10px 3px rgba(251, 191, 36, 0.5)' } as any : undefined}>
                    <XStack gap={4} alignItems="center">
                      <FontAwesome name="sign-in" size={14} color={theme.menuText} />
                      <Text
                        color={theme.menuText}
                        fontSize={t(13)}
                        fontWeight="800"
                        style={{ fontFamily: APP_SERIF_FONT }}>
                        Log In
                      </Text>
                    </XStack>
                  </YStack>
                </Pressable>
              ) : null}

              {session && onLogout ? (
                <Pressable onPress={handleLogoutClick}>
                  <YStack
                    paddingHorizontal={12}
                    paddingVertical={8}
                    borderRadius={12}
                    backgroundColor={theme.menuBg}
                    borderWidth={1}
                    borderColor={headerHovered === 'mlogout' ? '#FBBF24' : 'rgba(255,255,255,0.12)'}
                    shadowColor={theme.shadow}
                    shadowOffset={{ width: 0, height: 3 }}
                    shadowOpacity={0.12}
                    shadowRadius={6}
                    elevation={3}
                    alignItems="center"
                    justifyContent="center"
                    style={headerHovered === 'mlogout' ? { boxShadow: '0 0 10px 3px rgba(251, 191, 36, 0.5)' } as any : undefined}>
                    {MaterialIcons ? (
                      <MaterialIcons name="logout" size={18} color={theme.menuText} />
                    ) : (
                      <XStack alignItems="center" gap={4}>
                        <FontAwesome name="sign-out" size={14} color={theme.menuText} />
                        <Text color={theme.menuText} fontSize={t(12)} fontWeight="800" style={{ fontFamily: APP_SERIF_FONT }}>
                          Out
                        </Text>
                      </XStack>
                    )}
                  </YStack>
                </Pressable>
              ) : null}
            </XStack>
          )}
        </XStack>
      </View>


    </>
  );
}

const styles = StyleSheet.create({
  stickyHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    borderBottomWidth: 1,
  },
  mobileMenuOverlay: {
    position: 'absolute',
    top: 56,
    left: 14,
    right: 14,
    zIndex: 80,
  },
  menuRow: {
    gap: 10,
  },
  servicesDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    zIndex: 100,
    minWidth: 200,
    borderRadius: 14,
    borderWidth: 1,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 12,
  },
  logo: {
    width: 42,
    height: 42,
    resizeMode: 'contain',
  },
  logoMobile: {
    width: 52,
    height: 52,
  },
});
