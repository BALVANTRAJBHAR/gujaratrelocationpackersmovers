/**
 * Runs synchronously on web before the app tree renders (import from root layout first).
 */
import { Platform } from 'react-native';

import { installFontTimeoutGuard, preloadWebIconFonts } from '@/lib/font-web-guard';

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  installFontTimeoutGuard();
  void preloadWebIconFonts();
}
