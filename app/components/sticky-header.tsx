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

/** Shared compact icon-only button for action icons (theme, notification, auth) */
function ActionIconBtn({
  onPress,
  onHoverIn,
  onHoverOut,
  isHovered,
  theme,
  children,
}: {
  onPress: () => void;
  onHoverIn?: () => void;
  onHoverOut?: () => void;
  isHovered?: boolean;
  theme: any;
  children: React.ReactNode;
}) {
  return (
    <Pressable onPress={onPress} onHoverIn={onHoverIn} onHoverOut={onHoverOut}>
      <YStack
        width={44}
        height={44}
        borderRadius={12}
        backgroundColor={theme.menuBg}
        borderWidth={1}
        borderColor={isHovered ? '#FBBF24' : 'rgba(255,255,255,0.12)'}
        shadowColor={theme.shadow}
        shadowOffset={{ width: 0, height: 3 }}
        shadowOpacity={0.08}
        shadowRadius={5}
        elevation={2}
        alignItems="center"
        justifyContent="center"
        paddingHorizontal={0}
        style={isHovered ? { boxShadow: '0 0 6px 2px rgba(251, 191, 36, 0.3)' } as any : undefined}>
        {children}
      </YStack>
    </Pressable>
  );
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
        minHeight={44}
        borderRadius={14}
        backgroundColor={theme.menuBg}
        borderWidth={1}
        borderColor={hovered === id ? '#FBBF24' : 'rgba(255,255,255,0.12)'}
        shadowColor={theme.shadow}
        shadowOffset={{ width: 0, height: 3 }}
        shadowOpacity={0.08}
        shadowRadius={5}
        elevation={2}
        flexDirection="row"
        alignItems="center"
        gap={6}
        style={hovered === id ? { boxShadow: '0 0 6px 2px rgba(251, 191, 36, 0.3)' } as any : undefined}>
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
      router.replace('/home' as any);
    }
  };
  const isSmallScreen = _isSmallScreen ?? screenWidth <= 768;
  const [headerHovered, setHeaderHovered] = React.useState<string | null>(null);
  const [servicesOpen, setServicesOpen] = React.useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const handleMenuPress = (item: string) => {
    if (item === 'Services') {
      setServicesOpen((prev) => !prev);
      onServicesPress?.();
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
          gap="$2"
          flexWrap="nowrap"
          justifyContent="space-between"
          paddingHorizontal={isSmallScreen ? 14 : 24}
          // ← 10% height reduction: was 10/12, now 9/11
          paddingVertical={isSmallScreen ? 9 : 11}>
          <XStack
            alignItems="center"
            gap={isSmallScreen ? '$2' : '$2.5'}
            flexShrink={1}
            minWidth={0}
            maxWidth={isSmallScreen ? '50%' : 250}>
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

                {session && canManage ? (
                  <ActionIconBtn
                    onPress={() => router.push('/notifications' as any)}
                    onHoverIn={Platform.OS === 'web' ? () => setHeaderHovered('notif') : undefined}
                    onHoverOut={Platform.OS === 'web' ? () => setHeaderHovered(null) : undefined}
                    isHovered={headerHovered === 'notif'}
                    theme={theme}>
                    <View style={{ position: 'relative', width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
                      <FontAwesome name="bell" size={18} color={theme.menuText} style={{ textAlign: 'center' }} />
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
                  </ActionIconBtn>
                ) : null}

                {session && onDashboardPress ? (
                  <MenuBtn id="dashboard" hovered={headerHovered} setHovered={setHeaderHovered} onPress={onDashboardPress} theme={theme}>
                    <FontAwesome name="tachometer" size={14} color={menuTextColor} />
                    <Text color={menuTextColor} fontSize={menuFontSize} fontWeight="700" style={{ fontFamily: APP_SERIF_FONT, textDecorationLine: 'none' }}>
                      Dashboard
                    </Text>
                  </MenuBtn>
                ) : null}

                {session ? (
                  <MenuBtn id="refer" hovered={headerHovered} setHovered={setHeaderHovered} onPress={() => router.push('/refer-and-earn')} theme={theme}>
                    <FontAwesome name="gift" size={14} color="#F59E0B" />
                    <Text color="#F59E0B" fontSize={menuFontSize} fontWeight="700" style={{ fontFamily: APP_SERIF_FONT, textDecorationLine: 'none' }}>
                      Refer & Earn
                    </Text>
                  </MenuBtn>
                ) : null}

                {session ? (
                  <MenuBtn id="wallet" hovered={headerHovered} setHovered={setHeaderHovered} onPress={() => router.push('/wallet')} theme={theme}>
                    <FontAwesome name="credit-card" size={14} color={menuTextColor} />
                    <Text color={menuTextColor} fontSize={menuFontSize} fontWeight="700" style={{ fontFamily: APP_SERIF_FONT, textDecorationLine: 'none' }}>
                      Wallet
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

                {toggleTheme ? (
                  <ActionIconBtn
                    onPress={toggleTheme}
                    onHoverIn={Platform.OS === 'web' ? () => setHeaderHovered('theme') : undefined}
                    onHoverOut={Platform.OS === 'web' ? () => setHeaderHovered(null) : undefined}
                    isHovered={headerHovered === 'theme'}
                    theme={theme}>
                    <Text fontSize={t(16)} lineHeight={18} textAlign="center" style={{ textDecorationLine: 'none' }}>
                      {isDarkMode ? '\u2600\uFE0F' : '\uD83C\uDF19'}
                    </Text>
                  </ActionIconBtn>
                ) : null}

                {!session ? (
                  <ActionIconBtn
                    onPress={handleLogin}
                    onHoverIn={Platform.OS === 'web' ? () => setHeaderHovered('signin') : undefined}
                    onHoverOut={Platform.OS === 'web' ? () => setHeaderHovered(null) : undefined}
                    isHovered={headerHovered === 'signin'}
                    theme={theme}>
                    <View style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
                      <FontAwesome name="sign-in" size={16} color="#22C55E" style={{ textAlign: 'center' }} />
                    </View>
                  </ActionIconBtn>
                ) : (
                  <ActionIconBtn
                    onPress={handleLogoutClick}
                    onHoverIn={Platform.OS === 'web' ? () => setHeaderHovered('logout') : undefined}
                    onHoverOut={Platform.OS === 'web' ? () => setHeaderHovered(null) : undefined}
                    isHovered={headerHovered === 'logout'}
                    theme={theme}>
                    <View style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
                      <FontAwesome name="sign-out" size={16} color="#EF4444" style={{ textAlign: 'center' }} />
                    </View>
                  </ActionIconBtn>
                )}
              </XStack>
            </ScrollView>
          ) : (
            <XStack gap={8} alignItems="center">
              {toggleTheme ? (
                <ActionIconBtn
                  onPress={toggleTheme}
                  onHoverIn={Platform.OS === 'web' ? () => setHeaderHovered('mtheme') : undefined}
                  onHoverOut={Platform.OS === 'web' ? () => setHeaderHovered(null) : undefined}
                  isHovered={headerHovered === 'mtheme'}
                  theme={theme}>
                  <Text fontSize={t(16)} lineHeight={18} textAlign="center" style={{ textDecorationLine: 'none' }}>
                    {isDarkMode ? '\u2600\uFE0F' : '\uD83C\uDF19'}
                  </Text>
                </ActionIconBtn>
              ) : null}

              {session && canManage ? (
                <ActionIconBtn
                  onPress={() => router.push('/notifications' as any)}
                  onHoverIn={Platform.OS === 'web' ? () => setHeaderHovered('mnotif') : undefined}
                  onHoverOut={Platform.OS === 'web' ? () => setHeaderHovered(null) : undefined}
                  isHovered={headerHovered === 'mnotif'}
                  theme={theme}>
                  <View style={{ position: 'relative', width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
                    <FontAwesome name="bell" size={18} color={theme.menuText} style={{ textAlign: 'center' }} />
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
                </ActionIconBtn>
              ) : null}

              {!session ? (
                <ActionIconBtn
                  onPress={handleLogin}
                  onHoverIn={Platform.OS === 'web' ? () => setHeaderHovered('mlogin') : undefined}
                  onHoverOut={Platform.OS === 'web' ? () => setHeaderHovered(null) : undefined}
                  isHovered={headerHovered === 'mlogin'}
                  theme={theme}>
                  <View style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
                    <FontAwesome name="sign-in" size={16} color="#22C55E" style={{ textAlign: 'center' }} />
                  </View>
                </ActionIconBtn>
              ) : null}

              {session ? (
                <ActionIconBtn
                  onPress={handleLogoutClick}
                  onHoverIn={Platform.OS === 'web' ? () => setHeaderHovered('mlogout') : undefined}
                  onHoverOut={Platform.OS === 'web' ? () => setHeaderHovered(null) : undefined}
                  isHovered={headerHovered === 'mlogout'}
                  theme={theme}>
                  <View style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
                    <FontAwesome name="sign-out" size={16} color="#EF4444" style={{ textAlign: 'center' }} />
                  </View>
                </ActionIconBtn>
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
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 9,
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
