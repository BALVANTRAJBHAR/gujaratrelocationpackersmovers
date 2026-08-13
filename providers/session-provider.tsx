import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { isSupabaseAuthAbortError } from '@/lib/supabase-auth-guard';
import { getSupabaseSessionSafe, supabase } from '@/lib/supabase';

type UserProfile = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  role: string | null;
  provider_services?: string[] | null;
  license_number: string | null;
  vehicle_type: string | null;
  vehicle_number: string | null;
  vehicle_model: string | null;
  license_doc_url: string | null;
  id_doc_url: string | null;
  driver_status: string | null;
  driver_verified: boolean | null;
  wallet_balance: number;
  referral_code: string | null;
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
  const ensuredUserRowIdsRef = useRef<Set<string>>(new Set());
  const lastUserIdRef = useRef<string | null>(null);

  const getDeviceInfo = () => {
    const isWeb = Platform.OS === 'web';
    const ua = typeof navigator !== 'undefined' ? String(navigator.userAgent ?? '') : '';
    let deviceType: string = 'unknown';
    if (!isWeb) {
      deviceType = 'mobile_app';
    } else if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) {
      deviceType = 'mobile_web';
    } else {
      deviceType = 'desktop_web';
    }
    let browser: string = 'unknown';
    if (/Edg\//i.test(ua)) browser = 'Edge';
    else if (/OPR\//i.test(ua)) browser = 'Opera';
    else if (/Chrome\//i.test(ua)) browser = 'Chrome';
    else if (/Firefox\//i.test(ua)) browser = 'Firefox';
    else if (/Safari\//i.test(ua)) browser = 'Safari';
    let os: string = 'unknown';
    if (/Android/i.test(ua)) os = 'Android';
    else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
    else if (/Windows/i.test(ua)) os = 'Windows';
    else if (/Mac OS/i.test(ua)) os = 'macOS';
    else if (/Linux/i.test(ua)) os = 'Linux';
    return {
      device_type: deviceType,
      platform: isWeb ? 'web' : Platform.OS,
      os,
      browser,
      user_agent: ua || null,
      app_version: (Constants as any)?.expoConfig?.version ?? null,
    };
  };

  const logAuthActivity = async (action: 'login' | 'logout', userId: string | null) => {
    if (!userId) return;
    const device = getDeviceInfo();
    const row = { user_id: userId, action, ...device };
    try {
      const { error } = await supabase.from('auth_activity_logs').insert(row);
      if (error) throw error;
      return;
    } catch {
      try {
        await supabase.functions.invoke('log-auth-activity', { body: row });
      } catch {
        // ignore
      }
    }
  };

  const ensureUserRow = async (s: Session) => {
    const userId = s?.user?.id;
    if (!userId) return;
    if (ensuredUserRowIdsRef.current.has(userId)) return;
    ensuredUserRowIdsRef.current.add(userId);
    try {
      const email = s.user.email ?? null;
      const name = (s.user.user_metadata as any)?.name ?? null;
      await supabase
        .from('users')
        .upsert({ id: userId, email, name }, { onConflict: 'id' });
    } catch {
      ensuredUserRowIdsRef.current.delete(userId);
    }
  };

  const registerPushToken = async (userId: string) => {
    if (Platform.OS === 'web') {
      const { subscribeWebPush } = await import('@/lib/web-push');
      void subscribeWebPush(userId);
      return;
    }

    if ((Constants as any)?.appOwnership === 'expo') {
      return;
    }

    try {
      const Notifications = await import('expo-notifications');
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
    const baseSelect = 'id, name, phone, email, role, provider_services, wallet_balance, referral_code';

    const promise = (async () => {
      const { data: baseData, error: baseError } = await supabase
        .from('users')
        .select(baseSelect)
        .eq('id', userId)
        .maybeSingle();

      if (baseError || !baseData) {
        return;
      }

      setProfile({
        ...(baseData as any),
        phone: (baseData as any)?.phone ?? null,
        license_number: null,
        vehicle_type: null,
        vehicle_number: null,
        vehicle_model: null,
        license_doc_url: null,
        id_doc_url: null,
        driver_status: null,
        driver_verified: null,
        wallet_balance: (baseData as any)?.wallet_balance ?? 0,
        referral_code: (baseData as any)?.referral_code ?? null,
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
        const { data } = await getSupabaseSessionSafe();
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
        if (name === 'AbortError' || isSupabaseAuthAbortError(e) || msg.toLowerCase().includes('aborted')) {
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
          lastUserIdRef.current = nextSession.user.id;
          if (_event === 'SIGNED_IN') {
            void logAuthActivity('login', nextSession.user.id);
          }
          void ensureUserRow(nextSession);
          void loadProfile(nextSession.user.id);
          void registerPushToken(nextSession.user.id);
        } else {
          if (_event === 'SIGNED_OUT') {
            void logAuthActivity('logout', lastUserIdRef.current);
          }
          lastUserIdRef.current = null;
          setProfile(null);
        }
        setLoading(false);
      }
    );

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();

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
