import { FontAwesome, FontAwesome5 } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  ImageBackground,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import ViewShot from 'react-native-view-shot';
import { H1, H2, Image, Paragraph, Text, XStack, YStack } from 'tamagui';

import { supabase } from '@/lib/supabase';
import { useAppColorScheme } from '@/providers/color-scheme-provider';
import { useSession } from '@/providers/session-provider';

if (typeof window !== 'undefined' && !Linking.openURL) {
  Linking.openURL = (url: string) => {
    window.open(url, '_blank');
    return Promise.resolve();
  };
}

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const menuItems = ['Home', 'Services', 'Track', 'Contact'];

const roleRouteMap: Record<string, string> = {
  admin: '/(tabs)/admin',
  staff: '/(tabs)/admin',
  driver: '/(tabs)/driver',
  customer: '/(tabs)/bookings',
};

const resolveRoleRoute = (role?: string | null) => {
  const key = role?.toLowerCase() ?? 'customer';
  return roleRouteMap[key] ?? '/(tabs)';
};

const steps = [
  {
    id: '1',
    icon: '📋',
    title: 'Book Service',
    body: 'Tell us the pickup and drop, choose the move type, and lock your slot.',
  },
  {
    id: '2',
    icon: '📦',
    title: 'Packing',
    body: 'Our crew arrives with premium materials to protect every item.',
  },
  {
    id: '3',
    icon: '🚚',
    title: 'Transportation',
    body: 'Smart routing keeps your goods safe and on time.',
  },
  {
    id: '4',
    icon: '🏠',
    title: 'Delivery',
    body: 'We unload, unpack, and hand over with care.',
  },
];

const themes = {
  light: {
    bg: '#FFFFFF',
    bgSecondary: '#F8F9FA',
    bgCard: '#FFFFFF',
    bgCardSecondary: '#F3F4F6',
    text: '#1A1A1A',
    textSecondary: '#4A5568',
    textMuted: '#718096',
    primary: '#4F46E5',
    primaryHover: '#4338CA',
    accent: '#F59E0B',
    accentHover: '#D97706',
    border: '#E2E8F0',
    shadow: 'rgba(0, 0, 0, 0.08)',
    couponBg: '#DCFCE7',
    couponBorder: '#22C55E',
    couponText: '#166534',
    menuBg: '#4F46E5',
    menuText: '#FFFFFF',
    gradient1: '#EEF2FF',
    gradient2: '#E0E7FF',
    headerBg: '#FFFFFF',
  },
  dark: {
    bg: '#0F172A',
    bgSecondary: '#1E293B',
    bgCard: '#1E293B',
    bgCardSecondary: '#334155',
    text: '#F1F5F9',
    textSecondary: '#CBD5E1',
    textMuted: '#94A3B8',
    primary: '#6366F1',
    primaryHover: '#818CF8',
    accent: '#F59E0B',
    accentHover: '#FBBF24',
    border: '#334155',
    shadow: 'rgba(0, 0, 0, 0.3)',
    couponBg: '#065F46',
    couponBorder: '#10B981',
    couponText: '#D1FAE5',
    menuBg: '#1E293B',
    menuText: '#F1F5F9',
    gradient1: '#1E293B',
    gradient2: '#334155',
    headerBg: '#1E293B',
  },
};

const BusinessCard = ({ theme, viewShotRef }: any) => {
  const { width: cardWindowWidth } = useWindowDimensions();
  const isCardNarrow = cardWindowWidth <= 420;

  const card = (
    <YStack
      nativeID={Platform.OS === 'web' ? 'business-card' : undefined}
      backgroundColor={theme.bgCard}
      borderRadius={20}
      padding={isCardNarrow ? 18 : 28}
      gap="$3"
      borderWidth={2}
      borderColor={theme.primary}
      shadowColor={theme.shadow}
      shadowOffset={{ width: 0, height: 12 }}
      shadowOpacity={0.15}
      shadowRadius={24}
      elevation={10}
      width="100%"
      maxWidth={640}
      alignSelf="center"
      minHeight={360}>
      <XStack justifyContent="space-between" alignItems="flex-start" gap="$4" flexWrap="wrap">
        <YStack flex={1} gap="$3" minWidth={isCardNarrow ? 0 : 280}>
          <XStack alignItems="center" gap="$3" flexWrap="nowrap" style={{ minWidth: 0 }}>
            <Image
              source={require('../assets/images/PackersMoversLogo.png')}
              resizeMode="contain"
              style={{ width: isCardNarrow ? 58 : 70, height: isCardNarrow ? 58 : 70 }}
            />
            <YStack style={{ flexShrink: 1, minWidth: 0, flex: 1 }}>
              <Text
                color={theme.text}
                fontSize={22}
                fontWeight="900"
                lineHeight={26}
                numberOfLines={isCardNarrow ? 1 : 2}
                ellipsizeMode="tail"
                style={{ fontFamily: 'Georgia', flexShrink: 1 }}>
                Gujarat Relocation
              </Text>
              <Text
                color={theme.primary}
                fontSize={15}
                fontWeight="700"
                lineHeight={20}
                numberOfLines={1}
                ellipsizeMode="tail"
                style={{ fontFamily: 'Georgia', flexShrink: 1 }}>
                Packers & Movers
              </Text>
            </YStack>
          </XStack>

          <YStack height={2} backgroundColor={theme.primary} width="100%" borderRadius={1} marginVertical={12} />

          <YStack gap="$2.5">
            <XStack gap="$2.5" alignItems="center">
              <Text fontSize={18}>📞</Text>
              <Text
                color={theme.text}
                fontSize={15}
                fontWeight="700"
                style={{ fontFamily: Platform.OS === 'web' ? 'Times New Roman' : 'Georgia' }}>
                +91 9987963470
              </Text>
            </XStack>

            <XStack gap="$2.5" alignItems="center">
              <Text fontSize={18}>✉️</Text>
              <Text
                color={theme.text}
                fontSize={15}
                fontWeight="700"
                numberOfLines={1}
                style={{ fontFamily: 'Georgia' }}>
                info@gujaratrelocation.com
              </Text>
            </XStack>

            <XStack gap="$2.5" alignItems="flex-start">
              <Text fontSize={18}>📍</Text>
              <Text
                color={theme.text}
                fontSize={15}
                fontWeight="700"
                flex={1}
                lineHeight={22}
                style={{ fontFamily: 'Georgia' }}>
                CTS No 19A, Malad East- 400097
              </Text>
            </XStack>

            <XStack gap="$2.5" alignItems="center">
              <Text fontSize={18}>🕐</Text>
              <Text color={theme.textMuted} fontSize={13} fontWeight="700" style={{ fontFamily: 'Georgia' }}>
                24x7 Service Available
              </Text>
            </XStack>
          </YStack>

          <YStack
            backgroundColor={theme.bgSecondary}
            paddingHorizontal={14}
            paddingVertical={10}
            borderRadius={10}
            marginTop={1}
            alignSelf="center"
            width="100%"
            maxWidth={320}
            alignItems="center"
            justifyContent="center">
            <Text
              color={theme.primary}
              fontSize={12}
              fontWeight="800"
              textAlign="center"
              alignSelf="center"
              //alignSelf="flex-end"
              style={{ fontFamily: 'Georgia' }}>
              White-glove relocation • GPS tracking
            </Text>
          </YStack>
        </YStack>

        <YStack alignItems="center" gap="$2.5">
          <YStack
            nativeID={Platform.OS === 'web' ? 'business-card-qr' : undefined}
            backgroundColor={theme.bgSecondary}
            padding={14}
            borderRadius={16}
            borderWidth={2}
            borderColor={theme.border}>
            <QRCode value="tel:+919987963470" size={110} color={theme.text} backgroundColor={theme.bgCard} />
          </YStack>
          <Text
            color={theme.textMuted}
            fontSize={11}
            fontWeight="700"
            textAlign="center"
            style={{ fontFamily: 'Georgia' }}>
            Scan to Call
          </Text>
        </YStack>
      </XStack>

      <YStack alignItems="center" marginTop={2}>
        <Text color={theme.textMuted} fontSize={11} fontWeight="600" style={{ fontFamily: 'Georgia' }}>
          www.grmoverspackers.com • 2026 GRMoversPackers
        </Text>
      </YStack>
    </YStack>
  );

  return (
    <View pointerEvents={Platform.OS === 'web' ? 'none' : 'auto'} style={{ width: '100%' }}>
      {Platform.OS === 'web' ? card : <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1.0 }}>{card}</ViewShot>}
    </View>
  );
};

