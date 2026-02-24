import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

export type AppColorScheme = 'light' | 'dark';

type ColorSchemeContextValue = {
  colorScheme: AppColorScheme;
  setColorScheme: (value: AppColorScheme) => void;
  toggleColorScheme: () => void;
};

const ColorSchemeContext = createContext<ColorSchemeContextValue | null>(null);

const STORAGE_KEY = 'app_color_scheme';

const readStoredScheme = async (): Promise<AppColorScheme | null> => {
  try {
    if (Platform.OS === 'web') {
      const raw = typeof window === 'undefined' ? null : window.localStorage.getItem(STORAGE_KEY);
      if (raw === 'dark' || raw === 'light') return raw;
      return null;
    }

    const SecureStore = await import('expo-secure-store');
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    if (raw === 'dark' || raw === 'light') return raw;
    return null;
  } catch {
    return null;
  }
};

const writeStoredScheme = async (scheme: AppColorScheme) => {
  try {
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined') return;
      window.localStorage.setItem(STORAGE_KEY, scheme);
      return;
    }

    const SecureStore = await import('expo-secure-store');
    await SecureStore.setItemAsync(STORAGE_KEY, scheme);
  } catch {
    // ignore
  }
};

export function ColorSchemeProvider({ children }: { children: React.ReactNode }) {
  const [colorScheme, setColorScheme] = useState<AppColorScheme>('light');

  const didHydrateRef = useRef(false);

  useEffect(() => {
    if (didHydrateRef.current) return;
    didHydrateRef.current = true;
    let cancelled = false;
    readStoredScheme()
      .then((stored) => {
        if (cancelled) return;
        if (stored) setColorScheme(stored);
      })
      .catch(() => {
        // ignore
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setColorSchemePersisted = useCallback((value: AppColorScheme) => {
    setColorScheme(value);
    void writeStoredScheme(value);
  }, []);

  const toggleColorScheme = useCallback(() => {
    setColorScheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      void writeStoredScheme(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ colorScheme, setColorScheme: setColorSchemePersisted, toggleColorScheme }),
    [colorScheme, setColorSchemePersisted, toggleColorScheme]
  );

  return <ColorSchemeContext.Provider value={value}>{children}</ColorSchemeContext.Provider>;
}

export function useAppColorScheme() {
  const ctx = useContext(ColorSchemeContext);
  if (!ctx) return null;
  return ctx;
}
