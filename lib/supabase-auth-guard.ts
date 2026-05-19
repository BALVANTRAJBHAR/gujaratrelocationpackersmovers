import { Platform } from 'react-native';

/** Transient Supabase auth-js lock abort (common on web after email confirm / fast navigation). */
export function isSupabaseAuthAbortError(value: unknown): boolean {
  try {
    const msg = String((value as any)?.message ?? value ?? '').toLowerCase();
    const name = String((value as any)?.name ?? '').toLowerCase();
    return (
      name === 'aborterror' ||
      msg.includes('signal is aborted') ||
      msg.includes('aborted without reason') ||
      (msg.includes('abort') && msg.includes('signal'))
    );
  } catch {
    return false;
  }
}

function patchReactNativeGlobalErrorHandler(): void {
  try {
    const ErrorUtils = (globalThis as any)?.ErrorUtils;
    if (!ErrorUtils?.getGlobalHandler || !ErrorUtils?.setGlobalHandler) return;

    const previous = ErrorUtils.getGlobalHandler();
    ErrorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
      if (isSupabaseAuthAbortError(error)) return;
      previous?.(error, isFatal);
    });
  } catch {
    // ignore
  }
}

/** Prevent Supabase auth lock aborts from crashing the app (especially on web). */
export function installSupabaseAuthAbortGuard(): () => void {
  patchReactNativeGlobalErrorHandler();

  if (typeof window === 'undefined') return () => {};

  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    if (isSupabaseAuthAbortError((event as any)?.reason)) {
      event.preventDefault();
      event.stopPropagation?.();
    }
  };

  const onWindowError = (event: ErrorEvent) => {
    if (isSupabaseAuthAbortError((event as any)?.error ?? event.message)) {
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

/** Runs on web at module load (import from root layout before other app code). */
export function installSupabaseAuthAbortGuardIfWeb(): void {
  if (Platform.OS === 'web') {
    installSupabaseAuthAbortGuard();
  }
}
