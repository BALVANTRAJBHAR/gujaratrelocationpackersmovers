import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

let cachedLogo = '';

export async function getLogoBase64(): Promise<string> {
  if (cachedLogo) return cachedLogo;
  if (Platform.OS === 'web') {
    try {
      const imageUrl: string = require('../assets/images/PackersMoversLogo.png');
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const result = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('FileReader failed'));
        reader.readAsDataURL(blob);
      });
      cachedLogo = result;
      return cachedLogo;
    } catch (e) {
      console.warn('[getLogoBase64] Web fallback — logo not available:', e);
      return '';
    }
  }

  try {
    const assetId = require('../assets/images/PackersMoversLogo.png');
    const [asset] = await Asset.loadAsync(assetId);

    if (!asset?.localUri) throw new Error('Asset has no localUri after loadAsync');

    const base64 = await FileSystem.readAsStringAsync(asset.localUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    cachedLogo = `data:image/png;base64,${base64}`;
    return cachedLogo;
  } catch (e) {
    console.warn('[getLogoBase64] Fallback — logo not available:', e);
    return '';
  }
}
