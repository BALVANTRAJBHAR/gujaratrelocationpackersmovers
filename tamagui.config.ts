import { Platform } from 'react-native';

import { config } from '@tamagui/config/v3';
import { createFont, createTamagui } from 'tamagui';

const systemSans = Platform.select({
  web: "'Times New Roman', Times, serif",
  default: 'serif',
});

const systemSerif = Platform.select({
  web: "'Times New Roman', Times, serif",
  default: 'serif',
});

const bodyFont = createFont({
  ...(config as any).fonts?.body,
  family: systemSans,
});

const headingFont = createFont({
  ...(config as any).fonts?.heading,
  family: systemSerif,
});

const appConfig = createTamagui({
  ...config,
  fonts: {
    ...(config as any).fonts,
    body: bodyFont,
    heading: headingFont,
  },
  components: {
    ...(config as any).components,
    Input: {
      ...(config as any).components?.Input,
      defaultProps: {
        ...(config as any).components?.Input?.defaultProps,
        backgroundColor: '$backgroundStrong',
        borderColor: '$borderColor',
        borderWidth: 1,
        color: '$color',
        placeholderTextColor: '$color8',
      },
    },
  },
  fontLanguages: {},
});

export type AppConfig = typeof appConfig;

export default appConfig;
