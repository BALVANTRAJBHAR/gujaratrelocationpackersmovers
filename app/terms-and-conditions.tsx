import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { Button, Text, XStack, YStack } from 'tamagui';

import { themes } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getOrCreateTermsPdfUri, downloadLegalPdf, openLegalPdf } from '@/lib/legal-docs';
import { t } from '@/constants/typography';

export default function TermsAndConditionsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? themes.dark : themes.light;
  const [pdfBusy, setPdfBusy] = React.useState(false);

  const openPdf = async () => {
    setPdfBusy(true);
    try {
      const uri = await getOrCreateTermsPdfUri();
      console.log('[TermsScreen] PDF URI:', uri);
      if (uri) await openLegalPdf(uri);
      else Alert.alert('Error', 'PDF generation returned empty URI.');
    } catch (e) {
      console.error('[TermsScreen] openPdf error:', e);
      Alert.alert('Error', `Could not open PDF.\n${String(e)}`);
    } finally {
      setPdfBusy(false);
    }
  };

  const downloadPdf = async () => {
    setPdfBusy(true);
    try {
      const uri = await getOrCreateTermsPdfUri();
      console.log('[TermsScreen] Download URI:', uri);
      if (uri) await downloadLegalPdf(uri, 'Gujarat_Relocation_Terms_and_Conditions.pdf');
      else Alert.alert('Error', 'PDF generation returned empty URI.');
    } catch (e) {
      console.error('[TermsScreen] downloadPdf error:', e);
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
            Terms & Conditions
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
              1. Transfer of Valuables & Important Documents
            </Text>
            <Text fontSize={t(14)} fontWeight="600" lineHeight={22} color={theme.textMuted} style={{ fontFamily: 'Times New Roman' }}>
              Customers must retain personal valuables such as cash, jewellery, educational certificates, property papers,
              vehicle documents, medical records, share certificates, and similar important documents. Gujarat Relocation
              Packers & Movers shall not be liable for any loss, theft, or damage to such items if transported through our service.
            </Text>
          </YStack>

          <YStack gap="$2">
            <Text fontSize={t(18)} fontWeight="900" color={theme.text} style={{ fontFamily: 'Times New Roman' }}>
              2. Travel Advisory
            </Text>
            <Text fontSize={t(14)} fontWeight="600" lineHeight={22} color={theme.textMuted} style={{ fontFamily: 'Times New Roman' }}>
              Customers are advised not to schedule any air, rail, or road travel on the moving day. House shifting is
              time-consuming, and the company shall not be responsible for missed travel plans or delays.
            </Text>
          </YStack>

          <YStack gap="$2">
            <Text fontSize={t(18)} fontWeight="900" color={theme.text} style={{ fontFamily: 'Times New Roman' }}>
              3. Packaging Materials & Labour Charges
            </Text>
            <Text fontSize={t(14)} fontWeight="600" lineHeight={22} color={theme.textMuted} style={{ fontFamily: 'Times New Roman' }}>
              Packaging materials remain the property of Gujarat Relocation Packers & Movers and must be returned after
              delivery. Retention charges apply: Corrugated Box ₹60/box, GR Branded Red Box ₹500/box. Rope lifting/lowering
              is performed only at the customer's request and risk. Mathadi/Union labour charges are not included in the
              quotation. Unpacking services are not available in Kerala.
            </Text>
          </YStack>

          <YStack gap="$2">
            <Text fontSize={t(18)} fontWeight="900" color={theme.text} style={{ fontFamily: 'Times New Roman' }}>
              4. Long Carry Charges
            </Text>
            <Text fontSize={t(14)} fontWeight="600" lineHeight={22} color={theme.textMuted} style={{ fontFamily: 'Times New Roman' }}>
              Carry distance up to 30 meters at Pickup and Drop is included. Additional charges apply beyond 30 meters at
              the configured per-meter rate. This charge is shown separately in the payment summary.
            </Text>
          </YStack>

          <YStack gap="$2">
            <Text fontSize={t(18)} fontWeight="900" color={theme.text} style={{ fontFamily: 'Times New Roman' }}>
              5. Damage Claims
            </Text>
            <Text fontSize={t(14)} fontWeight="600" lineHeight={22} color={theme.textMuted} style={{ fontFamily: 'Times New Roman' }}>
              Damage claims require purchase proof. Without proof, compensation is limited to ₹5,000 per item. Claims are
              not accepted for self-packed goods, internal electronic damage, items missing from packing list, or incorrectly
              declared values. Damage must be reported within 48 hours of delivery with supporting documents within 72 hours.
              TV claims require before/after photographs.
            </Text>
          </YStack>

          <YStack gap="$2">
            <Text fontSize={t(18)} fontWeight="900" color={theme.text} style={{ fontFamily: 'Times New Roman' }}>
              6. Documentation
            </Text>
            <Text fontSize={t(14)} fontWeight="600" lineHeight={22} color={theme.textMuted} style={{ fontFamily: 'Times New Roman' }}>
              Only communication through the App, Email, or Official Support is valid. Customers must verify all items before
              signing POD. Claims after POD signature without remarks will not be accepted.
            </Text>
          </YStack>

          <YStack gap="$2">
            <Text fontSize={t(18)} fontWeight="900" color={theme.text} style={{ fontFamily: 'Times New Roman' }}>
              7. Vehicle Access & Delivery
            </Text>
            <Text fontSize={t(14)} fontWeight="600" lineHeight={22} color={theme.textMuted} style={{ fontFamily: 'Times New Roman' }}>
              Vehicle type depends on availability and location. Customers must inform society restrictions in advance.
              Delivery timelines depend on traffic, route conditions, commercial vehicle restrictions, weather, and
              force majeure events.
            </Text>
          </YStack>

          <YStack gap="$2">
            <Text fontSize={t(18)} fontWeight="900" color={theme.text} style={{ fontFamily: 'Times New Roman' }}>
              8. Service Inclusions & Exclusions
            </Text>
            <Text fontSize={t(14)} fontWeight="600" lineHeight={22} color={theme.textMuted} style={{ fontFamily: 'Times New Roman' }}>
              Quotation may change if booking date, inventory, or distance changes. Charges do not include carpentry,
              electrical work, AC gas refilling, extra AC pipes/wiring, long carry beyond 30 meters, or any additional
              services not included in the quotation.
            </Text>
          </YStack>

          <YStack gap="$2">
            <Text fontSize={t(18)} fontWeight="900" color={theme.text} style={{ fontFamily: 'Times New Roman' }}>
              9. Liability
            </Text>
            <Text fontSize={t(14)} fontWeight="600" lineHeight={22} color={theme.textMuted} style={{ fontFamily: 'Times New Roman' }}>
              Customers must ensure vehicle access at both locations. Transportation is at customer's risk unless
              protection/insurance is selected. If the company cancels due to unavoidable circumstances, only the
              booking amount will be refunded.
            </Text>
          </YStack>

          <YStack gap="$2">
            <Text fontSize={t(18)} fontWeight="900" color={theme.text} style={{ fontFamily: 'Times New Roman' }}>
              10. Cancellation & Refund
            </Text>
            <Text fontSize={t(14)} fontWeight="600" lineHeight={22} color={theme.textMuted} style={{ fontFamily: 'Times New Roman' }}>
              Cancellation charges apply as per policy. Rescheduling allowed up to 48 hours before shifting. Surge pricing
              may apply on high-demand dates. Refunds are processed within 5–6 working days.
            </Text>
          </YStack>

          <YStack gap="$2">
            <Text fontSize={t(18)} fontWeight="900" color={theme.text} style={{ fontFamily: 'Times New Roman' }}>
              11. Weekend & Month-End Advisory
            </Text>
            <Text fontSize={t(14)} fontWeight="600" lineHeight={22} color={theme.textMuted} style={{ fontFamily: 'Times New Roman' }}>
              During weekends and month-end, bookings are higher than usual. Timelines may be affected due to traffic,
              vehicle availability, and society regulations.
            </Text>
          </YStack>
        </YStack>

        <View style={{ height: 10 }} />
      </YStack>
    </ScrollView>
  );
}
