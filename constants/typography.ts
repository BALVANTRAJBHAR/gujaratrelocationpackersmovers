import { Platform } from 'react-native';

const isWeb = Platform.OS === 'web';

export const FONT_SCALE = isWeb ? 1.2 : 1.0;

export const t = (size: number) => Math.round(size * FONT_SCALE);
