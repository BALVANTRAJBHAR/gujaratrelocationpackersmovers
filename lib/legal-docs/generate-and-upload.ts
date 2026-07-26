import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import { downloadPdf, openPdf } from '@/lib/pdf-actions';
import { createWebPdfUri } from '@/lib/web-pdf';
import { getPrivacyPolicyHtml } from './privacy-html';
import { getTermsConditionsHtml } from './terms-html';

async function generatePdf(html: string): Promise<string> {
  if (Platform.OS === 'web') return createWebPdfUri(html, 'Gujarat Relocation Packers');

  const { uri } = await Print.printToFileAsync({ html, base64: false });
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) throw new Error(`PDF file does not exist at URI: ${uri}`);
  return uri;
}

export async function getOrCreateTermsPdfUri(): Promise<string> {
  return generatePdf(await getTermsConditionsHtml());
}

export async function getOrCreatePrivacyPdfUri(): Promise<string> {
  return generatePdf(await getPrivacyPolicyHtml());
}

/** Opens the viewer only—sharing is intentionally handled by the report share action. */
export async function openLegalPdf(uri: string): Promise<void> {
  await openPdf(uri);
}

export async function downloadLegalPdf(uri: string, fileName: string): Promise<boolean> {
  return downloadPdf(uri, fileName);
}
