import { FontAwesome } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
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

const serviceSubMenuItems = [
  { label: 'Shifting Services', route: '/book' },
  { label: 'Home Services', route: '/home-services/request' },
  { label: 'Property Management', route: '/properties' },
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
  const isSmallScreen = _isSmallScreen ?? screenWidth <= 768;
  const [headerHovered, setHeaderHovered] = React.useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [servicesOpen, setServicesOpen] = React.useState(false);

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
      onContactPress ? onContactPress() : router.push('/home');
    }
  };

  const handleServicesItemPress = (route: string) => {
    setServicesOpen(false);
    setMobileMenuOpen(false);
    router.push(route as any);
  };

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
          paddingVertical={isSmallScreen ? 12 : 14}>
          <XStack
            alignItems="center"
            gap={isSmallScreen ? '$2' : '$2.5'}
            flexShrink={1}
            minWidth={0}
            maxWidth={isSmallScreen ? '58%' : 250}>
            <Image
              source={Platform.OS === 'web' ? require('../../assets/images/PackersMoversLogo.png') : require('../../assets/images/apico.png')}
              style={[styles.logo, isSmallScreen && styles.logoMobile]}
            />
            <YStack flexShrink={1} minWidth={0}>
              <Text
                color={theme.text}
                fontSize={isSmallScreen ? 14 : 17}
                fontWeight="900"
                lineHeight={isSmallScreen ? 16 : 19}
                numberOfLines={1}
                letterSpacing={0.4}
                fontFamily={APP_SERIF_FONT}>
                GUJARAT
              </Text>
              <Text
                color={theme.text}
                fontSize={isSmallScreen ? 14 : 17}
                fontWeight="900"
                lineHeight={isSmallScreen ? 16 : 19}
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
                    <Pressable
                      onHoverIn={Platform.OS === 'web' ? () => setHeaderHovered(item) : undefined}
                      onHoverOut={Platform.OS === 'web' ? () => setHeaderHovered(null) : undefined}
                      onPress={() => handleMenuPress(item)}>
                      <YStack
                        paddingHorizontal={22}
                        paddingVertical={12}
                        borderRadius={14}
                        backgroundColor={theme.menuBg}
                        borderWidth={1}
                        borderColor={headerHovered === item ? '#FBBF24' : 'rgba(255,255,255,0.12)'}
                        shadowColor={theme.shadow}
                        shadowOffset={{ width: 0, height: 3 }}
                        shadowOpacity={0.12}
                        shadowRadius={6}
                        elevation={3}
                        style={headerHovered === item ? { boxShadow: '0 0 10px 3px rgba(251, 191, 36, 0.5)' } as any : undefined}>
                        <Text
                          color={theme.menuText}
                          fontSize={15}
                          fontWeight="700"
                          letterSpacing={0.3}
                          style={{ fontFamily: APP_SERIF_FONT, textDecorationLine: 'none' }}>
                          {item}
                        </Text>
                      </YStack>
                    </Pressable>
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
                              <Text
                                color={theme.text}
                                fontSize={14}
                                fontWeight="600"
                                style={{ fontFamily: APP_SERIF_FONT }}>
                                {sub.label}
                              </Text>
                            </YStack>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                  </View>
                ))}

                {toggleTheme ? (
                  <Pressable onHoverIn={Platform.OS === 'web' ? () => setHeaderHovered('theme') : undefined} onHoverOut={Platform.OS === 'web' ? () => setHeaderHovered(null) : undefined} onPress={toggleTheme}>
                    <YStack
                      paddingHorizontal={18}
                      paddingVertical={12}
                      borderRadius={14}
                      backgroundColor={theme.menuBg}
                      borderWidth={1}
                      borderColor={headerHovered === 'theme' ? '#FBBF24' : 'rgba(255,255,255,0.12)'}
                      shadowColor={theme.shadow}
                      shadowOffset={{ width: 0, height: 3 }}
                      shadowOpacity={0.12}
                      shadowRadius={6}
                      elevation={3}
                      style={headerHovered === 'theme' ? { boxShadow: '0 0 10px 3px rgba(251, 191, 36, 0.5)' } as any : undefined}>
                      <Text fontSize={18} style={{ textDecorationLine: 'none' }}>
                        {isDarkMode ? '\u2600\uFE0F' : '\uD83C\uDF19'}
                      </Text>
                    </YStack>
                  </Pressable>
                ) : null}

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
                            <Text color="#FFFFFF" fontSize={10} fontWeight="700">
                              {unreadCount > 99 ? '99+' : String(unreadCount)}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </YStack>
                  </Pressable>
                ) : null}

                {session && onDashboardPress ? (
                  <Pressable onHoverIn={Platform.OS === 'web' ? () => setHeaderHovered('dashboard') : undefined} onHoverOut={Platform.OS === 'web' ? () => setHeaderHovered(null) : undefined} onPress={onDashboardPress}>
                    <YStack
                      paddingHorizontal={22}
                      paddingVertical={12}
                      borderRadius={14}
                      backgroundColor={theme.menuBg}
                      borderWidth={1}
                      borderColor={headerHovered === 'dashboard' ? '#FBBF24' : 'rgba(255,255,255,0.12)'}
                      shadowColor={theme.shadow}
                      shadowOffset={{ width: 0, height: 3 }}
                      shadowOpacity={0.12}
                      shadowRadius={6}
                      elevation={3}
                      style={headerHovered === 'dashboard' ? { boxShadow: '0 0 10px 3px rgba(251, 191, 36, 0.5)' } as any : undefined}>
                      <Text
                        color={theme.menuText}
                        fontSize={15}
                        fontWeight="700"
                        style={{ fontFamily: APP_SERIF_FONT, textDecorationLine: 'none' }}>
                        Dashboard
                      </Text>
                    </YStack>
                  </Pressable>
                ) : null}

                {session && onProfilePress ? (
                  <Pressable onHoverIn={Platform.OS === 'web' ? () => setHeaderHovered('profile') : undefined} onHoverOut={Platform.OS === 'web' ? () => setHeaderHovered(null) : undefined} onPress={onProfilePress}>
                    <YStack
                      paddingHorizontal={16}
                      paddingVertical={12}
                      borderRadius={14}
                      backgroundColor={theme.menuBg}
                      borderWidth={1}
                      borderColor={headerHovered === 'profile' ? '#FBBF24' : 'rgba(255,255,255,0.12)'}
                      shadowColor={theme.shadow}
                      shadowOffset={{ width: 0, height: 3 }}
                      shadowOpacity={0.12}
                      shadowRadius={6}
                      elevation={3}
                      alignItems="center"
                      justifyContent="center"
                      style={headerHovered === 'profile' ? { boxShadow: '0 0 10px 3px rgba(251, 191, 36, 0.5)' } as any : undefined}>
                      <Text
                        color={theme.menuText}
                        fontSize={15}
                        fontWeight="700"
                        style={{ fontFamily: APP_SERIF_FONT }}>
                        {'\uD83D\uDC64'} Profile
                      </Text>
                    </YStack>
                  </Pressable>
                ) : null}

                {session && onLogout ? (
                  <Pressable onHoverIn={Platform.OS === 'web' ? () => setHeaderHovered('logout') : undefined} onHoverOut={Platform.OS === 'web' ? () => setHeaderHovered(null) : undefined} onPress={onLogout}>
                    <YStack
                      paddingHorizontal={16}
                      paddingVertical={12}
                      borderRadius={14}
                      backgroundColor={theme.menuBg}
                      borderWidth={1}
                      borderColor={headerHovered === 'logout' ? '#FBBF24' : 'rgba(255,255,255,0.12)'}
                      shadowColor={theme.shadow}
                      shadowOffset={{ width: 0, height: 3 }}
                      shadowOpacity={0.12}
                      shadowRadius={6}
                      elevation={3}
                      alignItems="center"
                      justifyContent="center"
                      style={headerHovered === 'logout' ? { boxShadow: '0 0 10px 3px rgba(251, 191, 36, 0.5)' } as any : undefined}>
                      {MaterialIcons ? (
                        <MaterialIcons name="logout" size={20} color={theme.menuText} />
                      ) : (
                        <Text color={theme.menuText} fontSize={15} fontWeight="700" style={{ fontFamily: APP_SERIF_FONT }}>
                          Logout
                        </Text>
                      )}
                    </YStack>
                  </Pressable>
                ) : null}

                {!session && onLoginPress ? (
                  <Pressable onHoverIn={Platform.OS === 'web' ? () => setHeaderHovered('signin') : undefined} onHoverOut={Platform.OS === 'web' ? () => setHeaderHovered(null) : undefined} onPress={onLoginPress}>
                    <YStack
                      paddingHorizontal={22}
                      paddingVertical={12}
                      borderRadius={14}
                      backgroundColor={theme.menuBg}
                      borderWidth={1}
                      borderColor={headerHovered === 'signin' ? '#FBBF24' : 'rgba(255,255,255,0.12)'}
                      shadowColor={theme.shadow}
                      shadowOffset={{ width: 0, height: 3 }}
                      shadowOpacity={0.12}
                      shadowRadius={6}
                      elevation={3}
                      style={headerHovered === 'signin' ? { boxShadow: '0 0 10px 3px rgba(251, 191, 36, 0.5)' } as any : undefined}>
                      <Text
                        color={theme.menuText}
                        fontSize={15}
                        fontWeight="800"
                        style={{ fontFamily: APP_SERIF_FONT, textDecorationLine: 'none' }}>
                        Sign In
                      </Text>
                    </YStack>
                  </Pressable>
                ) : null}
              </XStack>
            </ScrollView>
          ) : (
            <XStack gap="$2" alignItems="center">
              {toggleTheme ? (
                <Pressable onHoverIn={Platform.OS === 'web' ? () => setHeaderHovered('mtheme') : undefined} onHoverOut={Platform.OS === 'web' ? () => setHeaderHovered(null) : undefined} onPress={toggleTheme}>
                  <YStack
                    paddingHorizontal={16}
                    paddingVertical={11}
                    borderRadius={12}
                    backgroundColor={theme.menuBg}
                    borderWidth={1}
                    borderColor={headerHovered === 'mtheme' ? '#FBBF24' : 'rgba(255,255,255,0.12)'}
                    shadowColor={theme.shadow}
                    shadowOffset={{ width: 0, height: 3 }}
                    shadowOpacity={0.12}
                    shadowRadius={6}
                    elevation={3}
                    style={headerHovered === 'mtheme' ? { boxShadow: '0 0 10px 3px rgba(251, 191, 36, 0.5)' } as any : undefined}>
                    <Text fontSize={18} style={{ textDecorationLine: 'none' }}>
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
                    paddingHorizontal={14}
                    paddingVertical={11}
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
                          <Text color="#FFFFFF" fontSize={10} fontWeight="700">
                            {unreadCount > 99 ? '99+' : String(unreadCount)}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </YStack>
                </Pressable>
              ) : null}

              <Pressable onHoverIn={Platform.OS === 'web' ? () => setHeaderHovered('mhamburger') : undefined} onHoverOut={Platform.OS === 'web' ? () => setHeaderHovered(null) : undefined} onPress={() => setMobileMenuOpen(!mobileMenuOpen)}>
                <YStack
                  paddingHorizontal={16}
                  paddingVertical={11}
                  borderRadius={12}
                  backgroundColor={theme.menuBg}
                  borderWidth={1}
                  borderColor={headerHovered === 'mhamburger' ? '#FBBF24' : 'rgba(255,255,255,0.12)'}
                  shadowColor={theme.shadow}
                  shadowOffset={{ width: 0, height: 3 }}
                  shadowOpacity={0.12}
                  shadowRadius={6}
                  elevation={3}
                  style={headerHovered === 'mhamburger' ? { boxShadow: '0 0 10px 3px rgba(251, 191, 36, 0.5)' } as any : undefined}>
                  <Text color={theme.menuText} fontSize={18} style={{ textDecorationLine: 'none' }}>
                    {'\u2630'}
                  </Text>
                </YStack>
              </Pressable>
            </XStack>
          )}
        </XStack>
      </View>

      {isSmallScreen && mobileMenuOpen ? (
        <Pressable style={[styles.mobileMenuOverlay, { top: 56 }]} onPress={() => setMobileMenuOpen(false)}>
          <Pressable onPress={() => {}} style={{ width: '100%' } as any}>
            <YStack
              backgroundColor={theme.bgCard}
              borderRadius={18}
              padding={22}
              gap={14}
              borderWidth={1}
              borderColor={theme.border}
              shadowColor={theme.shadow}
              shadowOffset={{ width: 0, height: 10 }}
              shadowOpacity={0.18}
              shadowRadius={20}
              elevation={10}>
              {menuItems.map((item) => (
                <View key={item}>
                  <Pressable onPress={() => handleMenuPress(item)}>
                    <Text color={theme.text} fontSize={17} fontWeight="700" paddingVertical={10} style={{ fontFamily: APP_SERIF_FONT }}>
                      {item}
                    </Text>
                  </Pressable>
                  {item === 'Services' && servicesOpen ? (
                    <YStack paddingLeft={16} gap={4} paddingBottom={4}>
                      {serviceSubMenuItems.map((sub) => (
                        <Pressable key={sub.label} onPress={() => handleServicesItemPress(sub.route)}>
                          <Text color={theme.textSecondary ?? theme.text} fontSize={15} fontWeight="500" paddingVertical={8} style={{ fontFamily: APP_SERIF_FONT }}>
                            {sub.label}
                          </Text>
                        </Pressable>
                      ))}
                    </YStack>
                  ) : null}
                </View>
              ))}

              {session && onDashboardPress ? (
                <Pressable
                  onPress={() => {
                    setMobileMenuOpen(false);
                    onDashboardPress();
                  }}>
                  <Text color={theme.primary} fontSize={17} fontWeight="800" paddingVertical={10} style={{ fontFamily: APP_SERIF_FONT }}>
                    Dashboard
                  </Text>
                </Pressable>
              ) : null}

              {session && onProfilePress ? (
                <Pressable
                  onPress={() => {
                    setMobileMenuOpen(false);
                    onProfilePress();
                  }}>
                  <Text color={theme.primary} fontSize={17} fontWeight="800" paddingVertical={10} style={{ fontFamily: APP_SERIF_FONT }}>
                    My Profile
                  </Text>
                </Pressable>
              ) : null}

              {session && onLogout ? (
                <Pressable
                  onPress={() => {
                    setMobileMenuOpen(false);
                    onLogout();
                  }}>
                  <Text color={theme.accent} fontSize={17} fontWeight="800" paddingVertical={10} style={{ fontFamily: APP_SERIF_FONT }}>
                    Logout
                  </Text>
                </Pressable>
              ) : (
                onLoginPress ? (
                  <Pressable
                    onPress={() => {
                      setMobileMenuOpen(false);
                      onLoginPress();
                    }}>
                    <Text color={theme.primary} fontSize={17} fontWeight="800" paddingVertical={10} style={{ fontFamily: APP_SERIF_FONT }}>
                      Login
                    </Text>
                  </Pressable>
                ) : null
              )}
            </YStack>
          </Pressable>
        </Pressable>
      ) : null}
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
    width: 51,
    height: 51,
    resizeMode: 'contain',
  },
  logoMobile: {
    width: 41,
    height: 41,
  },
});
