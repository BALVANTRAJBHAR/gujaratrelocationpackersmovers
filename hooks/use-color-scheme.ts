import { useAppColorScheme } from '@/providers/color-scheme-provider';

export function useColorScheme() {
  const appScheme = useAppColorScheme();
  return appScheme?.colorScheme ?? 'light';
}
