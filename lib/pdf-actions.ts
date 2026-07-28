import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Alert, Linking, NativeModules, PermissionsAndroid, Platform, Share, ToastAndroid } from 'react-native';

type PdfDownloadModule = {
  saveToDownloads(sourceUri: string, fileName: string): Promise<string>;
  openPdf?(sourceUri: string, fileName: string): Promise<string>;
};

const nativePdfDownloader = NativeModules.PdfDownload as PdfDownloadModule | undefined;

function notifyDownloadSuccess() {
  if (Platform.OS === 'android') {
    ToastAndroid.show('PDF downloaded successfully.', ToastAndroid.LONG);
  } else if (Platform.OS === 'ios') {
    Alert.alert('Download complete', 'PDF downloaded successfully.');
  }
}

/** Opens the document; it deliberately never invokes the share sheet. */
export async function openPdf(uri: string): Promise<void> {
  if (Platform.OS === 'web') {
    window.open(uri, '_blank', 'noopener,noreferrer');
    return;
  }

  if (Platform.OS === 'android' && nativePdfDownloader?.openPdf) {
    await nativePdfDownloader.openPdf(uri, `View_${Date.now()}.pdf`);
    return;
  }

  const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!baseDir) throw new Error('No readable document directory is available.');
  const viewerUri = `${baseDir}viewer-${Date.now()}.pdf`;
  await FileSystem.copyAsync({ from: uri, to: viewerUri });
  const info = await FileSystem.getInfoAsync(viewerUri);
  if (!info.exists || !info.size) throw new Error('Generated PDF is empty.');
  const openUri = Platform.OS === 'android'
    ? await FileSystem.getContentUriAsync(viewerUri)
    : viewerUri;
  await Linking.openURL(openUri);
}

/** Uses the browser's normal download manager (including mobile browsers). */
function downloadPdfOnWeb(uri: string, fileName: string) {
  const link = document.createElement('a');
  link.href = uri;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Saves generated PDFs consistently. Android is backed by MediaStore, so it writes
 * to the public Downloads collection without opening the SAF directory picker.
 */
export async function downloadPdf(uri: string, fileName: string): Promise<boolean> {
  try {
    if (Platform.OS === 'web') {
      downloadPdfOnWeb(uri, fileName);
      return true;
    }

    if (Platform.OS === 'android' && nativePdfDownloader) {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS).catch(() => undefined);
      await nativePdfDownloader.saveToDownloads(uri, fileName);
      notifyDownloadSuccess();
      return true;
    }

    // iOS has no shared public Downloads folder API. Persist in the app's Documents
    // directory, which is exposed through Files / On My iPhone for the application.
    const baseDir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
    if (!baseDir) throw new Error('No writable document directory is available.');
    await FileSystem.copyAsync({ from: uri, to: `${baseDir}${fileName}` });
    notifyDownloadSuccess();
    return true;
  } catch (error) {
    console.error('[pdf-actions] download failed:', error);
    return false;
  }
}

/** The only code path that is allowed to show a native share sheet. */
export async function sharePdf(uri: string, fileName: string, dialogTitle?: string): Promise<boolean> {
  try {
    if (Platform.OS === 'web') {
      if (!navigator.share) return false;
      const response = await fetch(uri);
      const file = new File([await response.blob()], fileName, { type: 'application/pdf' });
      await navigator.share({ files: [file], title: dialogTitle || fileName });
      return true;
    }

    const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
    if (!baseDir) throw new Error('No writable cache directory is available.');
    const targetUri = `${baseDir}${fileName}`;
    await FileSystem.copyAsync({ from: uri, to: targetUri });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(targetUri, { mimeType: 'application/pdf', dialogTitle });
    } else {
      await Share.share({ url: targetUri, title: dialogTitle || fileName });
    }
    return true;
  } catch (error) {
    console.error('[pdf-actions] share failed:', error);
    return false;
  }
}