export default function HomeLandingScreen() {
  const router = useRouter();
  const { scrollTo } = useLocalSearchParams<{ scrollTo?: string }>();
  const { session, profile, refreshProfile } = useSession();
  const { width: windowWidth } = useWindowDimensions();
  const appColorScheme = useAppColorScheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [couponIndex, setCouponIndex] = useState(0);
  const couponTimerRef = useRef<any>(null);
  const couponScrollRef = useRef<ScrollView | null>(null);
  const [heroIndex, setHeroIndex] = useState(0);
  const [quoteModalOpen, setQuoteModalOpen] = useState(false);
  const [quoteName, setQuoteName] = useState('');
  const [quotePhone, setQuotePhone] = useState('');
  const [quoteEmail, setQuoteEmail] = useState('');
  const [quoteService, setQuoteService] = useState('');
  const [quoteMessage, setQuoteMessage] = useState('');
  const [quoteSubmitting, setQuoteSubmitting] = useState(false);
  const [quoteServicePickerOpen, setQuoteServicePickerOpen] = useState(false);
  const [quoteSubmitNotice, setQuoteSubmitNotice] = useState<string>('');
  const [cardDownloadNotice, setCardDownloadNotice] = useState<string>('');
  const scrollRef = useRef<ScrollView | null>(null);
  const sectionOffsetsRef = useRef<{ services?: number; contact?: number }>({});
  const buttonAnim = useRef(new Animated.Value(1)).current;
  const didRedirectRef = useRef(false);
  const businessCardRef = useRef<any>(null);
  const heroTimerRef = useRef<any>(null);
  const didScrollParamRef = useRef<string>('');
  const testimonialScrollRef = useRef<ScrollView | null>(null);
  const testimonialTimerRef = useRef<any>(null);
  const [testimonialIndex, setTestimonialIndex] = useState(0);

  const quoteServiceOptions = React.useMemo(
    () => [
      'Household Shifting',
      'Office Shifting',
      'Car & Bike Transport',
      'Packing and Moving',
      'Warehouse Services',
      'International Relocation',
      'Domestic Relocations',
      'Transportation Service',
      'Loading and Unloading',
    ] as const,
    []
  );

  const serviceColumns = windowWidth < 700 ? 1 : windowWidth < 1100 ? 2 : 3;
  const serviceCardWidth = serviceColumns === 1 ? '100%' : serviceColumns === 2 ? '48%' : '32%';
  const statsPaddingVertical = windowWidth < 480 ? 72 : windowWidth < 900 ? 96 : 124;
  const statsMinHeight = windowWidth < 480 ? 210 : windowWidth < 900 ? 245 : 290;
  const bookBannerPaddingLeft = windowWidth < 480 ? 26 : windowWidth < 900 ? 44 : 62;
  const bookBannerPaddingRight = windowWidth < 480 ? 28 : windowWidth < 900 ? 52 : 70;
  const bookBannerPaddingVertical = windowWidth < 480 ? 40 : windowWidth < 900 ? 48 : 60;
  const bookBannerMinHeight = windowWidth < 480 ? 235 : windowWidth < 900 ? 230 : 255;

  const isDarkMode = appColorScheme?.colorScheme === 'dark';
  const theme = isDarkMode ? themes.dark : themes.light;
  const isSmallScreen = windowWidth <= 768;

  const roleKey = (profile?.role ?? 'customer').toString().trim().toLowerCase();
  const canManage = ['admin', 'staff'].includes(roleKey);
  const isDriver = roleKey === 'driver';
  const isCustomer = !canManage && !isDriver;

  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const userId = session?.user?.id ?? '';
    if (!userId) return;
    if (!canManage) return;

    let active = true;
    const fetchUnread = async () => {
      try {
        const { count } = await supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .is('read_at', null);
        if (!active) return;
        setUnreadCount(count ?? 0);
      } catch {
        // ignore
      }
    };

    void fetchUnread();

    const channel = supabase
      .channel('home-notification-unread')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => {
          void fetchUnread();
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [canManage, session?.user?.id]);

  const heroSlides = [
    {
      key: 'slide-1',
      image: require('../assets/images/packers-movers-bg.jpg'),
      title: 'Pan India Moving\nServices',
      subtitle: '48,500+ Successful Relocations',
    },
    {
      key: 'slide-2',
      image: require('../assets/images/truckpackerss.jpg'),
      title: 'Gujarat Relocation\nPackers and Movers',
      subtitle: 'Your Trusted Moving Partner Since 2006',
    },
    {
      key: 'slide-3',
      image: require('../assets/images/truckpackers.jpg'),
      title: 'Safe & Secure\nRelocation',
      subtitle: '18+ Years of Quality Service',
    },
  ];

  useEffect(() => {
    if (!session?.user?.id) return;
    if (!isDriver) return;
    if (didRedirectRef.current) return;
    didRedirectRef.current = true;
    router.replace('/(tabs)/driver');
  }, [isDriver, router, session?.user?.id]);

  const welcomeName =
    profile?.name?.trim() ||
    (session?.user?.user_metadata as any)?.name?.trim?.() ||
    session?.user?.email ||
    'User';

  const MaterialIcons = React.useMemo(() => {
    if (Platform.OS === 'web') return null;
    try {
      return require('@expo/vector-icons/MaterialIcons').default as any;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(buttonAnim, { toValue: 1.08, duration: 1400, useNativeDriver: true }),
        Animated.timing(buttonAnim, { toValue: 1, duration: 1400, useNativeDriver: true }),
      ])
    ).start();
  }, [buttonAnim]);

  useEffect(() => {
    if (heroTimerRef.current) clearInterval(heroTimerRef.current);
    heroTimerRef.current = setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % heroSlides.length);
    }, 5000);
    return () => {
      if (heroTimerRef.current) clearInterval(heroTimerRef.current);
    };
  }, [heroSlides.length]);

  useEffect(() => {
    let cancelled = false;
    const loadCoupons = async () => {
      try {
        const today = new Date();
        const d = today.toISOString().slice(0, 10);
        const { data } = await supabase
          .from('coupons')
          .select(
            'code, title, discount_type, discount_value, max_discount, min_order_amount, valid_from, valid_until'
          )
          .eq('is_active', true)
          .or(`valid_from.is.null,valid_from.lte.${d}`)
          .or(`valid_until.is.null,valid_until.gte.${d}`)
          .order('created_at', { ascending: false })
          .limit(10);
        if (cancelled) return;
        setCoupons(data ?? []);
      } catch {
        if (cancelled) return;
        setCoupons([]);
      }
    };
    void loadCoupons();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (coupons.length <= 1) return;
    if (couponTimerRef.current) clearInterval(couponTimerRef.current);
    couponTimerRef.current = setInterval(() => {
      setCouponIndex((prev) => {
        const next = (prev + 1) % coupons.length;
        return next;
      });
    }, 4500);
    return () => {
      if (couponTimerRef.current) clearInterval(couponTimerRef.current);
    };
  }, [coupons.length]);

  useEffect(() => {
    if (coupons.length <= 1) return;
    const cardWidth = isSmallScreen ? Math.min(windowWidth - 64, 380) : 380;
    const gap = 16;
    const x = couponIndex * (cardWidth + gap);
    couponScrollRef.current?.scrollTo({ x, y: 0, animated: true });
  }, [couponIndex, coupons.length, isSmallScreen, windowWidth]);

  const testimonials = useMemo(
    () => [
      {
        name: 'Rajesh Sharma',
        route: 'Mumbai to Ahmedabad',
        letter: 'R',
        body: 'Excellent service! Very professional team. My entire house was shifted without any damage. Highly recommended!',
      },
      {
        name: 'Priya Patel',
        route: 'Surat to Mumbai',
        letter: 'P',
        body: 'Best packers and movers in Gujarat. Timely delivery and very careful handling of all items.',
      },
      {
        name: 'Amit Joshi',
        route: 'Vadodara to Pune',
        letter: 'A',
        body: 'Very happy with the service. Fair pricing and great communication throughout the process.',
      },
    ],
    []
  );

  useEffect(() => {
    if (!isSmallScreen) return;
    if (!testimonials.length) return;

    if (testimonialTimerRef.current) clearInterval(testimonialTimerRef.current);
    testimonialTimerRef.current = setInterval(() => {
      setTestimonialIndex((prev) => {
        const next = (prev + 1) % testimonials.length;
        return next;
      });
    }, 3500);

    return () => {
      if (testimonialTimerRef.current) clearInterval(testimonialTimerRef.current);
    };
  }, [isSmallScreen, testimonials.length]);

  useEffect(() => {
    if (!isSmallScreen) return;
    const cardWidth = Math.min(windowWidth - 64, 420);
    const gap = 18;
    const x = testimonialIndex * (cardWidth + gap);
    testimonialScrollRef.current?.scrollTo({ x, y: 0, animated: true });
  }, [isSmallScreen, testimonialIndex, windowWidth]);

  const buttonStyle = {
    opacity: buttonAnim.interpolate({
      inputRange: [1, 1.08],
      outputRange: [1, 0.92],
    }),
    transform: [{ scale: buttonAnim }],
  };

  const handleBook = () => {
    if (!session) {
      router.push({ pathname: '/auth/login' } as any);
      return;
    }
    if ((profile?.role ?? 'customer') === 'customer') {
      router.push({ pathname: '/book' } as any);
      return;
    }
    router.push({ pathname: resolveRoleRoute(profile?.role) } as any);
  };

  const handleDashboardSafe = async () => {
    await refreshProfile();
    router.push({ pathname: resolveRoleRoute(profile?.role) } as any);
  };

  const handleAdminSectionSafe = async (section: string) => {
    await refreshProfile();
    router.push({ pathname: '/(tabs)/admin', params: { section } } as any);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/home');
  };

  const scrollToSection = (key: 'services' | 'contact') => {
    const y = sectionOffsetsRef.current[key];
    if (typeof y !== 'number') return;
    const headerHeight = 100;
    scrollRef.current?.scrollTo({ y: Math.max(y - headerHeight, 0), animated: true });
  };

  useEffect(() => {
    const target = String(scrollTo ?? '');
    if (!target) return;
    if (didScrollParamRef.current === target) return;

    const key = target === 'services' || target === 'contact' ? (target as 'services' | 'contact') : null;
    if (!key) return;

    const attemptScroll = () => {
      const y = sectionOffsetsRef.current[key];
      if (typeof y !== 'number') return false;
      didScrollParamRef.current = target;
      scrollToSection(key);
      return true;
    };

    if (attemptScroll()) return;
    const t1 = setTimeout(() => attemptScroll(), 250);
    const t2 = setTimeout(() => attemptScroll(), 900);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [scrollTo]);

  const toggleTheme = () => {
    appColorScheme?.toggleColorScheme?.();
  };

  const handleCallNow = () => {
    Linking.openURL('tel:+919987963470');
  };

  const handleWhatsApp = () => {
    Linking.openURL('https://wa.me/919987963470');
  };

  const handleOpenQuote = () => {
    setQuoteName('');
    setQuotePhone('');
    setQuoteEmail('');
    setQuoteService('');
    setQuoteMessage('');
    setQuoteSubmitNotice('');
    setQuoteModalOpen(true);
  };

  const submitQuoteRequest = async () => {
    const name = quoteName.trim();
    const phone = quotePhone.trim().replace(/\D/g, '');
    const email = quoteEmail.trim();
    const service = quoteService.trim();
    const message = quoteMessage.trim();

    const normalizedEmail = email ? email.toLowerCase() : '';
    const emailOk = !normalizedEmail || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizedEmail);
    if (!emailOk) {
      setQuoteSubmitNotice('Wrong email format.');
      Alert.alert('Wrong Email', 'Please enter a valid email address.');
      return;
    }

    if (!name || !phone) {
      setQuoteSubmitNotice('Please enter your name and phone number.');
      Alert.alert('Missing info', 'Please enter your name and phone number.');
      return;
    }

    if (phone.length !== 10) {
      setQuoteSubmitNotice('Phone number must be exactly 10 digits.');
      Alert.alert('Invalid phone', 'Phone number must be exactly 10 digits.');
      return;
    }

    try {
      setQuoteSubmitting(true);
      setQuoteSubmitNotice('Submitting…');
      const invokeOnce = async () => {
        return await supabase.functions.invoke('send-quote-request', {
          body: {
            payload: {
              name,
              phone,
              email: normalizedEmail || undefined,
              service: service || undefined,
              message: message || undefined,
              source: 'home',
            },
          },
        });
      };

      let fnData: any;
      let fnError: any;

      try {
        const resp = await invokeOnce();
        fnData = (resp as any)?.data;
        fnError = (resp as any)?.error;
      } catch (invokeErr: any) {
        // retry once for transient network/cold-start issues
        await new Promise((r) => setTimeout(r, 600));
        try {
          const resp2 = await invokeOnce();
          fnData = (resp2 as any)?.data;
          fnError = (resp2 as any)?.error;
        } catch (invokeErr2: any) {
          const msg = invokeErr2?.message ? String(invokeErr2.message) : 'Failed to send a request to the Edge Function';
          console.error('send-quote-request invoke error', invokeErr2);
          setQuoteSubmitNotice(`Request failed: ${msg}`);
          Alert.alert('Failed', msg);
          return;
        }
      }

      if (fnError) {
        const anyErr = fnError as any;
        const status = anyErr?.context?.status ?? anyErr?.status;
        const body = anyErr?.context?.body;
        const details = body
          ? typeof body === 'string'
            ? body
            : JSON.stringify(body)
          : String(anyErr?.message ?? fnError);
        const full = status ? `(${status}) ${details}` : details;
        console.error('send-quote-request failed', fnError);
        setQuoteSubmitNotice(`Request failed: ${full}`);
        Alert.alert('Failed', full);
        return;
      }

      if ((fnData as any)?.sent === true) {
        setQuoteSubmitNotice('Request submitted and email sent successfully.');
        Alert.alert('Request submitted', 'Thank you! Our team will contact you shortly.');
      } else {
        setQuoteSubmitNotice('Request submitted successfully.');
        Alert.alert('Request submitted', 'Thank you! Our team will contact you shortly.');
      }
    } catch (e: any) {
      setQuoteSubmitNotice(e?.message ? String(e.message) : 'Could not submit your request.');
      Alert.alert('Failed', e?.message ? String(e.message) : 'Could not submit your request.');
    } finally {
      setQuoteSubmitting(false);
    }
  };

  const downloadBusinessCard = async () => {
    try {
      if (Platform.OS === 'web') {
        setCardDownloadNotice('Opening print…');

        const el = document.getElementById('business-card');
        if (!el) throw new Error('Business card not found.');

        const rawLogoSrc = (el.querySelector('img') as HTMLImageElement | null)?.getAttribute('src') ?? '';
        const absoluteLogoSrc = rawLogoSrc
          ? rawLogoSrc.startsWith('http')
            ? rawLogoSrc
            : `${window.location.origin}${rawLogoSrc.startsWith('/') ? '' : '/'}${rawLogoSrc}`
          : '';

        let logoSrc = absoluteLogoSrc;
        if (absoluteLogoSrc) {
          try {
            const res = await fetch(absoluteLogoSrc);
            const blob = await res.blob();
            logoSrc = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(String(reader.result ?? ''));
              reader.onerror = () => reject(new Error('Could not read logo.'));
              reader.readAsDataURL(blob);
            });
          } catch {
            logoSrc = absoluteLogoSrc;
          }
        }
        const qrSvg = (document.getElementById('business-card-qr')?.querySelector('svg') as SVGElement | null)?.outerHTML ?? '';

        const html = `<!doctype html><html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Business Card</title>
<style>
  @page { margin: 12mm; }
  body { margin: 0; padding: 0; font-family: Georgia, 'Times New Roman', serif; background: #fff; }
  .wrap { padding: 24px; display: flex; justify-content: center; }
  .card { width: 680px; border: 3px solid #4F46E5; border-radius: 18px; padding: 22px; box-sizing: border-box; }
  .top { display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; }
  .brand { display: flex; gap: 14px; align-items: center; }
  .logo { width: 68px; height: 68px; object-fit: contain; }
  .title { font-size: 26px; font-weight: 900; margin: 0; color: #0F172A; }
  .subtitle { font-size: 16px; font-weight: 700; margin: 4px 0 0; color: #4F46E5; }
  .line { height: 3px; background: #4F46E5; border-radius: 2px; margin: 16px 0; }
  .row { display: flex; gap: 10px; align-items: center; font-size: 16px; font-weight: 700; color: #0F172A; margin: 10px 0; }
  .phone { font-family: 'Times New Roman', Times, serif; }
  .muted { color: #475569; font-size: 14px; font-weight: 700; }
  .qrWrap { border: 2px solid #E2E8F0; border-radius: 16px; padding: 10px; width: 200px; box-sizing: border-box; text-align: center; }
  .qr { width: 180px; height: 180px; display: flex; align-items: center; justify-content: center; margin: 0 auto; }
  .qr svg { width: 180px !important; height: 180px !important; }
  .tagWrap { text-align: center; margin-top: 14px; }
  .tag { display: inline-block; background: #EEF2FF; border-radius: 10px; padding: 10px 12px; text-align: center; font-size: 12px; font-weight: 800; color: #4F46E5; box-sizing: border-box; }
  .footer { text-align: center; margin-top: 14px; color: #64748B; font-size: 12px; font-weight: 700; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="top">
        <div style="flex: 1; min-width: 360px;">
          <div class="brand">
            ${logoSrc ? '<img class="logo" src="' + logoSrc + '" alt="Logo" />' : ''}
            <div>
              <p class="title">Gujarat Relocation</p>
              <p class="subtitle">Packers &amp; Movers</p>
            </div>
          </div>
          <div class="line"></div>
          <div class="row"><span>📞</span><span class="phone">+91 9987963470</span></div>
          <div class="row"><span>✉️</span><span>info@gujaratrelocation.com</span></div>
          <div class="row"><span>📍</span><span>CTS No 19A, Malad East - 400097</span></div>
          <div class="row"><span>🕐</span><span class="muted">24x7 Service Available</span></div>
        </div>
        <div class="qrWrap">
          ${qrSvg ? '<div class="qr">' + qrSvg + '</div>' : '<div class="muted">QR unavailable</div>'}
          <div class="muted" style="margin-top: 8px;">Scan to Call</div>
        </div>
      </div>
      <div class="tagWrap"><div class="tag">White-glove relocation • GPS tracking</div></div>
      <div class="footer">www.grpackersmovers.com • © 2026 GRPackersMovers</div>
    </div>
  </div>
</body></html>`;

        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        iframe.style.opacity = '0';
        iframe.setAttribute('aria-hidden', 'true');
        document.body.appendChild(iframe);

        const doc = iframe.contentWindow?.document;
        if (!doc) {
          document.body.removeChild(iframe);
          throw new Error('Could not open print frame.');
        }

        doc.open();
        doc.write(html);
        doc.close();

        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch {
            // ignore
          } finally {
            setTimeout(() => {
              try {
                document.body.removeChild(iframe);
              } catch {
                // ignore
              }
            }, 1000);
          }
        }, 400);

        setCardDownloadNotice('Print opened. You can Save as PDF.');
        setTimeout(() => setCardDownloadNotice(''), 7000);
        return;
      }

      if (!businessCardRef.current) throw new Error('Business card is not ready.');

      setCardDownloadNotice('Preparing download…');
      const uri = await businessCardRef.current.capture({ format: 'png', quality: 1.0, result: 'tmpfile', timeout: 20000 });

      let MediaLibrary: any = null;
      try {
        MediaLibrary = require('expo-media-library');
      } catch {
        MediaLibrary = null;
      }

      if (MediaLibrary?.requestPermissionsAsync && MediaLibrary?.createAssetAsync) {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status === 'granted') {
          await MediaLibrary.createAssetAsync(uri);
          setCardDownloadNotice('Saved to gallery.');
          setTimeout(() => setCardDownloadNotice(''), 4500);
          Alert.alert('Saved', 'Business card saved to your gallery.');
          return;
        }
      }

      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Download Business Card',
      });

      setCardDownloadNotice('Share dialog opened.');
      setTimeout(() => setCardDownloadNotice(''), 4500);
    } catch (error: any) {
      const msg = error?.message ? String(error.message) : 'Download failed. Please try again.';
      console.error('downloadBusinessCard failed', error);
      setCardDownloadNotice(msg);
      setTimeout(() => setCardDownloadNotice(''), 7000);
      Alert.alert('Failed', msg);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View
        style={[
          styles.stickyHeader,
          {
            backgroundColor: theme.headerBg,
            borderBottomColor: theme.border,
            shadowColor: theme.shadow,
          },
        ]}>
        <XStack
          alignItems="center"
          gap="$3"
          flexWrap="wrap"
          justifyContent="space-between"
          paddingHorizontal={isSmallScreen ? 14 : 24}
          paddingVertical={isSmallScreen ? 12 : 14}>
          <Image source={require('../assets/images/PackersMoversLogo.png')} style={styles.logo} />

          {!isSmallScreen ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.menuRow}>
              <XStack gap="$2" alignItems="center" flexWrap="wrap">
                {menuItems.map((item) => (
                  <Pressable
                    key={item}
                    onPress={() => {
                      if (item === 'Home') router.push('/home');
                      if (item === 'Services') scrollToSection('services');
                      if (item === 'Track') router.push('/(tabs)/tracking');
                      if (item === 'Contact') scrollToSection('contact');
                    }}>
                    <YStack
                      paddingHorizontal={22}
                      paddingVertical={12}
                      borderRadius={14}
                      backgroundColor={theme.menuBg}
                      borderWidth={1}
                      borderColor="rgba(255,255,255,0.12)"
                      shadowColor={theme.shadow}
                      shadowOffset={{ width: 0, height: 3 }}
                      shadowOpacity={0.12}
                      shadowRadius={6}
                      elevation={3}>
                      <Text
                        color={theme.menuText}
                        fontSize={15}
                        fontWeight="700"
                        letterSpacing={0.3}
                        style={{ fontFamily: 'Georgia', textDecorationLine: 'none' }}>
                        {item}
                      </Text>
                    </YStack>
                  </Pressable>
                ))}

                <Pressable onPress={toggleTheme}>
                  <YStack
                    paddingHorizontal={18}
                    paddingVertical={12}
                    borderRadius={14}
                    backgroundColor={theme.menuBg}
                    borderWidth={1}
                    borderColor="rgba(255,255,255,0.12)"
                    shadowColor={theme.shadow}
                    shadowOffset={{ width: 0, height: 3 }}
                    shadowOpacity={0.12}
                    shadowRadius={6}
                    elevation={3}>
                    <Text fontSize={18} style={{ textDecorationLine: 'none' }}>
                      {isDarkMode ? '☀️' : '🌙'}
                    </Text>
                  </YStack>
                </Pressable>

                {session ? (
                  <>
                    {canManage && (
                      <>
                        <Pressable
                          onPress={() => {
                            router.push('/notifications' as any);
                          }}>
                          <YStack
                            paddingHorizontal={16}
                            paddingVertical={12}
                            borderRadius={14}
                            backgroundColor={theme.menuBg}
                            borderWidth={1}
                            borderColor="rgba(255,255,255,0.12)"
                            shadowColor={theme.shadow}
                            shadowOffset={{ width: 0, height: 3 }}
                            shadowOpacity={0.12}
                            shadowRadius={6}
                            elevation={3}
                            alignItems="center"
                            justifyContent="center">
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

                        <Pressable onPress={handleDashboardSafe}>
                          <YStack
                            paddingHorizontal={22}
                            paddingVertical={12}
                            borderRadius={14}
                            backgroundColor={theme.menuBg}
                            borderWidth={1}
                            borderColor="rgba(255,255,255,0.12)"
                            shadowColor={theme.shadow}
                            shadowOffset={{ width: 0, height: 3 }}
                            shadowOpacity={0.12}
                            shadowRadius={6}
                            elevation={3}>
                            <Text
                              color={theme.menuText}
                              fontSize={15}
                              fontWeight="700"
                              style={{ fontFamily: 'Georgia', textDecorationLine: 'none' }}>
                              Admin Panel
                            </Text>
                          </YStack>
                        </Pressable>
                      </>
                    )}

                    {isDriver && (
                      <Pressable onPress={handleDashboardSafe}>
                        <YStack
                          paddingHorizontal={22}
                          paddingVertical={12}
                          borderRadius={14}
                          backgroundColor={theme.menuBg}
                          borderWidth={1}
                          borderColor="rgba(255,255,255,0.12)"
                          shadowColor={theme.shadow}
                          shadowOffset={{ width: 0, height: 3 }}
                          shadowOpacity={0.12}
                          shadowRadius={6}
                          elevation={3}>
                          <Text
                            color={theme.menuText}
                            fontSize={15}
                            fontWeight="700"
                            style={{ fontFamily: 'Georgia', textDecorationLine: 'none' }}>
                            Driver Panel
                          </Text>
                        </YStack>
                      </Pressable>
                    )}

                    {isCustomer && (
                      <Pressable onPress={handleDashboardSafe}>
                        <YStack
                          paddingHorizontal={22}
                          paddingVertical={12}
                          borderRadius={14}
                          backgroundColor={theme.menuBg}
                          borderWidth={1}
                          borderColor="rgba(255,255,255,0.12)"
                          shadowColor={theme.shadow}
                          shadowOffset={{ width: 0, height: 3 }}
                          shadowOpacity={0.12}
                          shadowRadius={6}
                          elevation={3}>
                          <Text
                            color={theme.menuText}
                            fontSize={15}
                            fontWeight="700"
                            style={{ fontFamily: 'Georgia', textDecorationLine: 'none' }}>
                            My Bookings
                          </Text>
                        </YStack>
                      </Pressable>
                    )}

                    {Platform.OS !== 'android' && (
                      <YStack
                        paddingHorizontal={22}
                        paddingVertical={12}
                        borderRadius={14}
                        backgroundColor={theme.menuBg}
                        borderWidth={1}
                        borderColor="rgba(255,255,255,0.12)"
                        shadowColor={theme.shadow}
                        shadowOffset={{ width: 0, height: 3 }}
                        shadowOpacity={0.12}
                        shadowRadius={6}
                        elevation={3}>
                        <Text
                          color={theme.menuText}
                          fontSize={15}
                          fontWeight="700"
                          style={{ fontFamily: 'Georgia', textDecorationLine: 'none' }}>
                          Welcome, {welcomeName}
                        </Text>
                      </YStack>
                    )}

                    <Pressable onPress={handleLogout}>
                      <YStack
                        paddingHorizontal={16}
                        paddingVertical={12}
                        borderRadius={14}
                        backgroundColor={theme.menuBg}
                        borderWidth={1}
                        borderColor="rgba(255,255,255,0.12)"
                        shadowColor={theme.shadow}
                        shadowOffset={{ width: 0, height: 3 }}
                        shadowOpacity={0.12}
                        shadowRadius={6}
                        elevation={3}
                        alignItems="center"
                        justifyContent="center">
                        {MaterialIcons ? (
                          <MaterialIcons name="logout" size={20} color={theme.menuText} />
                        ) : (
                          <Text color={theme.menuText} fontSize={15} fontWeight="700" style={{ fontFamily: 'Georgia' }}>
                            Logout
                          </Text>
                        )}
                      </YStack>
                    </Pressable>
                  </>
                ) : (
                  <Pressable onPress={() => router.push('/auth/login')}>
                    <YStack
                      paddingHorizontal={22}
                      paddingVertical={12}
                      borderRadius={14}
                      backgroundColor={theme.menuBg}
                      borderWidth={1}
                      borderColor="rgba(255,255,255,0.12)"
                      shadowColor={theme.shadow}
                      shadowOffset={{ width: 0, height: 3 }}
                      shadowOpacity={0.12}
                      shadowRadius={6}
                      elevation={3}>
                      <Text
                        color={theme.menuText}
                        fontSize={15}
                        fontWeight="800"
                        style={{ fontFamily: 'Georgia', textDecorationLine: 'none' }}>
                        Login
                      </Text>
                    </YStack>
                  </Pressable>
                )}
              </XStack>
            </ScrollView>
          ) : (
            <XStack gap="$2" alignItems="center">
              <Pressable onPress={toggleTheme}>
                <YStack
                  paddingHorizontal={16}
                  paddingVertical={11}
                  borderRadius={12}
                  backgroundColor={theme.menuBg}
                  borderWidth={1}
                  borderColor="rgba(255,255,255,0.12)"
                  shadowColor={theme.shadow}
                  shadowOffset={{ width: 0, height: 3 }}
                  shadowOpacity={0.12}
                  shadowRadius={6}
                  elevation={3}>
                  <Text fontSize={18} style={{ textDecorationLine: 'none' }}>
                    {isDarkMode ? '☀️' : '🌙'}
                  </Text>
                </YStack>
              </Pressable>

              {session && canManage ? (
                <Pressable
                  onPress={() => {
                    router.push('/notifications' as any);
                  }}>
                  <YStack
                    paddingHorizontal={14}
                    paddingVertical={11}
                    borderRadius={12}
                    backgroundColor={theme.menuBg}
                    borderWidth={1}
                    borderColor="rgba(255,255,255,0.12)"
                    shadowColor={theme.shadow}
                    shadowOffset={{ width: 0, height: 3 }}
                    shadowOpacity={0.12}
                    shadowRadius={6}
                    elevation={3}
                    alignItems="center"
                    justifyContent="center">
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

              <Pressable onPress={() => setMobileMenuOpen(!mobileMenuOpen)}>
                <YStack
                  paddingHorizontal={16}
                  paddingVertical={11}
                  borderRadius={12}
                  backgroundColor={theme.menuBg}
                  borderWidth={1}
                  borderColor="rgba(255,255,255,0.12)"
                  shadowColor={theme.shadow}
                  shadowOffset={{ width: 0, height: 3 }}
                  shadowOpacity={0.12}
                  shadowRadius={6}
                  elevation={3}>
                  <Text color={theme.menuText} fontSize={18} style={{ textDecorationLine: 'none' }}>
                    ☰
                  </Text>
                </YStack>
              </Pressable>
            </XStack>
          )}
        </XStack>
      </View>

      <ScrollView
        ref={(ref) => {
          scrollRef.current = ref;
        }}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: isSmallScreen ? 100 : 110,
            paddingHorizontal: isSmallScreen ? 14 : 24,
          },
        ]}
        showsVerticalScrollIndicator={false}>
        <YStack gap="$4">
          {isSmallScreen && mobileMenuOpen && (
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
                <Pressable
                  key={item}
                  onPress={() => {
                    setMobileMenuOpen(false);
                    if (item === 'Home') router.push('/home');
                    if (item === 'Services') scrollToSection('services');
                    if (item === 'Track') router.push('/(tabs)/tracking');
                    if (item === 'Contact') scrollToSection('contact');
                  }}>
                  <Text
                    color={theme.text}
                    fontSize={17}
                    fontWeight="700"
                    paddingVertical={10}
                    style={{ fontFamily: 'Georgia' }}>
                    {item}
                  </Text>
                </Pressable>
              ))}
              {session ? (
                <>
                  {Platform.OS !== 'android' && (
                    <Text
                      color={theme.textSecondary}
                      fontSize={17}
                      fontWeight="700"
                      paddingVertical={10}
                      style={{ fontFamily: 'Georgia' }}>
                      Welcome, {welcomeName}
                    </Text>
                  )}

                  {canManage && (
                    <>
                      <Pressable
                        onPress={async () => {
                          setMobileMenuOpen(false);
                          await handleDashboardSafe();
                        }}>
                        <Text
                          color={theme.primary}
                          fontSize={16}
                          fontWeight="800"
                          paddingVertical={10}
                          style={{ fontFamily: 'Georgia' }}>
                          Admin Panel
                        </Text>
                      </Pressable>
                    </>
                  )}

                  {isDriver && (
                    <Pressable
                      onPress={async () => {
                        setMobileMenuOpen(false);
                        await handleDashboardSafe();
                      }}>
                      <Text
                        color={theme.primary}
                        fontSize={17}
                        fontWeight="800"
                        paddingVertical={10}
                        style={{ fontFamily: 'Georgia' }}>
                        Driver Panel
                      </Text>
                    </Pressable>
                  )}

                  {isCustomer && (
                    <Pressable
                      onPress={async () => {
                        setMobileMenuOpen(false);
                        router.push('/(tabs)/bookings');
                      }}>
                      <Text
                        color={theme.primary}
                        fontSize={17}
                        fontWeight="800"
                        paddingVertical={10}
                        style={{ fontFamily: 'Georgia' }}>
                        My Bookings
                      </Text>
                    </Pressable>
                  )}

                  <Pressable
                    onPress={async () => {
                      setMobileMenuOpen(false);
                      router.push('/auth/profile');
                    }}>
                    <Text
                      color={theme.text}
                      fontSize={17}
                      fontWeight="700"
                      paddingVertical={10}
                      style={{ fontFamily: 'Georgia' }}>
                      Profile
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setMobileMenuOpen(false);
                      handleLogout();
                    }}>
                    <Text
                      color={theme.accent}
                      fontSize={17}
                      fontWeight="800"
                      paddingVertical={10}
                      style={{ fontFamily: 'Georgia' }}>
                      Logout
                    </Text>
                  </Pressable>
                </>
              ) : (
                <Pressable
                  onPress={() => {
                    setMobileMenuOpen(false);
                    router.push('/auth/login');
                  }}>
                  <Text
                    color={theme.primary}
                    fontSize={17}
                    fontWeight="800"
                    paddingVertical={10}
                    style={{ fontFamily: 'Georgia' }}>
                    Login
                  </Text>
                </Pressable>
              )}
            </YStack>
          )}

          <XStack justifyContent="center" alignItems="center" marginTop={isSmallScreen ? 12 : 20}>
            <YStack alignItems="center" gap="$3" width="100%">
              <ImageBackground
                source={heroSlides[heroIndex]?.image}
                style={[styles.heroBg, isSmallScreen && { height: 300 }]}
                imageStyle={styles.heroBgImage}>
                <YStack style={styles.heroOverlay} alignItems="center" justifyContent="center" gap="$3.5">
                  <YStack alignItems="center" gap="$2.5">
                    <YStack
                      backgroundColor="rgba(255,255,255,0.14)"
                      paddingHorizontal={20}
                      paddingVertical={10}
                      borderRadius={16}
                      borderWidth={1.5}
                      borderColor="rgba(255,255,255,0.4)">
                      <Text
                        color="#FBBF24"
                        fontSize={isSmallScreen ? 12 : 13}
                        fontWeight="900"
                        style={{ fontFamily: 'Georgia' }}>
                        Since 2006
                      </Text>
                      <Text
                        color="#FFFFFF"
                        fontSize={isSmallScreen ? 12 : 13}
                        fontWeight="800"
                        style={{ fontFamily: 'Georgia' }}>
                        18+ Years of Excellence
                      </Text>
                    </YStack>

                    <H1
                      color="#FFFFFF"
                      fontSize={isSmallScreen ? 32 : 48}
                      textAlign={isSmallScreen ? 'center' : 'left'}
                      fontWeight="900"
                      lineHeight={isSmallScreen ? 40 : 58}
                      style={{ fontFamily: 'Georgia' }}>
                      {heroSlides[heroIndex]?.title}
                    </H1>

                    <Paragraph
                      color="#F1F5F9"
                      textAlign={isSmallScreen ? 'center' : 'left'}
                      fontSize={isSmallScreen ? 14 : 16}
                      fontWeight="700"
                      lineHeight={isSmallScreen ? 20 : 24}
                      paddingHorizontal={isSmallScreen ? 10 : 0}
                      style={{ fontFamily: 'Georgia' }}>
                      {heroSlides[heroIndex]?.subtitle}
                    </Paragraph>
                  </YStack>

                  <XStack flexWrap="wrap" gap="$2.5" justifyContent="center" alignItems="center" marginTop={10}>
                    <Pressable onPress={handleCallNow}>
                      <YStack style={[styles.heroCta, { backgroundColor: '#12a3a3ff' }]}>
                        <Text color="#e4ebecff" fontSize={20} fontWeight="900" style={{ fontFamily: 'Georgia' }}>
                          Call Now
                        </Text>
                      </YStack>
                    </Pressable>
                    <Pressable onPress={handleWhatsApp}>
                      <YStack style={[styles.heroCta, { backgroundColor: '#22C55E' }]}>
                        <Text color="#e4ebecff" fontSize={20} fontWeight="900" style={{ fontFamily: 'Georgia' }}>
                          WhatsApp
                        </Text>
                      </YStack>
                    </Pressable>
                    <Pressable onPress={handleOpenQuote}>
                      <YStack style={[styles.heroCta, { backgroundColor: '#3a53e2ff' }]}>
                        <Text color="#e4ebecff" fontSize={20} fontWeight="900" style={{ fontFamily: 'Georgia' }}>
                          Get Quote
                        </Text>
                      </YStack>
                    </Pressable>
                    <Pressable onPress={handleBook}>
                      <YStack style={[styles.heroCta, { backgroundColor: '#03a734ff' }]}>
                        <Text color="#e4ebecff" fontSize={20} fontWeight="900" style={{ fontFamily: 'Georgia' }}>
                          Book Now
                        </Text>
                      </YStack>
                    </Pressable>
                  </XStack>

                  <XStack gap="$2.5" justifyContent="center" alignItems="center" marginTop={12}>
                    {heroSlides.map((s, i) => (
                      <Pressable key={s.key} onPress={() => setHeroIndex(i)}>
                        <View style={[styles.heroDot, i === heroIndex && styles.heroDotActive]} />
                      </Pressable>
                    ))}
                  </XStack>
                </YStack>
              </ImageBackground>
            </YStack>
          </XStack>

          <Modal visible={quoteModalOpen} transparent animationType="fade" onRequestClose={() => setQuoteModalOpen(false)}>
            <View style={styles.modalBackdrop}>
              <View style={[styles.modalCard, { backgroundColor: theme.bgCard }]}>
                <XStack alignItems="center" justifyContent="space-between" marginBottom={14}>
                  <Text color={theme.text} fontSize={20} fontWeight="900" style={{ fontFamily: 'Georgia' }}>
                    Get Free Quote
                  </Text>
                  <Pressable onPress={() => setQuoteModalOpen(false)}>
                    <Text color={theme.textMuted} fontSize={24} fontWeight="900">
                      ×
                    </Text>
                  </Pressable>
                </XStack>

                <TextInput
                  value={quoteName}
                  onChangeText={setQuoteName}
                  placeholder="Your Name *"
                  placeholderTextColor="#9CA3AF"
                  style={[styles.modalInput, { borderColor: theme.border, color: theme.text, fontFamily: 'Georgia' }]}
                />
                <TextInput
                  value={quotePhone}
                  onChangeText={(t) => {
                    const digits = String(t ?? '').replace(/\D/g, '').slice(0, 10);
                    setQuotePhone(digits);
                  }}
                  placeholder="Phone Number *"
                  placeholderTextColor="#9CA3AF"
                  keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
                  maxLength={10}
                  style={[
                    styles.modalInput,
                    {
                      borderColor: theme.border,
                      color: theme.text,
                      fontFamily: 'Courier New',
                      letterSpacing: 0.5,
                    },
                  ]}
                />
                <TextInput
                  value={quoteEmail}
                  onChangeText={setQuoteEmail}
                  placeholder="Email (Optional)"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={[styles.modalInput, { borderColor: theme.border, color: theme.text, fontFamily: 'Georgia' }]}
                />
                <Pressable onPress={() => setQuoteServicePickerOpen(true)}>
                  <YStack
                    style={[
                      styles.modalInput,
                      {
                        borderColor: theme.border,
                        justifyContent: 'center',
                      },
                    ]}>
                    <XStack alignItems="center" justifyContent="space-between">
                      <Text
                        color={quoteService ? theme.text : '#9CA3AF'}
                        fontSize={14}
                        fontWeight="700"
                        style={{ fontFamily: 'Georgia' }}>
                        {quoteService || 'Select Service'}
                      </Text>
                      <Text color={theme.textMuted} fontSize={18} fontWeight="900">
                        ▾
                      </Text>
                    </XStack>
                  </YStack>
                </Pressable>

                <Modal
                  visible={quoteServicePickerOpen}
                  transparent
                  animationType="fade"
                  onRequestClose={() => setQuoteServicePickerOpen(false)}>
                  <Pressable style={styles.modalBackdrop} onPress={() => setQuoteServicePickerOpen(false)}>
                    <Pressable
                      onPress={() => {}}
                      style={[styles.modalCard, { backgroundColor: theme.bgCard, padding: 14, maxHeight: 360 }]}>
                      <Text color={theme.text} fontSize={16} fontWeight="900" style={{ fontFamily: 'Georgia' }}>
                        Select Service
                      </Text>
                      <YStack marginTop={10} borderWidth={1} borderColor={theme.border} borderRadius={14} overflow="hidden">
                        <ScrollView style={{ maxHeight: 280 }}>
                          {quoteServiceOptions.map((opt) => {
                            const selected = opt === quoteService;
                            return (
                              <Pressable
                                key={opt}
                                onPress={() => {
                                  setQuoteService(opt);
                                  setQuoteServicePickerOpen(false);
                                }}>
                                <XStack
                                  alignItems="center"
                                  justifyContent="space-between"
                                  paddingHorizontal={14}
                                  paddingVertical={12}
                                  backgroundColor={selected ? theme.bgSecondary : theme.bgCard}>
                                  <Text
                                    color={theme.text}
                                    fontSize={14}
                                    fontWeight={selected ? '900' : '700'}
                                    style={{ fontFamily: 'Georgia' }}>
                                    {opt}
                                  </Text>
                                  {selected ? (
                                    <Text color={theme.primary} fontSize={16} fontWeight="900">
                                      ✓
                                    </Text>
                                  ) : null}
                                </XStack>
                              </Pressable>
                            );
                          })}
                        </ScrollView>
                      </YStack>
                    </Pressable>
                  </Pressable>
                </Modal>
                <TextInput
                  value={quoteMessage}
                  onChangeText={setQuoteMessage}
                  placeholder="Your Message (Optional)"
                  placeholderTextColor="#9CA3AF"
                  multiline
                  style={[styles.modalTextarea, { borderColor: theme.border, color: theme.text, fontFamily: 'Georgia' }]}
                />

                <Pressable disabled={quoteSubmitting} onPress={submitQuoteRequest}>
                  <YStack
                    style={[styles.modalSubmit, { backgroundColor: theme.primary, opacity: quoteSubmitting ? 0.7 : 1 }]}>
                    <Text color="#FFFFFF" fontSize={20} fontWeight="900" style={{ fontFamily: 'Georgia' }}>
                      {quoteSubmitting ? 'Submitting…' : 'Request Callback'}
                    </Text>
                  </YStack>
                </Pressable>

                {quoteSubmitNotice ? (
                  <Text
                    marginTop={10}
                    color={theme.textSecondary}
                    fontSize={13}
                    fontWeight="700"
                    textAlign="center"
                    style={{ fontFamily: 'Georgia' }}>
                    {quoteSubmitNotice}
                  </Text>
                ) : null}
              </View>
            </View>
          </Modal>

          <XStack justifyContent="center" alignItems="center" marginTop={40}>
            <Animated.View style={buttonStyle}>
              <Pressable onPress={handleBook}>
                <YStack
                  paddingHorizontal={52}
                  paddingVertical={20}
                  borderRadius={18}
                  backgroundColor={theme.accent}
                  shadowColor={theme.accent}
                  shadowOffset={{ width: 0, height: 10 }}
                  shadowOpacity={0.35}
                  shadowRadius={20}
                  elevation={10}
                  alignItems="center"
                  justifyContent="center">
                  <Text color="#FFFFFF" fontSize={20} fontWeight="900" letterSpacing={0.5} style={{ fontFamily: 'Georgia' }}>
                    Book Now
                  </Text>
                </YStack>
              </Pressable>
            </Animated.View>
          </XStack>

          {coupons.length > 0 ? (
            <YStack marginTop={18} gap="$2.5">
              <Text
                color={theme.textMuted}
                fontSize={13}
                fontWeight="800"
                textAlign="center"
                style={{ fontFamily: 'Georgia' }}>
                Available Offers
              </Text>
              <ScrollView
                ref={(ref) => {
                  couponScrollRef.current = ref;
                }}
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToAlignment="start"
                decelerationRate="fast"
                contentContainerStyle={
                  {
                    paddingHorizontal: 18,
                    gap: 16,
                    flexGrow: 1,
                    justifyContent: coupons.length <= 2 ? 'center' : 'flex-start',
                  } as any
                }>
                {coupons.map((c, idx) => {
                  const cardWidth = isSmallScreen ? Math.min(screenWidth - 64, 380) : 380;
                  const discountText =
                    String(c?.discount_type ?? '').toLowerCase() === 'percent' ||
                    String(c?.discount_type ?? '').toLowerCase() === 'percentage'
                      ? `${Number(c?.discount_value ?? 0)}% OFF`
                      : `Flat ₹${Number(c?.discount_value ?? 0)} OFF`;
                  return (
                    <YStack
                      key={`${String(c?.code ?? idx)}-${idx}`}
                      width={cardWidth}
                      backgroundColor={theme.couponBg}
                      borderRadius={18}
                      padding={18}
                      borderWidth={2}
                      borderColor={theme.couponBorder}
                      gap="$2.5"
                      opacity={idx === couponIndex ? 1 : 0.88}>
                      <XStack alignItems="center" justifyContent="space-between" gap="$2.5">
                        <XStack alignItems="center" gap="$2.5" flex={1}>
                          <Text fontSize={22}>🎉</Text>
                          <Text
                            color={theme.couponText}
                            fontWeight="900"
                            fontSize={17}
                            style={{ fontFamily: 'Georgia' }}>
                            {String(c?.code ?? '').toUpperCase()}
                          </Text>
                        </XStack>
                        <YStack paddingHorizontal={12} paddingVertical={7} borderRadius={999} backgroundColor="rgba(0,0,0,0.14)">
                          <Text
                            color={theme.couponText}
                            fontWeight="900"
                            fontSize={13}
                            style={{ fontFamily: 'Georgia' }}>
                            {discountText}
                          </Text>
                        </YStack>
                      </XStack>
                      {c?.title ? (
                        <Text
                          color={theme.couponText}
                          fontSize={14}
                          fontWeight="800"
                          numberOfLines={2}
                          style={{ fontFamily: 'Georgia' }}>
                          {String(c.title)}
                        </Text>
                      ) : null}
                      <Text color={theme.couponText} fontSize={13} fontWeight="700" style={{ fontFamily: 'Georgia' }}>
                        {c?.max_discount ? `Max ₹${Number(c.max_discount)}` : ''}
                        {c?.max_discount && c?.min_order_amount ? ' • ' : ''}
                        {c?.min_order_amount ? `Min ₹${Number(c.min_order_amount)}` : ''}
                      </Text>
                    </YStack>
                  );
                })}
              </ScrollView>
            </YStack>
          ) : null}

          <View
            onLayout={(e) => {
              sectionOffsetsRef.current.services = e.nativeEvent.layout.y;
            }}>
            <YStack marginTop={64} gap="$4">
              <YStack alignItems="center" gap="$2.5">
              <Text
                color="#D97706"
                fontSize={14}
                letterSpacing={2.4}
                textTransform="uppercase"
                fontWeight="900"
                style={{ fontFamily: 'Georgia' }}>
                Our Services
              </Text>
              <H2
                color={theme.text}
                fontWeight="900"
                textAlign="center"
                fontSize={isSmallScreen ? 26 : 34}
                style={{ fontFamily: 'Georgia' }}>
                We're Quick, Friendly & Professional
              </H2>
              <Text
                color={theme.textMuted}
                fontSize={15}
                textAlign="center"
                lineHeight={22}
                fontWeight="700"
                style={{ fontFamily: 'Georgia' }}>
                Complete packing and moving solutions for homes, offices, and vehicles across India
              </Text>
              </YStack>

              <XStack width="100%" flexWrap="wrap" gap="$3.5" justifyContent="space-between">
              {[
                {
                  title: 'Household Shifting',
                  image: require('../assets/images/HOUSHOLD SHIFT.jpg'),
                },
                {
                  title: 'Office Shifting',
                  image: require('../assets/images/Office Shifting.jpg'),
                },
                {
                  title: 'Car & Bike Transport',
                  image: require('../assets/images/Car Bike Transport SHIFTING.jpg'),
                },
                {
                  title: 'Packing and Moving',
                  image: require('../assets/images/truckpackers.jpg'),
                },
                {
                  title: 'Warehouse Services',
                  image: require('../assets/images/WAREHOUSE SHIFING.jpg'),
                },
                {
                  title: 'International Relocation',
                  image: require('../assets/images/international-moving-services.jpg'),
                },
              ].map((item) => (
                <Pressable
                  key={item.title}
                  style={{ flexBasis: serviceCardWidth, maxWidth: serviceCardWidth, flexGrow: 0, flexShrink: 0 } as any}
                  onPress={() => {
                    if (item.title === 'Household Shifting') {
                      router.push('/services/household-shifting');
                      return;
                    }
                    if (item.title === 'Office Shifting') {
                      router.push('/services/office-shifting');
                      return;
                    }
                    if (item.title === 'Car & Bike Transport') {
                      router.push('/services/car-bike-transport');
                      return;
                    }
                    if (item.title === 'Packing and Moving') {
                      router.push('/services/packing-and-moving');
                      return;
                    }
                    if (item.title === 'Warehouse Services') {
                      router.push('/services/warehouse-services');
                      return;
                    }
                    if (item.title === 'International Relocation') {
                      router.push('/services/international-relocation');
                      return;
                    }
                  }}>
                  {(() => {
                    const serviceIconName =
                      item.title === 'Household Shifting'
                        ? 'cube'
                        : item.title === 'Office Shifting'
                          ? 'building'
                          : item.title === 'Car & Bike Transport'
                            ? 'car'
                            : item.title === 'Packing and Moving'
                              ? 'box-open'
                              : item.title === 'Warehouse Services'
                                ? 'warehouse'
                                : item.title === 'International Relocation'
                                  ? 'globe'
                                  : 'info-circle';

                    return (
                  <YStack
                    style={[
                      styles.serviceCard,
                      {
                        width: '100%',
                        backgroundColor: theme.bgCard,
                        borderColor: theme.border,
                      },
                    ]}>
                    <ImageBackground
                      source={item.image}
                      style={styles.serviceCardImage}
                      imageStyle={styles.serviceCardImageInner}>
                      <View style={styles.serviceCardOverlay}>
                        <Text color="#FFFFFF" fontSize={20} fontWeight="900" style={{ fontFamily: 'Georgia' }}>
                          {item.title}
                        </Text>
                      </View>
                    </ImageBackground>
                    <XStack alignItems="center" justifyContent="space-between" paddingHorizontal={16} paddingVertical={14}>
                      <XStack alignItems="center" gap="$2.5">
                        <FontAwesome5 name={serviceIconName as any} size={14} color={theme.textSecondary} />
                        <Text
                          color={theme.textSecondary}
                          fontSize={13}
                          fontWeight="800"
                          style={{ fontFamily: 'Georgia' }}>
                          View Details
                        </Text>
                      </XStack>
                      <Text color="#D97706" fontSize={20} fontWeight="900">
                        ›
                      </Text>
                    </XStack>
                  </YStack>
                    );
                  })()}
                </Pressable>
              ))}
              </XStack>
            </YStack>
          </View>

          <YStack style={[styles.statsStrip, { paddingVertical: statsPaddingVertical, minHeight: statsMinHeight }]} marginTop={64}>
            {isSmallScreen ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 10, alignItems: 'center', gap: 18 } as any}>
                {[
                  { label: 'Branches', value: '5', icon: '📍' },
                  { label: 'Years Experience', value: '18+', icon: '🕒' },
                  { label: 'Shifting Done', value: '48,500+', icon: '🚚' },
                  { label: 'Satisfaction Rate', value: '80%', icon: '⭐' },
                ].map((s) => (
                  <YStack key={s.label} style={[styles.statItem, { width: 170 }]} alignItems="center" gap="$1.5">
                    <YStack style={styles.statIcon}>
                      <Text fontSize={20}>{s.icon}</Text>
                    </YStack>
                    <Text color="#FFFFFF" fontSize={32} fontWeight="900" style={{ fontFamily: 'Georgia' }}>
                      {s.value}
                    </Text>
                    <Text
                      color="rgba(255,255,255,0.8)"
                      fontSize={13}
                      fontWeight="700"
                      textAlign="center"
                      style={{ fontFamily: 'Georgia' }}>
                      {s.label}
                    </Text>
                  </YStack>
                ))}
              </ScrollView>
            ) : (
              <XStack flexWrap="wrap" justifyContent="space-between" gap="$3.5">
                {[
                  { label: 'Branches', value: '5', icon: '📍' },
                  { label: 'Years Experience', value: '18+', icon: '🕒' },
                  { label: 'Shifting Done', value: '48,500+', icon: '🚚' },
                  { label: 'Satisfaction Rate', value: '80%', icon: '⭐' },
                ].map((s) => (
                  <YStack key={s.label} style={[styles.statItem, { width: '24%' }]} alignItems="center" gap="$1.5">
                    <YStack style={styles.statIcon}>
                      <Text fontSize={20}>{s.icon}</Text>
                    </YStack>
                    <Text color="#FFFFFF" fontSize={38} fontWeight="900" style={{ fontFamily: 'Georgia' }}>
                      {s.value}
                    </Text>
                    <Text
                      color="rgba(255,255,255,0.8)"
                      fontSize={13}
                      fontWeight="700"
                      textAlign="center"
                      style={{ fontFamily: 'Georgia' }}>
                      {s.label}
                    </Text>
                  </YStack>
                ))}
              </XStack>
            )}
          </YStack>

          <YStack marginTop={64} alignItems="center">
            <YStack
              style={[
                styles.bookBanner,
                {
                  backgroundColor: '#D6B23A',
                  paddingVertical: bookBannerPaddingVertical,
                  paddingLeft: bookBannerPaddingLeft,
                  paddingRight: bookBannerPaddingRight,
                  minHeight: bookBannerMinHeight,
                  justifyContent: 'center',
                },
              ]}>
              <XStack flexWrap="wrap" alignItems="center" justifyContent="space-between" gap="$3.5">
                <YStack flex={1} minWidth={isSmallScreen ? '100%' : 340} gap="$2.5">
                  <Text color="#FFFFFF" fontSize={24} fontWeight="900" style={{ fontFamily: 'Georgia' }}>
                    Book Your Move Today
                  </Text>
                  <Text
                    color="rgba(255,255,255,0.94)"
                    fontSize={14}
                    lineHeight={20}
                    fontWeight="700"
                    style={{ fontFamily: 'Georgia' }}>
                    Get instant quote, select vehicle, schedule date and book your relocation in just 3 easy steps!
                  </Text>
                  <YStack gap="$2.5" marginTop={10}>
                    {['Enter pickup & drop location', 'Select vehicle & laborers', 'Pay advance & confirm'].map(
                      (t, idx) => (
                        <XStack key={t} alignItems="center" gap="$2.5">
                          <YStack style={styles.stepBadge}>
                            <Text color="#1A1A1A" fontWeight="900" fontSize={13} style={{ fontFamily: 'Georgia' }}>
                              {idx + 1}
                            </Text>
                          </YStack>
                          <Text color="#FFFFFF" fontSize={14} fontWeight="800" style={{ fontFamily: 'Georgia' }}>
                            {t}
                          </Text>
                        </XStack>
                      )
                    )}
                  </YStack>
                </YStack>

                <YStack
                  alignItems={isSmallScreen ? 'flex-start' : 'flex-end'}
                  width={isSmallScreen ? '100%' : 'auto'}
                  marginRight={isSmallScreen ? 0 : 8}>
                  <Pressable onPress={handleBook}>
                    <YStack style={styles.bookBannerButton}>
                      <XStack alignItems="center" gap="$2.5">
                        <Text color="#FFFFFF" fontSize={15} fontWeight="900" style={{ fontFamily: 'Georgia' }}>
                          Start Booking
                        </Text>
                        <Text color="#FFFFFF" fontSize={18} fontWeight="900">
                          →
                        </Text>
                      </XStack>
                    </YStack>
                  </Pressable>
                </YStack>
              </XStack>
            </YStack>
          </YStack>

          <YStack marginTop={64} gap="$4">
            <YStack alignItems="center" gap="$2.5">
              <Text
                color="#D97706"
                fontSize={14}
                letterSpacing={2.4}
                textTransform="uppercase"
                fontWeight="900"
                style={{ fontFamily: 'Georgia' }}>
                Why Choose Us
              </Text>
              <H2
                color={theme.text}
                fontWeight="900"
                textAlign="center"
                fontSize={isSmallScreen ? 26 : 34}
                style={{ fontFamily: 'Georgia' }}>
                Why We Are The Best
              </H2>
            </YStack>

            <XStack flexWrap="wrap" justifyContent="space-between" gap="$3.5">
              {[
                { title: '24x7 Support', body: 'Round the clock customer support', icon: '🛡️' },
                { title: 'Complete Security', body: 'Your belongings are fully insured', icon: '✅' },
                { title: '100% Trustable', body: 'Trained and verified team members', icon: '⭐' },
                { title: 'User Friendly', body: 'No hidden charges, transparent pricing', icon: '🤝' },
              ].map((c) => (
                <YStack
                  key={c.title}
                  style={[
                    styles.whyCard,
                    {
                      width: isSmallScreen ? '100%' : '23%',
                      backgroundColor: theme.bgCard,
                      borderColor: theme.border,
                    },
                  ]}>
                  <YStack style={styles.whyIcon}>
                    <Text fontSize={20}>{c.icon}</Text>
                  </YStack>
                  <Text
                    color={theme.text}
                    fontSize={16}
                    fontWeight="900"
                    textAlign="center"
                    style={{ fontFamily: 'Georgia' }}>
                    {c.title}
                  </Text>
                  <Text
                    color={theme.textMuted}
                    fontSize={13}
                    fontWeight="700"
                    textAlign="center"
                    lineHeight={20}
                    style={{ fontFamily: 'Georgia' }}>
                    {c.body}
                  </Text>
                </YStack>
              ))}
            </XStack>
          </YStack>

          <YStack marginTop={64} gap="$4">
            <YStack alignItems="center" gap="$2.5">
              <Text
                color="#D97706"
                fontSize={14}
                letterSpacing={2.4}
                textTransform="uppercase"
                fontWeight="900"
                style={{ fontFamily: 'Georgia' }}>
                Testimonials
              </Text>
              <H2
                color={theme.text}
                fontWeight="900"
                textAlign="center"
                fontSize={isSmallScreen ? 26 : 34}
                style={{ fontFamily: 'Georgia' }}>
                What Our Customers Say
              </H2>
            </YStack>

            <XStack flexWrap="wrap" justifyContent="space-between" gap="$3.5">
              {isSmallScreen ? (
                <ScrollView
                  ref={(ref) => {
                    testimonialScrollRef.current = ref;
                  }}
                  horizontal
                  showsHorizontalScrollIndicator
                  contentContainerStyle={{ paddingHorizontal: 10, alignItems: 'stretch', gap: 18 } as any}>
                  {testimonials.map((t) => {
                    const cardWidth = Math.min(windowWidth - 64, 420);
                    return (
                      <YStack
                        key={t.name}
                        style={[
                          styles.testimonialCard,
                          {
                            width: cardWidth,
                            backgroundColor: theme.bgCard,
                            borderColor: theme.border,
                          },
                        ]}>
                        <Text color="#D97706" fontSize={18} fontWeight="900">
                          ⭐⭐⭐⭐⭐
                        </Text>
                        <Text
                          color={theme.textMuted}
                          fontSize={14}
                          lineHeight={22}
                          fontWeight="700"
                          style={{ fontFamily: 'Georgia' }}>
                          &quot;{t.body}&quot;
                        </Text>
                        <XStack alignItems="center" gap="$2.5" marginTop={12}>
                          <YStack style={styles.avatarCircle}>
                            <Text color="#FFFFFF" fontWeight="900" style={{ fontFamily: 'Georgia' }}>
                              {t.letter}
                            </Text>
                          </YStack>
                          <YStack>
                            <Text color={theme.text} fontWeight="900" style={{ fontFamily: 'Georgia' }}>
                              {t.name}
                            </Text>
                            <Text
                              color={theme.textMuted}
                              fontSize={12}
                              fontWeight="700"
                              style={{ fontFamily: 'Georgia' }}>
                              {t.route}
                            </Text>
                          </YStack>
                        </XStack>
                      </YStack>
                    );
                  })}
                </ScrollView>
              ) : (
                testimonials.map((t) => (
                  <YStack
                    key={t.name}
                    style={[
                      styles.testimonialCard,
                      {
                        width: '32%',
                        backgroundColor: theme.bgCard,
                        borderColor: theme.border,
                      },
                    ]}>
                    <Text color="#D97706" fontSize={18} fontWeight="900">
                      ⭐⭐⭐⭐⭐
                    </Text>
                    <Text
                      color={theme.textMuted}
                      fontSize={14}
                      lineHeight={22}
                      fontWeight="700"
                      style={{ fontFamily: 'Georgia' }}>
                      &quot;{t.body}&quot;
                    </Text>
                    <XStack alignItems="center" gap="$2.5" marginTop={12}>
                      <YStack style={styles.avatarCircle}>
                        <Text color="#FFFFFF" fontWeight="900" style={{ fontFamily: 'Georgia' }}>
                          {t.letter}
                        </Text>
                      </YStack>
                      <YStack>
                        <Text color={theme.text} fontWeight="900" style={{ fontFamily: 'Georgia' }}>
                          {t.name}
                        </Text>
                        <Text
                          color={theme.textMuted}
                          fontSize={12}
                          fontWeight="700"
                          style={{ fontFamily: 'Georgia' }}>
                          {t.route}
                        </Text>
                      </YStack>
                    </XStack>
                  </YStack>
                ))
              )}
            </XStack>
          </YStack>

          <YStack style={styles.transparentPricingSection} marginTop={64}>
            <YStack alignItems="center" gap="$2.5" marginBottom={18}>
              <Text
                color="#FFFFFF"
                fontSize={28}
                fontWeight="900"
                textAlign="center"
                style={{ fontFamily: 'Georgia' }}>
                Transparent Pricing
              </Text>
              <Text
                color="rgba(255,255,255,0.82)"
                fontSize={13}
                textAlign="center"
                lineHeight={20}
                fontWeight="700"
                style={{ fontFamily: 'Georgia' }}>
                Approximate charges for local shifting. Final price may vary based on actual items and distance.
              </Text>
            </YStack>

            <ScrollView
              horizontal={isSmallScreen}
              showsHorizontalScrollIndicator={isSmallScreen}
              contentContainerStyle={
                isSmallScreen
                  ? ({ paddingHorizontal: 10, alignItems: 'center' } as any)
                  : ({ alignItems: 'center' } as any)
              }
              style={{ width: '100%' } as any}>
              <YStack
                style={[
                  styles.transparentPricingTable,
                  isSmallScreen ? ({ minWidth: 760, width: 760 } as any) : ({ width: '80%' } as any),
                ] as any}>
                <XStack style={styles.transparentPricingHeaderRow}>
                  {['Type of Move', 'Up to 10 km', '11-25 km', '26-40 km'].map((h) => (
                    <YStack
                      key={h}
                      style={[
                        styles.transparentPricingCell,
                        styles.transparentPricingHeaderCell,
                        h === 'Type of Move' && { flex: 0.75 },
                      ] as any}>
                      <Text
                        color="#FFFFFF"
                        fontWeight="900"
                        fontSize={13}
                        textAlign="center"
                        style={{ fontFamily: 'Georgia' }}>
                        {h}
                      </Text>
                    </YStack>
                  ))}
                </XStack>

                {[ 
                  ['1 BHK Shifting', '₹3,000 - 5,000', '₹4,000 - 6,500', '₹7,000 - 8,500'],
                  ['2 BHK Shifting', '₹4,000 - 7,000', '₹6,500 - 9,500', '₹8,500 - 11,000'],
                  ['3 BHK Shifting', '₹7,000 - 11,000', '₹10,000 - 15,000', '₹14,000 - 18,000'],
                ].map((row) => (
                  <XStack key={row[0]} style={styles.transparentPricingBodyRow}>
                    {row.map((cell, idx) => (
                      <YStack
                        key={`${row[0]}-${idx}`}
                        style={[styles.transparentPricingCell, idx === 0 && { flex: 0.75 }] as any}>
                        <Text
                          color="#0F172A"
                          fontWeight={idx === 0 ? '900' : '800'}
                          fontSize={13}
                          textAlign="center"
                          lineHeight={22}
                          style={{ fontFamily: 'Georgia' }}>
                          {cell}
                        </Text>
                      </YStack>
                    ))}
                  </XStack>
                ))}
              </YStack>
            </ScrollView>

            <XStack
              justifyContent="center"
              alignItems="center"
              gap="$3.5"
              marginTop={20}
              marginBottom={6}
              flexWrap="wrap"
              width="100%">
              <Pressable onPress={handleOpenQuote}>
                <YStack style={[styles.transparentPricingActionButton, styles.transparentPricingActionButtonLight]}>
                  <XStack alignItems="center" gap="$2.5">
                    <Text color="#0B1220" fontSize={16} fontWeight="900" style={{ fontFamily: 'Georgia' }}>
                      Get Quote
                    </Text>
                  </XStack>
                </YStack>
              </Pressable>
              <Pressable onPress={handleBook}>
                <YStack style={[styles.transparentPricingActionButton, styles.transparentPricingActionButtonGreen]}>
                  <XStack alignItems="center" gap="$2.5">
                    <Text color="#FFFFFF" fontSize={16} fontWeight="900" style={{ fontFamily: 'Georgia' }}>
                      Book Now
                    </Text>
                  </XStack>
                </YStack>
              </Pressable>
            </XStack>
          </YStack>

          <YStack
            backgroundColor={theme.bgCard}
            borderRadius={26}
            padding={28}
            gap="$3.5"
            marginTop={28}
            borderWidth={1}
            borderColor={theme.border}
            shadowColor={theme.shadow}
            shadowOffset={{ width: 0, height: 10 }}
            shadowOpacity={0.14}
            shadowRadius={20}
            elevation={8}>
            <YStack
              backgroundColor={theme.bgSecondary}
              paddingHorizontal={26}
              paddingVertical={12}
              borderRadius={22}
              alignSelf="flex-start">
              <Text
                color={theme.primary}
                fontSize={14}
                letterSpacing={2.8}
                textTransform="uppercase"
                fontWeight="900"
                style={{ fontFamily: 'Georgia' }}>
                About Us
              </Text>
            </YStack>

            {!isSmallScreen ? (
              <XStack gap="$4" alignItems="center">
                <Image source={require('../assets/images/packers-movers-bg.jpg')} style={styles.aboutImage} />
                <YStack flex={1} gap="$3.5">
                  <Text color={theme.text} fontSize={22} fontWeight="900" style={{ fontFamily: 'Georgia' }}>
                    Prime Move Experience
                  </Text>
                  <Text
                    color={theme.textMuted}
                    fontSize={15}
                    fontWeight="700"
                    lineHeight={22}
                    style={{ fontFamily: 'Georgia' }}>
                    Smart packing, GPS tracking, and instant support in one premium flow.
                  </Text>
                  <Text
                    color={theme.textSecondary}
                    fontSize={15}
                    lineHeight={24}
                    fontWeight="700"
                    style={{ fontFamily: 'Georgia' }}>
                    With over 10 years of excellence, we've redefined relocation with precision tracking and
                    white-glove service.
                  </Text>
                </YStack>
              </XStack>
            ) : (
              <YStack gap="$3.5" alignItems="center">
                <Image source={require('../assets/images/packers-movers-bg.jpg')} style={styles.aboutImage} />
                <YStack gap="$3.5">
                  <Text
                    color={theme.text}
                    fontSize={22}
                    fontWeight="900"
                    textAlign="center"
                    style={{ fontFamily: 'Georgia' }}>
                    Prime Move Experience
                  </Text>
                  <Text
                    color={theme.textMuted}
                    fontSize={15}
                    fontWeight="700"
                    lineHeight={22}
                    textAlign="center"
                    style={{ fontFamily: 'Georgia' }}>
                    Smart packing, GPS tracking, and instant support in one premium flow.
                  </Text>
                  <Text
                    color={theme.textSecondary}
                    fontSize={15}
                    lineHeight={24}
                    textAlign="center"
                    fontWeight="700"
                    style={{ fontFamily: 'Georgia' }}>
                    With over 10 years of excellence, we've redefined relocation with precision tracking and
                    white-glove service.
                  </Text>
                </YStack>
              </YStack>
            )}
          </YStack>

          <View
            onLayout={(e) => {
              sectionOffsetsRef.current.contact = e.nativeEvent.layout.y;
            }}>
            <YStack
              backgroundColor={theme.bgCard}
              borderRadius={26}
              padding={30}
              gap="$4"
              marginTop={28}
              borderWidth={1}
              borderColor={theme.border}
              shadowColor={theme.shadow}
              shadowOffset={{ width: 0, height: 10 }}
              shadowOpacity={0.14}
              shadowRadius={20}
              elevation={8}>
              <YStack
                backgroundColor={theme.bgSecondary}
                paddingHorizontal={26}
                paddingVertical={12}
                borderRadius={22}
                alignSelf="flex-start">
                <Text
                  color={theme.primary}
                  fontSize={14}
                  letterSpacing={2.8}
                  textTransform="uppercase"
                  fontWeight="900"
                  style={{ fontFamily: 'Georgia' }}>
                  Contact & Support
                </Text>
              </YStack>

              <XStack flexWrap="wrap" justifyContent="space-between" gap="$4" alignItems="flex-start">
                <YStack
                  style={{
                    flexGrow: 1,
                    flexShrink: 1,
                    flexBasis: isSmallScreen ? '100%' : 0,
                    maxWidth: isSmallScreen ? '100%' : 560,
                    minWidth: isSmallScreen ? '100%' : 360,
                  }}
                  alignItems="center"
                  gap="$4">
                  <BusinessCard theme={theme} viewShotRef={businessCardRef} />

                  <Pressable onPress={downloadBusinessCard} style={{ zIndex: 5 }} pointerEvents="auto">
                    <YStack
                      paddingHorizontal={isSmallScreen ? 22 : 36}
                      paddingVertical={16}
                      borderRadius={16}
                      backgroundColor={theme.primary}
                      shadowColor={theme.primary}
                      shadowOffset={{ width: 0, height: 6 }}
                      shadowOpacity={0.35}
                      shadowRadius={14}
                      elevation={8}
                      alignItems="center"
                      flexDirection="row"
                      flexWrap="nowrap"
                      gap="$2.5">
                      <Text fontSize={20}>📥</Text>
                      <Text
                        color="#FFFFFF"
                        fontSize={isSmallScreen ? 15 : 17}
                        fontWeight="900"
                        numberOfLines={1}
                        ellipsizeMode="tail"
                        style={{ fontFamily: 'Georgia', flexShrink: 1 }}>
                        Download Business Card
                      </Text>
                    </YStack>
                  </Pressable>

                  {cardDownloadNotice ? (
                    <Text
                      color={theme.textSecondary}
                      fontSize={13}
                      fontWeight="700"
                      textAlign="center"
                      style={{ fontFamily: 'Georgia' }}>
                      {cardDownloadNotice}
                    </Text>
                  ) : null}
                </YStack>

                <YStack
                  style={{
                    flexGrow: 1,
                    flexShrink: 1,
                    flexBasis: isSmallScreen ? '100%' : 0,
                    maxWidth: isSmallScreen ? '100%' : 560,
                    minWidth: isSmallScreen ? '100%' : 360,
                  }}
                  backgroundColor={isDarkMode ? 'rgba(79, 70, 229, 0.1)' : theme.gradient1}
                  borderRadius={22}
                  padding={22}
                  alignItems="center"
                  borderWidth={1}
                  borderColor={theme.border}>
                  {Platform.OS === 'web' ? (
                    <iframe
                      src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d12248.981988516303!2d77.22197081543338!3d28.62788988366175!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x390cfd0000a2b655%3A0x51d7fda1c5d56c7c!2sArunachal%20Building!5e0!3m2!1sen!2sin!4v1769459405893!5m2!1sen!2sin"
                      width="100%"
                      height="300"
                      style={{ border: 'none', borderRadius: 18 } as any}
                      allowFullScreen={true}
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"></iframe>
                  ) : (
                    <YStack alignItems="center" justifyContent="center" gap="$3.5" width="100%" minHeight={300}>
                      <Text
                        color={theme.text}
                        fontSize={16}
                        fontWeight="900"
                        textAlign="center"
                        style={{ fontFamily: 'Georgia' }}>
                        Google Map
                      </Text>
                      <Pressable
                        onPress={() =>
                          Linking.openURL(
                            'https://www.google.com/maps/search/?api=1&query=Arunachal%20Building%2C%20New%20Delhi'
                          )
                        }>
                        <YStack
                          paddingHorizontal={24}
                          paddingVertical={14}
                          borderRadius={14}
                          backgroundColor={theme.accent}
                          alignItems="center"
                          justifyContent="center">
                          <Text color="#FFFFFF" fontSize={15} fontWeight="900" style={{ fontFamily: 'Georgia' }}>
                            Open in Maps
                          </Text>
                        </YStack>
                      </Pressable>
                    </YStack>
                  )}

                  <Text
                    marginTop={16}
                    color="#0ba705ff"
                    //color={theme.textMuted}
                    fontSize={13}
                    fontWeight="700"
                    textAlign="center"
                    style={{ fontFamily: 'Georgia' }}>
                    Find us on Google Maps — tap directions for the fastest route and live navigation.
                  </Text>
                </YStack>
              </XStack>
            </YStack>
          </View>

          <YStack style={[styles.footerWrap, { borderColor: theme.border }]} marginTop={64}>
            <XStack
              flexWrap={isSmallScreen ? 'wrap' : 'nowrap'}
              justifyContent="space-between"
              gap="$4">
              <YStack
                style={[
                  styles.footerCol,
                  {
                    flexGrow: 1,
                    flexShrink: 1,
                    flexBasis: isSmallScreen ? '100%' : 0,
                    maxWidth: isSmallScreen ? '100%' : undefined,
                    minWidth: 0,
                  },
                ]}
                gap="$2.5">
                <YStack style={styles.footerHeaderWrap}>
                  <Text color="#D97706" fontSize={15} fontWeight="900" style={{ fontFamily: 'Georgia' }}>
                    Gujarat Relocation Packers & Movers
                  </Text>
                </YStack>
                <YStack style={styles.footerBodyWrap}>
                  <Text
                    color={theme.textSecondary}
                    fontSize={13}
                    lineHeight={20}
                    fontWeight="700"
                    style={{ fontFamily: 'Georgia' }}>
                    Professional packing and relocation services with careful handling, verified staff, and transparent
                    pricing across India.
                  </Text>
                  <Text
                    color={theme.textMuted}
                    fontSize={13}
                    fontWeight="900"
                    marginTop={8}
                    style={{ fontFamily: 'Georgia' }}>
                    Follow Us
                  </Text>
                  <XStack gap="$2.5" alignItems="center">
                    <Pressable onPress={() => Linking.openURL('https://facebook.com/')}> 
                      <YStack style={styles.socialIcon}>
                        <FontAwesome name="facebook" size={18} color="#FFFFFF" />
                      </YStack>
                    </Pressable>
                    <Pressable onPress={() => Linking.openURL('https://instagram.com/')}> 
                      <YStack style={styles.socialIcon}>
                        <FontAwesome name="instagram" size={18} color="#FFFFFF" />
                      </YStack>
                    </Pressable>
                    <Pressable onPress={() => Linking.openURL('https://linkedin.com/')}> 
                      <YStack style={styles.socialIcon}>
                        <FontAwesome name="linkedin" size={18} color="#FFFFFF" />
                      </YStack>
                    </Pressable>
                    <Pressable onPress={() => Linking.openURL('https://youtube.com/')}> 
                      <YStack style={styles.socialIcon}>
                        <FontAwesome5 name="youtube" size={18} color="#FFFFFF" />
                      </YStack>
                    </Pressable>
                  </XStack>
                </YStack>
              </YStack>
              {(() => {
                const services = [
                  { label: 'Transportation Service', route: '/services/transportation-service' },
                  { label: 'Household Shifting', route: '/services/household-shifting' },
                  { label: 'Office Shifting', route: '/services/office-shifting' },
                  { label: 'Packing and Moving', route: '/services/packing-and-moving' },
                  { label: 'Loading and Unloading', route: '/services/loading-unloading' },
                  { label: 'Domestic Relocations', route: '/services/domestic-relocations' },
                  { label: 'Car and Bike Transport', route: '/services/car-bike-transport' },
                  { label: 'International Relocation', route: '/services/international-relocation' },
                  { label: 'Warehouse Services', route: '/services/warehouse-services' },
                ] as const;

                const left = services.slice(0, 4);
                const right = services.slice(4);

                const renderService = (s: (typeof services)[number]) => (
                  <Pressable key={s.label} onPress={() => router.push(s.route as any)}>
                    <XStack alignItems="center" gap="$2.5" paddingVertical={5}>
                      <Text color="#D97706" fontWeight="900">
                        ›
                      </Text>
                      <Text
                        color={theme.textSecondary}
                        fontSize={13}
                        fontWeight="800"
                        style={{ fontFamily: 'Georgia' }}>
                        {s.label}
                      </Text>
                    </XStack>
                  </Pressable>
                );

                return (
                  <>
                    <YStack
                      style={[
                        styles.footerCol,
                        {
                          flexGrow: 1,
                          flexShrink: 1,
                          flexBasis: isSmallScreen ? '100%' : 0,
                          maxWidth: isSmallScreen ? '100%' : undefined,
                          minWidth: 0,
                        },
                      ]}
                      gap="$2.5">
                      <YStack style={styles.footerHeaderWrap}>
                        <Text color="#D97706" fontSize={15} fontWeight="900" style={{ fontFamily: 'Georgia' }}>
                          Services We Provide
                        </Text>
                      </YStack>
                      <YStack style={styles.footerBodyWrap}>{(isSmallScreen ? services : left).map(renderService)}</YStack>
                    </YStack>

                    {!isSmallScreen ? (
                      <YStack
                        style={[
                          styles.footerCol,
                          {
                            flexGrow: 1,
                            flexShrink: 1,
                            flexBasis: 0,
                            minWidth: 0,
                          },
                        ]}
                        gap="$2.5">
                        <YStack style={styles.footerHeaderWrap} />
                        <YStack style={styles.footerBodyWrap}>{right.map(renderService)}</YStack>
                      </YStack>
                    ) : null}
                  </>
                );
              })()}

              <YStack
                style={[
                  styles.footerCol,
                  {
                    flexGrow: 1,
                    flexShrink: 1,
                    flexBasis: isSmallScreen ? '100%' : 0,
                    maxWidth: isSmallScreen ? '100%' : undefined,
                    minWidth: 0,
                  },
                ]}
                gap="$2.5">
                <YStack style={styles.footerHeaderWrap}>
                  <Text color="#D97706" fontSize={15} fontWeight="900" style={{ fontFamily: 'Georgia' }}>
                    Quick Links
                  </Text>
                </YStack>
                <YStack style={styles.footerBodyWrap}>
                  {[
                    { label: 'Home', action: () => scrollRef.current?.scrollTo({ y: 0, animated: true }) },
                    { label: 'Services', action: () => scrollToSection('services') },
                    { label: 'Track', action: () => router.push('/(tabs)/tracking') },
                    { label: 'Contact', action: () => scrollToSection('contact') },
                  ].map((l) => (
                    <Pressable key={l.label} onPress={l.action}>
                      <Text
                        color={theme.textSecondary}
                        fontSize={13}
                        fontWeight="800"
                        paddingVertical={7}
                        style={{ fontFamily: 'Georgia' }}>
                        {l.label}
                      </Text>
                    </Pressable>
                  ))}
                </YStack>
              </YStack>
            </XStack>

            <XStack justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$2.5" marginTop={20}>
              <Text color={theme.textMuted} fontSize={12} fontWeight="700" style={{ fontFamily: 'Georgia' }}>
                © 2026 BT SOFTECH. All Rights Reserved.
              </Text>
              <XStack gap="$3.5" alignItems="center">
                <Pressable onPress={() => router.push('/privacy-policy')}>
                  <Text color={theme.textMuted} fontSize={12} fontWeight="800" style={{ fontFamily: 'Georgia' }}>
                    Privacy Policy
                  </Text>
                </Pressable>
                <Pressable onPress={() => router.push('/terms-and-conditions')}>
                  <Text color={theme.textMuted} fontSize={12} fontWeight="800" style={{ fontFamily: 'Georgia' }}>
                    Terms & Conditions
                  </Text>
                </Pressable>
              </XStack>
            </XStack>
          </YStack>
        </YStack>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerPill: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 14,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  headerPillIcon: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  headerPillIconMobile: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  stickyHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    borderBottomWidth: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 52,
  },
  menuRow: {
    gap: 10,
  },
  logo: {
    width: 72,
    height: 72,
    resizeMode: 'contain',
  },
  heroBg: {
    width: '100%',
    height: 380,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.52)',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 52,
    paddingHorizontal: 32,
    borderRadius: 24,
  },
  heroBgImage: {
    resizeMode: 'cover',
    borderRadius: 24,
  },
  heroCta: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(0,0,0,0.3)',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 8,
  },
  heroDot: {
    width: 11,
    height: 11,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  heroDotActive: {
    width: 26,
    backgroundColor: '#FBBF24',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 540,
    borderRadius: 20,
    padding: 22,
  },
  modalInput: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    marginBottom: 12,
  },
  modalTextarea: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    marginBottom: 14,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  modalSubmit: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceCard: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  serviceCardImage: {
    width: '100%',
    height: 170,
    justifyContent: 'flex-end',
  },
  serviceCardImageInner: {
    resizeMode: 'cover',
  },
  serviceCardOverlay: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: 'rgba(0,0,0,0.38)',
  },
  statsStrip: {
    width: '100%',
    paddingVertical: 50,
    paddingHorizontal: 24,
    marginHorizontal: -24,
    borderRadius: 0,
    backgroundColor: '#1E3A5F',
    justifyContent: 'center',
    shadowColor: 'rgba(0,0,0,0.28)',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 22,
    elevation: 10,
  },
  statItem: {
    paddingVertical: 18,
  },
  statIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  bookBanner: {
    width: '100%',
    borderRadius: 22,
    paddingHorizontal: 30,
    paddingVertical: 30,
    minHeight: 190,
    shadowColor: 'rgba(0,0,0,0.26)',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 22,
    elevation: 10,
  },
  bookBannerButton: {
    backgroundColor: '#1F3B63',
    paddingHorizontal: 26,
    paddingVertical: 16,
    borderRadius: 16,
    minWidth: 180,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(0,0,0,0.26)',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 9,
  },
  stepBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  whyCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
    gap: 12,
  },
  whyIcon: {
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: 'rgba(15,23,42,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  testimonialCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  avatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1F3B63',
    alignItems: 'center',
    justifyContent: 'center',
  },
  transparentPricingSection: {
    borderRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 44,
    paddingBottom: 44,
    backgroundColor: '#1E3A5F',
  },
  transparentPricingTable: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  transparentPricingHeaderRow: {
    backgroundColor: '#D6B23A',
  },
  transparentPricingBodyRow: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15, 23, 42, 0.08)',
  },
  transparentPricingCell: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 34,
    justifyContent: 'center',
  },
  transparentPricingHeaderCell: {
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.28)',
  },
  transparentPricingActionButton: {
    minWidth: 160,
    height: 52,
    borderRadius: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(0,0,0,0.22)',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 8,
  },
  transparentPricingActionButtonLight: {
    backgroundColor: '#FFFFFF',
  },
  transparentPricingActionButtonGreen: {
    backgroundColor: '#12b12ce0',
  },
  aboutImage: {
    width: 120,
    height: 120,
    borderRadius: 20,
    resizeMode: 'cover',
  },
  footerWrap: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 24,
    backgroundColor: '#0B1B2B',
  },
  footerCol: {
    minWidth: 0,
  },
  footerHeaderWrap: {
    minHeight: 22,
    justifyContent: 'flex-start',
  },
  footerBodyWrap: {
    marginTop: 8,
  },
  footerLogo: {
    width: 90,
    height: 90,
    resizeMode: 'contain',
    marginBottom: 10,
  },
  socialIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});





