import { useRouter } from 'expo-router';
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

const FAQS = [
  { q: 'How much does house shifting cost?', a: 'Pricing depends on distance, items volume, and floor/lift availability. Request a callback for an exact quote.' },
  { q: 'How far in advance should I book?', a: 'We recommend booking 1-3 days in advance for best slot availability.' },
  { q: 'Is insurance included?', a: 'Basic coverage is available; add-on insurance can be provided depending on your move.' },
  { q: 'Do you provide packing materials?', a: 'Yes, we provide quality packing materials and trained packers for safe handling.' },
];

const { width: screenWidth } = Dimensions.get('window');

const menuItems = ['Home', 'Services', 'Track', 'Contact'];

export default function HouseholdShiftingScreen() {
  const router = useRouter();
  const { session, profile } = useSession();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isSmallScreen = screenWidth <= 768;

  const [quoteModalOpen, setQuoteModalOpen] = useState(false);
  const [quoteName, setQuoteName] = useState('');
  const [quotePhone, setQuotePhone] = useState('');
  const [quoteEmail, setQuoteEmail] = useState('');
  const [quoteMessage, setQuoteMessage] = useState('Household Shifting');
  const [quoteSubmitting, setQuoteSubmitting] = useState(false);

  const [openFaq, setOpenFaq] = useState<number | null>(null);

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
            service: 'Household Shifting',
            message: message || undefined,
            source: 'service_household',
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

  const heroMeta = useMemo(() => ({ rating: '4.8', exp: '18+ Years Experience' }), []);

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
                        if (item === 'Services') router.push('/home?scrollTo=services');
                        if (item === 'Track') router.push('/(tabs)/tracking');
                        if (item === 'Contact') router.push('/home?scrollTo=contact');
                      }}
                    >
                      <YStack
                        paddingHorizontal={20}
                        paddingVertical={12}
                        borderRadius={12}
                        backgroundColor={theme.primary}
                      >
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
                          <Text color="#FFFFFF" fontSize={14} fontWeight="800">
                            My Bookings
                          </Text>
                        </YStack>
                      </Pressable>
                      <Pressable onPress={handleLogout}>
                        <YStack paddingHorizontal={14} paddingVertical={12} borderRadius={12} backgroundColor="#111827">
                          <Text color="#FFFFFF" fontSize={14} fontWeight="800">
                            Logout
                          </Text>
                        </YStack>
                      </Pressable>
                    </>
                  ) : (
                    <Pressable onPress={() => router.push('/auth/login')}>
                      <YStack paddingHorizontal={24} paddingVertical={12} borderRadius={12} backgroundColor="#111827">
                        <Text color="#FFFFFF" fontSize={14} fontWeight="800">
                          Login
                        </Text>
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
            <YStack
              backgroundColor={theme.bgCard}
              borderRadius={16}
              padding={16}
              gap={12}
              borderWidth={1}
              borderColor={theme.border}
            >
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
                  <Pressable onPress={() => { setMobileMenuOpen(false); handleBook(); }}>
                    <Text color={theme.primary} fontSize={16} fontWeight="800" paddingVertical={8}>
                      My Bookings
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => { setMobileMenuOpen(false); void handleLogout(); }}>
                    <Text color={theme.accent} fontSize={16} fontWeight="800" paddingVertical={8}>
                      Logout
                    </Text>
                  </Pressable>
                </>
              ) : (
                <Pressable onPress={() => { setMobileMenuOpen(false); router.push('/auth/login'); }}>
                  <Text color={theme.primary} fontSize={16} fontWeight="800" paddingVertical={8}>
                    Login
                  </Text>
                </Pressable>
              )}
            </YStack>
          )}
        </YStack>

        <ImageBackground source={require('../../assets/images/packers-movers-bg.jpg')} style={styles.hero} imageStyle={styles.heroImage}>
          <View style={styles.heroOverlay} />
          <YStack padding={18} gap="$2">
            <H1 color="#FFFFFF" fontSize={28} fontWeight="900">Household Shifting</H1>
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
              <Text color="#FFFFFF" fontSize={22} fontWeight="900">₹3,000</Text>
              <Text color="rgba(255,255,255,0.85)" fontSize={11} fontWeight="700">Starting price for 1 BHK within 10km</Text>
            </YStack>
            <XStack gap="$2" flexWrap="wrap" marginTop={10}>
              <Pressable onPress={() => setQuoteModalOpen(true)}>
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
            <H2 color={theme.text} fontSize={18} fontWeight="900">Overview</H2>
            <Paragraph color={theme.textMuted} fontSize={13} lineHeight={20} fontWeight="600">
              Our household shifting services ensure a smooth and stress-free relocation experience. We handle everything from packing delicate items to safe transportation of your furniture and belongings to your new home.
            </Paragraph>
            <Paragraph color={theme.textMuted} fontSize={13} lineHeight={20} fontWeight="600">
              Our trained professionals use high-quality packing materials and modern equipment to ensure your items are protected throughout the journey. We offer door-to-door service with complete transparency in pricing.
            </Paragraph>
          </YStack>

          <YStack backgroundColor={theme.bgCard} borderRadius={16} borderWidth={1} borderColor={theme.border} padding={16} gap="$2">
            <Text color={theme.text} fontSize={16} fontWeight="900">What’s Included</Text>
            {[
              'Professional packing with quality materials',
              'Careful handling of delicate items',
              'Furniture dismantling and reassembly',
              'Loading and unloading with proper equipment',
              'Full insurance coverage',
              'Real time tracking available',
              'Unpacking and arrangement at destination',
            ].map((t) => (
              <XStack key={t} gap="$2" alignItems="center">
                <Text color="#22C55E" fontSize={14} fontWeight="900">✓</Text>
                <Text color={theme.textMuted} fontSize={12} fontWeight="700" flex={1}>
                  {t}
                </Text>
              </XStack>
            ))}
          </YStack>

          <YStack backgroundColor={theme.bgCard} borderRadius={16} borderWidth={1} borderColor={theme.border} padding={16} gap="$2">
            <Text color={theme.text} fontSize={16} fontWeight="900">Frequently Asked Questions</Text>
            {FAQS.map((f, idx) => {
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
              name: 'Amit Sharma',
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
