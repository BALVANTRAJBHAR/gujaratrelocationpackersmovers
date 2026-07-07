import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type AuthGuardResult = {
  isLoading: boolean;
  isAuthenticated: boolean;
  userId: string | null;
  role: string | null;
  error: string | null;
};

type AllowedRole = 'admin' | 'staff' | 'driver' | 'customer' | 'provider';

export const useAuthGuard = (allowedRoles?: AllowedRole[]): AuthGuardResult => {
  const [state, setState] = useState<AuthGuardResult>({
    isLoading: true,
    isAuthenticated: false,
    userId: null,
    role: null,
    error: null,
  });

  useEffect(() => {
    let active = true;
    let sub: { unsubscribe: () => void } | null = null;

    const check = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (!active) return;
        if (sessionError) throw sessionError;
        if (!session?.user?.id) {
          setState({ isLoading: false, isAuthenticated: false, userId: null, role: null, error: 'not_authenticated' });
          return;
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (!active) return;
        if (!user) {
          setState({ isLoading: false, isAuthenticated: false, userId: null, role: null, error: 'not_authenticated' });
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();
        if (!active) return;

        const role = String(profile?.role ?? '').trim().toLowerCase() || null;
        if (profileError) throw profileError;

        if (allowedRoles && allowedRoles.length > 0) {
          if (!role || !allowedRoles.includes(role as AllowedRole)) {
            setState({ isLoading: false, isAuthenticated: true, userId: user.id, role, error: 'forbidden' });
            return;
          }
        }

        setState({ isLoading: false, isAuthenticated: true, userId: user.id, role, error: null });
      } catch (e) {
        if (!active) return;
        setState({ isLoading: false, isAuthenticated: false, userId: null, role: null, error: 'error' });
      }
    };
    void check();

    try {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
        void check();
      });
      sub = subscription;
    } catch {
      // ignore subscription failure
    }

    return () => {
      active = false;
      try { sub?.unsubscribe(); } catch {}
    };
  }, [allowedRoles?.join(',')]);

  return state;
};
