import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

type UserProfile = {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
  license_number: string | null;
  vehicle_type: string | null;
  vehicle_number: string | null;
  vehicle_model: string | null;
  license_doc_url: string | null;
  id_doc_url: string | null;
  driver_status: string | null;
  driver_verified: boolean | null;
};

type SessionContextValue = {
  session: Session | null;
  loading: boolean;
  profile: UserProfile | null;
  refreshProfile: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue>({
  session: null,
  loading: true,
  profile: null,
  refreshProfile: async () => {},
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const didInitRef = useRef(false);
  const activeProfileUserIdRef = useRef<string | null>(null);
  const profileLoadPromiseRef = useRef<Promise<void> | null>(null);

  const ensureUserRow = async (s: Session) => {
    const userId = s?.user?.id;
    if (!userId) return;
    try {
      const email = s.user.email ?? null;
      const name = (s.user.user_metadata as any)?.name ?? null;
      await supabase
        .from('users')
        .upsert({ id: userId, email, name }, { onConflict: 'id' });
    } catch {
      // ignore
    }
  };

  const registerPushToken = async (userId: string) => {
    if (Platform.OS === 'web') return;

    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') return;

      const projectId =
        (Constants as any)?.expoConfig?.extra?.eas?.projectId ??
        (Constants as any)?.easConfig?.projectId ??
        undefined;

      const tokenResp = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
      const token = tokenResp?.data;
      if (!token) return;

      await supabase
        .from('users')
        .upsert({ id: userId, expo_push_token: token }, { onConflict: 'id' });
    } catch {
      // ignore
    }
  };

  const loadProfile = async (userId: string) => {
    if (activeProfileUserIdRef.current === userId && profileLoadPromiseRef.current) {
      return profileLoadPromiseRef.current;
    }

    activeProfileUserIdRef.current = userId;
    const baseSelect = 'id, name, email, role';
    const extendedSelect =
      'id, name, email, role, license_number, vehicle_type, vehicle_number, vehicle_model, license_doc_url, id_doc_url';

    const promise = (async () => {
      const { data: baseData, error: baseError } = await supabase
        .from('users')
        .select(baseSelect)
        .eq('id', userId)
        .maybeSingle();

      if (baseError || !baseData) {
        return;
      }

      let finalData: any = baseData;
      const { data: extData, error: extError } = await supabase
        .from('users')
        .select(extendedSelect)
        .eq('id', userId)
        .maybeSingle();

      if (!extError && extData) {
        finalData = extData;
      }

      setProfile({
        ...(finalData as any),
        driver_status: null,
        driver_verified: null,
      } as UserProfile);
    })()
      .catch(() => {
        // ignore
      })
      .finally(() => {
        if (activeProfileUserIdRef.current === userId) {
          activeProfileUserIdRef.current = null;
        }
        profileLoadPromiseRef.current = null;
      });

    profileLoadPromiseRef.current = promise;
    return promise;
  };

  const refreshProfile = async () => {
    if (!session?.user?.id) return;
    await loadProfile(session.user.id);
  };

  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;

    let isMounted = true;

    const shouldIgnoreSupabaseAbort = (value: unknown) => {
      const msg = String((value as any)?.message ?? value ?? '');
      return msg.toLowerCase().includes('signal is aborted without reason');
    };

    const unhandledRejectionHandler = (event: any) => {
      const reason = event?.reason;
      if (shouldIgnoreSupabaseAbort(reason)) {
        event?.preventDefault?.();
        return;
      }
    };

    const errorHandler = (event: any) => {
      const err = event?.error ?? event?.message;
      if (shouldIgnoreSupabaseAbort(err)) {
        event?.preventDefault?.();
        return;
      }
    };

    const errorUtils = (globalThis as any)?.ErrorUtils;
    const prevGlobalHandler = errorUtils?.getGlobalHandler?.();
    const setGlobalHandler = errorUtils?.setGlobalHandler?.bind(errorUtils);

    if (Platform.OS !== 'web' && typeof setGlobalHandler === 'function') {
      setGlobalHandler((e: any, isFatal?: boolean) => {
        if (shouldIgnoreSupabaseAbort(e)) return;
        if (typeof prevGlobalHandler === 'function') {
          prevGlobalHandler(e, isFatal);
        }
      });
    }

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('unhandledrejection', unhandledRejectionHandler);
      window.addEventListener('error', errorHandler);
    }

    const safeSetLoading = (v: boolean) => {
      if (!isMounted) return;
      setLoading(v);
    };
    const safeSetSession = (s: Session | null) => {
      if (!isMounted) return;
      setSession(s);
    };
    const safeSetProfile = (p: UserProfile | null) => {
      if (!isMounted) return;
      setProfile(p);
    };

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        safeSetSession(data.session ?? null);
        if (data.session?.user?.id) {
          void ensureUserRow(data.session);
          void loadProfile(data.session.user.id);
          void registerPushToken(data.session.user.id);
        } else {
          safeSetProfile(null);
        }
      } catch (e: any) {
        const msg = String(e?.message ?? '');
        const name = String(e?.name ?? '');
        if (name === 'AbortError' || msg.toLowerCase().includes('aborted')) {
          // ignore transient aborts from auth locking on web/dev reloads
        } else {
          safeSetSession(null);
          safeSetProfile(null);
        }
      } finally {
        safeSetLoading(false);
      }
    })();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, nextSession: Session | null) => {
        if (!isMounted) return;
        setSession(nextSession);
        if (nextSession?.user?.id) {
          void ensureUserRow(nextSession);
          void loadProfile(nextSession.user.id);
          void registerPushToken(nextSession.user.id);
        } else {
          setProfile(null);
        }
        setLoading(false);
      }
    );

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();

      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.removeEventListener('unhandledrejection', unhandledRejectionHandler);
        window.removeEventListener('error', errorHandler);
      }

      if (Platform.OS !== 'web' && typeof setGlobalHandler === 'function' && typeof prevGlobalHandler === 'function') {
        setGlobalHandler(prevGlobalHandler);
      }
    };
  }, []);

  const value = useMemo(
    () => ({ session, loading, profile, refreshProfile }),
    [session, loading, profile]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}
