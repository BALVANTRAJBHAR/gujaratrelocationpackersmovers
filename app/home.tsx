import StickyHeader from '@/app/components/sticky-header';
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
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import ViewShot from 'react-native-view-shot';
import { Button, H1, H2, Image, Paragraph, Text, XStack, YStack } from 'tamagui';

import { themes } from '@/constants/theme';
import { searchPlaces } from '@/lib/mapbox';
import { signOutSupabaseSafe, supabase } from '@/lib/supabase';
import { useAppColorScheme } from '@/providers/color-scheme-provider';
import { useSession } from '@/providers/session-provider';
import { t } from '@/constants/typography';

if (typeof window !== 'undefined' && !Linking.openURL) {
  Linking.openURL = (url: string) => {
    window.open(url, '_blank');
    return Promise.resolve();
  };
}

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const APP_SERIF_FONT = Platform.OS === 'web' ? "'Times New Roman', Times, serif" : 'Times New Roman';

const menuItems = ['Home', 'Services', 'Track', 'Contact'];

const roleRouteMap: Record<string, string> = {
  admin: '/(tabs)/admin',
  staff: '/(tabs)/admin',
  driver: '/(tabs)/driver',
  provider: '/(tabs)',
  customer: '/(tabs)/bookings',
};

const transparentPricingColumns = ['Type of Move', 'Up to 10 km', '11-25 km', '26-40 km'];

const transparentPricingRows = [
  ['1 BHK Shifting', '₹3,000 - 5,000', '₹4,000 - 6,500', '₹7,000 - 8,500'],
  ['2 BHK Shifting', '₹4,000 - 7,000', '₹6,500 - 9,500', '₹8,500 - 11,000'],
  ['3 BHK Shifting', '₹7,000 - 11,000', '₹10,000 - 15,000', '₹14,000 - 18,000'],
];

const googleMapCoords = '19.19345137320862,72.87039928686748';
const googleMapEmbedUrl =
  'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d15072.160349352169!2d72.87039928686748!3d19.19345137320862!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3be7b7b2f8931407%3A0x3f3198a6e19ac233!2sSethia%20Aashray!5e0!3m2!1sen!2sin!4v1772384635990!5m2!1sen!2sin';
const googleMapWebViewHtml = `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    <style>
      html, body, iframe { margin: 0; width: 100%; height: 100%; border: 0; overflow: hidden; }
      body { background: #F8FAFC; }
    </style>
  </head>
  <body>
    <iframe src="${googleMapEmbedUrl}" allowfullscreen loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
  </body>
</html>`;

const glowKeyframes = {
  '0%': { backgroundPosition: '0 0' },
  '50%': { backgroundPosition: '400% 0' },
  '100%': { backgroundPosition: '0 0' },
} as any;

const resolveRoleRoute = (role?: string | null) => {
  const key = role?.toLowerCase() ?? 'customer';
  return roleRouteMap[key] ?? '/(tabs)';
};

const resolveDashboardRoute = (args: { role?: string | null; providerSubtype?: string | null }) => {
  const roleKey = String(args.role ?? '').trim().toLowerCase();
  const subtype = String(args.providerSubtype ?? '').trim().toLowerCase();
  if (roleKey === 'admin' || roleKey === 'staff') return '/(tabs)/admin';
  if (roleKey === 'driver') return '/(tabs)/driver';
  if (roleKey === 'provider') {
    if (subtype === 'property_owner') return '/(tabs)/properties';
    if (subtype === 'home_service') return '/(tabs)/home-service';
    return '/(tabs)';
  }
  return '/(tabs)/bookings';
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

const AppButton = ({
  label,
  onPress,
  backgroundColor,
  textColor,
  containerStyle,
  labelStyle,
  glowOnHover,
  content,
}: {
  label: string;
  onPress: () => void;
  backgroundColor: string;
  textColor: string;
  containerStyle?: any;
  labelStyle?: any;
  glowOnHover?: boolean;
  content?: React.ReactNode;
}) => {
  const [hovered, setHovered] = useState(false);

  const resolvedContainerStyle = StyleSheet.flatten(containerStyle);
  const glowRadius =
    typeof resolvedContainerStyle?.borderRadius === 'number' ? resolvedContainerStyle.borderRadius : 18;

  const inner = (
    <YStack style={[resolvedContainerStyle, { backgroundColor }] as any}>
      {content ?? (
        <Text color={textColor} style={labelStyle}>
          {label}
        </Text>
      )}
    </YStack>
  );

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={Platform.OS === 'web' ? () => setHovered(true) : undefined}
      onHoverOut={Platform.OS === 'web' ? () => setHovered(false) : undefined}>
      {Platform.OS === 'web' && glowOnHover ? (
        <View style={[styles.glowWrap as any, { borderRadius: glowRadius }]}>
          <View style={[styles.glowLayer as any, { opacity: hovered ? 1 : 0, borderRadius: glowRadius }]} />
          <View style={styles.glowInner as any}>{inner}</View>
        </View>
      ) : (
        inner
      )}
    </Pressable>
  );
};



const brandTextKeyframes = {
  '0%': { color: '#1877F2' },
  '25%': { color: '#E1306C' },
  '50%': { color: '#0A66C2' },
  '75%': { color: '#FF0000' },
  '100%': { color: '#1877F2' },
} as any;

const BusinessCard = ({ theme, viewShotRef }: any) => {
  const { width: cardWindowWidth } = useWindowDimensions();
  const isCardNarrow = cardWindowWidth <= 520;

  const card = (
    <YStack
      nativeID={Platform.OS === 'web' ? 'business-card' : undefined}
      backgroundColor={theme.bgCard}
      borderRadius={20}
      padding={isCardNarrow ? 16 : 28}
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
      minHeight={isCardNarrow ? 430 : 360}>
      <XStack
        justifyContent="space-between"
        alignItems={isCardNarrow ? 'stretch' : 'flex-start'}
        gap={isCardNarrow ? '$2' : '$4'}
        flexWrap={isCardNarrow ? 'nowrap' : 'wrap'}
        flexDirection={isCardNarrow ? 'column' : 'row'}>
        <YStack flex={isCardNarrow ? undefined : 1} width={isCardNarrow ? '100%' : undefined} gap="$3" minWidth={isCardNarrow ? 0 : 280}>
          <XStack alignItems="center" gap="$3" flexWrap="nowrap" style={{ minWidth: 0 }}>
            <Image
              source={require('../assets/images/PackersMoversLogo.png')}
              resizeMode="contain"
              style={{ width: isCardNarrow ? 52 : 70, height: isCardNarrow ? 52 : 70 }}
            />
            <YStack style={{ flexShrink: 1, minWidth: 0, flex: 1 }}>
              <Text
                color={theme.text}
                fontSize={isCardNarrow ? 19 : 22}
                fontWeight="900"
                lineHeight={isCardNarrow ? 22 : 26}
                numberOfLines={2}
                ellipsizeMode="tail"
                style={{ fontFamily: APP_SERIF_FONT, flexShrink: 1 }}>
                Gujarat Relocation
              </Text>
              <Text
                color={theme.primary}
                fontSize={isCardNarrow ? 13 : 15}
                fontWeight="700"
                lineHeight={isCardNarrow ? 18 : 20}
                numberOfLines={1}
                ellipsizeMode="tail"
                style={{ fontFamily: APP_SERIF_FONT, flexShrink: 1 }}>
                Packers & Movers
              </Text>
            </YStack>
          </XStack>

          <YStack height={2} backgroundColor={theme.primary} width="100%" borderRadius={1} marginVertical={12} />

          <YStack gap="$2.5">
            <XStack gap="$2.5" alignItems="center">
              <FontAwesome name="phone" size={18} color="#2563EB" />
              <Text
                color={theme.text}
                fontSize={t(15)}
                fontWeight="700"
                style={{ fontFamily: APP_SERIF_FONT }}>
                +91 9987963470
              </Text>
            </XStack>

            <XStack gap="$2.5" alignItems="center">
              <FontAwesome name="envelope" size={18} color="#22C55E" />
              <Text
                color={theme.text}
                fontSize={t(15)}
                fontWeight="700"
                numberOfLines={isCardNarrow ? 2 : 1}
                lineHeight={20}
                style={{ fontFamily: APP_SERIF_FONT, flexShrink: 1 }}>
                info@gujaratrelocation.com
              </Text>
            </XStack>

            <XStack gap="$2.5" alignItems="flex-start">
              <FontAwesome name="map-marker" size={20} color="#EF4444" style={{ marginTop: 1 }} />
              <Text
                color={theme.text}
                fontSize={t(15)}
                fontWeight="700"
                flex={1}
                lineHeight={22}
                style={{ fontFamily: APP_SERIF_FONT }}>
                Sethia Aashray, Mumbai 400101
              </Text>
            </XStack>

            <XStack gap="$2.5" alignItems="center">
              <Text fontSize={t(18)}>🕐</Text>
              <Text color={theme.textMuted} fontSize={t(13)} fontWeight="700" style={{ fontFamily: APP_SERIF_FONT }}>
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
              fontSize={t(12)}
              fontWeight="800"
              textAlign="center"
              alignSelf="center"
              //alignSelf="flex-end"
              style={{ fontFamily: APP_SERIF_FONT }}>
              White-glove relocation • GPS tracking
            </Text>
          </YStack>
        </YStack>

        <YStack alignItems="center" gap="$2.5" width={isCardNarrow ? '100%' : undefined}>
          <YStack
            nativeID={Platform.OS === 'web' ? 'business-card-qr' : undefined}
            backgroundColor={theme.bgSecondary}
            padding={isCardNarrow ? 8 : 14}
            borderRadius={16}
            borderWidth={2}
            borderColor={theme.border}>
            <QRCode value="tel:+919987963470" size={isCardNarrow ? 118 : 110} color={theme.text} backgroundColor={theme.bgCard} />
          </YStack>
          <Text
            color={theme.textMuted}
            fontSize={t(11)}
            fontWeight="700"
            textAlign="center"
            style={{ fontFamily: APP_SERIF_FONT }}>
            Scan to Call
          </Text>
        </YStack>
      </XStack>

      <YStack alignItems="center" marginTop={2}>
        <Text
          color={theme.textMuted}
          fontSize={t(11)}
          fontWeight="600"
          textAlign="center"
          lineHeight={16}
          style={{ fontFamily: APP_SERIF_FONT }}>
          www.gujaratrelocation.com • 2026 GujaratRelocationMoversPackers
        </Text>
      </YStack>
    </YStack>
  );

  return (
    <View style={{ width: '100%', minHeight: isCardNarrow ? 430 : 360 }}>
      {Platform.OS === 'web' ? (
        card
      ) : (
        <ViewShot
          ref={viewShotRef}
          style={{ width: '100%', minHeight: isCardNarrow ? 430 : 360 }}
          options={{ format: 'png', quality: 1.0 }}>
          {card}
        </ViewShot>
      )}
    </View>
  );
};

