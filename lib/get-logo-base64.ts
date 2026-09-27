import { Asset } from 'expo-asset';
import { readAsStringAsync } from 'expo-file-system/legacy';
import { Platform } from 'react-native';

let cachedLogo = '';

/** Converts any fetchable image URI (asset://, content://, http(s)://, data:) into a base64 data URI. */
async function uriToBase64DataUri(uri: string): Promise<string> {
  const response = await fetch(uri);
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function getLogoBase64(): Promise<string> {
  if (cachedLogo) return cachedLogo;

  if (Platform.OS === 'web') {
    try {
      const asset = Asset.fromModule(require('../assets/images/PackersMoversLogo.png'));
      cachedLogo = await uriToBase64DataUri(asset.uri);
      return cachedLogo;
    } catch (e) {
      throw new Error(`[getLogoBase64] Web logo loading failed: ${e}`);
    }
  }

  // Mobile (Android/iOS): use Asset.loadAsync (Expo SDK 54 recommended)
  const [asset] = await Asset.loadAsync(require('../assets/images/PackersMoversLogo.png'));

  console.log('[getLogoBase64] asset.uri:', asset.uri);
  console.log('[getLogoBase64] asset.localUri:', asset.localUri);

  const filePath = asset.localUri ?? asset.uri;
  if (!filePath) throw new Error('[getLogoBase64] No asset URI resolved after loadAsync');

  console.log('[getLogoBase64] resolved filePath:', filePath);

  let raw = '';

  // Only try the fast filesystem path when we actually have a real file:// URI.
  // In release/production Android builds, small images can get inlined into APK
  // resources and resolve to an "asset:///" scheme instead — expo-file-system's
  // readAsStringAsync does not support that scheme and throws
  // "Unsupported scheme for location ...".
  if (filePath.startsWith('file://')) {
    try {
      raw = await readAsStringAsync(filePath, { encoding: 'base64' });
    } catch (e1) {
      const altPath = filePath.replace(/^file:\/\//, '');
      console.log('[getLogoBase64] first read failed, trying altPath:', altPath);
      try {
        raw = await readAsStringAsync(altPath, { encoding: 'base64' });
      } catch (e2) {
        console.log('[getLogoBase64] filesystem read failed, falling back to fetch:', e2);
      }
    }
  }

  if (raw) {
    cachedLogo = `data:image/png;base64,${raw}`;
  } else {
    // Fallback for asset://, content://, or any other non-file scheme: fetch + blob,
    // same approach already used on web. React Native's fetch understands these
    // resource schemes even though expo-file-system does not.
    console.log('[getLogoBase64] using fetch/blob fallback for:', filePath);
    cachedLogo = await uriToBase64DataUri(filePath);
  }

  console.log('[getLogoBase64] logo.length:', cachedLogo.length);
  console.log('[getLogoBase64] logo.startsWith data:image:', cachedLogo.startsWith('data:image/png;base64,'));

  if (!cachedLogo) {
    throw new Error('[getLogoBase64] Failed to resolve logo to a base64 data URI');
  }

  return cachedLogo;
}