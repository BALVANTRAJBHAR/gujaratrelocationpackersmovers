import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, Dimensions, ImageBackground, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { H1, H2, Image, Paragraph, Text, XStack, YStack } from 'tamagui';

import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';

const theme = {
  bg: '#FFFFFF',
  bgCard: '#FFFFFF',
  text: '#111827',
  textMuted: '#6B7280',
  primary: '#4F46E5',
  accent: '#F97316',
  border: '#E5E7EB',
};

const { width: screenWidth } = Dimensions.get('window');

const menuItems = ['Home', 'Services', 'Track', 'Contact'];

type ServiceKey =
  | 'office-shifting'
  | 'car-bike-transport'
  | 'packing-and-moving'
  | 'warehouse-services'
  | 'international-relocation'
  | 'transportation-service'
  | 'loading-unloading'
  | 'domestic-relocations';

type ServiceConfig = {
  title: string;
  heroImage: any;
  rating: string;
  exp: string;
  priceLabel: string;
  priceSub: string;
  aboutTitle: string;
  about: string[];
  included: string[];
  faqs: { q: string; a: string }[];
};

const SERVICES: Record<ServiceKey, ServiceConfig> = {
  'office-shifting': {
    title: 'Office Shifting',
    heroImage: require('../../assets/images/moving-house-service.webp'),
    rating: '4.8',
    exp: '18+ Years Experience',
    priceLabel: '₹8,000',
    priceSub: 'Starting price for small office',
    aboutTitle: 'About This Service',
    about: [
      'Our office shifting services ensure minimal downtime and stress-free business relocation. We plan and execute office moves with precision and efficiency.',
      'From IT equipment to furniture, documents to delicate electronics — we handle everything systematically to ensure your business is up and running at the new location as quickly as possible.',
    ],
    included: [
      'Minimal business downtime',
      'Document and file packing',
      'After-hours and weekend moves available',
      'Post move support',
      'IT equipment handling specialists',
      'Furniture disassembly and setup',
      'Labeling and inventory management',
    ],
    faqs: [
      { q: 'Can you move during weekends?', a: 'Yes, we offer weekend and after-hours moving to minimize business disruption.' },
      { q: 'How do you handle IT equipment?', a: 'We use anti-static packing, careful labeling, and dedicated handling for sensitive electronics.' },
      { q: 'Do you provide storage if needed?', a: 'Yes, short-term storage options are available based on requirements.' },
    ],
  },
  'car-bike-transport': {
    title: 'Car & Bike Transport',
    heroImage: require('../../assets/images/furniture-packers-moving-helpers-carry.webp'),
    rating: '4.8',
    exp: '18+ Years Experience',
    priceLabel: '₹5,000',
    priceSub: 'Starting price within state',
    aboutTitle: 'About This Service',
    about: [
      'Vehicle transport made safe and simple. We ensure your car or bike reaches its destination without a scratch.',
      'We use specialized carriers and bike trailers with proper securing mechanisms. All vehicles are covered with comprehensive transit insurance.',
    ],
    included: [
      'Enclosed car carriers',
      'Door-to-door pickup and delivery',
      'Comprehensive transit insurance',
      'Secure bike transportation',
      'GPS tracking available',
      'Pan-India network',
    ],
    faqs: [
      { q: 'Is my vehicle insured during transport?', a: 'Yes, all vehicles are covered with comprehensive transit insurance.' },
      { q: 'How long does it take?', a: 'Timelines depend on distance and route. We share an ETA at the time of booking.' },
      { q: 'Can I track my vehicle?', a: 'Yes, GPS tracking is available on eligible shipments.' },
    ],
  },
  'packing-and-moving': {
    title: 'Packing and Moving',
    heroImage: require('../../assets/images/truckpackers.jpg'),
    rating: '4.8',
    exp: '18+ Years Experience',
    priceLabel: '₹2,000',
    priceSub: 'Packing charges for 1BHK',
    aboutTitle: 'About This Service',
    about: [
      'Complete packing and moving solutions tailored to your needs. Our expert team uses high-quality materials and proven techniques to ensure all your belongings are packed safely.',
      'We handle everything from fragile glassware to heavy furniture, ensuring proper protection at every step.',
    ],
    included: [
      'Quality packing materials included',
      'Systematic labeling',
      'Specialized packing for fragile items',
      'Inventory checklist',
    ],
    faqs: [
      { q: 'What packing materials do you use?', a: 'We use corrugated boxes, bubble wrap, thermocol, stretch film, and premium tape.' },
      { q: 'Do you pack fragile items separately?', a: 'Yes, fragile items get extra cushioning and separate handling labels.' },
    ],
  },
  'warehouse-services': {
    title: 'Warehouse Services',
    heroImage: require('../../assets/images/packers-movers-bg.jpg'),
    rating: '4.8',
    exp: '18+ Years Experience',
    priceLabel: '₹1,500',
    priceSub: 'Per month for small storage',
    aboutTitle: 'About This Service',
    about: [
      'Need safe storage during a move or long-term? We provide secure warehousing solutions with flexible duration.',
      'Our warehouses are equipped with 24/7 security, fire safety systems, and pest control measures.',
    ],
    included: [
      '24/7 security and CCTV',
      'Flexible storage duration',
      'Pest-free environment',
      'Climate-controlled options',
      'Easy access when needed',
      'Fire safety systems',
    ],
    faqs: [
      { q: 'What is the minimum storage duration?', a: 'Minimum storage period is 1 month, but we offer flexible plans.' },
      { q: 'Can I access my items anytime?', a: 'Yes, access can be arranged during business hours with prior notice.' },
    ],
  },
  'international-relocation': {
    title: 'International Relocation',
    heroImage: require('../../assets/images/moving-house-service.webp'),
    rating: '4.8',
    exp: '18+ Years Experience',
    priceLabel: 'Custom Quote',
    priceSub: 'Custom quote based on destination',
    aboutTitle: 'About This Service',
    about: [
      'International relocation made easy. We handle documentation, customs clearance, packing, and shipping with complete support.',
      'Our global network ensures your belongings reach any corner of the world safely and on time.',
    ],
    included: [
      'Complete documentation support',
      'Air and sea freight options',
      'Destination services available',
      'Customs clearance assistance',
      'Door-to-door international service',
      'Tracking and updates',
    ],
    faqs: [
      { q: 'How long does international shipping take?', a: 'Sea freight takes 4-8 weeks, air freight takes 1-2 weeks depending on destination.' },
      { q: 'Do you handle customs?', a: 'Yes, we assist with customs clearance and documentation.' },
    ],
  },
  'transportation-service': {
    title: 'Transportation Service',
    heroImage: require('../../assets/images/truckpackers.jpg'),
    rating: '4.8',
    exp: '18+ Years Experience',
    priceLabel: '₹4,000',
    priceSub: 'Starting price for local transport',
    aboutTitle: 'About This Service',
    about: [
      'Fast and secure transportation for household and business goods. We provide reliable vehicles, trained drivers, and careful handling at every step.',
      'From local moves to intercity deliveries, we ensure timely pickup and safe drop with transparent pricing.',
    ],
    included: [
      'Clean and well-maintained vehicles',
      'Trained driver and route planning',
      'Safe loading and placement',
      'GPS tracking available',
      'On-time pickup and delivery',
      'Support team assistance',
    ],
    faqs: [
      { q: 'Do you provide same-day transportation?', a: 'Yes, depending on availability and distance. Contact us for slot confirmation.' },
      { q: 'Can I track the vehicle?', a: 'Yes, GPS tracking is available on eligible shipments.' },
      { q: 'Is packing included?', a: 'Packing is optional. You can book packing separately or choose a full move package.' },
    ],
  },
  'loading-unloading': {
    title: 'Loading and Unloading',
    heroImage: require('../../assets/images/packers-movers-bg.jpg'),
    rating: '4.8',
    exp: '18+ Years Experience',
    priceLabel: '₹1,200',
    priceSub: 'Starting price for basic labor',
    aboutTitle: 'About This Service',
    about: [
      'Professional loading and unloading services with trained laborers and proper equipment. We focus on safety, speed, and damage-free handling.',
      'Ideal for shifting within the same building, moving to a new floor, or loading goods into trucks/containers.',
    ],
    included: [
      'Trained labor support',
      'Safe handling of fragile items',
      'Proper lifting techniques',
      'Placement as per your instructions',
      'Basic tools and straps (as needed)',
      'On-site supervision',
    ],
    faqs: [
      { q: 'Do you provide labor by the hour?', a: 'We offer both hourly and fixed packages based on job size and complexity.' },
      { q: 'Can you handle heavy items?', a: 'Yes, we can handle heavy items with sufficient manpower and equipment.' },
      { q: 'Is packaging mandatory?', a: 'Not mandatory, but we recommend packing for delicate items to avoid damage.' },
    ],
  },
  'domestic-relocations': {
    title: 'Domestic Relocations',
    heroImage: require('../../assets/images/moving-house-service.webp'),
    rating: '4.8',
    exp: '18+ Years Experience',
    priceLabel: '₹12,000',
    priceSub: 'Starting price for intercity relocation',
    aboutTitle: 'About This Service',
    about: [
      'End-to-end domestic relocation services for households and offices across India. We manage packing, transport, and delivery with complete coordination.',
      'Our nationwide network and scheduling ensure your move is smooth, secure, and on time.',
    ],
    included: [
      'Door-to-door service',
      'Packing and labeling (optional)',
      'Safe long-distance transport',
      'Dedicated move coordinator',
      'Insurance options available',
      'Timely delivery updates',
    ],
    faqs: [
      { q: 'How do you estimate domestic move cost?', a: 'Cost depends on distance, volume/weight, floors, packing type, and vehicle size.' },
      { q: 'Do you offer insurance?', a: 'Yes, insurance options are available depending on the package and route.' },
      { q: 'How many days does delivery take?', a: 'Delivery time varies by route and distance. We provide an ETA at booking time.' },
    ],
  },
};

