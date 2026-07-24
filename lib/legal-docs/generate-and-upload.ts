import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Alert, Linking, Platform } from 'react-native';
import { getTermsConditionsHtml } from './terms-html';
import { getPrivacyPolicyHtml } from './privacy-html';

async function generatePdf(html: string): Promise<string> {
  if (Platform.OS === 'web') {
    const uri = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
    console.log('[generatePdf] Web data URI length:', uri.length);
    return uri;
  }

  console.log('[generatePdf] Calling Print.printToFileAsync...');
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  console.log('[generatePdf] printToFileAsync returned URI:', uri);

  const info = await FileSystem.getInfoAsync(uri);
  console.log('[generatePdf] File info:', JSON.stringify(info));
  if (!info.exists) {
    throw new Error(`PDF file does not exist at URI: ${uri}`);
  }

  return uri;
}

export async function getOrCreateTermsPdfUri(): Promise<string> {
  console.log('[getOrCreateTermsPdfUri] Generating Terms PDF...');
  const html = await getTermsConditionsHtml();
  return generatePdf(html);
}

export async function getOrCreatePrivacyPdfUri(): Promise<string> {
  console.log('[getOrCreatePrivacyPdfUri] Generating Privacy PDF...');
  const html = await getPrivacyPolicyHtml();
  return generatePdf(html);
}

/**
 * Open a PDF for viewing on the device.
 *
 * Priority on Android 13/14:
 *   1. expo-sharing.shareAsync (shows system preview / "Open with" sheet)
 *   2. FileSystem.getContentUriAsync + Linking.openURL (content:// URI)
 *
 * iOS: expo-sharing.shareAsync fallback when Linking fails.
 */
export async function openLegalPdf(uri: string): Promise<void> {
  console.log('[openLegalPdf] URI:', uri);

  if (Platform.OS === 'web') {
    window.open(uri, '_blank');
    return;
  }

  // Prefer expo-sharing — works on Android 13+ (shows preview + open with)
  const sharingAvailable = await Sharing.isAvailableAsync();
  console.log('[openLegalPdf] Sharing available:', sharingAvailable);

  if (sharingAvailable) {
    try {
      await Sharing.shareAsync(uri);
      console.log('[openLegalPdf] Sharing.shareAsync succeeded');
      return;
    } catch (shareErr) {
      console.warn('[openLegalPdf] Sharing.shareAsync failed:', shareErr);
    }
  }

  // Fallback: try content:// URI via SAF (bypasses file:// restrictions on Android 13/14)
  try {
    const contentUri = await FileSystem.getContentUriAsync(uri);
    console.log('[openLegalPdf] Content URI:', contentUri);
    await Linking.openURL(contentUri);
    console.log('[openLegalPdf] Linking with content URI succeeded');
  } catch (finalErr) {
    console.error('[openLegalPdf] All open methods failed:', finalErr);
    throw new Error(`Could not open PDF: ${finalErr}`);
  }
}

/**
 * Download a PDF using Storage Access Framework (Android 13/14 compliant).
 */
export async function downloadLegalPdf(uri: string, fileName: string): Promise<boolean> {
  console.log('[downloadLegalPdf] URI:', uri, 'Filename:', fileName);

  try {
    if (Platform.OS === 'web') {
      const a = document.createElement('a');
      a.href = uri;
      a.download = fileName.endsWith('.pdf') ? fileName : fileName + '.html';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      console.log('[downloadLegalPdf] Web download triggered');
      return true;
    }

    if (Platform.OS === 'android') {
      return await downloadAndroid(uri, fileName);
    }

    const baseDir = FileSystem.documentDirectory || FileSystem.cacheDirectory || '';
    const dest = `${baseDir}${fileName}`;
    console.log('[downloadLegalPdf] iOS dest:', dest);
    await FileSystem.copyAsync({ from: uri, to: dest });
    Alert.alert('Download complete', `PDF saved.\n\n${dest}`);
    return true;
  } catch (e) {
    console.error('[downloadLegalPdf] Unexpected error:', e);
    Alert.alert('Download failed', `Could not save the PDF.\n${String(e)}`);
    return false;
  }
}

async function downloadAndroid(uri: string, fileName: string): Promise<boolean> {
  // SAF: request user-selected directory (scoped-storage compliant)
  console.log('[downloadAndroid] Requesting SAF directory permission...');
  try {
    const safResult = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    console.log('[downloadAndroid] SAF result:', JSON.stringify(safResult));

    if (safResult.granted && safResult.directoryUri) {
      const content = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const newUri = await FileSystem.StorageAccessFramework.createFileAsync(
        safResult.directoryUri,
        fileName,
        'application/pdf'
      );
      console.log('[downloadAndroid] SAF createFileAsync returned:', newUri);
      await FileSystem.StorageAccessFramework.writeAsStringAsync(newUri, content, {
        encoding: FileSystem.EncodingType.Base64,
      });
      Alert.alert('Download complete', `${fileName} saved to selected folder.`);
      return true;
    }
    console.warn('[downloadAndroid] SAF permission denied by user');
  } catch (safErr) {
    console.warn('[downloadAndroid] SAF method failed:', safErr);
  }

  // Fallback: app-internal storage
  try {
    const downloadPath = `${FileSystem.documentDirectory || FileSystem.cacheDirectory || ''}${fileName}`;
    console.log('[downloadAndroid] Internal fallback:', downloadPath);
    await FileSystem.copyAsync({ from: uri, to: downloadPath });
    Alert.alert('Download complete', `PDF saved to app storage.\n\n${downloadPath}`);
    return true;
  } catch (internalErr) {
    console.error('[downloadAndroid] All download methods failed:', internalErr);
    Alert.alert('Download failed', `Could not save PDF.\n${String(internalErr)}`);
    return false;
  }
}
