import StickyHeader from '@/app/components/sticky-header';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, Dimensions, ImageBackground, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { H1, H2, Image, Paragraph, Text, XStack, YStack } from 'tamagui';

import { themes } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';
import { t } from '@/constants/typography';

const FAQS = [
  { q: 'How much does house shifting cost?', a: 'Pricing depends on distance, items volume, and floor/lift availability. Request a callback for an exact quote.' },
  { q: 'How far in advance should I book?', a: 'We recommend booking 1-3 days in advance for best slot availability.' },
  { q: 'Is insurance included?', a: 'Basic coverage is available; add-on insurance can be provided depending on your move.' },
  { q: 'Do you provide packing materials?', a: 'Yes, we provide quality packing materials and trained packers for safe handling.' },
];

const { width: screenWidth } = Dimensions.get('window');

export default function HouseholdShiftingScreen() {
  const router = useRouter();
  const { session, profile } = useSession();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? themes.dark : themes.light;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [headerHovered, setHeaderHovered] = useState<string | null>(null);

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
      setQuoteName('');
      setQuotePhone('');
      setQuoteEmail('');
      setQuoteMessage('');
      Alert.alert('Request submitted', 'OUR EXECUTIVE WILL CALL WITHIN 10 MINUTE');
    } catch (e: any) {
      Alert.alert('Failed', e?.message ? String(e.message) : 'Could not submit your request.');
    } finally {
      setQuoteSubmitting(false);
    }
  };

  const heroMeta = useMemo(() => ({ rating: '4.8', exp: '18+ Years Experience' }), []);

  return (
    <View style={[styles.page, { backgroundColor: theme.bg }]}>
      <StickyHeader
        theme={theme}
        isSmallScreen={isSmallScreen}
        session={session}
        onHomePress={() => router.push('/home')}
        onLogout={handleLogout}
        onLoginPress={() => router.push('/auth/login')}
      />
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: isSmallScreen ? 76 : 96 }]} showsVerticalScrollIndicator={false}>

        <ImageBackground source={require('../../assets/images/packers-movers-bg.jpg')} style={[styles.hero, { height: isSmallScreen ? 260 : 340 }]} imageStyle={styles.heroImage}>
          <View style={styles.heroOverlay} />
          <YStack padding={isSmallScreen ? 18 : 28} gap="$2" justifyContent="flex-end" flex={1}>
            <H1 color="#FFFFFF" fontSize={isSmallScreen ? 26 : 40} fontWeight="900" lineHeight={isSmallScreen ? 32 : 50}>Household Shifting</H1>
            <XStack gap="$3" alignItems="center" flexWrap="wrap">
              <Text color={theme.accent} fontWeight="900" fontSize={isSmallScreen ? 14 : 16}>★ {heroMeta.rating}</Text>
              <Text color="rgba(255,255,255,0.85)" fontWeight="700">|</Text>
              <Text color="rgba(255,255,255,0.92)" fontWeight="800" fontSize={isSmallScreen ? 13 : 15}>{heroMeta.exp}</Text>
            </XStack>
          </YStack>
        </ImageBackground>

        <YStack paddingHorizontal={16} marginTop={14} gap="$3">
          <YStack backgroundColor="#1F3B63" borderRadius={16} padding={16} gap="$2" shadowColor="rgba(0,0,0,0.2)" shadowOffset={{ width: 0, height: 8 }} shadowOpacity={0.2} shadowRadius={16} elevation={6}>
            <YStack>
              <Text color={theme.textMuted} fontSize={isSmallScreen ? 13 : 15} fontWeight="700">Starting from</Text>
              <Text color="#FFFFFF" fontSize={isSmallScreen ? 26 : 32} fontWeight="900">₹3,000</Text>
              <Text color="rgba(255,255,255,0.85)" fontSize={isSmallScreen ? 13 : 14} fontWeight="700">Starting price for 1 BHK within 10km</Text>
            </YStack>
            <XStack gap="$2" flexWrap="wrap" marginTop={10}>
              <Pressable
                onHoverIn={Platform.OS === 'web' ? () => setHeaderHovered('callback') : undefined}
                onHoverOut={Platform.OS === 'web' ? () => setHeaderHovered(null) : undefined}
                onPress={() => setQuoteModalOpen(true)}>
                <YStack style={[styles.ctaBtn, { backgroundColor: theme.accent, borderWidth: 1, borderColor: headerHovered === 'callback' ? '#FBBF24' : 'transparent', boxShadow: headerHovered === 'callback' ? '0 0 10px 3px rgba(251, 191, 36, 0.5)' : undefined } as any]}>
                  <Text color={theme.text} fontWeight="900" fontSize={t(14)}>Request Callback</Text>
                </YStack>
              </Pressable>
              <Pressable
                onHoverIn={Platform.OS === 'web' ? () => setHeaderHovered('booknow') : undefined}
                onHoverOut={Platform.OS === 'web' ? () => setHeaderHovered(null) : undefined}
                onPress={handleBook}>
                <YStack style={[styles.ctaBtn, { backgroundColor: theme.bgSecondary, borderWidth: 1, borderColor: headerHovered === 'booknow' ? '#FBBF24' : 'transparent', boxShadow: headerHovered === 'booknow' ? '0 0 10px 3px rgba(251, 191, 36, 0.5)' : undefined } as any]}>
                  <Text color={theme.text} fontWeight="900" fontSize={t(14)}>Book Now</Text>
                </YStack>
              </Pressable>
            </XStack>
          </YStack>

          <YStack gap="$2">
            <H2 color={theme.text} fontSize={isSmallScreen ? 19 : 23} fontWeight="900">Overview</H2>
            <Paragraph color={theme.textMuted} fontSize={isSmallScreen ? 15 : 17} lineHeight={isSmallScreen ? 23 : 26} fontWeight="600">
              Our household shifting services ensure a smooth and stress-free relocation experience. We handle everything from packing delicate items to safe transportation of your furniture and belongings to your new home.
            </Paragraph>
            <Paragraph color={theme.textMuted} fontSize={isSmallScreen ? 15 : 17} lineHeight={isSmallScreen ? 23 : 26} fontWeight="600">
              Our trained professionals use high-quality packing materials and modern equipment to ensure your items are protected throughout the journey. We offer door-to-door service with complete transparency in pricing.
            </Paragraph>
          </YStack>

          <YStack backgroundColor={theme.bgCard} borderRadius={16} borderWidth={1} borderColor={theme.border} padding={16} gap="$2">
            <Text color={theme.text} fontSize={isSmallScreen ? 17 : 21} fontWeight="900">What’s Included</Text>
            {[
              'Professional packing with quality materials',
              'Careful handling of delicate items',
              'Furniture dismantling and reassembly',
              'Loading and unloading with proper equipment',
              'Full insurance coverage',
              'Real time tracking available',
              'Unpacking and arrangement at destination',
            ].map((feature) => (
              <XStack key={feature} gap="$2" alignItems="center">
                <Text color={theme.success} fontSize={isSmallScreen ? 15 : 17} fontWeight="900">✓</Text>
                <Text color={theme.textMuted} fontSize={isSmallScreen ? 14 : 16} fontWeight="700" flex={1}>
                  {feature}
                </Text>
              </XStack>
            ))}
          </YStack>

          <YStack backgroundColor={theme.bgCard} borderRadius={16} borderWidth={1} borderColor={theme.border} padding={16} gap="$2">
            <Text color={theme.text} fontSize={isSmallScreen ? 16 : 19} fontWeight="900">Frequently Asked Questions</Text>
            {FAQS.map((f, idx) => {
              const open = openFaq === idx;
              return (
                <YStack key={f.q} borderRadius={12} borderWidth={1} borderColor={theme.border} overflow="hidden">
                  <Pressable onPress={() => setOpenFaq(open ? null : idx)}>
                    <XStack alignItems="center" justifyContent="space-between" paddingHorizontal={14} paddingVertical={12} backgroundColor={theme.bgSecondary}>
                      <Text color={theme.text} fontSize={isSmallScreen ? 14 : 16} fontWeight="800" flex={1}>
                        {f.q}
                      </Text>
                      <Text color={theme.textMuted} fontSize={18} fontWeight="900">{open ? '−' : '+'}</Text>
                    </XStack>
                  </Pressable>
                  {open ? (
                    <YStack paddingHorizontal={14} paddingVertical={12} backgroundColor={theme.bgCard}>
                      <Text color={theme.textMuted} fontSize={isSmallScreen ? 14 : 15} fontWeight="700" lineHeight={18}>
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
              <Text color={theme.text} fontSize={t(17)} fontWeight="900">Customer Reviews</Text>
              <Text color={theme.primary} fontSize={t(13)} fontWeight="800">View All →</Text>
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
                <YStack width={34} height={34} borderRadius={17} backgroundColor={theme.primary} alignItems="center" justifyContent="center">
                  <Text color="#FFFFFF" fontWeight="900">{r.letter}</Text>
                </YStack>
                <YStack flex={1} gap="$1">
                  <Text color={theme.text} fontSize={t(13)} fontWeight="900">{r.name}</Text>
                  <Text color={theme.warning} fontSize={t(13)} fontWeight="900">{r.rating}</Text>
                  <Text color={theme.textMuted} fontSize={t(13)} fontWeight="700">{r.body}</Text>
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
            <Text color={theme.text} fontSize={isSmallScreen ? 14 : 16} fontWeight="900">Ready to Book?</Text>
          </YStack>
          <XStack gap="$2" flexWrap="wrap" justifyContent="flex-end">
            <Pressable onPress={handleCallNow}>
              <YStack style={[styles.bottomBtn, { backgroundColor: theme.bgCard }]}>
                <Text color={theme.text} fontWeight="900" fontSize={isSmallScreen ? 14 : 16}>Call Now</Text>
              </YStack>
            </Pressable>
            <Pressable onPress={handleWhatsApp}>
              <YStack style={[styles.bottomBtn, { backgroundColor: theme.success }]}>
                <Text color="#FFFFFF" fontWeight="900" fontSize={isSmallScreen ? 14 : 16}>WhatsApp</Text>
              </YStack>
            </Pressable>
            <Pressable onPress={handleBook}>
              <YStack style={[styles.bottomBtn, { backgroundColor: theme.bgSecondary }]}>
                <Text color={theme.text} fontWeight="900" fontSize={isSmallScreen ? 14 : 16}>Book Online →</Text>
              </YStack>
            </Pressable>
          </XStack>
        </XStack>
      </YStack>

      <Modal visible={quoteModalOpen} transparent animationType="fade" onRequestClose={() => setQuoteModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.bgCard }]}>
            <XStack alignItems="center" justifyContent="space-between" marginBottom={12}>
              <Text color={theme.text} fontSize={t(16)} fontWeight="900">Request Callback</Text>
              <Pressable onPress={() => setQuoteModalOpen(false)}>
                <Text color={theme.textMuted} fontSize={t(20)} fontWeight="900">×</Text>
              </Pressable>
            </XStack>

            <TextInput
              value={quoteName}
              onChangeText={setQuoteName}
              placeholder="Your Name *"
              placeholderTextColor={theme.textMuted}
              style={[styles.modalInput, { borderColor: theme.border, color: theme.inputText }]}
            />
            <TextInput
              value={quotePhone}
              onChangeText={setQuotePhone}
              placeholder="Phone Number *"
              placeholderTextColor={theme.textMuted}
              keyboardType="phone-pad"
              style={[styles.modalInput, { borderColor: theme.border, color: theme.inputText }]}
            />
            <TextInput
              value={quoteEmail}
              onChangeText={setQuoteEmail}
              placeholder="Email (Optional)"
              placeholderTextColor={theme.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              style={[styles.modalInput, { borderColor: theme.border, color: theme.inputText }]}
            />
            <TextInput
              value={quoteMessage}
              onChangeText={setQuoteMessage}
              placeholder="Message"
              placeholderTextColor={theme.textMuted}
              multiline
              style={[styles.modalInput, { borderColor: theme.border, color: theme.inputText, height: 92, textAlignVertical: 'top' }]}
            />

            <Pressable disabled={quoteSubmitting} onPress={submitQuoteRequest}>
              <YStack style={[styles.modalSubmit, { opacity: quoteSubmitting ? 0.7 : 1, backgroundColor: theme.primary }]}>
                <Text color="#FFFFFF" fontSize={t(14)} fontWeight="900">
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
  },
  content: {
    paddingBottom: 12,
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
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    minWidth: 110,
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
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    marginBottom: 10,
  },
  modalSubmit: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
});