export default function ServiceDetailScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug?: string }>();
  const { session, profile } = useSession();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isSmallScreen = screenWidth <= 768;

  const [quoteModalOpen, setQuoteModalOpen] = useState(false);
  const [quoteName, setQuoteName] = useState('');
  const [quotePhone, setQuotePhone] = useState('');
  const [quoteEmail, setQuoteEmail] = useState('');
  const [quoteMessage, setQuoteMessage] = useState('');
  const [quoteSubmitting, setQuoteSubmitting] = useState(false);

  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const key = (slug ?? '') as ServiceKey;
  const service = SERVICES[key];

  const handleBook = () => {
    if (!session) {
      router.push({ pathname: '/auth/login' } as any);
      return;
    }
    const role = (profile?.role ?? 'customer').toString().trim().toLowerCase();
    if (role === 'customer') {
      router.push({ pathname: '/book' } as any);
      return;
    }
    router.push({ pathname: '/(tabs)' } as any);
  };

  const handleCallNow = () => {
    Linking.openURL('tel:+919987963470');
  };

  const handleWhatsApp = () => {
    Linking.openURL('https://wa.me/919987963470');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/home');
  };

  const submitQuoteRequest = async () => {
    const name = quoteName.trim();
    const phone = quotePhone.trim().replace(/\D/g, '');
    const email = quoteEmail.trim();
    const message = quoteMessage.trim();

    const normalizedEmail = email ? email.toLowerCase() : '';
    if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizedEmail)) {
      Alert.alert('Wrong Email', 'Please enter a valid email address.');
      return;
    }

    if (!name || !phone) {
      Alert.alert('Missing info', 'Please enter your name and phone number.');
      return;
    }

    if (phone.length !== 10) {
      Alert.alert('Invalid phone', 'Phone number must be exactly 10 digits.');
      return;
    }

    try {
      setQuoteSubmitting(true);
      const { error: fnError } = await supabase.functions.invoke('send-quote-request', {
        body: {
          payload: {
            name,
            phone,
            email: normalizedEmail || undefined,
            service: service?.title ?? 'Service',
            message: message || undefined,
            source: `service_${String(slug ?? '').slice(0, 40)}`,
          },
        },
      });

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
        throw new Error(full);
      }

      setQuoteModalOpen(false);
      Alert.alert('Request submitted', 'Thank you! Our team will contact you shortly.');
    } catch (e: any) {
      Alert.alert('Failed', e?.message ? String(e.message) : 'Could not submit your request.');
    } finally {
      setQuoteSubmitting(false);
    }
  };

  const heroMeta = useMemo(() => ({ rating: service?.rating ?? '4.8', exp: service?.exp ?? '18+ Years Experience' }), [service]);

  if (!service) {
    return (
      <View style={styles.page}>
        <YStack padding={20} gap="$3" alignItems="center" justifyContent="center" flex={1}>
          <Text color={theme.text} fontSize={18} fontWeight="900">Service not found</Text>
          <Pressable onPress={() => router.push('/home')}>
            <YStack paddingHorizontal={18} paddingVertical={12} borderRadius={12} backgroundColor={theme.primary}>
              <Text color="#FFFFFF" fontWeight="900">Go Home</Text>
            </YStack>
          </Pressable>
        </YStack>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <YStack paddingHorizontal={16} paddingTop={16} paddingBottom={10} gap="$3">
          <XStack alignItems="center" gap="$3" flexWrap="wrap" justifyContent="space-between">
            <Pressable onPress={() => router.push('/home')}>
              <Image source={require('../../assets/images/PackersMoversLogo.png')} style={styles.logo} />
            </Pressable>

            {!isSmallScreen ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.menuRow}>
                <XStack gap="$2" alignItems="center" flexWrap="wrap">
                  {menuItems.map((item) => (
                    <Pressable
                      key={item}
                      onPress={() => {
                        if (item === 'Home') router.push('/home');
                        if (item === 'Services') router.push('/home');
                        if (item === 'Track') router.push('/(tabs)/tracking');
                        if (item === 'Contact') router.push('/home');
                      }}
                    >
                      <YStack paddingHorizontal={20} paddingVertical={12} borderRadius={12} backgroundColor={theme.primary}>
                        <Text color="#FFFFFF" fontSize={14} fontWeight="700" letterSpacing={0.5}>
                          {item}
                        </Text>
                      </YStack>
                    </Pressable>
                  ))}

                  {session ? (
                    <>
                      <Pressable onPress={handleBook}>
                        <YStack paddingHorizontal={18} paddingVertical={12} borderRadius={12} backgroundColor={theme.accent}>
                          <Text color="#FFFFFF" fontSize={14} fontWeight="800">My Bookings</Text>
                        </YStack>
                      </Pressable>
                      <Pressable onPress={handleLogout}>
                        <YStack paddingHorizontal={14} paddingVertical={12} borderRadius={12} backgroundColor="#111827">
                          <Text color="#FFFFFF" fontSize={14} fontWeight="800">Logout</Text>
                        </YStack>
                      </Pressable>
                    </>
                  ) : (
                    <Pressable onPress={() => router.push('/auth/login')}>
                      <YStack paddingHorizontal={24} paddingVertical={12} borderRadius={12} backgroundColor="#111827">
                        <Text color="#FFFFFF" fontSize={14} fontWeight="800">Login</Text>
                      </YStack>
                    </Pressable>
                  )}
                </XStack>
              </ScrollView>
            ) : (
              <XStack gap="$2" alignItems="center">
                <Pressable onPress={() => setMobileMenuOpen(!mobileMenuOpen)}>
                  <YStack paddingHorizontal={16} paddingVertical={12} borderRadius={10} backgroundColor={theme.primary}>
                    <Text color="#FFFFFF" fontSize={20} fontWeight="900">☰</Text>
                  </YStack>
                </Pressable>
              </XStack>
            )}
          </XStack>

          {isSmallScreen && mobileMenuOpen && (
            <YStack backgroundColor={theme.bgCard} borderRadius={16} padding={16} gap={12} borderWidth={1} borderColor={theme.border}>
              {menuItems.map((item) => (
                <Pressable
                  key={item}
                  onPress={() => {
                    setMobileMenuOpen(false);
                    if (item === 'Home') router.push('/home');
                    if (item === 'Services') router.push('/home?scrollTo=services');
                    if (item === 'Track') router.push('/(tabs)/tracking');
                    if (item === 'Contact') router.push('/home?scrollTo=contact');
                  }}
                >
                  <Text color={theme.text} fontSize={16} fontWeight="700" paddingVertical={8}>
                    {item}
                  </Text>
                </Pressable>
              ))}

              {session ? (
                <>
                  <Pressable
                    onPress={() => {
                      setMobileMenuOpen(false);
                      handleBook();
                    }}
                  >
                    <Text color={theme.primary} fontSize={16} fontWeight="800" paddingVertical={8}>
                      My Bookings
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setMobileMenuOpen(false);
                      void handleLogout();
                    }}
                  >
                    <Text color={theme.accent} fontSize={16} fontWeight="800" paddingVertical={8}>
                      Logout
                    </Text>
                  </Pressable>
                </>
              ) : (
                <Pressable
                  onPress={() => {
                    setMobileMenuOpen(false);
                    router.push('/auth/login');
                  }}
                >
                  <Text color={theme.primary} fontSize={16} fontWeight="800" paddingVertical={8}>
                    Login
                  </Text>
                </Pressable>
              )}
            </YStack>
          )}
        </YStack>

        <ImageBackground source={service.heroImage} style={styles.hero} imageStyle={styles.heroImage}>
          <View style={styles.heroOverlay} />
          <YStack padding={18} gap="$2">
            <H1 color="#FFFFFF" fontSize={28} fontWeight="900">{service.title}</H1>
            <XStack gap="$3" alignItems="center" flexWrap="wrap">
              <Text color="#FBBF24" fontWeight="900">★ {heroMeta.rating}</Text>
              <Text color="rgba(255,255,255,0.85)" fontWeight="700">|</Text>
              <Text color="rgba(255,255,255,0.92)" fontWeight="800">{heroMeta.exp}</Text>
            </XStack>
          </YStack>
        </ImageBackground>

        <YStack paddingHorizontal={16} marginTop={14} gap="$3">
          <YStack backgroundColor="#1F3B63" borderRadius={16} padding={16} gap="$2" shadowColor="rgba(0,0,0,0.2)" shadowOffset={{ width: 0, height: 8 }} shadowOpacity={0.2} shadowRadius={16} elevation={6}>
            <YStack>
              <Text color="#E5E7EB" fontSize={12} fontWeight="700">Starting from</Text>
              <Text color="#FFFFFF" fontSize={22} fontWeight="900">{service.priceLabel}</Text>
              <Text color="rgba(255,255,255,0.85)" fontSize={11} fontWeight="700">{service.priceSub}</Text>
            </YStack>
            <XStack gap="$2" flexWrap="wrap" marginTop={10}>
              <Pressable
                onPress={() => {
                  setQuoteMessage(service.title);
                  setQuoteModalOpen(true);
                }}
              >
                <YStack style={[styles.ctaBtn, { backgroundColor: '#FBBF24' }]}>
                  <Text color="#111827" fontWeight="900" fontSize={13}>Request Callback</Text>
                </YStack>
              </Pressable>
              <Pressable onPress={handleBook}>
                <YStack style={[styles.ctaBtn, { backgroundColor: '#111827' }]}>
                  <Text color="#FFFFFF" fontWeight="900" fontSize={13}>Book Now</Text>
                </YStack>
              </Pressable>
            </XStack>
          </YStack>

          <YStack gap="$2">
            <H2 color={theme.text} fontSize={18} fontWeight="900">{service.aboutTitle}</H2>
            {service.about.map((p) => (
              <Paragraph key={p} color={theme.textMuted} fontSize={13} lineHeight={20} fontWeight="600">
                {p}
              </Paragraph>
            ))}
          </YStack>

          <YStack backgroundColor={theme.bgCard} borderRadius={16} borderWidth={1} borderColor={theme.border} padding={16} gap="$2">
            <Text color={theme.text} fontSize={16} fontWeight="900">What’s Included</Text>
            <XStack flexWrap="wrap" gap="$2" justifyContent="space-between">
              {service.included.map((t) => (
                <XStack key={t} gap="$2" alignItems="center" width={isSmallScreen ? '100%' : '48%'}>
                  <Text color="#22C55E" fontSize={14} fontWeight="900">✓</Text>
                  <Text color={theme.textMuted} fontSize={12} fontWeight="700" flex={1}>
                    {t}
                  </Text>
                </XStack>
              ))}
            </XStack>
          </YStack>

          <YStack backgroundColor={theme.bgCard} borderRadius={16} borderWidth={1} borderColor={theme.border} padding={16} gap="$2">
            <Text color={theme.text} fontSize={16} fontWeight="900">Frequently Asked Questions</Text>
            {service.faqs.map((f, idx) => {
              const open = openFaq === idx;
              return (
                <YStack key={f.q} borderRadius={12} borderWidth={1} borderColor={theme.border} overflow="hidden">
                  <Pressable onPress={() => setOpenFaq(open ? null : idx)}>
                    <XStack alignItems="center" justifyContent="space-between" paddingHorizontal={14} paddingVertical={12} backgroundColor="#F8FAFC">
                      <Text color={theme.text} fontSize={12} fontWeight="800" flex={1}>
                        {f.q}
                      </Text>
                      <Text color={theme.textMuted} fontSize={18} fontWeight="900">{open ? '−' : '+'}</Text>
                    </XStack>
                  </Pressable>
                  {open ? (
                    <YStack paddingHorizontal={14} paddingVertical={12} backgroundColor="#FFFFFF">
                      <Text color={theme.textMuted} fontSize={12} fontWeight="700" lineHeight={18}>
                        {f.a}
                      </Text>
                    </YStack>
                  ) : null}
                </YStack>
              );
            })}
          </YStack>

          <YStack backgroundColor={theme.bgCard} borderRadius={16} borderWidth={1} borderColor={theme.border} padding={16} gap="$2">
            <XStack alignItems="center" justifyContent="space-between">
              <Text color={theme.text} fontSize={16} fontWeight="900">Customer Reviews</Text>
              <Text color={theme.primary} fontSize={12} fontWeight="800">View All →</Text>
            </XStack>
            {[{
              name: 'Amit P.',
              rating: '★★★★★',
              body: 'Excellent service! Very professional team.',
              letter: 'A',
            }, {
              name: 'Priya S.',
              rating: '★★★★★',
              body: 'Highly recommended. Careful handling of all items.',
              letter: 'P',
            }].map((r) => (
              <XStack key={r.name} gap="$3" paddingVertical={10} borderBottomWidth={1} borderBottomColor={theme.border}>
                <YStack width={34} height={34} borderRadius={17} backgroundColor="#111827" alignItems="center" justifyContent="center">
                  <Text color="#FFFFFF" fontWeight="900">{r.letter}</Text>
                </YStack>
                <YStack flex={1} gap="$1">
                  <Text color={theme.text} fontSize={12} fontWeight="900">{r.name}</Text>
                  <Text color="#D97706" fontSize={12} fontWeight="900">{r.rating}</Text>
                  <Text color={theme.textMuted} fontSize={12} fontWeight="700">{r.body}</Text>
                </YStack>
              </XStack>
            ))}
          </YStack>

          <YStack height={78} />
        </YStack>
      </ScrollView>

      <YStack style={styles.bottomBar}>
        <XStack alignItems="center" justifyContent="space-between" gap="$2" flexWrap="wrap">
          <YStack flex={1} minWidth={130}>
            <Text color="#111827" fontSize={12} fontWeight="900">Ready to Book?</Text>
          </YStack>
          <XStack gap="$2" flexWrap="wrap" justifyContent="flex-end">
            <Pressable onPress={handleCallNow}>
              <YStack style={[styles.bottomBtn, { backgroundColor: '#FFFFFF' }]}>
                <Text color="#111827" fontWeight="900" fontSize={12}>Call Now</Text>
              </YStack>
            </Pressable>
            <Pressable onPress={handleWhatsApp}>
              <YStack style={[styles.bottomBtn, { backgroundColor: '#22C55E' }]}>
                <Text color="#FFFFFF" fontWeight="900" fontSize={12}>WhatsApp</Text>
              </YStack>
            </Pressable>
            <Pressable onPress={handleBook}>
              <YStack style={[styles.bottomBtn, { backgroundColor: '#111827' }]}>
                <Text color="#FFFFFF" fontWeight="900" fontSize={12}>Book Online →</Text>
              </YStack>
            </Pressable>
          </XStack>
        </XStack>
      </YStack>

      <Modal visible={quoteModalOpen} transparent animationType="fade" onRequestClose={() => setQuoteModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <XStack alignItems="center" justifyContent="space-between" marginBottom={12}>
              <Text color={theme.text} fontSize={16} fontWeight="900">Request Callback</Text>
              <Pressable onPress={() => setQuoteModalOpen(false)}>
                <Text color={theme.textMuted} fontSize={20} fontWeight="900">×</Text>
              </Pressable>
            </XStack>

            <TextInput
              value={quoteName}
              onChangeText={setQuoteName}
              placeholder="Your Name *"
              placeholderTextColor="#9CA3AF"
              style={styles.modalInput}
            />
            <TextInput
              value={quotePhone}
              onChangeText={setQuotePhone}
              placeholder="Phone Number *"
              placeholderTextColor="#9CA3AF"
              keyboardType="phone-pad"
              style={styles.modalInput}
            />
            <TextInput
              value={quoteEmail}
              onChangeText={setQuoteEmail}
              placeholder="Email (Optional)"
              placeholderTextColor="#9CA3AF"
              keyboardType="email-address"
              autoCapitalize="none"
              style={styles.modalInput}
            />
            <TextInput
              value={quoteMessage}
              onChangeText={setQuoteMessage}
              placeholder="Message"
              placeholderTextColor="#9CA3AF"
              multiline
              style={[styles.modalInput, { height: 92, textAlignVertical: 'top' }]}
            />

            <Pressable disabled={quoteSubmitting} onPress={submitQuoteRequest}>
              <YStack style={[styles.modalSubmit, { opacity: quoteSubmitting ? 0.7 : 1 }]}>
                <Text color="#FFFFFF" fontSize={14} fontWeight="900">
                  {quoteSubmitting ? 'Submitting…' : 'Request Callback'}
                </Text>
              </YStack>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  content: {
    paddingBottom: 12,
  },
  logo: {
    width: 44,
    height: 44,
    resizeMode: 'contain',
  },
  menuRow: {
    paddingLeft: 0,
    paddingRight: 0,
  },
  hero: {
    height: 210,
    marginHorizontal: 16,
    borderRadius: 18,
    overflow: 'hidden',
  },
  heroImage: {
    resizeMode: 'cover',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
  },
  ctaBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    minWidth: 140,
    alignItems: 'center',
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#D6B23A',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.08)',
  },
  bottomBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    padding: 16,
    backgroundColor: '#FFFFFF',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    marginBottom: 10,
    color: '#111827',
  },
  modalSubmit: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#4F46E5',
  },
});
