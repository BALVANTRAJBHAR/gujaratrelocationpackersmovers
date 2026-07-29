import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { Image, Platform } from 'react-native';

let cachedLogoDataUri = '';

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
  const dest = `${cacheDir}logo-cache.png`;
  const downloaded = await FileSystem.downloadAsync(uri, dest);
  return readFileAsDataUri(downloaded.uri);
}

/**
 * Returns an inline base64 data URI for the company logo.
 * expo-print / WKWebView requires inlined base64 — local file:// URIs do not render.
 */
export async function getLogoBase64(): Promise<string> {
  if (cachedLogoDataUri) return cachedLogoDataUri;

  const assetModule = require('../assets/images/PackersMoversLogo.png');

  try {
    const asset = Asset.fromModule(assetModule);
    await asset.downloadAsync();

    if (asset.localUri?.startsWith('file://')) {
      cachedLogoDataUri = await readFileAsDataUri(asset.localUri);
      if (cachedLogoDataUri) return cachedLogoDataUri;
    }

    const resolved = Image.resolveAssetSource(assetModule);
    const fetchUri = resolved?.uri ?? asset.uri;
    if (!fetchUri) return '';

    if (Platform.OS === 'web' || /^https?:\/\//i.test(fetchUri)) {
      cachedLogoDataUri = await uriToBase64DataUri(fetchUri);
      return cachedLogoDataUri;
    }

    cachedLogoDataUri = await downloadAndReadAsDataUri(fetchUri);
  } catch (e) {
    console.warn('[getLogoBase64] Failed:', e);
  }

  return cachedLogoDataUri;
}

/** @deprecated Use getLogoBase64 — expo-print always needs base64 inline images. */
export async function getLogoSrcForPdf(): Promise<string> {
  return getLogoBase64();
}
