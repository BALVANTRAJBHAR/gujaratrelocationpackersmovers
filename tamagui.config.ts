import { config } from '@tamagui/config/v3';
import { createTamagui } from 'tamagui';

const appConfig = createTamagui({
  ...config,
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
