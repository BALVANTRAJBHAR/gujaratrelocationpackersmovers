import type { Session } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { installSupabaseAuthAbortGuardIfWeb, isSupabaseAuthAbortError } from '@/lib/supabase-auth-guard';

installSupabaseAuthAbortGuardIfWeb();

const extra = (Constants as any)?.expoConfig?.extra ?? (Constants as any)?.manifest?.extra ?? {};
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? extra?.supabaseUrl ?? 'https://cojbunmxhfackvqzawzc.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? extra?.supabaseAnonKey ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvamJ1bm14aGZhY2t2cXphd3pjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxOTAyNTUsImV4cCI6MjA4NDc2NjI1NX0.5JauwG3u8qWUgipLBK7JhE4mXINHRAva3O5OR_sp75Y';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase env vars missing. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.'
  );
}

/**
 * Web storage: uses localStorage for session persistence across refreshes, new tabs, browser restarts.
 * Also migrates any old sessions previously stored in sessionStorage.
 * Falls back to sessionStorage if localStorage is blocked (strict private mode).
 */
const webStorage = {
  getItem: (key: string): string | null => {
    if (typeof window === 'undefined') return null;
    try {
      // Try localStorage first (new approach)
      const lsVal = window.localStorage.getItem(key);
      if (lsVal !== null) return lsVal;
      // Migrate old sessions from sessionStorage → localStorage
      try {
        const ssVal = window.sessionStorage.getItem(key);
        if (ssVal !== null) {
          // Migrate to localStorage for future use
          try { window.localStorage.setItem(key, ssVal); } catch { /* ignore */ }
          return ssVal;
        }
      } catch { /* ignore */ }
      return null;
    } catch {
      // localStorage blocked (e.g. strict private mode) – fall back to sessionStorage
      try { return window.sessionStorage.getItem(key); } catch { return null; }
    }
  },
  setItem: (key: string, value: string): void => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(key, value);
    } catch {
      try { window.sessionStorage.setItem(key, value); } catch { /* ignore */ }
    }
  },
  removeItem: (key: string): void => {
    if (typeof window === 'undefined') return;
    // Remove from both storages to ensure complete sign-out
    try { window.localStorage.removeItem(key); } catch { /* ignore */ }
    try { window.sessionStorage.removeItem(key); } catch { /* ignore */ }
  },
};

const memoryStorage = (() => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
  };
})();

const nativeStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

const globalForSupabase = globalThis as any;

// Noop WebSocket for SSR (Node <22) — never actually connects during server render.
class NoopWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  url = '';
  readyState = NoopWebSocket.CLOSED;
  binaryType: BinaryType = 'blob';
  bufferedAmount = 0;
  extensions = '';
  protocol = '';
  onopen: ((e: any) => void) | null = null;
  onclose: ((e: any) => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  onmessage: ((e: any) => void) | null = null;
  send(_data: any) {}
  close(_code?: number, _reason?: string) {}
  addEventListener() {}
  removeEventListener() {}
  dispatchEvent(_e: Event) { return true; }
}

const resolveTransport = () => {
  if (typeof WebSocket !== 'undefined') return WebSocket;
  if (typeof (globalThis as any).WebSocket !== 'undefined') return (globalThis as any).WebSocket;
  return NoopWebSocket as any;
};

const createSupabaseClient = () => {
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      console.warn('Supabase URL or Anon Key is missing. Returning fallback object.');
      return {
        auth: {
          getSession: async () => ({ data: { session: null }, error: null }),
          getUser: async () => ({ data: { user: null }, error: null }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
          signInWithOAuth: async () => { throw new Error('Supabase configuration is missing (URL/Key)'); },
          signInWithPassword: async () => { throw new Error('Supabase configuration is missing (URL/Key)'); },
          signOut: async () => {},
        },
      } as any;
    }
    return createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: (Platform.OS === 'web' ? webStorage : nativeStorage) as any,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web',
      },
      realtime: { transport: resolveTransport() },
    });
  } catch (e) {
    console.error('Failed to create Supabase client:', e);
    return {
      auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
        getUser: async () => ({ data: { user: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        signInWithOAuth: async () => { throw new Error('Supabase configuration failed to initialize'); },
        signInWithPassword: async () => { throw new Error('Supabase configuration failed to initialize'); },
        signOut: async () => {},
      },
    } as any;
  }
};

if (!globalForSupabase.__supabase) {
  globalForSupabase.__supabase = createSupabaseClient();
}

const supabase = globalForSupabase.__supabase as ReturnType<typeof createClient>;
export { supabase };

/**
 * RealtimeClient.channel(name) returns the EXISTING channel instance when one with the
 * same topic is still registered. If that instance is still joined (e.g. an async
 * removeChannel was interrupted by navigation), a subsequent .on('postgres_changes', ...)
 * throws "cannot add postgres_changes callbacks for <topic> after subscribe()".
 * Call this before subscribing to a channel name to drop any leftover instance.
 */
export function removeStaleRealtimeChannel(channelName: string) {
  const topic = `realtime:${channelName}`;
  const existing = supabase.getChannels().find((ch) => ch.topic === topic);
  if (existing) void supabase.removeChannel(existing);
}

let authChain: Promise<unknown> = Promise.resolve();

/** Serialize auth calls to avoid auth-js navigator lock aborts on web. */
export function runSupabaseAuth<T>(fn: () => Promise<T>): Promise<T> {
  const run = authChain.then(() => fn());
  authChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export async function getSupabaseSessionSafe() {
  return runSupabaseAuth(async () => {
    try {
      return await supabase.auth.getSession();
    } catch (e) {
      if (isSupabaseAuthAbortError(e)) {
        return { data: { session: null as Session | null }, error: null };
      }
      throw e;
    }
  });
}

export async function setSupabaseSessionSafe(params: { access_token: string; refresh_token: string }) {
  return runSupabaseAuth(async () => {
    try {
      return await supabase.auth.setSession(params);
    } catch (e) {
      if (!isSupabaseAuthAbortError(e)) throw e;
      await new Promise((r) => setTimeout(r, 80));
      return await supabase.auth.setSession(params);
    }
  });
}

export async function getSupabaseUserSafe() {
  return runSupabaseAuth(async () => {
    try {
      return await supabase.auth.getUser();
    } catch (e) {
      if (isSupabaseAuthAbortError(e)) {
        return { data: { user: null }, error: null };
      }
      throw e;
    }
  });
}

/**
 * Signs out the user.
 * On web: uses a full page reload after sign-out so that React state is
 * completely reset and the user visibly ends up on the home page as a guest.
 * On native: standard sign-out with local scope.
 */
export async function signOutSupabaseSafe(redirectToOnWeb = '/home') {
  return runSupabaseAuth(async () => {
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch (e) {
      if (!isSupabaseAuthAbortError(e)) {
        console.warn('signOut error (non-abort):', e);
      }
    }
    // On web, do a hard reload so localStorage is cleared and React state starts fresh.
    // This avoids the race condition where the login page's session useEffect still
    // sees the old (not-yet-cleared) session and auto-redirects the user back in.
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.href = redirectToOnWeb;
    }
  });
}
