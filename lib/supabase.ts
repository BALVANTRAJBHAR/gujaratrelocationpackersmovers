import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const extra = (Constants as any)?.expoConfig?.extra ?? (Constants as any)?.manifest?.extra ?? {};
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? extra?.supabaseUrl ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? extra?.supabaseAnonKey ?? '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase env vars missing. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (or expo.extra.supabaseUrl/supabaseAnonKey).'
  );
}

if (Platform.OS !== 'web') {
  const u = String(supabaseUrl ?? '');
  if (u) {
    console.log('[Supabase] URL:', u);
    if (u.includes('localhost') || u.includes('127.0.0.1')) {
      console.warn('[Supabase] URL points to localhost. On a real Android device this will fail. Use https://<project>.supabase.co');
    }
    if (u.startsWith('http://')) {
      console.warn('[Supabase] URL is http:// (not https). Android may block cleartext unless usesCleartextTraffic is enabled.');
    }
  }
}

const webStorage = {
  getItem: (key: string) => {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // ignore
    }
  },
  removeItem: (key: string) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  },
};

const memoryStorage = (() => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
})();

const nativeStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

const globalForSupabase = globalThis as any;

const createSupabaseClient = () =>
  createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: (Platform.OS === 'web' ? memoryStorage : nativeStorage) as any,
      autoRefreshToken: Platform.OS !== 'web',
      persistSession: Platform.OS !== 'web',
      detectSessionInUrl: false,
    },
  });

export const supabase =
  Platform.OS === 'web' ? createSupabaseClient() : globalForSupabase.__supabase ?? createSupabaseClient();

if (Platform.OS !== 'web' && !globalForSupabase.__supabase) {
  globalForSupabase.__supabase = supabase;
}
