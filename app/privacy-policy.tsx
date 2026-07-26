import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { Button, Text, XStack, YStack } from 'tamagui';

import { themes } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getOrCreatePrivacyPdfUri, downloadLegalPdf, openLegalPdf } from '@/lib/legal-docs';
import { t } from '@/constants/typography';
import { COMPANY_EMAIL } from '@/constants/company';

export default function PrivacyPolicyScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? themes.dark : themes.light;
  const [pdfBusy, setPdfBusy] = React.useState(false);

  const openPdf = async () => {
    setPdfBusy(true);
    try {
      const uri = await getOrCreatePrivacyPdfUri();
      console.log('[PrivacyScreen] PDF URI:', uri);
      if (uri) await openLegalPdf(uri);
      else Alert.alert('Error', 'PDF generation returned empty URI.');
    } catch (e) {
      console.error('[PrivacyScreen] openPdf error:', e);
      Alert.alert('Error', `Could not open PDF.\n${String(e)}`);
    } finally {
      setPdfBusy(false);
    }
  };

  const downloadPdf = async () => {
    setPdfBusy(true);
    try {
      const uri = await getOrCreatePrivacyPdfUri();
      console.log('[PrivacyScreen] Download URI:', uri);
      if (uri) await downloadLegalPdf(uri, 'Gujarat_Relocation_Privacy_Policy.pdf');
      else Alert.alert('Error', 'PDF generation returned empty URI.');
    } catch (e) {
      console.error('[PrivacyScreen] downloadPdf error:', e);
      Alert.alert('Error', `Could not download PDF.\n${String(e)}`);
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 24, backgroundColor: theme.bg }}>
      <YStack gap="$4">
        <Pressable onPress={() => router.back()} style={{ alignSelf: 'flex-start' }}>
          <Text fontSize={t(14)} fontWeight="800" color={theme.primary} style={{ fontFamily: 'Times New Roman' }}>
            {'← Back'}
          </Text>
        </Pressable>

        <YStack gap="$2">
          <Text fontSize={t(28)} fontWeight="900" color={theme.text} style={{ fontFamily: 'Times New Roman' }}>
            Privacy Policy
          </Text>
          <Text fontSize={t(13)} fontWeight="700" color={theme.textMuted} style={{ fontFamily: 'Times New Roman' }}>
            Last updated: January 2025
          </Text>
        </YStack>

        <XStack gap="$2">
          <Button flex={1} backgroundColor="#D97706" color="#FFFFFF" borderRadius={12} onPress={openPdf} disabled={pdfBusy} opacity={pdfBusy ? 0.6 : 1}>
            {pdfBusy ? 'Opening…' : 'View PDF'}
          </Button>
          <Button flex={1} backgroundColor={theme.bgSecondary} color={theme.text} borderRadius={12} borderWidth={1} borderColor={theme.border} onPress={downloadPdf} disabled={pdfBusy} opacity={pdfBusy ? 0.6 : 1}>
            {pdfBusy ? 'Opening…' : 'Download PDF'}
          </Button>
        </XStack>

        <View style={{ height: 1, backgroundColor: theme.border }} />

        <YStack gap="$4">
          <YStack gap="$2">
            <Text fontSize={t(18)} fontWeight="900" color={theme.text} style={{ fontFamily: 'Times New Roman' }}>
              1. Information We Collect
            </Text>
            <Text fontSize={t(14)} fontWeight="600" lineHeight={22} color={theme.textMuted} style={{ fontFamily: 'Times New Roman' }}>
              We collect personal information such as your name, phone number, email address, pickup and drop locations,
              shifting inventory details, property addresses, service preferences, and media (photos/videos) when you use
              our services.
            </Text>
          </YStack>

          <YStack gap="$2">
            <Text fontSize={t(18)} fontWeight="900" color={theme.text} style={{ fontFamily: 'Times New Roman' }}>
              2. How We Use Your Information
            </Text>
            <Text fontSize={t(14)} fontWeight="600" lineHeight={22} color={theme.textMuted} style={{ fontFamily: 'Times New Roman' }}>
              We use the information to provide and manage shifting, home services, and property management services;
              process payments; communicate booking status and support requests; improve our services; and comply with
              legal obligations.
            </Text>
          </YStack>

          <YStack gap="$2">
            <Text fontSize={t(18)} fontWeight="900" color={theme.text} style={{ fontFamily: 'Times New Roman' }}>
              3. Information Sharing
            </Text>
            <Text fontSize={t(14)} fontWeight="600" lineHeight={22} color={theme.textMuted} style={{ fontFamily: 'Times New Roman' }}>
              We do not sell your personal information. We may share it with service partners (drivers, labourers),
              payment processors (Razorpay), or legal authorities as required by law.
            </Text>
          </YStack>

          <YStack gap="$2">
            <Text fontSize={t(18)} fontWeight="900" color={theme.text} style={{ fontFamily: 'Times New Roman' }}>
              4. Data Security
            </Text>
            <Text fontSize={t(14)} fontWeight="600" lineHeight={22} color={theme.textMuted} style={{ fontFamily: 'Times New Roman' }}>
              We implement SSL/TLS encryption, secure Supabase storage with row-level security, and access controls.
              However, no method of electronic storage or transmission is 100% secure.
            </Text>
          </YStack>

          <YStack gap="$2">
            <Text fontSize={t(18)} fontWeight="900" color={theme.text} style={{ fontFamily: 'Times New Roman' }}>
              5. Data Retention & Your Rights
            </Text>
            <Text fontSize={t(14)} fontWeight="600" lineHeight={22} color={theme.textMuted} style={{ fontFamily: 'Times New Roman' }}>
              We retain your data while your account is active. You have the right to access, correct, or delete your
              data. Contact {COMPANY_EMAIL} to exercise your rights.
            </Text>
          </YStack>

          <YStack gap="$2">
            <Text fontSize={t(18)} fontWeight="900" color={theme.text} style={{ fontFamily: 'Times New Roman' }}>
              6. Third-Party Services
            </Text>
            <Text fontSize={t(14)} fontWeight="600" lineHeight={22} color={theme.textMuted} style={{ fontFamily: 'Times New Roman' }}>
              We integrate with Supabase, Razorpay, Mapbox, and Expo. These services have their own privacy policies.
            </Text>
          </YStack>

          <YStack gap="$2">
            <Text fontSize={t(18)} fontWeight="900" color={theme.text} style={{ fontFamily: 'Times New Roman' }}>
              7. Contact
            </Text>
            <Text fontSize={t(14)} fontWeight="600" lineHeight={22} color={theme.textMuted} style={{ fontFamily: 'Times New Roman' }}>
              For questions about this Privacy Policy, contact {COMPANY_EMAIL} or call +91 9987963470.
            </Text>
          </YStack>
        </YStack>

        <View style={{ height: 10 }} />
      </YStack>
    </ScrollView>
  );
}
