import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

let cachedLogo = '';

async function uriToBase64DataUri(uri: string): Promise<string> {
  const response = await fetch(uri);
  if (!response.ok) throw new Error(`fetch failed: ${response.status}`);
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
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

export async function getLogoBase64(): Promise<string> {
  if (cachedLogo) return cachedLogo;

  const assetModule = require('../assets/images/PackersMoversLogo.png');

  try {
    const asset = Asset.fromModule(assetModule);
    await asset.downloadAsync();

    const localUri = asset.localUri ?? asset.uri;
    if (!localUri) throw new Error('Logo URI unavailable');

    if (localUri.startsWith('file://') || !localUri.includes('://')) {
      cachedLogo = await readFileAsDataUri(localUri);
      if (cachedLogo) return cachedLogo;
    }

    if (Platform.OS === 'web') {
      cachedLogo = await uriToBase64DataUri(localUri);
      return cachedLogo;
    }

    if (asset.localUri?.startsWith('file://')) {
      cachedLogo = await readFileAsDataUri(asset.localUri);
      if (cachedLogo) return cachedLogo;
    }

    console.warn('[getLogoBase64] Could not read bundled logo from filesystem:', localUri);
  } catch (e) {
    console.warn('[getLogoBase64] Failed:', e);
  }

  return '';
}
