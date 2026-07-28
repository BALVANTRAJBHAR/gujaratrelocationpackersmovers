import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';

let cachedLogo = '';

export async function getLogoBase64(): Promise<string> {
  if (cachedLogo) return cachedLogo;

  try {
    const [asset] = await Asset.loadAsync(require('../assets/images/PackersMoversLogo.png'));
    const uri = asset.localUri ?? asset.uri;
    if (!uri) throw new Error('Logo URI unavailable');

    // Try expo-file-system first (native)
    const base64 = await FileSystem.readAsStringAsync(uri.replace(/^file:\/\//, ''), {
      encoding: FileSystem.EncodingType.Base64,
    });
    cachedLogo = `data:image/png;base64,${base64}`;
    return cachedLogo;
  } catch {
    // Fallback: fetch + FileReader (works on all platforms including web)
    try {
      const assetId = require('../assets/images/PackersMoversLogo.png');
      const uri = Asset.fromModule(assetId).uri;
      const response = await fetch(uri);
      const blob = await response.blob();
      cachedLogo = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      return cachedLogo;
    } catch (e2) {
      console.warn('[getLogoBase64] All methods failed:', e2);
      return '';
    }
  }
}