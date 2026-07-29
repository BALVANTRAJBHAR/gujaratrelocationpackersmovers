import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import { downloadPdf, openPdf } from '@/lib/pdf-actions';
import { createWebPdfUri } from '@/lib/web-pdf';
import { getPrivacyPolicyHtml } from './privacy-html';
import { getTermsConditionsHtml } from './terms-html';

async function generatePdf(html: string): Promise<string> {
  if (Platform.OS === 'web') {
    console.log('[generatePdf] Generating web PDF...');
    const webUri = await createWebPdfUri(html, 'Gujarat Relocation Packers');
    console.log('[generatePdf] Web PDF URI:', webUri?.slice(0, 80));
    return webUri;
  }

  console.log('[generatePdf] Printing PDF to file...');
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  console.log('[generatePdf] PDF generated at:', uri);

  if (!uri) throw new Error('Print.printToFileAsync returned empty URI');

  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) throw new Error(`PDF file does not exist at URI: ${uri}`);
  if (info.size != null && info.size <= 0) throw new Error(`PDF file is empty at URI: ${uri} (size: ${info.size})`);

  console.log('[generatePdf] PDF validated, size:', info.size);
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
