import { useColorScheme as useRNColorScheme } from 'react-native';

import { useAppColorScheme } from '@/providers/color-scheme-provider';

export function useColorScheme() {
  const appScheme = useAppColorScheme();
  const rnScheme = useRNColorScheme();
  return appScheme?.colorScheme ?? (rnScheme as any) ?? 'light';
}
