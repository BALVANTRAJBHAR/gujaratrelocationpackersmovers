import { Platform } from 'react-native';

export async function getLogoBase64(): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      const imageUrl: string = require('../assets/images/PackersMoversLogo.png');
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      return await new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }
  try {
    const assetId = require('../assets/images/PackersMoversLogo.png');
    const { Asset } = require('expo-asset');
    if (!Asset) return null;
    const [asset] = await Asset.loadAsync(assetId);
    if (!asset?.localUri) return null;
    const { default: fs } = await import('expo-file-system/legacy');
    const base64 = await fs.readAsStringAsync(asset.localUri, {
      encoding: fs.EncodingType.Base64,
    });
    return `data:image/png;base64,${base64}`;
  } catch {
    return null;
  }
}
