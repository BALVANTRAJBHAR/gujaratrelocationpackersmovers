import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { Image, Platform } from 'react-native';

let cachedLogoDataUri = '';
let cachedLogoFileUri = '';

async function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function uriToBase64DataUri(uri: string): Promise<string> {
  const response = await fetch(uri);
  if (!response.ok) throw new Error(`fetch failed: ${response.status}`);
  return blobToDataUri(await response.blob());
}

async function readFileAsDataUri(fileUri: string): Promise<string> {
  const candidates = fileUri.startsWith('file://')
    ? [fileUri, fileUri.replace(/^file:\/\//, '')]
    : [fileUri, `file://${fileUri}`];

  for (const candidate of candidates) {
    try {
      const base64 = await FileSystem.readAsStringAsync(candidate, {
        encoding: FileSystem.EncodingType.Base64,
      });
      if (base64) return `data:image/png;base64,${base64}`;
    } catch {
      // try next path variant
    }
  }
  return '';
}

async function downloadAndReadAsDataUri(uri: string): Promise<string> {
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) return '';
  const dest = `${cacheDir}logo-cache-${Date.now()}.png`;
  const downloaded = await FileSystem.downloadAsync(uri, dest);
  cachedLogoFileUri = downloaded.uri;
  return readFileAsDataUri(downloaded.uri);
}

async function ensureLogoLoaded(): Promise<void> {
  if (cachedLogoDataUri || cachedLogoFileUri) return;

  const assetModule = require('../assets/images/PackersMoversLogo.png');
  const asset = Asset.fromModule(assetModule);
  await asset.downloadAsync();

  const localUri = asset.localUri ?? asset.uri;
  if (!localUri) throw new Error('Logo URI unavailable');

  if (localUri.startsWith('file://')) {
    cachedLogoFileUri = localUri;
    cachedLogoDataUri = await readFileAsDataUri(localUri);
    if (cachedLogoDataUri) return;
  }

  if (Platform.OS === 'web') {
    cachedLogoDataUri = await uriToBase64DataUri(localUri);
    return;
  }

  const resolved = Image.resolveAssetSource(assetModule);
  if (resolved?.uri) {
    try {
      cachedLogoDataUri = await downloadAndReadAsDataUri(resolved.uri);
      if (cachedLogoDataUri) return;
    } catch (e) {
      console.warn('[getLogoBase64] download fallback failed:', e);
    }
  }

  if (localUri.startsWith('file://')) {
    cachedLogoFileUri = localUri;
  }

  console.warn('[getLogoBase64] Could not resolve logo to base64:', localUri);
}

/** Returns a base64 data URI suitable for web PDF rendering and html2canvas. */
export async function getLogoBase64(): Promise<string> {
  await ensureLogoLoaded();
  return cachedLogoDataUri;
}

/**
 * Returns the best img src for PDF HTML on the current platform.
 * Native expo-print renders file:// URIs more reliably than long data URIs.
 */
export async function getLogoSrcForPdf(): Promise<string> {
  await ensureLogoLoaded();
  if (Platform.OS !== 'web' && cachedLogoFileUri) return cachedLogoFileUri;
  return cachedLogoDataUri;
}
