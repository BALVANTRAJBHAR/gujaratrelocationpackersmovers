import { Platform } from 'react-native';

import { createAnimations } from '@tamagui/animations-react-native';
import { config } from '@tamagui/config/v3';
import { createFont, createTamagui } from 'tamagui';

const systemSans = Platform.select({
  web: "'Times New Roman', Times, serif",
  default: 'Times New Roman',
});

const systemSerif = Platform.select({
  web: "'Times New Roman', Times, serif",
  default: 'Times New Roman',
});

const bodyFont = createFont({
  ...(config as any).fonts?.body,
  family: systemSans,
});

const headingFont = createFont({
  ...(config as any).fonts?.heading,
  family: systemSerif,
});

const animations = createAnimations({
  bouncy: {
    type: 'spring',
    damping: 10,
    mass: 0.9,
    stiffness: 100,
  },
  lazy: {
    type: 'spring',
    damping: 20,
    stiffness: 60,
  },
  quick: {
    type: 'spring',
    damping: 20,
    mass: 1.2,
    stiffness: 250,
  },
  pulse: {
    type: 'spring',
    damping: 15,
    mass: 0.5,
    stiffness: 200,
  },
});

const appConfig = createTamagui({
  ...config,
  animations,
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