export default function HomeLandingScreen({ embeddedInTabs = false }: { embeddedInTabs?: boolean }) {
  const router = useRouter();
  const { scrollTo } = useLocalSearchParams<{ scrollTo?: string }>();
  const { session, profile, refreshProfile } = useSession();
  const { width: windowWidth } = useWindowDimensions();
  const appColorScheme = useAppColorScheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [headerHovered, setHeaderHovered] = useState<string | null>(null);
  const [footerHovered, setFooterHovered] = useState<string | null>(null);
  const [activeService, setActiveService] = useState<'shifting' | 'home_services' | 'property'>('shifting');
  const [topSearch, setTopSearch] = useState('');
  const [propertyMode, setPropertyMode] = useState<'buy' | 'rent' | 'commercial'>('rent');
  const [propertyBuyType, setPropertyBuyType] = useState<'full_house' | 'land_plot'>('full_house');
  const [propertyRentType, setPropertyRentType] = useState<'full_house' | 'pg_hostel' | 'flatmates'>('full_house');
  const [propertyCommercialTxn, setPropertyCommercialTxn] = useState<'rent' | 'buy'>('rent');
  const [buyBhkSelected, setBuyBhkSelected] = useState<string[]>([]);
  const [buyPropertyStatus, setBuyPropertyStatus] = useState<'under_construction' | 'ready' | ''>('');
  const [buyNewBuilderProjects, setBuyNewBuilderProjects] = useState(false);
  const [rentFullHouseBhkSelected, setRentFullHouseBhkSelected] = useState<string[]>([]);
  const [rentPgTenantType, setRentPgTenantType] = useState<'male' | 'female' | 'anyone' | ''>('');
  const [rentPgRoomType, setRentPgRoomType] = useState<'single_room' | 'double_sharing' | 'triple_sharing' | 'four_sharing' | ''>('');
  const [rentFlatmatesTenantTypes, setRentFlatmatesTenantTypes] = useState<('male' | 'female')[]>([]);
  const [rentFlatmatesRoomType, setRentFlatmatesRoomType] = useState<'single_room' | 'shared_room' | ''>('');
  const [commercialPropertyTypes, setCommercialPropertyTypes] = useState<string[]>([]);
  const [commercialAvailability, setCommercialAvailability] = useState<'immediate' | 'within_15_days' | 'within_30_days' | 'after_30_days' | ''>('');
  const [pickerOpen, setPickerOpen] = useState<
    | null
    | 'buy_bhk'
    | 'buy_status'
    | 'rent_fullhouse_bhk'
    | 'rent_pg_tenant'
    | 'rent_pg_room'
    | 'rent_flatmates_tenant'
    | 'rent_flatmates_room'
    | 'commercial_property_type'
    | 'commercial_availability'
  >(null);
  const [propertyState, setPropertyState] = useState<string>('Gujarat');
  const [propertyCity, setPropertyCity] = useState<string>('Ahmedabad');
  const [propertyStatePickerOpen, setPropertyStatePickerOpen] = useState(false);
  const [propertyCityPickerOpen, setPropertyCityPickerOpen] = useState(false);
  const [propertyLocalitySuggestions, setPropertyLocalitySuggestions] = useState<{ id: string; label: string; full: string }[]>([]);
  const [propertyLocalityLoading, setPropertyLocalityLoading] = useState(false);
  const [propertyLocalityRawDebug, setPropertyLocalityRawDebug] = useState<string>('');
  const [propertySelectedLocalities, setPropertySelectedLocalities] = useState<string[]>([]);
  const suppressNextPropertyLocalitySuggestRef = useRef(false);
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

  const quoteNameReadOnly = Boolean(profile?.name?.trim() || String((session?.user?.user_metadata as any)?.name ?? '').trim());
  const quotePhoneReadOnly = Boolean(String(profile?.phone ?? '').trim());
  const quoteEmailReadOnly = Boolean(String(profile?.email ?? session?.user?.email ?? '').trim());
  const scrollRef = useRef<ScrollView | null>(null);
  const sectionOffsetsRef = useRef<{ services?: number; serviceMenu?: number; contact?: number }>({});
  const propertyCityCentersRef = useRef<Record<string, [number, number]>>({});
  const buttonAnim = useRef(new Animated.Value(1)).current;
  const didRedirectRef = useRef(false);
  const businessCardRef = useRef<any>(null);
  const contactHeadingRef = useRef<any>(null);
  const scrollOffsetRef = useRef(0);
  const heroTimerRef = useRef<any>(null);
  const heroPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 15 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5,
      onPanResponderRelease: (_, gs) => {
        if (gs.dx > 50) setHeroIndex((p) => (p === 0 ? heroSlides.length - 1 : p - 1));
        else if (gs.dx < -50) setHeroIndex((p) => (p + 1) % heroSlides.length);
      },
    })
  ).current;
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
      'Full House Buy',
      'Full House Rent',
      'Land/Plot Buy',
      'Land/Plot Sale',
      'PG / Hostel',
      'Flatmates',
      'Office Space',
      'Co-Working',
      'Shop',
      'Showroom',
      'Industrial Building',
      'Industrial Shed',
      'Godown / Warehouse',
      'Restaurant / Cafe',
    ] as const,
    []
  );

  type StateRow = { id: string; name: string };
  type CityRow = { id: string; state_id: string; name: string };

  const propertyFallbackCityByState = useMemo(() => {
    return {
      Gujarat: ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot'],
      Maharashtra: ['Mumbai', 'Pune', 'Nagpur', 'Nashik'],
      Rajasthan: ['Jaipur', 'Jodhpur', 'Udaipur', 'Kota'],
      'Madhya Pradesh': ['Bhopal', 'Indore', 'Jabalpur', 'Gwalior'],
    } as Record<string, string[]>;
  }, []);

  const [propertyStates, setPropertyStates] = useState<StateRow[]>([]);
  const [propertyCities, setPropertyCities] = useState<CityRow[]>([]);

  const selectedPropertyStateId = useMemo(() => {
    const s = propertyStates.find((x) => x.name.toLowerCase() === propertyState.trim().toLowerCase());
    return s?.id ?? null;
  }, [propertyState, propertyStates]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const { data, error } = await supabase.from('states').select('id,name').order('name');
        if (!active) return;
        if (error) throw new Error(error.message);
        setPropertyStates(((data as any) ?? []) as StateRow[]);
      } catch {
        if (!active) return;
        setPropertyStates([]);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!selectedPropertyStateId) {
        setPropertyCities([]);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('cities')
          .select('id,state_id,name')
          .eq('state_id', selectedPropertyStateId)
          .order('name');
        if (!active) return;
        if (error) throw new Error(error.message);
        setPropertyCities(((data as any) ?? []) as CityRow[]);
      } catch {
        if (!active) return;
        setPropertyCities([]);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [selectedPropertyStateId]);

  const propertyStateOptions = useMemo(() => {
    if (propertyStates.length) return propertyStates.map((s) => s.name);
    return Object.keys(propertyFallbackCityByState);
  }, [propertyFallbackCityByState, propertyStates]);

  const propertyCityOptions = useMemo(() => {
    if (propertyCities.length) return propertyCities.map((c) => c.name);
    const list = propertyFallbackCityByState[propertyState] ?? [];
    return list.length ? list : ['Select city'];
  }, [propertyCities, propertyFallbackCityByState, propertyState]);

  const homeServiceOptions = useMemo(
    () =>
      [
        { key: 'ac', label: 'AC' },
        { key: 'carpenter', label: 'Carpenter' },
        { key: 'electrician', label: 'Electrician' },
        { key: 'plumber', label: 'Plumber' },
        { key: 'pest', label: 'Pest Control' },
        { key: 'cleaning', label: 'Deep Cleaning' },
        { key: 'painting', label: 'Painting' },
      ] as const,
    []
  );

  const serviceColumns = windowWidth < 700 ? 1 : windowWidth < 1100 ? 2 : 3;
  const serviceCardWidth = serviceColumns === 1 ? '100%' : serviceColumns === 2 ? '48%' : '32%';
  const statsPaddingVertical = windowWidth < 480 ? 20 : windowWidth < 900 ? 44 : 124;
  const statsMinHeight = windowWidth < 480 ? 0 : windowWidth < 900 ? 0 : 290;
  const bookBannerPaddingLeft = windowWidth < 480 ? 22 : windowWidth < 900 ? 44 : 62;
  const bookBannerPaddingRight = windowWidth < 480 ? 22 : windowWidth < 900 ? 52 : 70;
  const bookBannerPaddingVertical = windowWidth < 480 ? 38 : windowWidth < 900 ? 44 : 60;
  const bookBannerMinHeight = windowWidth < 480 ? 240 : windowWidth < 900 ? 230 : 255;

  const isDarkMode = appColorScheme?.colorScheme === 'dark';
  const theme = isDarkMode ? themes.dark : themes.light;
  const isSmallScreen = windowWidth <= 768;
  const pricingTableWidth = isSmallScreen ? '100%' : '80%';
  const pricingHeaderFontSize = isSmallScreen ? 12 : 14;
  const pricingBodyFontSize = isSmallScreen ? 12 : 14;
  const pricingBodyLineHeight = isSmallScreen ? 17 : 23;
  const nativeWebView = useMemo(() => {
    if (Platform.OS === 'web') return null;
    try {
      return require('react-native-webview');
    } catch {
      return null;
    }
  }, []);
  const nativeMaps = useMemo(() => {
    if (Platform.OS === 'web') return null;
    try {
      return require('react-native-maps');
    } catch {
      return null;
    }
  }, []);
  const NativeWebView = nativeWebView?.WebView as any;
  const NativeMapView = nativeMaps?.default as any;
  const NativeMapMarker = nativeMaps?.Marker as any;
  const sectionGap = isSmallScreen ? 20 : 64;
  const tightSectionGap = isSmallScreen ? 12 : 28;
  const statusBarHeight = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0;

  const roleKey = (profile?.role ?? 'customer').toString().trim().toLowerCase();
  const canManage = ['admin', 'staff'].includes(roleKey);
  const isProvider = roleKey === 'provider' || roleKey === 'driver';
  const isDriver = roleKey === 'driver';
  const isCustomer = !canManage && !isProvider;

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
    {
      key: 'slide-4',
      image: require('../assets/images/MultiSImages.png'),
      title: 'Multi Services\nProvider',
      subtitle: 'All Home Services in One Place',
    },
  ];

  const serviceMenuItems = useMemo(
    () =>
      [
        { key: 'shifting' as const, label: 'Shifting\nServices', icon: 'truck' },
        { key: 'home_services' as const, label: 'Home\nServices', icon: 'broom' },
        { key: 'property' as const, label: 'Property\nManagement', icon: 'building' },
      ],
    []
  );

  useEffect(() => {
    if (embeddedInTabs) return;
    if (!session?.user?.id) return;
    if (!isProvider) return;
    if (didRedirectRef.current) return;
    didRedirectRef.current = true;
    void (async () => {
      try {
        const roleIntent = String((session.user?.user_metadata as any)?.role_intent ?? '').trim().toLowerCase();
        const providerSubtype = String((session.user?.user_metadata as any)?.provider_subtype ?? '').trim().toLowerCase();
        if (roleIntent === 'provider') {
          const { data: row, error: rowError } = await supabase
            .from('users')
            .select('id, phone')
            .eq('id', session.user.id)
            .maybeSingle();

          const phoneOk = Boolean(String((row as any)?.phone ?? '').trim());

          const { data: docs, error: docsError } = await supabase
            .from('user_documents')
            .select('id, document_number')
            .eq('user_id', session.user.id)
            .eq('document_type', 'aadhar')
            .order('created_at', { ascending: false })
            .limit(1);

          const doc = (docs ?? [])[0] as any;
          const aadhaarDigits = String(doc?.document_number ?? '').replace(/\D/g, '');
          const aadhaarOk = aadhaarDigits.length === 12;

          if (rowError || docsError || !phoneOk || !aadhaarOk) {
            router.replace('/auth/register' as any);
            return;
          }

          if (providerSubtype === 'property_owner') {
            router.replace('/(tabs)/properties' as any);
            return;
          }
        }
      } catch {
        // ignore
      }

      if (isDriver) {
        router.replace('/(tabs)/driver');
      }
    })();
  }, [embeddedInTabs, isProvider, router, session?.user?.id]);

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
    router.push({ pathname: '/book' } as any);
  };

  const isProviderRegistrationIncomplete = Boolean(
    session?.user?.id &&
      ((String((profile?.role ?? '')).trim().toLowerCase() === 'provider') ||
        String((session?.user?.user_metadata as any)?.role_intent ?? '').trim().toLowerCase() === 'provider') &&
      (!profile?.phone || !Array.isArray(profile?.provider_services) || profile.provider_services.length === 0)
  );

  const handlePrimaryServiceAction = () => {
    if (activeService === 'shifting') {
      handleBook();
      return;
    }

    if (activeService === 'home_services') {
      if (!session) {
        router.push({ pathname: '/auth/login' } as any);
        return;
      }
      if (isProviderRegistrationIncomplete) {
        router.replace('/auth/register' as any);
        return;
      }
      router.push({ pathname: '/home-services/request' } as any);
      return;
    }

    if (activeService === 'property') {
      if (!session) {
        router.push({ pathname: '/auth/login' } as any);
        return;
      }
      if (isProviderRegistrationIncomplete) {
        router.replace('/auth/register' as any);
        return;
      }
      router.push({ pathname: '/properties/post' } as any);
      return;
    }

    Alert.alert('Coming soon', 'This service will be available soon.');
  };

  const handleDashboardSafe = async () => {
    await refreshProfile();
    const providerSubtype = String((session?.user?.user_metadata as any)?.provider_subtype ?? '').trim().toLowerCase();
    router.push({ pathname: resolveDashboardRoute({ role: profile?.role, providerSubtype }) } as any);
  };

  const handleAdminSectionSafe = async (section: string) => {
    await refreshProfile();
    router.push({ pathname: '/(tabs)/admin', params: { section } } as any);
  };

  const handleLogout = async () => {
    await signOutSupabaseSafe();
    router.replace('/home');
  };

  const scrollToServiceMenu = () => {
    const y = sectionOffsetsRef.current.serviceMenu ?? sectionOffsetsRef.current.services;
    if (typeof y !== 'number') return;
    const extraTopSpacing = 0;
    const scrollY = y - (isSmallScreen ? 62 : 18) - extraTopSpacing;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: Math.max(scrollY, 0), animated: true });
    });
  };

  const scrollToSection = (key: 'services' | 'contact') => {
    if (key === 'contact') {
      contactHeadingRef.current?.measureInWindow((_x, screenY, _w, _h) => {
        if (typeof screenY !== 'number') return;
        const headerBottom = (isSmallScreen ? 70 : 86) + statusBarHeight + 20;
        const delta = screenY - headerBottom;
        scrollRef.current?.scrollTo({ y: Math.max(scrollOffsetRef.current + delta, 0), animated: true });
      });
      return;
    }
    const y = sectionOffsetsRef.current[key];
    if (typeof y !== 'number') return;
    const extraTopSpacing = 20;
    const scrollY = y - (isSmallScreen ? 62 : 18) - extraTopSpacing;
    scrollRef.current?.scrollTo({ y: Math.max(scrollY, 0), animated: true });
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

  const handleOpenMaps = async () => {
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${googleMapCoords}`;

    try {
      await Linking.openURL(mapsUrl);
    } catch {
      await Linking.openURL(`https://maps.google.com/?q=${googleMapCoords}`);
    }
  };

  const handleTopSearch = () => {
    if (activeService === 'shifting') {
      handlePrimaryServiceAction();
      return;
    }
    if (activeService !== 'property') return;

    const trimOrEmpty = (v: string) => String(v ?? '').trim();
    const state = trimOrEmpty(propertyState);
    const city = trimOrEmpty(propertyCity);
    const selectedLocalityQuery = propertySelectedLocalities.map(trimOrEmpty).filter(Boolean).join(',');
    const q = selectedLocalityQuery || trimOrEmpty(topSearch);

    const params: Record<string, any> = {
      state,
      city,
      q,
    };

    if (propertyMode === 'buy') {
      params.listing_type = 'buy';
      params.property_category = propertyBuyType === 'land_plot' ? 'land_plot' : 'residential';
      params.ad_type = 'resale';
      if (propertyBuyType === 'full_house') {
        if (buyBhkSelected.length) params.bhk = buyBhkSelected.join(',');
        if (buyPropertyStatus) params.property_status = buyPropertyStatus;
        params.new_builder_project = buyNewBuilderProjects ? '1' : '0';
      }
    }

    if (propertyMode === 'rent') {
      params.listing_type = 'rent';
      params.property_category = 'residential';
      // DB stores residential full-house rentals as ad_type='rent' (not 'full_house').
      params.ad_type = propertyRentType === 'full_house' ? 'rent' : propertyRentType;
      if (propertyRentType === 'full_house') {
        if (rentFullHouseBhkSelected.length) params.bhk = rentFullHouseBhkSelected.join(',');
      } else if (propertyRentType === 'pg_hostel') {
        if (rentPgTenantType) params.pg_tenant_type = rentPgTenantType;
        if (rentPgRoomType) params.pg_room_type = rentPgRoomType;
      } else if (propertyRentType === 'flatmates') {
        if (rentFlatmatesTenantTypes.length) params.flatmates_tenant_type = rentFlatmatesTenantTypes.join(',');
        if (rentFlatmatesRoomType) params.flatmates_room_type = rentFlatmatesRoomType;
      }
    }

    if (propertyMode === 'commercial') {
      params.listing_type = 'commercial';
      params.property_category = 'commercial';
      params.ad_type = propertyCommercialTxn === 'buy' ? 'sale' : 'rent';
      if (commercialPropertyTypes.length) params.property_type = commercialPropertyTypes.join(',');
      if (propertyCommercialTxn === 'buy' && commercialAvailability) params.commercial_availability = commercialAvailability;
    }

    router.push({ pathname: '/properties', params } as any);
  };

  const addPropertySelectedLocality = (label: string) => {
    const next = String(label ?? '').trim();
    if (!next) return;
    setPropertySelectedLocalities((prev) => {
      if (prev.length >= 3) return prev;
      if (prev.some((x) => x.trim().toLowerCase() === next.toLowerCase())) return prev;
      return [...prev, next];
    });
    setTopSearch('');
    setPropertyLocalitySuggestions([]);
  };

  const removePropertySelectedLocality = (label: string) => {
    setPropertySelectedLocalities((prev) => prev.filter((x) => x !== label));
  };

  React.useEffect(() => {
    setPropertySelectedLocalities([]);
    setPropertyLocalitySuggestions([]);
    setTopSearch('');
  }, [propertyState, propertyCity]);

  React.useEffect(() => {
    let active = true;
    if (activeService !== 'property') {
      setPropertyLocalitySuggestions([]);
      setPropertyLocalityRawDebug('');
      return;
    }

    if (suppressNextPropertyLocalitySuggestRef.current) {
      suppressNextPropertyLocalitySuggestRef.current = false;
      return;
    }

    const q = topSearch.trim();
    if (propertySelectedLocalities.length >= 3 || !q || q.length < 2) {
      setPropertyLocalitySuggestions([]);
      setPropertyLocalityRawDebug('');
      return;
    }

    const normalizeLocalityToken = (s: string) =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/v/g, 'w');

    const qLower = q.toLowerCase();
    const qNorm = normalizeLocalityToken(q);

    const handle = setTimeout(() => {
      void (async () => {
        try {
          setPropertyLocalityLoading(true);
          const cityLower = String(propertyCity ?? '').trim().toLowerCase();
          const stateLower = String(propertyState ?? '').trim().toLowerCase();

          let proximity: [number, number] | undefined;
          let bbox: [number, number, number, number] | undefined;
          if (cityLower && stateLower) {
            const key = `${cityLower}|${stateLower}`;
            const cached = propertyCityCentersRef.current[key];
            if (cached) {
              proximity = cached;
            } else {
              try {
                const cityLookup = await searchPlaces(`${propertyCity}, ${propertyState}`.trim(), {
                  limit: 1,
                  types: ['place'],
                });
                const center = (cityLookup?.[0]?.center ?? null) as any;
                const lookedBbox = (cityLookup?.[0] as any)?.bbox ?? null;
                if (Array.isArray(center) && center.length === 2) {
                  proximity = [Number(center[0]), Number(center[1])];
                  propertyCityCentersRef.current[key] = proximity;
                }
                if (Array.isArray(lookedBbox) && lookedBbox.length === 4) {
                  bbox = [Number(lookedBbox[0]), Number(lookedBbox[1]), Number(lookedBbox[2]), Number(lookedBbox[3])];
                }
              } catch {
              }
            }
          }

          const results = await searchPlaces(`${q}, ${propertyCity || ''} ${propertyState || ''}`.trim(), {
            limit: 20,
            types: ['poi', 'neighborhood', 'locality', 'place', 'district', 'address'],
            proximity,
            bbox,
          });
          if (!active) return;

          try {
            const slim = (results ?? []).slice(0, 8).map((r: any) => ({
              id: r?.id,
              text: r?.text,
              place_type: r?.place_type,
              place_name: r?.place_name,
              center: r?.center,
              context: Array.isArray(r?.context) ? r.context.map((c: any) => c?.text).filter(Boolean) : [],
            }));
            setPropertyLocalityRawDebug(JSON.stringify(slim, null, 2));
          } catch {
            setPropertyLocalityRawDebug('');
          }

          const allowedTypes = new Set(['poi', 'neighborhood', 'locality', 'place', 'district', 'address']);
          const picked = results
            .filter((x) => {
              const placeTypes = ((x as any)?.place_type ?? []) as string[];
              const hasAllowedType = placeTypes.some((t) => allowedTypes.has(String(t)));
              if (!hasAllowedType) return false;
              const name = String((x as any)?.place_name ?? '').toLowerCase();
              if (stateLower && !name.includes(stateLower)) return false;
              if (cityLower) {
                const ctx = ((x as any)?.context ?? []) as { text?: string }[];
                const ctxText = ctx.map((c) => String(c?.text ?? '').toLowerCase()).filter(Boolean);
                const ctxHasCity = ctxText.some((t) => t.includes(cityLower));
                if (!name.includes(cityLower) && !ctxHasCity) return false;
              }
              return true;
            })
            .map((x) => {
              const place = String((x as any)?.place_name ?? '').trim();
              const textLabel = String((x as any)?.text ?? '').trim();
              const placeNameLower = place.toLowerCase();
              const textLower = textLabel.toLowerCase();
              const ctx = ((x as any)?.context ?? []) as { text?: string }[];
              const ctxParts = ctx.map((c) => String(c?.text ?? '').trim()).filter(Boolean);
              const placeParts = place
                .split(/,|•/g)
                .map((p) => p.trim())
                .filter(Boolean);
              const candidates = Array.from(new Set([...ctxParts, ...placeParts, textLabel].filter(Boolean)));

              const isBadPrefix = (s: string) => {
                const v = s.trim().toLowerCase();
                return (
                  v.startsWith('near ') ||
                  v.startsWith('opp') ||
                  v.startsWith('opposite') ||
                  v.startsWith('beside') ||
                  v.startsWith('behind') ||
                  v.startsWith('in front of')
                );
              };

              const qMatches = (s: string) => normalizeLocalityToken(s).includes(qNorm);
              const bestCandidate = candidates
                .filter((c) => qMatches(c))
                .sort((a, b) => {
                  const aNorm = normalizeLocalityToken(a);
                  const bNorm = normalizeLocalityToken(b);
                  const aStarts = aNorm.startsWith(qNorm) ? 1 : 0;
                  const bStarts = bNorm.startsWith(qNorm) ? 1 : 0;
                  if (aStarts !== bStarts) return bStarts - aStarts;
                  const aBad = isBadPrefix(a) ? 1 : 0;
                  const bBad = isBadPrefix(b) ? 1 : 0;
                  if (aBad !== bBad) return aBad - bBad;
                  return a.length - b.length;
                })[0];

              let label = bestCandidate || textLabel || place.split(',')[0]?.trim() || place;

              let full = place;
              const labelLowerForFull = label.toLowerCase();
              const matchIndex = placeParts.findIndex((p) => p.toLowerCase() === labelLowerForFull);
              if (matchIndex >= 0) {
                full = placeParts.slice(matchIndex).join(', ');
              } else {
                const containsIndex = placeParts.findIndex((p) => p.toLowerCase().includes(labelLowerForFull));
                if (containsIndex >= 0) full = placeParts.slice(containsIndex).join(', ');
              }

              const placeTypes = ((x as any)?.place_type ?? []) as string[];
              const ctxText = ctx.map((c) => String(c?.text ?? '').toLowerCase()).filter(Boolean);
              const fullLower = full.toLowerCase();
              const labelLower = label.toLowerCase();
              const fullNorm = normalizeLocalityToken(full);
              const labelNorm = normalizeLocalityToken(label);
              const textNorm = normalizeLocalityToken(textLabel);
              let score = 0;
              const matchesQuery =
                labelNorm.includes(qNorm) ||
                fullNorm.includes(qNorm) ||
                textNorm.includes(qNorm) ||
                ctxText.some((t) => normalizeLocalityToken(t).includes(qNorm));
              if (!matchesQuery) score -= 1000;
              if (labelNorm.startsWith(qNorm)) score += 40;
              else if (fullNorm.startsWith(qNorm)) score += 20;
              if (isBadPrefix(labelLower) && ctxText.some((t) => normalizeLocalityToken(t).includes(qNorm))) score -= 15;
              const isAddress = placeTypes.includes('address');
              if (isAddress && isBadPrefix(textLower) && labelLower === textLower) score -= 1000;
              if (cityLower) {
                const ctxHasCity = ctxText.some((t) => t.includes(cityLower));
                if (fullLower.includes(cityLower) || labelLower.includes(cityLower) || ctxHasCity) score += 20;
                else score -= 200;
              }
              if (placeTypes.includes('poi')) score += 12;
              if (placeTypes.includes('neighborhood')) score += 10;
              if (placeTypes.includes('locality')) score += 9;
              if (placeTypes.includes('address')) score += 2;
              if (placeTypes.includes('place')) score -= 6;
              if (labelLower.includes('police')) score += 25;
              if (labelLower.includes('railway')) score += 22;
              if (labelLower.includes('station')) score += 14;
              if (labelLower.includes('metro')) score += 12;
              return { id: String((x as any)?.id ?? place), label, full, score };
            })
            .filter((x) => x.score > -500)
            .filter((x) => {
              const labelLower = x.label.trim().toLowerCase();
              if (cityLower && labelLower === cityLower) return false;
              if (stateLower && labelLower === stateLower) return false;
              return true;
            })
            .sort((a, b) => b.score - a.score)
            .slice(0, 6)
            .map(({ id, label, full }) => ({ id, label, full }));

          setPropertyLocalitySuggestions(picked);
        } catch {
          if (!active) return;
          setPropertyLocalitySuggestions([]);
          setPropertyLocalityRawDebug('');
        } finally {
          if (!active) return;
          setPropertyLocalityLoading(false);
        }
      })();
    }, 350);

    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [topSearch, propertyState, propertyCity, activeService, propertySelectedLocalities.length]);

  const buyBhkOptions = React.useMemo(() => ['1 RK', '1 BHK', '2 BHK', '3 BHK', '4 BHK'] as const, []);
  const rentBhkOptions = React.useMemo(() => ['1 RK', '1 BHK', '2 BHK', '3 BHK', '4 BHK', '4+ BHK'] as const, []);
  const commercialPropertyTypeOptions = React.useMemo(
    () =>
      [
        'Office Space',
        'Co-Working',
        'Shop',
        'Showroom',
        'Industrial Building',
        'Industrial Shed',
        'Godown/Warehouse',
        'Other Business',
        'Restaurant',
        'Cafe',
      ] as const,
    []
  );

  const formatSelection = (values: string[], emptyLabel = 'Select') => {
    if (!values.length) return emptyLabel;
    if (values.length <= 2) return values.join(', ');
    return `${values.slice(0, 2).join(', ')} +${values.length - 2}`;
  };

  const toggleMultiValue = (current: string[], value: string) => {
    if (current.includes(value)) return current.filter((x) => x !== value);
    return [...current, value];
  };

  const pickerConfig = React.useMemo(() => {
    if (!pickerOpen) return null;
    switch (pickerOpen) {
      case 'buy_bhk':
        return {
          title: 'Select BHK Type',
          mode: 'multi' as const,
          options: [...buyBhkOptions],
          selected: buyBhkSelected,
          onToggle: (v: string) => setBuyBhkSelected((cur) => toggleMultiValue(cur, v)),
        };
      case 'buy_status':
        return {
          title: 'Select Property Status',
          mode: 'single' as const,
          options: [
            { label: 'Under Construction', value: 'under_construction' },
            { label: 'Ready', value: 'ready' },
          ],
          selected: buyPropertyStatus,
          onSelect: (v: 'under_construction' | 'ready') => setBuyPropertyStatus(v),
        };
      case 'rent_fullhouse_bhk':
        return {
          title: 'Select BHK Type',
          mode: 'multi' as const,
          options: [...rentBhkOptions],
          selected: rentFullHouseBhkSelected,
          onToggle: (v: string) => setRentFullHouseBhkSelected((cur) => toggleMultiValue(cur, v)),
        };
      case 'rent_pg_tenant':
        return {
          title: 'Select Tenant Type',
          mode: 'single' as const,
          options: [
            { label: 'Male', value: 'male' },
            { label: 'Female', value: 'female' },
            { label: 'Anyone', value: 'anyone' },
          ],
          selected: rentPgTenantType,
          onSelect: (v: 'male' | 'female' | 'anyone') => setRentPgTenantType(v),
        };
      case 'rent_pg_room':
        return {
          title: 'Select Room Type',
          mode: 'single' as const,
          options: [
            { label: 'Single Room', value: 'single_room' },
            { label: 'Double Sharing', value: 'double_sharing' },
            { label: 'Triple Sharing', value: 'triple_sharing' },
            { label: 'Four Sharing', value: 'four_sharing' },
          ],
          selected: rentPgRoomType,
          onSelect: (v: 'single_room' | 'double_sharing' | 'triple_sharing' | 'four_sharing') => setRentPgRoomType(v),
        };
      case 'rent_flatmates_tenant':
        return {
          title: 'Select Tenant Type',
          mode: 'multi' as const,
          options: ['Male', 'Female'],
          selected: rentFlatmatesTenantTypes.map((x) => (x === 'male' ? 'Male' : 'Female')),
          onToggle: (label: string) =>
            setRentFlatmatesTenantTypes((cur) => {
              const value = label === 'Male' ? 'male' : 'female';
              if (cur.includes(value)) return cur.filter((x) => x !== value);
              return [...cur, value];
            }),
        };
      case 'rent_flatmates_room':
        return {
          title: 'Select Room Type',
          mode: 'single' as const,
          options: [
            { label: 'Single Room', value: 'single_room' },
            { label: 'Shared Room', value: 'shared_room' },
          ],
          selected: rentFlatmatesRoomType,
          onSelect: (v: 'single_room' | 'shared_room') => setRentFlatmatesRoomType(v),
        };
      case 'commercial_property_type':
        return {
          title: 'Select Property Type',
          mode: 'multi' as const,
          options: [...commercialPropertyTypeOptions],
          selected: commercialPropertyTypes,
          onToggle: (v: string) => setCommercialPropertyTypes((cur) => toggleMultiValue(cur, v)),
        };
      case 'commercial_availability':
        return {
          title: 'Select Availability',
          mode: 'single' as const,
          options: [
            { label: 'Immediate', value: 'immediate' },
            { label: 'Within 15 Days', value: 'within_15_days' },
            { label: 'Within 30 Days', value: 'within_30_days' },
            { label: 'After 30 Days', value: 'after_30_days' },
          ],
          selected: commercialAvailability,
          onSelect: (v: 'immediate' | 'within_15_days' | 'within_30_days' | 'after_30_days') => setCommercialAvailability(v),
        };
      default:
        return null;
    }
  }, [
    pickerOpen,
    buyBhkOptions,
    rentBhkOptions,
    commercialPropertyTypeOptions,
    buyBhkSelected,
    buyPropertyStatus,
    rentFullHouseBhkSelected,
    rentPgTenantType,
    rentPgRoomType,
    rentFlatmatesTenantTypes,
    rentFlatmatesRoomType,
    commercialPropertyTypes,
    commercialAvailability,
  ]);

  const handleOpenQuote = () => {
    setQuoteName(profile?.name?.trim() || String((session?.user?.user_metadata as any)?.name ?? '').trim() || '');
    setQuotePhone(String(profile?.phone ?? '').replace(/\D/g, '').slice(0, 10));
    setQuoteEmail(String(profile?.email ?? session?.user?.email ?? '').trim());
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
      const metadata = {
        device: Platform.OS,
        browser:
          typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string'
            ? navigator.userAgent
            : undefined,
        os: Platform.OS,
        language:
          typeof navigator !== 'undefined' && typeof navigator.language === 'string'
            ? navigator.language
            : undefined,
        timezone:
          typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function'
            ? Intl.DateTimeFormat().resolvedOptions().timeZone
            : undefined,
      };

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
              metadata,
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
        setQuoteSubmitNotice('Request submitted successfully. Our executive will call within 10 minutes.');
        Alert.alert('Request submitted', 'Your quote request has been sent. We will contact you shortly.');
      } else {
        setQuoteSubmitNotice('Request submitted successfully. Our executive will call within 10 minutes.');
        Alert.alert('Request submitted', 'Your quote request has been sent. We will contact you shortly.');
      }
      setQuoteName('');
      setQuotePhone('');
      setQuoteEmail('');
      setQuoteService('');
      setQuoteMessage('');
      // keep the modal open so the user can see the success message and re-submit if needed
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
  body { margin: 0; padding: 0; font-family: 'Times New Roman', Times, serif; background: #fff; }
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
  .icon { width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; }
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
          <div class="row">
            <span class="icon">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="#2563EB" xmlns="http://www.w3.org/2000/svg"><path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 011 1V20a1 1 0 01-1 1C10.07 21 3 13.93 3 5a1 1 0 011-1h3.5a1 1 0 011 1c0 1.24.2 2.45.57 3.57a1 1 0 01-.24 1.02l-2.2 2.2z"/></svg>
            </span>
            <span class="phone">+91 9987963470</span>
          </div>
          <div class="row">
            <span class="icon">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="#22C55E" xmlns="http://www.w3.org/2000/svg"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
            </span>
            <span>info@gujaratrelocation.com</span>
          </div>
          <div class="row">
            <span class="icon">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="#EF4444" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"/></svg>
            </span>
            <span>Sethia Aashray, Mumbai 400101</span>
          </div>
          <div class="row"><span>🕐</span><span class="muted">24x7 Service Available</span></div>
        </div>
        <div class="qrWrap">
          ${qrSvg ? '<div class="qr">' + qrSvg + '</div>' : '<div class="muted">QR unavailable</div>'}
          <div class="muted" style="margin-top: 8px;">Scan to Call</div>
        </div>
      </div>
      <div class="tagWrap"><div class="tag">White-glove relocation • GPS tracking</div></div>
      <div class="footer">www.gujaratrelocation.com • 2026 GujaratRelocationMoversPackers</div>
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
      <StickyHeader
        theme={theme}
        isSmallScreen={isSmallScreen}
        isDarkMode={isDarkMode}
        toggleTheme={toggleTheme}
        session={session}
        unreadCount={unreadCount}
        canManage={canManage}
        MaterialIcons={MaterialIcons}
        onHomePress={() => router.push('/home')}
        onServicesPress={() => scrollToSection('services')}
        onContactPress={() => scrollToSection('contact')}
        onDashboardPress={handleDashboardSafe}
        onProfilePress={() => router.push('/auth/profile')}
        onLogout={handleLogout}
        onLoginPress={() => router.push('/auth/login')}
      />

      <ScrollView
        ref={(ref) => {
          scrollRef.current = ref;
        }}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: (isSmallScreen ? 70 : 86) + statusBarHeight,
            paddingHorizontal: isSmallScreen ? 14 : 24,
            paddingBottom: isSmallScreen ? 8 : 24,
          },
        ]}
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
        scrollEventThrottle={16}
        onScroll={(e) => { scrollOffsetRef.current = e.nativeEvent.contentOffset.y; }}>
        <YStack>

          <XStack justifyContent="center" alignItems="center" marginTop={isSmallScreen ? 3 : 6}>
            <YStack alignItems="center" gap="$3" width="100%">
              <ImageBackground
                source={heroSlides[heroIndex]?.image}
                style={[styles.heroBg, isSmallScreen && styles.heroBgMobile]}
                imageStyle={styles.heroBgImage}
                {...heroPanResponder.panHandlers}>
                <YStack
                  style={[styles.heroOverlay, isSmallScreen && styles.heroOverlayMobile]}
                  alignItems="center"
                  justifyContent="center"
                  gap={isSmallScreen ? '$2' : '$3.5'}>
                  <YStack alignItems="center" gap={isSmallScreen ? '$1' : '$2.5'} marginTop={isSmallScreen ? 8 : 0}>
                    <YStack
                      backgroundColor="rgba(255,255,255,0.14)"
                      paddingHorizontal={isSmallScreen ? 13 : 20}
                      paddingVertical={isSmallScreen ? 5 : 10}
                      borderRadius={isSmallScreen ? 12 : 16}
                      borderWidth={1.5}
                      borderColor="rgba(255,255,255,0.4)">
                      <Text
                        color="#FBBF24"
                        fontSize={isSmallScreen ? t(10) : t(13)}
                        fontWeight="900"
                        lineHeight={isSmallScreen ? 12 : 18}
                        style={{ fontFamily: APP_SERIF_FONT }}>
                        Since 2006
                      </Text>
                      <Text
                        color="#FFFFFF"
                        fontSize={isSmallScreen ? t(10) : t(13)}
                        fontWeight="800"
                        lineHeight={isSmallScreen ? 12 : 18}
                        style={{ fontFamily: APP_SERIF_FONT }}>
                        18+ Years of Excellence
                      </Text>
                    </YStack>

                    <H1
                      color="#FFFFFF"
                      fontSize={isSmallScreen ? t(25) : t(48)}
                      textAlign={isSmallScreen ? 'center' : 'left'}
                      fontWeight="900"
                      lineHeight={isSmallScreen ? 29 : 58}
                      style={{ fontFamily: APP_SERIF_FONT }}>
                      {heroSlides[heroIndex]?.title}
                    </H1>

                    <Paragraph
                      color="#F1F5F9"
                      textAlign={isSmallScreen ? 'center' : 'left'}
                      fontSize={isSmallScreen ? t(11) : t(16)}
                      fontWeight="700"
                      lineHeight={isSmallScreen ? 15 : 24}
                      paddingHorizontal={isSmallScreen ? 10 : 0}
                      style={{ fontFamily: APP_SERIF_FONT }}>
                      {heroSlides[heroIndex]?.subtitle}
                    </Paragraph>
                  </YStack>

                  {heroSlides[heroIndex]?.key === 'slide-4' ? (
                    <XStack
                      flexWrap="wrap"
                      gap={isSmallScreen ? '$2' : '$2.5'}
                      justifyContent="center"
                      alignItems="center"
                      marginTop={isSmallScreen ? 4 : 10}
                      maxWidth={isSmallScreen ? 236 : undefined}>
                      <AppButton
                        label="Shifting"
                        onPress={() => {
                          setActiveService('shifting');
                          scrollToServiceMenu();
                        }}
                        backgroundColor="#F59E0B"
                        textColor="#FFFFFF"
                        containerStyle={[styles.heroCta, isSmallScreen && styles.heroCtaMobile]}
                        labelStyle={{ fontFamily: APP_SERIF_FONT, fontSize: isSmallScreen ? 14 : 20, fontWeight: '900' }}
                        glowOnHover
                      />
                      <AppButton
                        label="Home Services"
                        onPress={() => {
                          setActiveService('home_services');
                          scrollToServiceMenu();
                        }}
                        backgroundColor="#3B82F6"
                        textColor="#FFFFFF"
                        containerStyle={[styles.heroCta, isSmallScreen && styles.heroCtaMobileWide]}
                        labelStyle={{ fontFamily: APP_SERIF_FONT, fontSize: isSmallScreen ? 14 : 20, fontWeight: '900' }}
                        glowOnHover
                      />
                      <AppButton
                        label="Property"
                        onPress={() => {
                          setActiveService('property');
                          scrollToServiceMenu();
                        }}
                        backgroundColor="#22C55E"
                        textColor="#FFFFFF"
                        containerStyle={[styles.heroCta, isSmallScreen && styles.heroCtaMobile]}
                        labelStyle={{ fontFamily: APP_SERIF_FONT, fontSize: isSmallScreen ? 14 : 20, fontWeight: '900' }}
                        glowOnHover
                      />
                    </XStack>
                  ) : (
                    <XStack
                      flexWrap="wrap"
                      gap={isSmallScreen ? '$2' : '$2.5'}
                      justifyContent="center"
                      alignItems="center"
                      marginTop={isSmallScreen ? 4 : 10}
                      maxWidth={isSmallScreen ? 236 : undefined}>
                      <AppButton
                        label="Call Now"
                        onPress={handleCallNow}
                        backgroundColor="#12a3a3ff"
                        textColor="#FFFFFF"
                        containerStyle={[styles.heroCta, isSmallScreen && styles.heroCtaMobile]}
                        labelStyle={{ fontFamily: APP_SERIF_FONT, fontSize: isSmallScreen ? 14 : 20, fontWeight: '900' }}
                        glowOnHover
                      />
                      <AppButton
                        label="WhatsApp"
                        onPress={handleWhatsApp}
                        backgroundColor="#22C55E"
                        textColor="#FFFFFF"
                        containerStyle={[styles.heroCta, isSmallScreen && styles.heroCtaMobile]}
                        labelStyle={{ fontFamily: APP_SERIF_FONT, fontSize: isSmallScreen ? 14 : 20, fontWeight: '900' }}
                        glowOnHover
                      />
                      <AppButton
                        label="Get Quote"
                        onPress={handleOpenQuote}
                        backgroundColor="#3a53e2ff"
                        textColor="#FFFFFF"
                        containerStyle={[styles.heroCta, isSmallScreen && styles.heroCtaMobile]}
                        labelStyle={{ fontFamily: APP_SERIF_FONT, fontSize: isSmallScreen ? 14 : 20, fontWeight: '900' }}
                        glowOnHover
                      />
                    </XStack>
                  )}

                  <XStack gap="$2.5" justifyContent="center" alignItems="center" marginTop={isSmallScreen ? 2 : 12}>
                    {heroSlides.map((s, i) => (
                      <Pressable key={s.key} onPress={() => setHeroIndex(i)}>
                        <View style={[styles.heroDot, i === heroIndex && styles.heroDotActive]} />
                      </Pressable>
                    ))}
                  </XStack>
                </YStack>
              </ImageBackground>

              <View
                style={{ width: '100%', alignItems: 'center' }}
                onLayout={(e) => {
                  sectionOffsetsRef.current.serviceMenu = e.nativeEvent.layout.y;
                }}>
                <YStack
                  marginTop={16}
                  width={isSmallScreen ? '100%' : 720}
                  maxWidth="100%"
                  backgroundColor={theme.bgCard}
                  borderRadius={20}
                  padding={isSmallScreen ? 12 : 18}
                  borderWidth={1}
                  borderColor={theme.border}
                  shadowColor="#000"
                  shadowOffset={{ width: 0, height: 4 }}
                  shadowOpacity={0.08}
                  shadowRadius={12}
                  elevation={4}
                  gap="$2.5">
                  <Text
                    color={theme.text}
                    fontSize={isSmallScreen ? t(16) : t(19)}
                    fontWeight="900"
                    letterSpacing={0.3}
                    style={{ fontFamily: APP_SERIF_FONT }}>
                    What are you looking for?
                  </Text>
                  <XStack gap={isSmallScreen ? '$2' : '$3'} justifyContent="space-between" flexWrap="nowrap" width="100%">
                    {serviceMenuItems.map((item) => {
                      const selected = activeService === item.key;
                      return (
                        <Pressable
                          key={item.key}
                          onPress={() => setActiveService(item.key)}
                          style={{ flex: 1, minWidth: 0 } as any}>
                          <YStack
                            style={[
                              styles.serviceMenuCard,
                              {
                                backgroundColor: selected ? theme.primary : theme.bgCardSecondary,
                                borderColor: selected ? '#FBBF24' : theme.border,
                                shadowColor: selected ? theme.primary : 'rgba(0,0,0,0.12)',
                                shadowOpacity: selected ? 0.35 : 0.1,
                                shadowRadius: selected ? 14 : 8,
                                shadowOffset: { width: 0, height: selected ? 8 : 3 },
                                elevation: selected ? 10 : 4,
                              },
                            ]}>
                            <YStack
                              width={isSmallScreen ? 40 : 52}
                              height={isSmallScreen ? 40 : 52}
                              borderRadius={14}
                              backgroundColor={selected ? 'rgba(255,255,255,0.2)' : theme.bgCard}
                              alignItems="center"
                              justifyContent="center"
                              borderWidth={selected ? 0 : 1}
                              borderColor={theme.border}>
                              <FontAwesome5
                                name={item.icon as any}
                                size={isSmallScreen ? 18 : 24}
                                color={selected ? '#FFFFFF' : theme.primary}
                              />
                            </YStack>
                            <YStack alignItems="center" gap={1}>
                              {item.label.split('\n').map((line, i) => (
                                <Text
                                  key={i}
                                  color={selected ? '#FFFFFF' : theme.text}
                                  fontSize={isSmallScreen ? t(11) : t(14)}
                                  fontWeight={selected ? '800' : '700'}
                                  lineHeight={isSmallScreen ? 13 : 17}
                                  textAlign="center"
                                  style={{ fontFamily: APP_SERIF_FONT }}>
                                  {line}
                                </Text>
                              ))}
                            </YStack>
                          </YStack>
                        </Pressable>
                      );
                    })}
                  </XStack>

                {activeService === 'property' ? (
                  <YStack
                    backgroundColor={theme.bgSecondary}
                    borderRadius={16}
                    padding={12}
                    borderWidth={1}
                    borderColor={theme.border}
                    gap="$2">
                    <XStack gap="$2" justifyContent="space-between" flexWrap="wrap">
                    <Button
                      flex={1}
                      minWidth={isSmallScreen ? '30%' : 160}
                      backgroundColor={propertyMode === 'buy' ? theme.primary : theme.bgCard}
                      color={propertyMode === 'buy' ? '#FFFFFF' : theme.text}
                      borderWidth={1}
                      borderColor={theme.border}
                      hoverStyle={{ backgroundColor: '#22C55E', borderColor: '#FBBF24', color: '#FFFFFF', boxShadow: '0 0 10px 3px rgba(251, 191, 36, 0.5)' } as any}
                      pressStyle={{ backgroundColor: '#16A34A', borderColor: '#16A34A', color: '#FFFFFF' } as any}
                      focusStyle={{ backgroundColor: '#22C55E', borderColor: '#22C55E', color: '#FFFFFF' } as any}
                      onPress={() => setPropertyMode('buy')}>
                      Buy
                    </Button>
                    <Button
                      flex={1}
                      minWidth={isSmallScreen ? '30%' : 160}
                      backgroundColor={propertyMode === 'rent' ? theme.primary : theme.bgCard}
                      color={propertyMode === 'rent' ? '#FFFFFF' : theme.text}
                      borderWidth={1}
                      borderColor={theme.border}
                      hoverStyle={{ backgroundColor: '#22C55E', borderColor: '#FBBF24', color: '#FFFFFF', boxShadow: '0 0 10px 3px rgba(251, 191, 36, 0.5)' } as any}
                      pressStyle={{ backgroundColor: '#16A34A', borderColor: '#16A34A', color: '#FFFFFF' } as any}
                      focusStyle={{ backgroundColor: '#22C55E', borderColor: '#22C55E', color: '#FFFFFF' } as any}
                      onPress={() => setPropertyMode('rent')}>
                      Rent
                    </Button>
                    <Button
                      flex={1}
                      minWidth={isSmallScreen ? '30%' : 160}
                      backgroundColor={propertyMode === 'commercial' ? theme.primary : theme.bgCard}
                      color={propertyMode === 'commercial' ? '#FFFFFF' : theme.text}
                      borderWidth={1}
                      borderColor={theme.border}
                      hoverStyle={{ backgroundColor: '#22C55E', borderColor: '#FBBF24', color: '#FFFFFF', boxShadow: '0 0 10px 3px rgba(251, 191, 36, 0.5)' } as any}
                      pressStyle={{ backgroundColor: '#16A34A', borderColor: '#16A34A', color: '#FFFFFF' } as any}
                      focusStyle={{ backgroundColor: '#22C55E', borderColor: '#22C55E', color: '#FFFFFF' } as any}
                      onPress={() => setPropertyMode('commercial')}>
                      Commercial
                    </Button>
                    </XStack>

                    {propertyMode === 'buy' ? (
                      <YStack gap="$2">
                        <XStack gap="$2" flexWrap="wrap" alignItems="center">
                          <Pressable onPress={() => setPropertyBuyType('full_house')}>
                            <XStack gap="$2" alignItems="center">
                              <View style={[styles.radioOuter, propertyBuyType === 'full_house' && styles.radioOuterActive]}>
                                {propertyBuyType === 'full_house' ? <View style={styles.radioInner} /> : null}
                              </View>
                              <Text color={theme.text} fontSize={t(12)} fontWeight="800" style={{ fontFamily: APP_SERIF_FONT }}>
                                House Property{propertyBuyType === 'full_house' && buyBhkSelected.length ? ` (${formatSelection(buyBhkSelected)})` : ''}
                              </Text>
                            </XStack>
                          </Pressable>
                          <Pressable onPress={() => setPropertyBuyType('land_plot')}>
                            <XStack gap="$2" alignItems="center">
                              <View style={[styles.radioOuter, propertyBuyType === 'land_plot' && styles.radioOuterActive]}>
                                {propertyBuyType === 'land_plot' ? <View style={styles.radioInner} /> : null}
                              </View>
                              <Text color={theme.text} fontSize={t(12)} fontWeight="800" style={{ fontFamily: APP_SERIF_FONT }}>
                                Land/Plot
                              </Text>
                            </XStack>
                          </Pressable>
                        </XStack>

                        {propertyBuyType === 'full_house' ? (
                          <YStack gap="$2">
                            <XStack gap="$2" flexWrap="wrap" justifyContent="space-between">
                              <Pressable onPress={() => setPickerOpen('buy_bhk')} style={{ flexBasis: isSmallScreen ? '100%' : '32%' } as any}>
                                <YStack backgroundColor={theme.bgCard} borderRadius={12} padding={12} borderWidth={1} borderColor={theme.border}>
                                  <Text color={theme.textMuted} fontSize={t(11)} fontWeight="800" style={{ fontFamily: APP_SERIF_FONT }}>
                                    BHK Type
                                  </Text>
                                  <Text color={theme.text} fontSize={t(12)} fontWeight="900" style={{ fontFamily: APP_SERIF_FONT }}>
                                    {formatSelection(buyBhkSelected)}
                                  </Text>
                                </YStack>
                              </Pressable>

                              <Pressable onPress={() => setPickerOpen('buy_status')} style={{ flexBasis: isSmallScreen ? '100%' : '32%' } as any}>
                                <YStack backgroundColor={theme.bgCard} borderRadius={12} padding={12} borderWidth={1} borderColor={theme.border}>
                                  <Text color={theme.textMuted} fontSize={t(11)} fontWeight="800" style={{ fontFamily: APP_SERIF_FONT }}>
                                    Property Status
                                  </Text>
                                  <Text color={theme.text} fontSize={t(12)} fontWeight="900" style={{ fontFamily: APP_SERIF_FONT }}>
                                    {buyPropertyStatus === 'under_construction' ? 'Under Construction' : buyPropertyStatus === 'ready' ? 'Ready' : 'Select'}
                                  </Text>
                                </YStack>
                              </Pressable>

                              <Pressable
                                onPress={() => setBuyNewBuilderProjects((v) => !v)}
                                style={{ flexBasis: isSmallScreen ? '100%' : '32%' } as any}>
                                <YStack
                                  backgroundColor={theme.bgCard}
                                  borderRadius={12}
                                  padding={12}
                                  borderWidth={1}
                                  borderColor={theme.border}
                                  gap={8}>
                                  <XStack alignItems="center" justifyContent="space-between" gap="$2">
                                    <Text color={theme.textMuted} fontSize={t(11)} fontWeight="800" style={{ fontFamily: APP_SERIF_FONT }}>
                                      New Builder Projects
                                    </Text>
                                    <View
                                      style={{
                                        width: 18,
                                        height: 18,
                                        borderRadius: 4,
                                        borderWidth: 1.5,
                                        borderColor: buyNewBuilderProjects ? '#10B981' : theme.border,
                                        backgroundColor: buyNewBuilderProjects ? '#10B981' : 'transparent',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                      }}>
                                      {buyNewBuilderProjects ? <Text color="#FFFFFF" fontSize={t(12)} fontWeight="900">✓</Text> : null}
                                    </View>
                                  </XStack>
                                  <Text color={theme.text} fontSize={t(12)} fontWeight="900" style={{ fontFamily: APP_SERIF_FONT }}>
                                    {buyNewBuilderProjects ? 'Yes' : 'No'}
                                  </Text>
                                </YStack>
                              </Pressable>
                            </XStack>
                          </YStack>
                        ) : null}
                      </YStack>
                    ) : null}

                    {propertyMode === 'rent' ? (
                      <YStack gap="$2">
                        <XStack gap="$2" flexWrap="wrap" alignItems="center">
                          <Pressable onPress={() => setPropertyRentType('full_house')}>
                            <XStack gap="$2" alignItems="center">
                              <View style={[styles.radioOuter, propertyRentType === 'full_house' && styles.radioOuterActive]}>
                                {propertyRentType === 'full_house' ? <View style={styles.radioInner} /> : null}
                              </View>
                              <Text color={theme.text} fontSize={t(12)} fontWeight="800" style={{ fontFamily: APP_SERIF_FONT }}>
                                House Property{propertyRentType === 'full_house' && rentFullHouseBhkSelected.length ? ` (${formatSelection(rentFullHouseBhkSelected)})` : ''}
                              </Text>
                            </XStack>
                          </Pressable>
                          <Pressable onPress={() => setPropertyRentType('pg_hostel')}>
                            <XStack gap="$2" alignItems="center">
                              <View style={[styles.radioOuter, propertyRentType === 'pg_hostel' && styles.radioOuterActive]}>
                                {propertyRentType === 'pg_hostel' ? <View style={styles.radioInner} /> : null}
                              </View>
                              <Text color={theme.text} fontSize={t(12)} fontWeight="800" style={{ fontFamily: APP_SERIF_FONT }}>
                                PG/Hostel
                              </Text>
                            </XStack>
                          </Pressable>
                          <Pressable onPress={() => setPropertyRentType('flatmates')}>
                            <XStack gap="$2" alignItems="center">
                              <View style={[styles.radioOuter, propertyRentType === 'flatmates' && styles.radioOuterActive]}>
                                {propertyRentType === 'flatmates' ? <View style={styles.radioInner} /> : null}
                              </View>
                              <Text color={theme.text} fontSize={t(12)} fontWeight="800" style={{ fontFamily: APP_SERIF_FONT }}>
                                Flatmates
                              </Text>
                            </XStack>
                          </Pressable>
                        </XStack>

                        {propertyRentType === 'full_house' ? (
                          <Pressable onPress={() => setPickerOpen('rent_fullhouse_bhk')}>
                            <YStack backgroundColor={theme.bgCard} borderRadius={12} padding={12} borderWidth={1} borderColor={theme.border}>
                              <Text color={theme.textMuted} fontSize={t(11)} fontWeight="800" style={{ fontFamily: APP_SERIF_FONT }}>
                                BHK Type
                              </Text>
                              <Text color={theme.text} fontSize={t(12)} fontWeight="900" style={{ fontFamily: APP_SERIF_FONT }}>
                                {formatSelection(rentFullHouseBhkSelected)}
                              </Text>
                            </YStack>
                          </Pressable>
                        ) : null}

                        {propertyRentType === 'pg_hostel' ? (
                          <XStack gap="$2" flexWrap="wrap" justifyContent="space-between">
                            <Pressable onPress={() => setPickerOpen('rent_pg_tenant')} style={{ flexBasis: isSmallScreen ? '100%' : '49%' } as any}>
                              <YStack backgroundColor={theme.bgCard} borderRadius={12} padding={12} borderWidth={1} borderColor={theme.border}>
                                <Text color={theme.textMuted} fontSize={t(11)} fontWeight="800" style={{ fontFamily: APP_SERIF_FONT }}>
                                  Tenant Type
                                </Text>
                                <Text color={theme.text} fontSize={t(12)} fontWeight="900" style={{ fontFamily: APP_SERIF_FONT }}>
                                  {rentPgTenantType ? rentPgTenantType[0].toUpperCase() + rentPgTenantType.slice(1) : 'Select'}
                                </Text>
                              </YStack>
                            </Pressable>
                            <Pressable onPress={() => setPickerOpen('rent_pg_room')} style={{ flexBasis: isSmallScreen ? '100%' : '49%' } as any}>
                              <YStack backgroundColor={theme.bgCard} borderRadius={12} padding={12} borderWidth={1} borderColor={theme.border}>
                                <Text color={theme.textMuted} fontSize={t(11)} fontWeight="800" style={{ fontFamily: APP_SERIF_FONT }}>
                                  Room Type
                                </Text>
                                <Text color={theme.text} fontSize={t(12)} fontWeight="900" style={{ fontFamily: APP_SERIF_FONT }}>
                                  {rentPgRoomType === 'single_room'
                                    ? 'Single Room'
                                    : rentPgRoomType === 'double_sharing'
                                      ? 'Double Sharing'
                                      : rentPgRoomType === 'triple_sharing'
                                        ? 'Triple Sharing'
                                        : rentPgRoomType === 'four_sharing'
                                          ? 'Four Sharing'
                                          : 'Select'}
                                </Text>
                              </YStack>
                            </Pressable>
                          </XStack>
                        ) : null}

                        {propertyRentType === 'flatmates' ? (
                          <XStack gap="$2" flexWrap="wrap" justifyContent="space-between">
                            <Pressable onPress={() => setPickerOpen('rent_flatmates_tenant')} style={{ flexBasis: isSmallScreen ? '100%' : '49%' } as any}>
                              <YStack backgroundColor={theme.bgCard} borderRadius={12} padding={12} borderWidth={1} borderColor={theme.border}>
                                <Text color={theme.textMuted} fontSize={t(11)} fontWeight="800" style={{ fontFamily: APP_SERIF_FONT }}>
                                  Tenant Type
                                </Text>
                                <Text color={theme.text} fontSize={t(12)} fontWeight="900" style={{ fontFamily: APP_SERIF_FONT }}>
                                  {rentFlatmatesTenantTypes.length ? rentFlatmatesTenantTypes.map((type) => type[0].toUpperCase() + type.slice(1)).join(', ') : 'Select'}
                                </Text>
                              </YStack>
                            </Pressable>
                            <Pressable onPress={() => setPickerOpen('rent_flatmates_room')} style={{ flexBasis: isSmallScreen ? '100%' : '49%' } as any}>
                              <YStack backgroundColor={theme.bgCard} borderRadius={12} padding={12} borderWidth={1} borderColor={theme.border}>
                                <Text color={theme.textMuted} fontSize={t(11)} fontWeight="800" style={{ fontFamily: APP_SERIF_FONT }}>
                                  Room Type
                                </Text>
                                <Text color={theme.text} fontSize={t(12)} fontWeight="900" style={{ fontFamily: APP_SERIF_FONT }}>
                                  {rentFlatmatesRoomType === 'single_room' ? 'Single Room' : rentFlatmatesRoomType === 'shared_room' ? 'Shared Room' : 'Select'}
                                </Text>
                              </YStack>
                            </Pressable>
                          </XStack>
                        ) : null}
                      </YStack>
                    ) : null}

                    {propertyMode === 'commercial' ? (
                      <YStack gap="$2">
                        <XStack gap="$2" flexWrap="wrap" alignItems="center">
                          <Pressable onPress={() => setPropertyCommercialTxn('rent')}>
                            <XStack gap="$2" alignItems="center">
                              <View style={[styles.radioOuter, propertyCommercialTxn === 'rent' && styles.radioOuterActive]}>
                                {propertyCommercialTxn === 'rent' ? <View style={styles.radioInner} /> : null}
                              </View>
                              <Text color={theme.text} fontSize={t(12)} fontWeight="800" style={{ fontFamily: APP_SERIF_FONT }}>
                                Rent
                              </Text>
                            </XStack>
                          </Pressable>
                          <Pressable onPress={() => setPropertyCommercialTxn('buy')}>
                            <XStack gap="$2" alignItems="center">
                              <View style={[styles.radioOuter, propertyCommercialTxn === 'buy' && styles.radioOuterActive]}>
                                {propertyCommercialTxn === 'buy' ? <View style={styles.radioInner} /> : null}
                              </View>
                              <Text color={theme.text} fontSize={t(12)} fontWeight="800" style={{ fontFamily: APP_SERIF_FONT }}>
                                Buy
                              </Text>
                            </XStack>
                          </Pressable>
                        </XStack>

                        <XStack gap="$2" flexWrap="wrap" justifyContent="space-between">
                          <Pressable
                            onPress={() => setPickerOpen('commercial_property_type')}
                            style={{ flexBasis: isSmallScreen ? '100%' : propertyCommercialTxn === 'buy' ? '49%' : '100%' } as any}>
                            <YStack backgroundColor={theme.bgCard} borderRadius={12} padding={12} borderWidth={1} borderColor={theme.border}>
                              <Text color={theme.textMuted} fontSize={t(11)} fontWeight="800" style={{ fontFamily: APP_SERIF_FONT }}>
                                Property Type
                              </Text>
                              <Text color={theme.text} fontSize={t(12)} fontWeight="900" style={{ fontFamily: APP_SERIF_FONT }}>
                                {formatSelection(commercialPropertyTypes)}
                              </Text>
                            </YStack>
                          </Pressable>

                          {propertyCommercialTxn === 'buy' ? (
                            <Pressable onPress={() => setPickerOpen('commercial_availability')} style={{ flexBasis: isSmallScreen ? '100%' : '49%' } as any}>
                              <YStack backgroundColor={theme.bgCard} borderRadius={12} padding={12} borderWidth={1} borderColor={theme.border}>
                                <Text color={theme.textMuted} fontSize={t(11)} fontWeight="800" style={{ fontFamily: APP_SERIF_FONT }}>
                                  Availability
                                </Text>
                                <Text color={theme.text} fontSize={t(12)} fontWeight="900" style={{ fontFamily: APP_SERIF_FONT }}>
                                  {commercialAvailability === 'immediate'
                                    ? 'Immediate'
                                    : commercialAvailability === 'within_15_days'
                                      ? 'Within 15 Days'
                                      : commercialAvailability === 'within_30_days'
                                        ? 'Within 30 Days'
                                        : commercialAvailability === 'after_30_days'
                                          ? 'After 30 Days'
                                          : 'Select'}
                                </Text>
                              </YStack>
                            </Pressable>
                          ) : null}
                        </XStack>
                      </YStack>
                    ) : null}

                    <XStack gap="$2" justifyContent="space-between" flexWrap="wrap">
                      <Pressable
                        onPress={() => setPropertyStatePickerOpen(true)}
                        style={{ flexBasis: isSmallScreen ? '100%' : '49%' } as any}>
                        <YStack
                          backgroundColor={theme.bgCard}
                          borderRadius={14}
                          padding={12}
                          borderWidth={1}
                          borderColor={theme.border}>
                          <Text color={theme.textMuted} fontSize={t(12)} fontWeight="800" style={{ fontFamily: APP_SERIF_FONT }}>
                            State
                          </Text>
                          <Text color={theme.text} fontSize={t(14)} fontWeight="900" style={{ fontFamily: APP_SERIF_FONT }}>
                            {propertyState}
                          </Text>
                        </YStack>
                      </Pressable>

                      <Pressable
                        onPress={() => setPropertyCityPickerOpen(true)}
                        style={{ flexBasis: isSmallScreen ? '100%' : '49%' } as any}>
                        <YStack
                          backgroundColor={theme.bgCard}
                          borderRadius={14}
                          padding={12}
                          borderWidth={1}
                          borderColor={theme.border}>
                          <Text color={theme.textMuted} fontSize={t(12)} fontWeight="800" style={{ fontFamily: APP_SERIF_FONT }}>
                            City
                          </Text>
                          <Text color={theme.text} fontSize={t(14)} fontWeight="900" style={{ fontFamily: APP_SERIF_FONT }}>
                            {propertyCity}
                          </Text>
                        </YStack>
                      </Pressable>
                    </XStack>

                    <XStack
                      width="100%"
                      backgroundColor={theme.bgCard}
                      borderRadius={16}
                      padding={12}
                      borderWidth={1}
                      borderColor={theme.border}
                      alignItems="center"
                      gap="$2">
                      <TextInput
                        value={topSearch}
                        onChangeText={(value) => {
                          if (propertySelectedLocalities.length < 3) setTopSearch(value);
                        }}
                        editable={propertySelectedLocalities.length < 3}
                        placeholder={propertySelectedLocalities.length >= 3 ? 'Maximum 3 localities selected' : 'Search upto 3 localities or landmarks'}
                        placeholderTextColor="#9CA3AF"
                        style={{
                          flex: 1,
                          height: 44,
                          borderRadius: 12,
                          paddingHorizontal: 14,
                          borderWidth: 1,
                          borderColor: theme.border,
                          color: theme.text,
                          fontFamily: APP_SERIF_FONT,
                        }}
                      />

                      <Button
                        backgroundColor="#5b0f78ff"
                        borderRadius={12}
                        paddingHorizontal={20}
                        height={50}
                        color="#FFFFFF"
                        hoverStyle={{ backgroundColor: '#4338CA', borderColor: '#FBBF24', color: '#FFFFFF', boxShadow: '0 0 10px 3px rgba(251, 191, 36, 0.5)' } as any}
                        pressStyle={{ backgroundColor: '#3730A3', color: '#FFFFFF' } as any}
                        focusStyle={{ backgroundColor: '#4338CA', color: '#FFFFFF' } as any}
                        onPress={handleTopSearch}>
                        Search
                      </Button>
                    </XStack>

                    {propertyLocalitySuggestions.length ? (
                      <YStack gap="$2">
                        {propertyLocalitySuggestions.map((s) => (
                          <Pressable
                            key={s.id}
                            onPress={() => {
                              suppressNextPropertyLocalitySuggestRef.current = true;
                              addPropertySelectedLocality(s.label);
                            }}>
                            <YStack borderWidth={1} borderColor={theme.border} borderRadius={12} padding={10} backgroundColor={theme.bgSecondary}>
                              <Text color={theme.text} fontWeight="900" numberOfLines={1} style={{ fontFamily: APP_SERIF_FONT }}>
                                {s.label}
                              </Text>
                              <Text color={theme.textMuted} fontSize={t(11)} numberOfLines={1} style={{ fontFamily: APP_SERIF_FONT }}>
                                {s.full}
                              </Text>
                            </YStack>
                          </Pressable>
                        ))}
                      </YStack>
                    ) : propertyLocalityLoading && topSearch.trim().length >= 2 ? (
                      <Text color={theme.textMuted} fontSize={t(11)} fontWeight="700" style={{ fontFamily: APP_SERIF_FONT }}>
                        Searching...
                      </Text>
                    ) : null}

                    {propertySelectedLocalities.length > 0 ? (
                      <XStack gap="$2" flexWrap="wrap">
                        {propertySelectedLocalities.map((loc) => (
                          <Pressable key={loc} onPress={() => removePropertySelectedLocality(loc)}>
                            <YStack backgroundColor="#3B82F6" borderRadius={999} paddingHorizontal={10} paddingVertical={5}>
                              <Text color="#FFFFFF" fontSize={t(11)} fontWeight="800" style={{ fontFamily: APP_SERIF_FONT }}>
                                {loc} x
                              </Text>
                            </YStack>
                          </Pressable>
                        ))}
                        {propertySelectedLocalities.length >= 3 ? (
                          <Text color={theme.textMuted} fontSize={t(11)} fontWeight="700" style={{ fontFamily: APP_SERIF_FONT }}>
                            Max 3 selected
                          </Text>
                        ) : null}
                      </XStack>
                    ) : null}


                    <Modal
                      visible={propertyStatePickerOpen}
                      transparent
                      animationType="fade"
                      onRequestClose={() => setPropertyStatePickerOpen(false)}>
                      <Pressable style={styles.modalBackdrop} onPress={() => setPropertyStatePickerOpen(false)}>
                        <Pressable
                          onPress={() => {}}
                          style={[styles.modalCard, { backgroundColor: theme.bgCard, padding: 14, maxHeight: 360 }]}>
                          <Text
                            color={theme.text}
                            fontSize={t(18)}
                            fontWeight="900"
                            style={{ fontFamily: APP_SERIF_FONT, marginBottom: 10 } as any}>
                            Select State
                          </Text>
                          <ScrollView showsVerticalScrollIndicator={false}>
                            {propertyStateOptions.map((st) => (
                              <Pressable
                                key={st}
                                onPress={() => {
                                  setPropertyState(String(st));
                                  const cities = propertyFallbackCityByState[String(st)] ?? [];
                                  if (cities.length) setPropertyCity(cities[0]);
                                  setPropertyStatePickerOpen(false);
                                }}>
                                <XStack
                                  alignItems="center"
                                  justifyContent="space-between"
                                  paddingVertical={12}
                                  paddingHorizontal={12}
                                  borderRadius={12}
                                  backgroundColor={String(st) === propertyState ? theme.bgSecondary : 'transparent'}>
                                  <Text color={theme.text} fontWeight="800" style={{ fontFamily: APP_SERIF_FONT }}>
                                    {st}
                                  </Text>
                                  <Text color={theme.textMuted} fontWeight="900">
                                    {String(st) === propertyState ? '✓' : ''}
                                  </Text>
                                </XStack>
                              </Pressable>
                            ))}
                          </ScrollView>
                        </Pressable>
                      </Pressable>
                    </Modal>

                    <Modal
                      visible={propertyCityPickerOpen}
                      transparent
                      animationType="fade"
                      onRequestClose={() => setPropertyCityPickerOpen(false)}>
                      <Pressable style={styles.modalBackdrop} onPress={() => setPropertyCityPickerOpen(false)}>
                        <Pressable
                          onPress={() => {}}
                          style={[styles.modalCard, { backgroundColor: theme.bgCard, padding: 14, maxHeight: 360 }]}>
                          <Text
                            color={theme.text}
                            fontSize={t(18)}
                            fontWeight="900"
                            style={{ fontFamily: APP_SERIF_FONT, marginBottom: 10 } as any}>
                            Select City
                          </Text>
                          <ScrollView showsVerticalScrollIndicator={false}>
                            {propertyCityOptions.map((ct) => (
                              <Pressable
                                key={ct}
                                onPress={() => {
                                  setPropertyCity(String(ct));
                                  setPropertyCityPickerOpen(false);
                                }}>
                                <XStack
                                  alignItems="center"
                                  justifyContent="space-between"
                                  paddingVertical={12}
                                  paddingHorizontal={12}
                                  borderRadius={12}
                                  backgroundColor={String(ct) === propertyCity ? theme.bgSecondary : 'transparent'}>
                                  <Text color={theme.text} fontWeight="800" style={{ fontFamily: APP_SERIF_FONT }}>
                                    {ct}
                                  </Text>
                                  <Text color={theme.textMuted} fontWeight="900">
                                    {String(ct) === propertyCity ? '✓' : ''}
                                  </Text>
                                </XStack>
                              </Pressable>
                            ))}
                          </ScrollView>
                        </Pressable>
                      </Pressable>
                    </Modal>

                    <Modal visible={!!pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(null)}>
                      <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(null)}>
                        <Pressable
                          onPress={() => {}}
                          style={[styles.modalCard, { backgroundColor: theme.bgCard, padding: 14, maxHeight: 420 }]}>
                          <XStack alignItems="center" justifyContent="space-between" marginBottom={10}>
                            <Text color={theme.text} fontSize={t(18)} fontWeight="900" style={{ fontFamily: APP_SERIF_FONT }}>
                              {pickerConfig?.title ?? 'Select'}
                            </Text>
                            <Pressable onPress={() => setPickerOpen(null)}>
                              <Text color={theme.textMuted} fontSize={t(24)} fontWeight="900">
                                ×
                              </Text>
                            </Pressable>
                          </XStack>

                          <ScrollView showsVerticalScrollIndicator={false}>
                            {pickerConfig?.mode === 'multi'
                              ? (pickerConfig as any).options.map((opt: string) => {
                                  const checked = (pickerConfig.selected as string[]).includes(opt);
                                  return (
                                    <Pressable key={opt} onPress={() => pickerConfig.onToggle(opt)}>
                                      <XStack
                                        alignItems="center"
                                        justifyContent="space-between"
                                        paddingVertical={12}
                                        paddingHorizontal={12}
                                        borderRadius={12}
                                        backgroundColor={checked ? theme.bgSecondary : 'transparent'}>
                                        <Text color={theme.text} fontWeight="800" style={{ fontFamily: APP_SERIF_FONT }}>
                                          {opt}
                                        </Text>
                                        <View
                                          style={{
                                            width: 18,
                                            height: 18,
                                            borderRadius: 4,
                                            borderWidth: 1.5,
                                            borderColor: checked ? '#10B981' : theme.border,
                                            backgroundColor: checked ? '#10B981' : 'transparent',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                          }}>
                                          {checked ? <Text color="#FFFFFF" fontSize={t(12)} fontWeight="900">✓</Text> : null}
                                        </View>
                                      </XStack>
                                    </Pressable>
                                  );
                                })
                              : pickerConfig?.mode === 'single'
                                ? (pickerConfig as any).options.map((opt: { label: string; value: any }) => {
                                    const checked = opt.value === pickerConfig.selected;
                                    return (
                                      <Pressable
                                        key={String(opt.value)}
                                        onPress={() => {
                                          (pickerConfig as any).onSelect(opt.value as any);
                                          setPickerOpen(null);
                                        }}>
                                        <XStack
                                          alignItems="center"
                                          justifyContent="space-between"
                                          paddingVertical={12}
                                          paddingHorizontal={12}
                                          borderRadius={12}
                                          backgroundColor={checked ? theme.bgSecondary : 'transparent'}>
                                          <Text color={theme.text} fontWeight="800" style={{ fontFamily: APP_SERIF_FONT }}>
                                            {opt.label}
                                          </Text>
                                          <Text color={theme.textMuted} fontWeight="900">
                                            {checked ? '✓' : ''}
                                          </Text>
                                        </XStack>
                                      </Pressable>
                                    );
                                  })
                                : null}
                          </ScrollView>

                          {pickerConfig?.mode === 'multi' ? (
                            <XStack gap="$2" justifyContent="flex-end" marginTop={12}>
                              <Button
                                backgroundColor="#F59E0B"
                                color="#FFFFFF"
                                fontWeight="900"
                                borderRadius={12}
                                hoverStyle={{ backgroundColor: '#22C55E', color: '#FFFFFF' } as any}
                                pressStyle={{ backgroundColor: '#16A34A', color: '#FFFFFF' } as any}
                                focusStyle={{ backgroundColor: '#22C55E', color: '#FFFFFF' } as any}
                                onPress={() => setPickerOpen(null)}>
                                Done
                              </Button>
                            </XStack>
                          ) : null}
                        </Pressable>
                      </Pressable>
                    </Modal>
                  </YStack>
                ) : null}

                {activeService === 'home_services' ? (
                  <XStack width="100%" flexWrap="wrap" gap="$2.5" justifyContent="space-between" marginTop={10}>
                    {homeServiceOptions.map((s) => (
                      <Pressable
                        key={s.key}
                        onPress={() => {
                          if (!session) {
                            router.push({ pathname: '/auth/login' } as any);
                            return;
                          }
                          router.push({ pathname: '/home-services/request', params: { service: s.key } } as any);
                        }}
                        style={{ flexBasis: isSmallScreen ? '48%' : '23%' } as any}>
                        <YStack
                          backgroundColor={theme.bgCard}
                          borderRadius={16}
                          padding={12}
                          borderWidth={1}
                          borderColor={theme.border}
                          alignItems="center"
                          justifyContent="center"
                          gap="$1.5">
                          <Text color={theme.text} fontWeight="900" textAlign="center" style={{ fontFamily: APP_SERIF_FONT }}>
                            {s.label}
                          </Text>
                          <Text color={theme.textMuted} fontSize={t(11)} fontWeight="700" textAlign="center" style={{ fontFamily: APP_SERIF_FONT }}>
                            Book now
                          </Text>
                        </YStack>
                      </Pressable>
                    ))}
                  </XStack>
                ) : null}

                <XStack gap="$2" alignItems="center" justifyContent="space-between" flexWrap="wrap">
                  <YStack flex={1} minWidth={isSmallScreen ? '100%' : 420}>
                    {activeService === 'property' ? (
                      <Pressable onPress={handleCallNow}>
                        <XStack gap="$1.5" alignItems="center">
                          
                          <FontAwesome name="phone" size={16} color={theme.primary} />
                          <Text color={theme.primary} fontSize={t(13)} fontWeight="700" textDecorationLine="underline" style={{ fontFamily: APP_SERIF_FONT }}>
                            Call us for property listing or Search
                          </Text>
                          
                        </XStack>
                      </Pressable>
                    ) : null}
                    <Text marginTop={activeService === 'property' ? 8 : 0} color={theme.textMuted} fontSize={t(12)} fontWeight="700" style={{ fontFamily: APP_SERIF_FONT }}>
                      {activeService === 'shifting'
                        ? 'Book shifting service in 2 minutes'
                        : activeService === 'home_services'
                          ? 'Call me instead of Online Booking'
                          : 'Are you a property owner ->'}
                    </Text>
                  </YStack>
                  <Button
                    backgroundColor={activeService === 'property' ? '#22C55E' : '#F59E0B'}
                    color="#FFFFFF"
                    fontWeight="900"
                    borderRadius={14}
                    borderWidth={0}
                    borderColor="transparent"
                    hoverStyle={
                      (activeService === 'property'
                        ? { backgroundColor: '#16A34A', borderColor: '#FBBF24', color: '#FFFFFF', boxShadow: '0 0 10px 3px rgba(251, 191, 36, 0.5)' }
                        : { backgroundColor: '#22C55E', borderColor: '#FBBF24', color: '#FFFFFF', boxShadow: '0 0 10px 3px rgba(251, 191, 36, 0.5)' }) as any
                    }
                    pressStyle={
                      (activeService === 'property'
                        ? { backgroundColor: '#15803D', color: '#FFFFFF' }
                        : { backgroundColor: '#16A34A', color: '#FFFFFF' }) as any
                    }
                    focusStyle={
                      (activeService === 'property'
                        ? { backgroundColor: '#16A34A', color: '#FFFFFF' }
                        : { backgroundColor: '#22C55E', color: '#FFFFFF' }) as any
                    }
                    onPress={activeService === 'home_services' ? handleCallNow : handlePrimaryServiceAction}>
                    {activeService === 'shifting' ? 'Book Shifting' : activeService === 'home_services' ? 'Call me' : 'Post Property'}
                  </Button>
                </XStack>
                </YStack>
              </View>
            </YStack>
          </XStack>

          <Modal visible={quoteModalOpen} transparent animationType="fade" onRequestClose={() => setQuoteModalOpen(false)}>
            <View style={styles.modalBackdrop}>
              <View style={[styles.modalCard, { backgroundColor: theme.bgCard }]}>
                <XStack alignItems="center" justifyContent="space-between" marginBottom={14}>
                  <Text color={theme.text} fontSize={t(20)} fontWeight="900" style={{ fontFamily: APP_SERIF_FONT }}>
                    Get Free Quote
                  </Text>
                  <Pressable onPress={() => setQuoteModalOpen(false)}>
                    <Text color={theme.textMuted} fontSize={t(24)} fontWeight="900">
                      ×
                    </Text>
                  </Pressable>
                </XStack>

                <TextInput
                  value={quoteName}
                  onChangeText={setQuoteName}
                  placeholder="Your Name *"
                  placeholderTextColor="#9CA3AF"
                  editable={!quoteNameReadOnly}
                  style={[styles.modalInput, { borderColor: theme.border, color: theme.text, fontFamily: APP_SERIF_FONT }]}
                />
                <TextInput
                  value={quotePhone}
                  onChangeText={(t) => {
                    const digits = String(t ?? '').replace(/\D/g, '');
                    if (digits.length > 10) return;
                    setQuotePhone(digits);
                  }}
                  placeholder="Phone Number *"
                  placeholderTextColor="#9CA3AF"
                  keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
                  maxLength={10}
                  editable={!quotePhoneReadOnly}
                  style={[
                    styles.modalInput,
                    {
                      borderColor: theme.border,
                      color: theme.text,
                      fontFamily: APP_SERIF_FONT,
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
                  editable={!quoteEmailReadOnly}
                  style={[styles.modalInput, { borderColor: theme.border, color: theme.text, fontFamily: APP_SERIF_FONT }]}
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
                        fontSize={t(14)}
                        fontWeight="700"
                        style={{ fontFamily: APP_SERIF_FONT }}>
                        {quoteService || 'Select Service'}
                      </Text>
                      <Text color={theme.textMuted} fontSize={t(18)} fontWeight="900">
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
                      <Text color={theme.text} fontSize={t(16)} fontWeight="900" style={{ fontFamily: APP_SERIF_FONT }}>
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
                                    fontSize={t(14)}
                                    fontWeight={selected ? '900' : '700'}
                                    style={{ fontFamily: APP_SERIF_FONT }}>
                                    {opt}
                                  </Text>
                                  {selected ? (
                                    <Text color={theme.primary} fontSize={t(16)} fontWeight="900">
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
                  style={[styles.modalTextarea, { borderColor: theme.border, color: theme.text, fontFamily: APP_SERIF_FONT }]}
                />

                <Pressable
                  disabled={quoteSubmitting}
                  onHoverIn={Platform.OS === 'web' ? () => setHeaderHovered('qcallback') : undefined}
                  onHoverOut={Platform.OS === 'web' ? () => setHeaderHovered(null) : undefined}
                  onPress={submitQuoteRequest}>
                  <YStack
                    style={[styles.modalSubmit, { backgroundColor: theme.primary, opacity: quoteSubmitting ? 0.7 : 1, borderWidth: 1, borderColor: headerHovered === 'qcallback' ? '#FBBF24' : 'transparent', boxShadow: headerHovered === 'qcallback' ? '0 0 10px 3px rgba(251, 191, 36, 0.5)' : undefined } as any]}>
                    <Text color="#FFFFFF" fontSize={t(20)} fontWeight="900" style={{ fontFamily: APP_SERIF_FONT }}>
                      {quoteSubmitting ? 'Submitting…' : 'Request Callback'}
                    </Text>
                  </YStack>
                </Pressable>

                {quoteSubmitNotice ? (
                  <Text
                    marginTop={10}
                    color={theme.textSecondary}
                    fontSize={t(13)}
                    fontWeight="700"
                    textAlign="center"
                    style={{ fontFamily: APP_SERIF_FONT }}>
                    {quoteSubmitNotice}
                  </Text>
                ) : null}
              </View>
            </View>
          </Modal>

          {coupons.length > 0 ? (
            <YStack marginTop={18} gap="$2.5">
              <Text
                color={theme.textMuted}
                fontSize={t(13)}
                fontWeight="800"
                textAlign="center"
                style={{ fontFamily: APP_SERIF_FONT }}>
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
                          <Text fontSize={t(22)}>🎉</Text>
                          <Text
                            color={theme.couponText}
                            fontWeight="900"
                            fontSize={t(17)}
                            style={{ fontFamily: APP_SERIF_FONT }}>
                            {String(c?.code ?? '').toUpperCase()}
                          </Text>
                        </XStack>
                        <YStack paddingHorizontal={12} paddingVertical={7} borderRadius={999} backgroundColor="rgba(0,0,0,0.14)">
                          <Text
                            color={theme.couponText}
                            fontWeight="900"
                            fontSize={t(13)}
                            style={{ fontFamily: APP_SERIF_FONT }}>
                            {discountText}
                          </Text>
                        </YStack>
                      </XStack>
                      {c?.title ? (
                        <Text
                          color={theme.couponText}
                          fontSize={t(14)}
                          fontWeight="800"
                          numberOfLines={2}
                          style={{ fontFamily: APP_SERIF_FONT }}>
                          {String(c.title)}
                        </Text>
                      ) : null}
                      <Text color={theme.couponText} fontSize={t(13)} fontWeight="700" style={{ fontFamily: APP_SERIF_FONT }}>
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

          <YStack
            onLayout={(e) => {
              sectionOffsetsRef.current.services = e.nativeEvent.layout.y;
            }}
            marginTop={sectionGap} gap="$4">
              <YStack alignItems="center" gap="$2.5">
              <Text
                color="#D97706"
                fontSize={t(15)}
                letterSpacing={2.4}
                textTransform="uppercase"
                fontWeight="900"
                style={{ fontFamily: APP_SERIF_FONT }}>
                OUR SERVICES
              </Text>
              <H2
                color={theme.text}
                fontWeight="900"
                textAlign="center"
                fontSize={isSmallScreen ? t(27) : t(35)}
                style={{ fontFamily: APP_SERIF_FONT }}>
                We&apos;re Quick, Friendly & Professional
              </H2>
              <Text
                color={theme.textMuted}
                fontSize={t(16)}
                textAlign="center"
                lineHeight={23}
                fontWeight="700"
                style={{ fontFamily: APP_SERIF_FONT }}>
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
                        <Text color="#FFFFFF" fontSize={t(21)} fontWeight="900" style={{ fontFamily: APP_SERIF_FONT }}>
                          {item.title}
                        </Text>
                      </View>
                    </ImageBackground>
                    <XStack alignItems="center" justifyContent="space-between" paddingHorizontal={16} paddingVertical={14}>
                      <XStack alignItems="center" gap="$2.5">
                        <FontAwesome5 name={serviceIconName as any} size={14} color={theme.textSecondary} />
                        <Text
                          color={theme.textSecondary}
                          fontSize={t(14)}
                          fontWeight="800"
                          style={{ fontFamily: APP_SERIF_FONT }}>
                          View Details
                        </Text>
                      </XStack>
                      <Text color="#D97706" fontSize={t(21)} fontWeight="900">
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

          <YStack
            style={[
              styles.statsStrip,
              {
                paddingVertical: statsPaddingVertical,
                minHeight: statsMinHeight,
                marginHorizontal: isSmallScreen ? 0 : -24,
                borderRadius: isSmallScreen ? 24 : 0,
                paddingHorizontal: isSmallScreen ? 16 : 24,
                overflow: 'hidden',
              },
            ]}
            marginTop={sectionGap}>
            {isSmallScreen ? (
              <YStack width="100%" gap="$2.5">
                {[
                  { label: 'Branches', value: '5', icon: '📍' },
                  { label: 'Years Experience', value: '18+', icon: '🕒' },
                  { label: 'Shifting Done', value: '48,500+', icon: '🚚' },
                  { label: 'Satisfaction Rate', value: '80%', icon: '⭐' },
                ].map((s) => (
                  <YStack key={s.label} style={[styles.statItem, styles.mobileStatItem]} alignItems="center" gap="$1.5">
                    <YStack style={styles.statIcon}>
                      <Text fontSize={t(20)}>{s.icon}</Text>
                    </YStack>
                    <Text color="#FFFFFF" fontSize={t(30)} fontWeight="900" style={{ fontFamily: APP_SERIF_FONT }}>
                      {s.value}
                    </Text>
                    <Text
                      color="rgba(255,255,255,0.8)"
                      fontSize={t(13)}
                      fontWeight="700"
                      textAlign="center"
                      style={{ fontFamily: APP_SERIF_FONT }}>
                      {s.label}
                    </Text>
                  </YStack>
                ))}
              </YStack>
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
                      <Text fontSize={t(20)}>{s.icon}</Text>
                    </YStack>
                    <Text color="#FFFFFF" fontSize={t(38)} fontWeight="900" style={{ fontFamily: APP_SERIF_FONT }}>
                      {s.value}
                    </Text>
                    <Text
                      color="rgba(255,255,255,0.8)"
                      fontSize={t(13)}
                      fontWeight="700"
                      textAlign="center"
                      style={{ fontFamily: APP_SERIF_FONT }}>
                      {s.label}
                    </Text>
                  </YStack>
                ))}
              </XStack>
            )}
          </YStack>

          <YStack marginTop={sectionGap} gap="$4">
            <YStack alignItems="center" gap="$2.5">
              <Text
                color="#D97706"
                fontSize={t(14)}
                letterSpacing={2.4}
                textTransform="uppercase"
                fontWeight="900"
                style={{ fontFamily: APP_SERIF_FONT }}>
                Our Branches
              </Text>
              <H2
                color={theme.text}
                fontWeight="900"
                textAlign="center"
                fontSize={isSmallScreen ? t(26) : t(34)}
                style={{ fontFamily: APP_SERIF_FONT }}>
                We Are Across India
              </H2>
            </YStack>

            <XStack flexWrap="wrap" justifyContent="center" gap="$4">
              {[
                { name: 'Mumbai', addr: 'Sethia Aashray, Mumbai 400101' },
                { name: 'Delhi', addr: 'Connaught Place, New Delhi 110001' },
                { name: 'Kolkata', addr: 'Park Street, Kolkata 700016' },
                { name: 'Hyderabad', addr: 'Hitech City, Hyderabad 500081' },
                { name: 'Gujarat', addr: 'SG Highway, Ahmedabad 380054' },
              ].map((b) => (
                <YStack
                  key={b.name}
                  backgroundColor={theme.bgCard}
                  borderRadius={16}
                  padding={16}
                  borderWidth={1}
                  borderColor={theme.border}
                  width={isSmallScreen ? '100%' : '30%'}
                  minWidth={isSmallScreen ? '100%' : 200}
                  maxWidth={360}
                  alignItems="center"
                  gap="$2">
                  <FontAwesome name="map-marker" size={28} color="#EF4444" />
                  <Text color={theme.text} fontSize={t(16)} fontWeight="900" textAlign="center" style={{ fontFamily: APP_SERIF_FONT }}>
                    {b.name}
                  </Text>
                  <Text color={theme.textMuted} fontSize={t(13)} fontWeight="700" textAlign="center" style={{ fontFamily: APP_SERIF_FONT }}>
                    {b.addr}
                  </Text>
                </YStack>
              ))}
            </XStack>
          </YStack>

          <YStack marginTop={sectionGap} alignItems="center">
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
                  <Text color="#FFFFFF" fontSize={t(24)} fontWeight="900" style={{ fontFamily: APP_SERIF_FONT }}>
                    Book Your Move Today
                  </Text>
                  <Text
                    color="rgba(255,255,255,0.94)"
                    fontSize={t(14)}
                    lineHeight={20}
                    fontWeight="700"
                    style={{ fontFamily: APP_SERIF_FONT }}>
                    Get instant quote, select vehicle, schedule date and book your relocation in just 3 easy steps!
                  </Text>
                  <YStack gap="$2.5" marginTop={10}>
                    {['Enter pickup & drop location', 'Select vehicle & laborers', 'Pay advance & confirm'].map(
                      (step, idx) => (
                        <XStack key={step} alignItems="center" gap="$2.5">
                          <YStack style={styles.stepBadge}>
                            <Text color="#1A1A1A" fontWeight="900" fontSize={t(13)} style={{ fontFamily: APP_SERIF_FONT }}>
                              {idx + 1}
                            </Text>
                          </YStack>
                          <Text color="#FFFFFF" fontSize={t(14)} fontWeight="800" style={{ fontFamily: APP_SERIF_FONT }}>
                            {step}
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
                  <AppButton
                    label="Start Booking"
                    onPress={handleBook}
                    backgroundColor="#1F3B63"
                    textColor="#FFFFFF"
                    containerStyle={styles.bookBannerButton}
                    glowOnHover
                    content={
                      <XStack alignItems="center" gap="$2.5">
                        <Text color="#FFFFFF" fontSize={t(15)} fontWeight="900" style={{ fontFamily: APP_SERIF_FONT }}>
                          Start Booking
                        </Text>
                        <Text color="#FFFFFF" fontSize={t(18)} fontWeight="900">
                          →
                        </Text>
                      </XStack>
                    }
                  />
                </YStack>
              </XStack>
            </YStack>
          </YStack>

          <YStack marginTop={sectionGap} gap="$4">
            <YStack alignItems="center" gap="$2.5">
              <Text
                color="#D97706"
                fontSize={t(14)}
                letterSpacing={2.4}
                textTransform="uppercase"
                fontWeight="900"
                style={{ fontFamily: APP_SERIF_FONT }}>
                Why Choose Us
              </Text>
              <H2
                color={theme.text}
                fontWeight="900"
                textAlign="center"
                fontSize={isSmallScreen ? t(26) : t(34)}
                style={{ fontFamily: APP_SERIF_FONT }}>
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
                    <Text fontSize={t(20)}>{c.icon}</Text>
                  </YStack>
                  <Text
                    color={theme.text}
                    fontSize={t(17)}
                    fontWeight="900"
                    textAlign="center"
                    style={{ fontFamily: APP_SERIF_FONT }}>
                    {c.title}
                  </Text>
                  <Text
                    color={theme.textMuted}
                    fontSize={t(14)}
                    fontWeight="700"
                    textAlign="center"
                    lineHeight={21}
                    style={{ fontFamily: APP_SERIF_FONT }}>
                    {c.body}
                  </Text>
                </YStack>
              ))}
            </XStack>
          </YStack>

          <YStack marginTop={sectionGap} gap="$4">
            <YStack alignItems="center" gap="$2.5">
              <Text
                color="#D97706"
                fontSize={t(15)}
                letterSpacing={2.4}
                textTransform="uppercase"
                fontWeight="900"
                style={{ fontFamily: APP_SERIF_FONT }}>
                Testimonials
              </Text>
              <H2
                color={theme.text}
                fontWeight="900"
                textAlign="center"
                fontSize={isSmallScreen ? t(27) : t(35)}
                style={{ fontFamily: APP_SERIF_FONT }}>
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
                  {testimonials.map((testimonial) => {
                    const cardWidth = Math.min(windowWidth - 64, 420);
                    return (
                      <YStack
                        key={testimonial.name}
                        style={[
                          styles.testimonialCard,
                          {
                            width: cardWidth,
                            backgroundColor: theme.bgCard,
                            borderColor: theme.border,
                          },
                        ]}>
                        <Text color="#D97706" fontSize={t(18)} fontWeight="900">
                          ⭐⭐⭐⭐⭐
                        </Text>
                        <Text
                          color={theme.textMuted}
                          fontSize={t(15)}
                          lineHeight={23}
                          fontWeight="700"
                          style={{ fontFamily: APP_SERIF_FONT }}>
                          &quot;{testimonial.body}&quot;
                        </Text>
                        <XStack alignItems="center" gap="$2.5" marginTop={12}>
                          <YStack style={styles.avatarCircle}>
                            <Text color="#FFFFFF" fontWeight="900" style={{ fontFamily: APP_SERIF_FONT }}>
                              {testimonial.letter}
                            </Text>
                          </YStack>
                          <YStack>
                            <Text color={theme.text} fontWeight="900" style={{ fontFamily: APP_SERIF_FONT }}>
                              {testimonial.name}
                            </Text>
                            <Text
                              color={theme.textMuted}
                              fontSize={t(13)}
                              fontWeight="700"
                              style={{ fontFamily: APP_SERIF_FONT }}>
                              {testimonial.route}
                            </Text>
                          </YStack>
                        </XStack>
                      </YStack>
                    );
                  })}
                </ScrollView>
              ) : (
                testimonials.map((testimonial) => (
                  <YStack
                    key={testimonial.name}
                    style={[
                      styles.testimonialCard,
                      {
                        width: '32%',
                        backgroundColor: theme.bgCard,
                        borderColor: theme.border,
                      },
                    ]}>
                    <Text color="#D97706" fontSize={t(18)} fontWeight="900">
                      ⭐⭐⭐⭐⭐
                    </Text>
                    <Text
                      color={theme.textMuted}
                      fontSize={t(15)}
                      lineHeight={23}
                      fontWeight="700"
                      style={{ fontFamily: APP_SERIF_FONT }}>
                      &quot;{testimonial.body}&quot;
                    </Text>
                    <XStack alignItems="center" gap="$2.5" marginTop={12}>
                      <YStack style={styles.avatarCircle}>
                        <Text color="#FFFFFF" fontWeight="900" style={{ fontFamily: APP_SERIF_FONT }}>
                          {testimonial.letter}
                        </Text>
                      </YStack>
                      <YStack>
                        <Text color={theme.text} fontWeight="900" style={{ fontFamily: APP_SERIF_FONT }}>
                          {testimonial.name}
                        </Text>
                        <Text
                          color={theme.textMuted}
                          fontSize={t(13)}
                          fontWeight="700"
                          style={{ fontFamily: APP_SERIF_FONT }}>
                          {testimonial.route}
                        </Text>
                      </YStack>
                    </XStack>
                  </YStack>
                ))
              )}
            </XStack>
          </YStack>

          <YStack style={styles.transparentPricingSection} marginTop={sectionGap}>
            <YStack alignItems="center" gap="$2.5" marginBottom={18}>
              <Text
                color="#FFFFFF"
                fontSize={t(29)}
                fontWeight="900"
                textAlign="center"
                style={{ fontFamily: APP_SERIF_FONT }}>
                Transparent Pricing
              </Text>
              <Text
                color="rgba(255,255,255,0.82)"
                fontSize={t(14)}
                textAlign="center"
                lineHeight={21}
                fontWeight="700"
                style={{ fontFamily: APP_SERIF_FONT }}>
                Approximate charges for local shifting. Final price may vary based on actual items and distance.
              </Text>
            </YStack>

            {isSmallScreen ? (
              <YStack width="100%" gap="$3">
                {transparentPricingRows.map((row) => (
                  <YStack
                    key={row[0]}
                    backgroundColor="#FFFFFF"
                    borderRadius={18}
                    overflow="hidden"
                    borderWidth={1}
                    borderColor="rgba(15, 23, 42, 0.1)">
                    <YStack backgroundColor="#D6B23A" paddingHorizontal={16} paddingVertical={14}>
                      <Text
                        color="#FFFFFF"
                        fontWeight="900"
                        fontSize={t(15)}
                        textAlign="center"
                        lineHeight={19}
                        style={{ fontFamily: APP_SERIF_FONT }}>
                        {row[0]}
                      </Text>
                    </YStack>
                    {row.slice(1).map((price, idx) => (
                      <XStack
                        key={`${row[0]}-${transparentPricingColumns[idx + 1]}`}
                        alignItems="center"
                        justifyContent="space-between"
                        gap="$2"
                        paddingHorizontal={14}
                        paddingVertical={12}
                        borderTopWidth={idx === 0 ? 0 : 1}
                        borderTopColor="rgba(15, 23, 42, 0.08)">
                        <Text
                          color="rgba(15, 23, 42, 0.72)"
                          fontWeight="900"
                          fontSize={t(13)}
                          lineHeight={17}
                          flex={1}
                          style={{ fontFamily: APP_SERIF_FONT }}>
                          {transparentPricingColumns[idx + 1]}
                        </Text>
                        <Text
                          color="#0F172A"
                          fontWeight="900"
                          fontSize={t(13)}
                          lineHeight={17}
                          flex={1}
                          textAlign="right"
                          style={{ fontFamily: APP_SERIF_FONT }}>
                          {price}
                        </Text>
                      </XStack>
                    ))}
                  </YStack>
                ))}
              </YStack>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ alignItems: 'center' } as any}
                style={{ width: '100%' } as any}>
                <YStack
                  style={[
                    styles.transparentPricingTable,
                    {
                      width: pricingTableWidth,
                      maxWidth: 760,
                    } as any,
                  ] as any}>
                  <XStack style={styles.transparentPricingHeaderRow}>
                    {transparentPricingColumns.map((h) => (
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
                          fontSize={pricingHeaderFontSize}
                          lineHeight={18}
                          textAlign="center"
                          style={{ fontFamily: APP_SERIF_FONT }}>
                          {h}
                        </Text>
                      </YStack>
                    ))}
                  </XStack>

                  {transparentPricingRows.map((row) => (
                    <XStack key={row[0]} style={styles.transparentPricingBodyRow}>
                      {row.map((cell, idx) => (
                        <YStack
                          key={`${row[0]}-${idx}`}
                          style={[
                            styles.transparentPricingCell,
                            idx === 0 && { flex: 0.75 },
                          ] as any}>
                          <Text
                            color="#0F172A"
                            fontWeight={idx === 0 ? '900' : '800'}
                            fontSize={pricingBodyFontSize}
                            textAlign="center"
                            lineHeight={pricingBodyLineHeight}
                            style={{ fontFamily: APP_SERIF_FONT }}>
                            {cell}
                          </Text>
                        </YStack>
                      ))}
                    </XStack>
                  ))}
                </YStack>
              </ScrollView>
            )}

            <XStack
              justifyContent="center"
              alignItems="center"
              gap="$3.5"
              marginTop={20}
              marginBottom={6}
              flexWrap="wrap"
              width="100%">
              <AppButton
                label="Get Quote"
                onPress={handleOpenQuote}
                backgroundColor="#FFFFFF"
                textColor="#0B1220"
                glowOnHover
                containerStyle={[styles.transparentPricingActionButton, styles.transparentPricingActionButtonLight]}
                labelStyle={{ fontFamily: APP_SERIF_FONT, fontSize: 16, fontWeight: '900' }}
              />
              <AppButton
                label={activeService === 'shifting' ? 'Book Shifting' : activeService === 'home_services' ? 'Explore' : 'Search'}
                onPress={handlePrimaryServiceAction}
                backgroundColor="#12b12ce0"
                textColor="#FFFFFF"
                glowOnHover
                containerStyle={[styles.transparentPricingActionButton, styles.transparentPricingActionButtonGreen]}
                labelStyle={{ fontFamily: APP_SERIF_FONT, fontSize: 16, fontWeight: '900' }}
              />
            </XStack>
          </YStack>

          <YStack
            backgroundColor={theme.bgCard}
            borderRadius={26}
            padding={28}
            gap="$3.5"
            marginTop={tightSectionGap}
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
                fontSize={t(15)}
                letterSpacing={2.8}
                textTransform="uppercase"
                fontWeight="900"
                style={{ fontFamily: APP_SERIF_FONT }}>
                About Us
              </Text>
            </YStack>

            {!isSmallScreen ? (
              <XStack gap="$4" alignItems="center">
                <Image source={require('../assets/images/packers-movers-bg.jpg')} style={styles.aboutImage} />
                <YStack flex={1} gap="$3.5">
                  <Text color={theme.text} fontSize={t(23)} fontWeight="900" style={{ fontFamily: APP_SERIF_FONT }}>
                    Prime Move Experience
                  </Text>
                  <Text
                    color={theme.textMuted}
                    fontSize={t(16)}
                    fontWeight="700"
                    lineHeight={23}
                    style={{ fontFamily: APP_SERIF_FONT }}>
                    Smart packing, GPS tracking, and instant support in one premium flow.
                  </Text>
                  <Text
                    color={theme.textSecondary}
                    fontSize={t(16)}
                    lineHeight={25}
                    fontWeight="700"
                    style={{ fontFamily: APP_SERIF_FONT }}>
                    With over 10 years of excellence, we&apos;ve redefined relocation with precision tracking and
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
                    fontSize={t(23)}
                    fontWeight="900"
                    textAlign="center"
                    style={{ fontFamily: APP_SERIF_FONT }}>
                    Prime Move Experience
                  </Text>
                  <Text
                    color={theme.textMuted}
                    fontSize={t(16)}
                    fontWeight="700"
                    lineHeight={23}
                    textAlign="center"
                    style={{ fontFamily: APP_SERIF_FONT }}>
                    Smart packing, GPS tracking, and instant support in one premium flow.
                  </Text>
                  <Text
                    color={theme.textSecondary}
                    fontSize={t(16)}
                    lineHeight={25}
                    textAlign="center"
                    fontWeight="700"
                    style={{ fontFamily: APP_SERIF_FONT }}>
                    With over 10 years of excellence, we&apos;ve redefined relocation with precision tracking and
                    white-glove service.
                  </Text>
                </YStack>
              </YStack>
            )}
          </YStack>

          <YStack
            onLayout={(e) => {
              sectionOffsetsRef.current.contact = e.nativeEvent.layout.y;
            }}
            backgroundColor={theme.bgCard}
            borderRadius={isSmallScreen ? 22 : 26}
            padding={isSmallScreen ? 16 : 30}
            gap={isSmallScreen ? '$3' : '$4'}
            marginTop={tightSectionGap}
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
                  ref={contactHeadingRef}
                  color={theme.primary}
                  fontSize={t(14)}
                  letterSpacing={2.8}
                  textTransform="uppercase"
                  fontWeight="900"
                  style={{ fontFamily: APP_SERIF_FONT }}>
                  Contact & Support
                </Text>
              </YStack>

              <YStack alignItems="center" gap={isSmallScreen ? '$3' : '$4'}>
                  <YStack
                    style={{
                      width: '100%',
                      maxWidth: isSmallScreen ? '100%' : 560,
                      minWidth: isSmallScreen ? '100%' : 360,
                    }}
                    alignItems="center"
                    gap={isSmallScreen ? '$3' : '$4'}>
                    <BusinessCard theme={theme} viewShotRef={businessCardRef} />

                    <View pointerEvents="auto">
                    <AppButton
                      label="Download Business Card"
                      onPress={downloadBusinessCard}
                      backgroundColor={theme.primary}
                      textColor="#FFFFFF"
                      glowOnHover
                      containerStyle={{
                        height: 50,
                        minWidth: isSmallScreen ? 300 : 340,
                        paddingHorizontal: isSmallScreen ? 22 : 34,
                        borderRadius: 700,
                        shadowColor: 'rgba(0,0,0,0.55)',
                        shadowOffset: { width: 0, height: 14 },
                        shadowOpacity: 0.28,
                        shadowRadius: 22,
                        elevation: 12,
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'row',
                        flexWrap: 'nowrap',
                        gap: 12,
                      }}
                      content={
                        <>
                          <Text fontSize={t(20)}>📥</Text>
                          <Text
                            color="#FFFFFF"
                            fontSize={isSmallScreen ? t(16) : t(18)}
                            fontWeight="900"
                            numberOfLines={1}
                            ellipsizeMode="tail"
                            style={{ fontFamily: APP_SERIF_FONT, flexShrink: 1 }}>
                            Download Business Card
                          </Text>
                        </>
                      }
                    />
                  </View>

                  {cardDownloadNotice ? (
                    <Text
                      color={theme.textSecondary}
                      fontSize={t(13)}
                      fontWeight="700"
                      textAlign="center"
                      style={{ fontFamily: APP_SERIF_FONT }}>
                      {cardDownloadNotice}
                    </Text>
                  ) : null}
                </YStack>
              </YStack>
            </YStack>

          {/* ---- Separator between Contact & Map ---- */}
          <YStack
            marginTop={tightSectionGap}
            marginBottom={sectionGap}
            alignItems="center"
            paddingHorizontal={isSmallScreen ? 0 : 40}>
            <YStack
              height={2}
              width={isSmallScreen ? '100%' : '60%'}
              backgroundColor={theme.primary}
              opacity={0.15}
              borderRadius={1}
            />
          </YStack>

          <YStack
            backgroundColor={theme.bgCard}
            borderRadius={isSmallScreen ? 22 : 26}
            padding={isSmallScreen ? 16 : 24}
            gap={isSmallScreen ? '$3' : '$4'}
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
                fontSize={t(14)}
                letterSpacing={2.8}
                textTransform="uppercase"
                fontWeight="900"
                style={{ fontFamily: APP_SERIF_FONT }}>
                Google Map
              </Text>
            </YStack>

            <YStack
              width="100%"
              minHeight={isSmallScreen ? 280 : 320}
              borderRadius={20}
              overflow="hidden"
              borderWidth={1}
              borderColor={theme.border}
              backgroundColor={theme.bgSecondary}>
              {Platform.OS === 'web' ? (
                <iframe
                  src={googleMapEmbedUrl}
                  width="100%"
                  height={isSmallScreen ? 280 : 320}
                  style={{ border: 'none', width: '100%', height: isSmallScreen ? 280 : 320 } as any}
                  allowFullScreen={true}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"></iframe>
              ) : NativeWebView ? (
                <NativeWebView
                  source={{ html: googleMapWebViewHtml, baseUrl: 'https://www.google.com' }}
                  style={{ width: '100%', height: isSmallScreen ? 280 : 320 } as any}
                  originWhitelist={['*']}
                  javaScriptEnabled
                  domStorageEnabled
                  startInLoadingState
                  mixedContentMode="always"
                />
              ) : NativeMapView ? (
                <NativeMapView
                  style={{ width: '100%', height: isSmallScreen ? 280 : 320 } as any}
                  initialRegion={{
                    latitude: 19.19345137320862,
                    longitude: 72.87039928686748,
                    latitudeDelta: 0.03,
                    longitudeDelta: 0.03,
                  }}
                  scrollEnabled
                  zoomEnabled
                  rotateEnabled
                  pitchEnabled>
                  {NativeMapMarker ? (
                    <NativeMapMarker coordinate={{ latitude: 19.19345137320862, longitude: 72.87039928686748 }} />
                  ) : null}
                </NativeMapView>
              ) : (
                <YStack alignItems="center" justifyContent="center" width="100%" flex={1} gap="$3" padding={20}>
                  <FontAwesome name="map-marker" size={34} color={theme.accent} />
                  <Text color={theme.text} fontSize={t(17)} fontWeight="900" textAlign="center" style={{ fontFamily: APP_SERIF_FONT }}>
                    Google Map
                  </Text>
                </YStack>
              )}
            </YStack>

            <AppButton
              label="Open in Maps"
              onPress={handleOpenMaps}
              backgroundColor={theme.accent}
              textColor="#FFFFFF"
              glowOnHover
              containerStyle={{
                height: 48,
                minWidth: isSmallScreen ? 190 : 220,
                paddingHorizontal: 24,
                borderRadius: 14,
                shadowColor: 'rgba(0,0,0,0.25)',
                shadowOffset: { width: 0, height: 10 },
                shadowOpacity: 0.18,
                shadowRadius: 16,
                elevation: 8,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                flexWrap: 'nowrap',
                gap: 10,
              }}
              content={
                <>
                  <FontAwesome name="map-marker" size={18} color="#FFFFFF" />
                  <Text color="#FFFFFF" fontSize={t(15)} fontWeight="900" style={{ fontFamily: APP_SERIF_FONT }}>
                    Open in Maps
                  </Text>
                </>
              }
            />

            <Text
              color="#0ba705ff"
              fontSize={t(13)}
              fontWeight="700"
              textAlign="center"
              lineHeight={19}
              style={{ fontFamily: APP_SERIF_FONT }}>
              Find us on Google Maps - tap directions for the fastest route and live navigation.
            </Text>
          </YStack>

          <YStack style={[styles.footerWrap, { borderColor: theme.border }]} marginTop={sectionGap}>
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
                  <Text color="#D97706" fontSize={t(16)} fontWeight="900" style={{ fontFamily: APP_SERIF_FONT }}>
                    Gujarat Relocation Packers & Movers
                  </Text>
                </YStack>
                <YStack style={styles.footerBodyWrap}>
                  <Text
                    color={theme.textSecondary}
                    fontSize={t(14)}
                    lineHeight={21}
                    fontWeight="700"
                    style={{ fontFamily: APP_SERIF_FONT }}>
                    Professional packing and relocation services with careful handling, verified staff, and transparent
                    pricing across India.
                  </Text>
                  <Text
                    color={theme.textMuted}
                    fontSize={t(14)}
                    fontWeight="900"
                    marginTop={8}
                    style={{ fontFamily: APP_SERIF_FONT }}>
                    Follow Us
                  </Text>
                  <XStack gap="$2.5" alignItems="center">
                    <AppButton
                      label="Facebook"
                      onPress={() => Linking.openURL('https://facebook.com/')}
                      backgroundColor={'rgba(255,255,255,0.1)'}
                      textColor="#FFFFFF"
                      glowOnHover
                      containerStyle={styles.socialIcon}
                      content={<FontAwesome name="facebook" size={18} color="#1877F2" />}
                    />
                    <AppButton
                      label="Instagram"
                      onPress={() => Linking.openURL('https://www.instagram.com/balvant__rajbhar')}
                      backgroundColor={'rgba(255,255,255,0.1)'}
                      textColor="#FFFFFF"
                      glowOnHover
                      containerStyle={styles.socialIcon}
                      content={<FontAwesome name="instagram" size={18} color="#E1306C" />}
                    />
                    <AppButton
                      label="LinkedIn"
                      onPress={() => Linking.openURL('https://www.linkedin.com/in/balvant-rajbhar-0118751b4')}
                      backgroundColor={'rgba(255,255,255,0.1)'}
                      textColor="#FFFFFF"
                      glowOnHover
                      containerStyle={styles.socialIcon}
                      content={<FontAwesome name="linkedin" size={18} color="#0A66C2" />}
                    />
                    <AppButton
                      label="YouTube"
                      onPress={() => Linking.openURL('https://www.youtube.com/@BalvantTrendyTech')}
                      backgroundColor={'rgba(255,255,255,0.1)'}
                      textColor="#FFFFFF"
                      glowOnHover
                      containerStyle={styles.socialIcon}
                      content={<FontAwesome5 name="youtube" size={18} color="#FF0000" />}
                    />
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
                  <Pressable
                    key={s.label}
                    onHoverIn={Platform.OS === 'web' ? () => setFooterHovered('svc_' + s.label) : undefined}
                    onHoverOut={Platform.OS === 'web' ? () => setFooterHovered(null) : undefined}
                    onPress={() => router.push(s.route as any)}>
                    <XStack alignItems="center" gap="$2.5" paddingVertical={5}>
                      <Text color="#D97706" fontWeight="900">
                        ›
                      </Text>
                      <Text
                        color={footerHovered === 'svc_' + s.label ? '#D97706' : theme.textSecondary}
                        fontSize={t(14)}
                        fontWeight="800"
                        style={{ fontFamily: APP_SERIF_FONT }}>
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
                        <Text color="#D97706" fontSize={t(16)} fontWeight="900" style={{ fontFamily: APP_SERIF_FONT }}>
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
                  <Text color="#D97706" fontSize={t(16)} fontWeight="900" style={{ fontFamily: APP_SERIF_FONT }}>
                    Quick Links
                  </Text>
                </YStack>
                <YStack style={styles.footerBodyWrap}>
                  {[ 
                    { label: 'Home', action: () => scrollRef.current?.scrollTo({ y: 0, animated: true }) },
                    { label: 'Services', action: () => scrollToSection('services') },
                    {
                      label: 'Track',
                      action: () => {
                        if (!session?.user?.id) {
                          router.push({ pathname: '/auth/login', params: { redirectTo: '/(tabs)/tracking' } } as any);
                        } else {
                          router.push('/(tabs)/tracking');
                        }
                      },
                    },
                    { label: 'Contact', action: () => scrollToSection('contact') },
                  ].map((l) => (
                    <Pressable
                      key={l.label}
                      onHoverIn={Platform.OS === 'web' ? () => setFooterHovered('ql_' + l.label) : undefined}
                      onHoverOut={Platform.OS === 'web' ? () => setFooterHovered(null) : undefined}
                      onPress={l.action}>
                      <Text
                        color={footerHovered === 'ql_' + l.label ? '#D97706' : theme.textSecondary}
                        fontSize={t(14)}
                        fontWeight="800"
                        paddingVertical={7}
                        style={{ fontFamily: APP_SERIF_FONT }}>
                        {l.label}
                      </Text>
                    </Pressable>
                  ))}
                </YStack>
              </YStack>
            </XStack>

            <XStack justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$2.5" marginTop={20}>
              <Pressable
                onHoverIn={Platform.OS === 'web' ? () => setFooterHovered('copyright') : undefined}
                onHoverOut={Platform.OS === 'web' ? () => setFooterHovered(null) : undefined}
                onPress={() =>
                  Linking.openURL(
                    'https://www.google.com/search?q=BT+SOFTECH&sca_esv=1ef01aa32e62b85d&sxsrf=ANbL-n4Qxg11bZze2VYtDUukS4Om-AfTZQ%3A1772388277243&ei=tX-kacnJDrSQseMP5pOl4QU&biw=1366&bih=641&ved=0ahUKEwiJ-KztpP-SAxU0SGwGHeZJKVwQ4dUDCBM&uact=5&oq=BT+SOFTECH&gs_lp=Egxnd3Mtd2l6LXNlcnAiCkJUIFNPRlRFQ0gyDRAuGIAEGMcBGA0YrwEyBxAAGIAEGA0yBxAAGIAEGA0yBxAAGIAEGA0yBxAAGIAEGA0yBxAAGIAEGA0yBhAAGA0YHjIGEAAYDRgeMgYQABgNGB4yBhAAGA0YHjIcEC4YgAQYxwEYDRivARiXBRjcBBjeBBjgBNgBAUiZTVD8DliiRHACeAGQAQCYAboBoAGSCaoBAzAuOLgBA8gBAPgBAZgCB6ACtwbCAgoQABiwAxjWBBhHwgIEECMYJ8ICBRAAGO8FwgIIEAAYogQYiQWYAwCIBgGQBgK6BgYIARABGBSSBwMyLjWgB8oesgcDMC41uAefBsIHBzAuMi4zLjLIByuACAA&sclient=gws-wiz-serp'
                  )
                }>
                <Text
                  color={footerHovered === 'copyright' ? '#D97706' : theme.textMuted}
                  fontSize={t(13)}
                  fontWeight="800"
                  style={
                    Platform.OS === 'web'
                      ? ([
                          { fontFamily: APP_SERIF_FONT, cursor: 'pointer' },
                          {
                            animationDuration: '6s',
                            animationTimingFunction: 'linear',
                            animationIterationCount: 'infinite',
                            animationKeyframes: brandTextKeyframes,
                          },
                        ] as any)
                      : ({ fontFamily: APP_SERIF_FONT } as any)
                  }>
                  2026 BT SOFTECH. All Rights Reserved.
                </Text>
              </Pressable>
              <XStack gap="$3.5" alignItems="center">
                <Pressable
                  onHoverIn={Platform.OS === 'web' ? () => setFooterHovered('privacy') : undefined}
                  onHoverOut={Platform.OS === 'web' ? () => setFooterHovered(null) : undefined}
                  onPress={() => router.push('/privacy-policy')}>
                  <Text color={footerHovered === 'privacy' ? '#D97706' : theme.textMuted} fontSize={t(13)} fontWeight="800" style={{ fontFamily: APP_SERIF_FONT }}>
                    Privacy Policy
                  </Text>
                </Pressable>
                <Pressable
                  onHoverIn={Platform.OS === 'web' ? () => setFooterHovered('terms') : undefined}
                  onHoverOut={Platform.OS === 'web' ? () => setFooterHovered(null) : undefined}
                  onPress={() => router.push('/terms-and-conditions')}>
                  <Text color={footerHovered === 'terms' ? '#D97706' : theme.textMuted} fontSize={t(13)} fontWeight="800" style={{ fontFamily: APP_SERIF_FONT }}>
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
  glowWrap: {
    position: 'relative',
    borderRadius: 18,
  },
  glowLayer: {
    position: 'absolute',
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: 18,
    backgroundImage:
      'linear-gradient(45deg, #ff0000, #ff7300, #fffb00, #48ff00, #00ffd5, #002bff, #7a00ff, #ff00c8, #ff0000)',
    backgroundSize: '400% 400%',
    filter: 'blur(5px)',
    transitionDuration: '300ms',
    transitionProperty: 'opacity',
    animationDuration: '20s',
    animationTimingFunction: 'linear',
    animationIterationCount: 'infinite',
    animationKeyframes: glowKeyframes,
    zIndex: 0,
  },
  glowInner: {
    position: 'relative',
    zIndex: 1,
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
  mobileMenuOverlay: {
    position: 'absolute',
    top: 56,
    left: 14,
    right: 14,
    zIndex: 80,
  },
  content: {
    flexGrow: 0,
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  menuRow: {
    gap: 10,
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
  heroBg: {
    width: '100%',
    height: 380,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBgMobile: {
    height: 232,
    marginLeft: 0,
    marginRight: 0,
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
  heroOverlayMobile: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 18,
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
  heroCtaMobile: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    minWidth: 96,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
  },
  heroCtaMobileWide: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    minWidth: 118,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
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
  radioOuter: {
    width: 16,
    height: 16,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  radioOuterActive: {
    borderColor: '#2563EB',
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#2563EB',
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
  serviceMenuCard: {
    minHeight: 96,
    borderRadius: 16,
    borderWidth: 1.5,
    paddingHorizontal: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  statsStrip: {
    width: '100%',
    paddingVertical: 44,
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
  mobileStatItem: {
    width: '100%',
    minHeight: 112,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.11)',
    justifyContent: 'center',
  },
  statIcon: {
    width: 48,
    height: 48,
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
    paddingTop: 36,
    paddingBottom: 36,
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
    width: 44,
    height: 44,
    minWidth: 44,
    minHeight: 44,
    padding: 0,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
} as any);


