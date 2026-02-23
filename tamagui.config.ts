import { config } from '@tamagui/config/v3';
import { createTamagui } from 'tamagui';

const appConfig = createTamagui({
  ...config,
  fontLanguages: {},
});

export type AppConfig = typeof appConfig;

export default appConfig;
