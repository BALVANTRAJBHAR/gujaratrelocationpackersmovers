import FontAwesome from '@expo/vector-icons/build/FontAwesome';
import FontAwesome5Icon from '@expo/vector-icons/build/FontAwesome5';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Font from 'expo-font';
import { Platform } from 'react-native';

const FONT_TIMEOUT_MSG = '6000ms timeout exceeded';

export function isFontTimeoutError(value: unknown): boolean {
  try {
    const msg = typeof value === 'string' ? value : String((value as any)?.message ?? value ?? '');
    return msg.includes(FONT_TIMEOUT_MSG) || msg.includes('timeout exceeded');
  } catch {
    return false;
  }
}

function patchReactNativeGlobalErrorHandler(): void {
  try {
    const ErrorUtils = (global as any)?.ErrorUtils;
    if (!ErrorUtils?.getGlobalHandler || !ErrorUtils?.setGlobalHandler) return;

    const previous = ErrorUtils.getGlobalHandler();
    ErrorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
      if (isFontTimeoutError(error)) return;
      previous?.(error, isFatal);
    });
  } catch {
    // ignore
  }
}

/** Prevent fontfaceobserver timeout from crashing the web app (icon fonts are optional). */
export function installFontTimeoutGuard(): () => void {
  if (typeof window === 'undefined') return () => {};

  patchReactNativeGlobalErrorHandler();

  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    if (isFontTimeoutError((event as any)?.reason)) {
      event.preventDefault();
      event.stopPropagation?.();
    }
  };

  const onWindowError = (event: ErrorEvent) => {
    if (isFontTimeoutError((event as any)?.error ?? event.message)) {
      event.preventDefault();
      event.stopPropagation?.();
    }
  };

  window.addEventListener('unhandledrejection', onUnhandledRejection, true);
  window.addEventListener('error', onWindowError, true);

  return () => {
    window.removeEventListener('unhandledrejection', onUnhandledRejection, true);
    window.removeEventListener('error', onWindowError, true);
  };
}

function loadIconFont(IconModule: { loadFont?: () => Promise<void>; font?: Record<string, number> }): Promise<unknown> {
  if (typeof IconModule.loadFont === 'function') {
    return IconModule.loadFont().catch(() => {});
  }
  if (IconModule.font) {
    return Font.loadAsync(IconModule.font).catch(() => {});
  }
  return Promise.resolve();
}

/** Preload vector-icon fonts on web so FontFaceObserver does not time out mid-render. */
export async function preloadWebIconFonts(): Promise<void> {
  if (Platform.OS !== 'web') return;

  const loads: Promise<unknown>[] = [
    loadIconFont(MaterialCommunityIcons as { loadFont?: () => Promise<void>; font?: Record<string, number> }),
    loadIconFont(MaterialIcons as { loadFont?: () => Promise<void>; font?: Record<string, number> }),
  ];

  const faLoadFont = (FontAwesome as { loadFont?: () => Promise<void> }).loadFont;
  if (typeof faLoadFont === 'function') {
    loads.push(faLoadFont.call(FontAwesome).catch(() => {}));
  }

  const fa5Fonts = (FontAwesome5Icon as { font?: Record<string, number> }).font;
  if (fa5Fonts) {
    loads.push(Font.loadAsync(fa5Fonts).catch(() => {}));
  }

  await Promise.allSettled(loads);
}
