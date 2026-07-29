import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import { PDF_MARGINS } from '@/lib/pdf-layout';
import { createWebPdfUri } from '@/lib/web-pdf';

function mmToPoints(mm: number): number {
  return (mm * 72) / 25.4;
}

/** Generates a PDF from HTML using the same engine as mobile (expo-print) on native, and a matching web renderer. */
export async function printHtmlToPdfUri(html: string, title = 'Document'): Promise<string> {
  if (Platform.OS === 'web') {
    return createWebPdfUri(html, title);
  }

  const { uri } = await Print.printToFileAsync({
    html,
    base64: false,
    ...(Platform.OS === 'ios'
      ? {
          margins: {
            top: mmToPoints(PDF_MARGINS.top),
            bottom: mmToPoints(PDF_MARGINS.bottom),
            left: mmToPoints(PDF_MARGINS.left),
            right: mmToPoints(PDF_MARGINS.right),
          },
        }
      : {}),
  });

  if (!uri) throw new Error('Print.printToFileAsync returned empty URI');

  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) throw new Error(`PDF file does not exist at URI: ${uri}`);
  if (info.size != null && info.size <= 0) throw new Error(`PDF file is empty (size: ${info.size})`);

  return uri;
}
