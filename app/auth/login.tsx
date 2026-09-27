import { AntDesign, MaterialIcons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView } from 'react-native';
import { Button, H2, Input, Paragraph, Text, XStack, YStack } from 'tamagui';

import type { AuthChangeEvent } from '@supabase/supabase-js';

import { themes } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getDashboardRoute } from '@/lib/role-routing';
import { getSupabaseSessionSafe, runSupabaseAuth, setSupabaseSessionSafe, supabase } from '@/lib/supabase';
import { lookupReferralCode } from '@/lib/wallet';
import { useSession } from '@/providers/session-provider';

let _pendingRedirectTo: string | null = null;
let _processingOAuth = false;

const ALLOWED_REDIRECT_PREFIXES = [
  '/', 
  'http://localhost', 
  'https://localhost', 
  'http://127.0.0.1', 
  'https://127.0.0.1',
  'https://gujaratrelocationpackers.com',
  'https://www.gujaratrelocationpackers.com'
];

const isValidRedirect = (redirect: string): boolean => {
  try {
    const trimmed = redirect.trim();
    if (!trimmed) return false;
    if (trimmed.startsWith('/')) return true;
    const url = new URL(trimmed);
    return ALLOWED_REDIRECT_PREFIXES.some((p) => trimmed.startsWith(p));
  } catch {
    return false;
  }
};

const stripUrlTokens = () => {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    const clean = `${url.origin}${url.pathname}${url.search}`;
    if (clean !== window.location.href) {
      window.history.replaceState({}, '', clean);
    }
  } catch {
    // ignore
  }
};

const extractUrlParams = (incomingUrl: string): { code?: string; access_token?: string; refresh_token?: string } => {
  const fragmentStart = incomingUrl.indexOf('#');
  const queryStart = incomingUrl.indexOf('?');
  const searchString = queryStart !== -1 ? incomingUrl.slice(queryStart + 1, fragmentStart !== -1 ? fragmentStart : undefined) : '';
  const params: Record<string, string> = {};
  for (const part of searchString.split('&')) {
    const eq = part.indexOf('=');
    if (eq !== -1) params[part.slice(0, eq)] = decodeURIComponent(part.slice(eq + 1));
  }
  if (fragmentStart !== -1) {
    for (const part of incomingUrl.slice(fragmentStart + 1).split('&')) {
      const eq = part.indexOf('=');
      if (eq !== -1) params[part.slice(0, eq)] = decodeURIComponent(part.slice(eq + 1));
    }
  }
  return { code: params.code, access_token: params.access_token, refresh_token: params.refresh_token };
};

export default function LoginScreen() {
  const router = useRouter();
  const { session } = useSession();
  const params = useLocalSearchParams<{ redirectTo?: string } & Record<string, string>>();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? themes.dark : themes.light;
  const activeBtnBg = '#3B82F6';
  const activeBtnText = '#FFFFFF';
  const activeBtnHoverBg = '#2563EB';
  const activeBtnPressBg = '#1D4ED8';
  const idleBtnBg = theme.bgCardSecondary;
  const idleBtnText = theme.textMuted;
  const idleBtnHoverBg = theme.border;
  const idleBtnPressBg = theme.border;
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [forgotStep, setForgotStep] = useState<'request' | 'set_password'>('request');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'facebook' | null>(null);
  const [pendingOAuthUser, setPendingOAuthUser] = useState<{ email: string; name?: string } | null>(null);
  const [showEmailSignup, setShowEmailSignup] = useState(false);
  const [initialProcessing, setInitialProcessing] = useState(false);
  const [referredById, setReferredById] = useState<string | null>(null);
  // Prevents redirectAfterAuth from executing more than once per component mount.
  // This is the single navigation guard — all post-auth navigation flows through
  // the session useEffect below, so we only need one guard.
  const navigatedRef = useRef(false);

  // Resolve referral code from URL param
  useEffect(() => {
    const refCode = (params as any).ref as string | undefined;
    if (!refCode) return;
    lookupReferralCode(refCode).then((id) => {
      if (id) setReferredById(id);
    });
  }, [params]);

  // Pre-fill name and email when pendingOAuthUser changes
  useEffect(() => {
    if (pendingOAuthUser) {
      setName(pendingOAuthUser.name ?? '');
      setEmail(pendingOAuthUser.email);
    }
  }, [pendingOAuthUser]);

  // Reset pendingOAuthUser when mode changes away from signup or when canceling
  useEffect(() => {
    if (mode !== 'signup') {
      setPendingOAuthUser(null);
    }
  }, [mode]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [signupRole, setSignupRole] = useState<'customer' | 'provider'>('customer');
  const [signupProviderSubtype, setSignupProviderSubtype] = useState<'home_service' | 'property_owner'>('home_service');

  const resolveDbRole = (intent: 'customer' | 'provider') => {
    return intent === 'provider' ? 'provider' : 'customer';
  };

  const resolveProviderServices = (providerSubtype: string) => {
    if (providerSubtype === 'property_owner') return ['property owner'];
    if (providerSubtype === 'home_service') return ['home_service'];
    return [];
  };

  const maybeStartOAuthProfileCompletion = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) return false;

      // Check if email already exists in users table with a completed profile
      if (user.email) {
        const { data: existingUser } = await supabase
          .from('users')
          .select('role, provider_type')
          .eq('email', user.email)
          .maybeSingle();

        if (existingUser?.role) {
          // Returning user — already has role, no role selection needed
          // ensureUserRow in session-provider will sync the row if needed
          return false;
        }
      }

      const { data: profile, error: profileError } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle();
      if (profileError) return false;

      const dbRole = String((profile as any)?.role ?? '').trim().toLowerCase();
      const roleIntent = String((user.user_metadata as any)?.role_intent ?? '').trim().toLowerCase();
      const providerSubtype = String((user.user_metadata as any)?.provider_subtype ?? '').trim().toLowerCase();
      const hasAnyRole = Boolean(dbRole) || Boolean(roleIntent);
      const isProvider = dbRole === 'provider' || roleIntent === 'provider';
      const needsSubtype = isProvider && !providerSubtype;
      if (hasAnyRole && !needsSubtype) return false;

      // Auto-assign customer role for new Google users — skip the form
      if (!isProvider) {
        await supabase.from('users').upsert(
          { id: user.id, email: user.email ?? null, name: (user.user_metadata as any)?.name ?? null, role: 'customer', referred_by: referredById },
          { onConflict: 'id' }
        );
        await supabase.auth.updateUser({ data: { ...(user.user_metadata as any), role_intent: 'customer' } });
        return false;
      }

      setPendingOAuthUser({ email: user.email ?? '', name: (user.user_metadata as any)?.name });
      setShowEmailSignup(true);
      setMode('signup');

      if (isProvider) {
        setSignupRole('provider');
        if (providerSubtype === 'property_owner' || providerSubtype === 'home_service') {
          setSignupProviderSubtype(providerSubtype as any);
        }
      }
      return true;
    } catch {
      // ignore
    }
    return false;
  };

  const maybeRedirectToRegistration = async () => {
    try {
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;
      if (!userId) return false;

      const roleIntent = String((data.user?.user_metadata as any)?.role_intent ?? '').trim().toLowerCase();

      if (roleIntent === 'provider') {
        router.replace('/auth/register' as any);
        return true;
      }

      const { data: row, error: rowError } = await supabase
        .from('users')
        .select('id, phone, role, provider_services, provider_type')
        .eq('id', userId)
        .maybeSingle();

      if (rowError) return false;

      const dbRole = String((row as any)?.role ?? '').trim().toLowerCase();
      const providerServices = Array.isArray((row as any)?.provider_services) ? (row as any)?.provider_services : [];
      const isProvider = dbRole === 'provider' || roleIntent === 'provider';
      const providerIncomplete = isProvider && (!row?.phone || providerServices.length === 0);

      if (providerIncomplete) {
        router.replace('/auth/register' as any);
        return true;
      }

      const dashboardRoute = getDashboardRoute(dbRole, row?.provider_type ?? null, typeof window !== 'undefined' ? 'web' : 'native');
      if (typeof window !== 'undefined' && dashboardRoute.startsWith('/')) {
        window.location.assign(dashboardRoute);
        return true;
      }
      router.replace(dashboardRoute as any);
      return true;
    } catch {
      // ignore
    }
    return false;
  };

  const redirectAfterAuth = async () => {
    // Only allow one redirect per component mount to prevent duplicate navigation
    if (navigatedRef.current) return;
    navigatedRef.current = true;

    const pending = _pendingRedirectTo;
    _pendingRedirectTo = null;
    const redirect = pending || String(params.redirectTo ?? '').trim();
    if (redirect && isValidRedirect(redirect)) {
      router.replace(redirect as any);
      return;
    }
    const didRedirect = await maybeRedirectToRegistration();
    if (!didRedirect) router.replace(Platform.OS === 'web' ? '/home' : '/(tabs)');
  };

  useEffect(() => {
    if (mode !== 'forgot') return;
    if (forgotStep !== 'set_password') return;

    const tryPrefillEmail = async () => {
      const { data } = await getSupabaseSessionSafe();
      const sessionEmail = data.session?.user?.email;
      if (sessionEmail && (!email || email.trim().length === 0)) {
        setEmail(sessionEmail);
      }
    };

    void tryPrefillEmail();
  }, [email, forgotStep, mode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const openRecoveryIfPresent = async () => {
      try {
        const rawUrl = new URL(window.location.href);
        const hashParams = new URLSearchParams((rawUrl.hash ?? '').replace(/^#/, ''));
        const searchParams = rawUrl.searchParams;

        const type = (hashParams.get('type') || searchParams.get('type') || '').trim();
        const isRecovery = type === 'recovery';
        const access_token = (hashParams.get('access_token') ?? '').trim();
        const refresh_token = (hashParams.get('refresh_token') ?? '').trim();
        const code = (searchParams.get('code') ?? '').trim();

        const hasOAuthParams = Boolean(access_token || refresh_token || code);

        // Immediately strip tokens from URL before any processing
        if (hasOAuthParams || isRecovery) {
          stripUrlTokens();
        }

        if (isRecovery) {
          setMode('forgot');
          setForgotStep('set_password');
          setInfo('Verifying reset link…');
          setError(null);
        }

        if (hasOAuthParams) {
          setInitialProcessing(true);

          if (access_token) {
            await setSupabaseSessionSafe({ access_token, refresh_token: refresh_token || '' });
          } else if (code) {
            await runSupabaseAuth(() => supabase.auth.exchangeCodeForSession(code));
          }

          const { data } = await getSupabaseSessionSafe();
          if (data.session?.user?.id) {
            if (isRecovery) {
              setMode('forgot');
              setForgotStep('set_password');
              setInfo('Set a new password for your account.');
              setError(null);
              return;
            }

            const didStartCompletion = await maybeStartOAuthProfileCompletion();
            if (didStartCompletion) {
              return;
            }

            // Navigation is handled by the session useEffect — no direct redirectAfterAuth call
          }
        }
      } catch {
        // ignore
      } finally {
        setInitialProcessing(false);
      }
    };

    void openRecoveryIfPresent();
  }, []);

  // Listen to session changes and redirect authenticated users.
  // This is the SINGLE source of truth for post-auth navigation.
  // handleSubmit and OAuth handlers no longer navigate directly — they let this
  // effect pick up the session change and call redirectAfterAuth.
  useEffect(() => {
    if (session && !pendingOAuthUser && !initialProcessing && mode !== 'forgot') {
      void redirectAfterAuth();
    }
  }, [session, pendingOAuthUser, initialProcessing, mode]);

  useEffect(() => {
    const handleOAuthUrl = async (incomingUrl: string) => {
      if (!incomingUrl?.startsWith('grpackersmovers://auth/login')) return;
      if (_processingOAuth) return;
      _processingOAuth = true;
      try {
        setOauthLoading('google');
        setInitialProcessing(true);
        const { code, access_token, refresh_token } = extractUrlParams(incomingUrl);
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) { setError(exchangeError.message); return; }
        } else if (access_token) {
          await setSupabaseSessionSafe({ access_token, refresh_token: refresh_token ?? '' });
        } else {
          return;
        }
        const didStartCompletion = await maybeStartOAuthProfileCompletion();
        if (didStartCompletion) return;
      } catch {
        setError('OAuth sign-in failed');
      } finally {
        setOauthLoading(null);
        _processingOAuth = false;
        setInitialProcessing(false);
      }
    };

    Linking.getInitialURL().then((url) => {
      if (url) void handleOAuthUrl(url);
    });

    const subscription = Linking.addEventListener('url', (event) => {
      void handleOAuthUrl(event.url);
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const { data } = supabase.auth.onAuthStateChange((event: AuthChangeEvent) => {
      if (event === 'PASSWORD_RECOVERY') {
        try {
          const url = new URL(window.location.href);
          const hashParams = new URLSearchParams((url.hash ?? '').replace(/^#/, ''));
          const type = (hashParams.get('type') || url.searchParams.get('type') || '').trim();
          if (type !== 'recovery') {
            return;
          }
        } catch {
          return;
        }
        setMode('forgot');
        setForgotStep('set_password');
        setInfo('Set a new password for your account.');
        setError(null);
      }
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  const commonInputProps = {
    backgroundColor: 'transparent' as const,
    borderWidth: 1 as const,
    borderColor: theme.border,
    color: theme.inputText,
    placeholderTextColor: theme.textMuted,
    fontFamily: 'Times New Roman' as const,
    fontSize: 16,
    borderRadius: 9 as const,
  };

  const title = useMemo(() => {
    if (mode === 'signup') return 'Create account';
    if (mode === 'forgot') return 'Reset password';
    return 'Sign In';
  }, [mode]);

  const subtitle = useMemo(() => {
    if (mode === 'signup') {
      if (pendingOAuthUser) return 'Complete your Google profile to continue.';
      return 'Create your account to book and track moves.';
    }
    if (mode === 'forgot') {
      return forgotStep === 'request'
        ? 'We will send a password reset link to your email.'
        : 'Set a new password for your account.';
    }
    return 'Sign in to continue booking and tracking.';
  }, [forgotStep, mode, pendingOAuthUser]);

  const handleOAuth = async (provider: 'google' | 'facebook') => {
    setError(null);
    setInfo(null);

    if (provider === 'facebook') {
      setInfo('Facebook sign-in is coming soon.');
      return;
    }

    _pendingRedirectTo = params.redirectTo && isValidRedirect(params.redirectTo) ? params.redirectTo : null;
    _processingOAuth = true;
    setOauthLoading(provider);

    try {
      const redirectTo =
        Platform.OS === 'web'
          ? typeof window === 'undefined'
            ? ''
            : `${window.location.origin}/auth/login`
          : 'grpackersmovers://auth/login';

      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
        },
      });

      if (oauthError) {
        setError(sanitizeAuthError(oauthError));
        return;
      }

      const url = (data as any)?.url as string | undefined;
      if (!url) {
        setError('Could not start OAuth sign-in.');
        return;
      }

      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') window.location.assign(url);
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(url, redirectTo);
      if (result.type !== 'success' || !result.url) return;

      const { code, access_token: rawToken, refresh_token: rawRefresh } = extractUrlParams(result.url);
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          setError(sanitizeAuthError(exchangeError));
          return;
        }
      } else if (rawToken) {
        await setSupabaseSessionSafe({ access_token: rawToken, refresh_token: rawRefresh ?? '' });
      } else {
        setError('Sign-in did not return a code. Please try again.');
        return;
      }

      const didStartCompletion = await maybeStartOAuthProfileCompletion();
      if (didStartCompletion) return;

      // Navigation is handled by the session useEffect — no direct router.replace needed
    } catch (e: any) {
      const errMsg = e?.message ?? String(e) ?? 'Unknown error';
      console.error('[OAuth] Sign-in failed:', errMsg, e);
      setError(`OAuth sign-in failed: ${errMsg}`);
    } finally {
      setOauthLoading(null);
      _processingOAuth = false;
    }
  };

  const sanitizeAuthError = (err: unknown): string => {
    if (!err) return 'An unexpected error occurred.';
    const msg = String((err as any)?.message ?? err ?? '').toLowerCase();
    if (msg.includes('invalid login credentials')) return 'Invalid email or password.';
    if (msg.includes('email not confirmed')) return 'Please confirm your email address before signing in.';
    if (msg.includes('user already registered')) return 'An account with this email already exists.';
    if (msg.includes('password should be at least 6 characters')) return 'Password must be at least 6 characters.';
    if (msg.includes('rate limit')) return 'Too many attempts. Please try again later.';
    return 'Authentication failed. Please try again.';
  };

  const handleSubmit = async () => {
    setError(null);
    setInfo(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Please enter email.');
      return;
    }

    if (mode === 'forgot') {
      if (forgotStep === 'set_password') {
        if (!newPassword) {
          setError('Please enter new password.');
          return;
        }
        if (newPassword.length < 6) {
          setError('Password must be at least 6 characters.');
          return;
        }
      }
    } else if (!password) {
      setError('Please enter password.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });

        if (signInError) {
          setError(sanitizeAuthError(signInError));
          return;
        }

        // Navigation is handled by the session useEffect above — no direct router.replace needed
        return;
      }

      if (mode === 'signup') {
        const trimmedName = pendingOAuthUser?.name?.trim() ?? name.trim();
        const trimmedEmail = pendingOAuthUser?.email?.trim() ?? email.trim();

        // If we have a pending OAuth user, just update metadata and DB; no auth.signUp needed
        if (pendingOAuthUser) {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            await supabase.auth.updateUser({
              data: {
                ...(trimmedName ? { name: trimmedName } : {}),
                role_intent: signupRole,
                provider_subtype: signupRole === 'provider' ? signupProviderSubtype : undefined,
                ...(signupRole === 'provider' ? { provider_services: resolveProviderServices(signupProviderSubtype) } : {}),
              },
            });
            // Update users table
            await supabase
              .from('users')
              .upsert(
                {
                  id: user.id,
                  email: trimmedEmail,
                  name: trimmedName || null,
                  role: resolveDbRole(signupRole),
                  provider_services: signupRole === 'provider' ? resolveProviderServices(signupProviderSubtype) : null,
                  provider_type: signupRole === 'provider' ? signupProviderSubtype : null,
                  referred_by: referredById,
                },
                { onConflict: 'id' }
              );
            // Navigation is handled by the session useEffect — no direct router.replace needed
            return;
          }
        }

        // Normal email signup
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: {
            ...(typeof window === 'undefined'
              ? null
              : {
                  emailRedirectTo: `${window.location.origin}${signupRole === 'provider' ? '/auth/register' : '/auth/login'}`,
                }),
            data: {
              ...(trimmedName ? { name: trimmedName } : {}),
              role_intent: signupRole,
              provider_subtype: signupRole === 'provider' ? signupProviderSubtype : undefined,
              ...(signupRole === 'provider' ? { provider_services: resolveProviderServices(signupProviderSubtype) } : {}),
            },
          },
        });

        if (signUpError) {
          setError(sanitizeAuthError(signUpError));
          return;
        }

        const identities = (signUpData as any)?.user?.identities;
        if (Array.isArray(identities) && identities.length === 0) {
          setError('This email is already registered. Please sign in or use Forgot password.');
          setMode('login');
          return;
        }

        const createdUserId = (signUpData as any)?.user?.id as string | undefined;
        const session = (signUpData as any)?.session ?? null;

        if (createdUserId && session?.user?.id) {
          await supabase
            .from('users')
            .upsert(
              {
                id: createdUserId,
                email: trimmedEmail,
                name: trimmedName || null,
                role: resolveDbRole(signupRole),
                provider_services:
                  signupRole === 'provider'
                    ? resolveProviderServices(signupProviderSubtype)
                    : null,
                provider_type: signupRole === 'provider' ? signupProviderSubtype : null,
                referred_by: referredById,
              },
              { onConflict: 'id' }
            );

          // Navigation is handled by the session useEffect — no direct router.replace needed
          return;
        }

        setInfo('Account created. Please check your email to confirm (if required), then sign in.');
        setMode('login');
        setPassword('');
        return;
      }

      if (forgotStep === 'request') {
        const redirectTo =
          typeof window === 'undefined' ? undefined : `${window.location.origin}/auth/login`;
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
          redirectTo,
        });

        if (resetError) {
          setError(sanitizeAuthError(resetError));
          return;
        }

        setInfo('Password reset link sent. Open it from your email.');
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!data.session?.user?.id) {
        setError('Session missing. Please open the reset link again.');
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        setError(sanitizeAuthError(updateError));
        return;
      }

      setInfo('Password updated successfully. Please sign in.');
      setMode('login');
      setForgotStep('request');
      setNewPassword('');
      setPassword('');
      await supabase.auth.signOut();
      return;
    } catch (e) {
      setError('Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ─── New UI matching reference design ────────────────────────────────────────
  return initialProcessing ? (
    <YStack flex={1} backgroundColor="#EEF2F7" alignItems="center" justifyContent="center">
      <ActivityIndicator size="large" color="#0B1F3A" />
    </YStack>
  ) : (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#EEF2F7' } as any}
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20 } as any}
      keyboardShouldPersistTaps="handled">

      {/* Card */}
      <YStack
        width="100%"
        maxWidth={440}
        backgroundColor="#FFFFFF"
        borderRadius={20}
        paddingHorizontal={32}
        paddingVertical={36}
        gap="$0"
        shadowColor="#000"
        shadowOffset={{ width: 0, height: 4 } as any}
        shadowOpacity={0.08 as any}
        shadowRadius={24 as any}
        elevation={6}>

        {/* ── SIGN IN ── */}
        {mode === 'login' ? (
          <>
            {/* Logo + Title */}
            <YStack alignItems="center" gap="$3" marginBottom={24}>
              <YStack
                width={80} height={80} borderRadius={40}
                backgroundColor="#F8FAFC"
                borderWidth={1} borderColor="#E2E8F0"
                alignItems="center" justifyContent="center"
                overflow="hidden"
                shadowColor="#000"
                shadowOffset={{ width: 0, height: 2 } as any}
                shadowOpacity={0.06 as any}
                shadowRadius={8 as any}
                elevation={2}>
                <Image
                  source={require('@/assets/images/GR-New-Icon.png')}
                  style={{ width: 68, height: 68, borderRadius: 34 }}
                  resizeMode="contain"
                />
              </YStack>
              <YStack alignItems="center" gap="$1">
                <Text style={{ fontSize: 20, fontWeight: '900', color: '#0B1F3A', textAlign: 'center', fontFamily: 'Times New Roman', lineHeight: 26 } as any}>
                  Welcome to Gujarat{'\n'}Relocation Packers &{'\n'}Movers
                </Text>
                <Text style={{ fontSize: 13, color: '#6B7280', textAlign: 'center', marginTop: 4, fontFamily: 'Times New Roman' } as any}>
                  Sign in to continue
                </Text>
              </YStack>
            </YStack>

            {/* Google Button */}
            <Pressable
              onPress={() => handleOAuth('google')}
              disabled={loading || oauthLoading !== null}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10,
                paddingVertical: 13, paddingHorizontal: 16, gap: 10,
                backgroundColor: pressed ? '#F9FAFB' : '#FFFFFF',
                marginBottom: 20,
              }) as any}>
              {oauthLoading === 'google' ? (
                <ActivityIndicator size="small" color="#0B1F3A" />
              ) : (
                <AntDesign name="google" size={19} color="#EA4335" />
              )}
              <Text style={{ fontSize: 15, fontWeight: '600', color: '#0B1F3A', fontFamily: 'Times New Roman' } as any}>
                Continue with Google
              </Text>
            </Pressable>

            {/* OR divider */}
            <XStack alignItems="center" gap="$3" marginBottom={20}>
              <YStack flex={1} height={1} backgroundColor="#E5E7EB" />
              <Text style={{ fontSize: 13, color: '#6B7280', fontWeight: '600' } as any}>OR</Text>
              <YStack flex={1} height={1} backgroundColor="#E5E7EB" />
            </XStack>

            {/* Email */}
            <YStack gap="$1" marginBottom={16}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 6 } as any}>Email</Text>
              <XStack
                alignItems="center" borderWidth={1} borderColor="#D1D5DB"
                borderRadius={10} paddingHorizontal={12} backgroundColor="#FFFFFF">
                <MaterialIcons name="mail-outline" size={18} color="#9CA3AF" style={{ marginRight: 8 } as any} />
                <Input
                  {...commonInputProps}
                  flex={1} borderWidth={0} value={email} onChangeText={setEmail}
                  autoCapitalize="none" keyboardType="email-address"
                  placeholder="you@example.com"
                  style={{ height: 46, fontFamily: 'Times New Roman', fontSize: 15, color: '#0B1F3A' } as any}
                />
              </XStack>
            </YStack>

            {/* Password */}
            <YStack gap="$1" marginBottom={24}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 6 } as any}>Password</Text>
              <XStack
                alignItems="center" borderWidth={1} borderColor="#D1D5DB"
                borderRadius={10} paddingHorizontal={12} backgroundColor="#FFFFFF">
                <MaterialIcons name="lock-outline" size={18} color="#9CA3AF" style={{ marginRight: 8 } as any} />
                <Input
                  {...commonInputProps}
                  flex={1} borderWidth={0} value={password} onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  placeholder="••••••••"
                  style={{ height: 46, fontFamily: 'Times New Roman', fontSize: 15, color: '#0B1F3A' } as any}
                />
                <Pressable onPress={() => setShowPassword(!showPassword)} style={{ padding: 4 } as any}>
                  <MaterialIcons name={showPassword ? 'visibility-off' : 'visibility'} size={20} color="#9CA3AF" />
                </Pressable>
              </XStack>
            </YStack>

            {error ? <Text style={{ color: '#DC2626', fontSize: 13, marginBottom: 12, textAlign: 'center' } as any}>{error}</Text> : null}
            {info  ? <Text style={{ color: '#059669', fontSize: 13, marginBottom: 12, textAlign: 'center' } as any}>{info}</Text>  : null}

            {/* Sign In button */}
            <Pressable
              onPress={handleSubmit}
              disabled={loading || oauthLoading !== null}
              style={({ pressed }) => ({
                backgroundColor: pressed ? '#1a2f4e' : '#0B1F3A',
                borderRadius: 10, paddingVertical: 15, alignItems: 'center', marginBottom: 20,
              }) as any}>
              {loading
                ? <ActivityIndicator size="small" color="#FFFFFF" />
                : <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '800', fontFamily: 'Times New Roman' } as any}>Sign in</Text>}
            </Pressable>

            {/* Footer links */}
            <XStack justifyContent="space-between" alignItems="center">
              <Pressable onPress={() => { setMode('forgot'); setForgotStep('request'); setError(null); setInfo(null); }}>
                <Text style={{ fontSize: 13, color: '#6B7280' } as any}>Forgot password?</Text>
              </Pressable>
              <XStack gap="$1">
                <Text style={{ fontSize: 13, color: '#6B7280' } as any}>Need an account?</Text>
                <Pressable onPress={() => { setMode('signup'); setShowEmailSignup(false); setError(null); setInfo(null); }}>
                  <Text style={{ fontSize: 13, color: '#0B1F3A', fontWeight: '800' } as any}> Sign up</Text>
                </Pressable>
              </XStack>
            </XStack>
          </>
        ) : null}

        {/* ── SIGN UP ── */}
        {mode === 'signup' ? (
          <>
            {/* Back link */}
            <Pressable
              onPress={() => { setMode('login'); setShowEmailSignup(false); setPendingOAuthUser(null); setError(null); setInfo(null); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 20 } as any}>
              <MaterialIcons name="arrow-back" size={18} color="#374151" />
              <Text style={{ fontSize: 14, color: '#374151', fontWeight: '600' } as any}>Back to sign in</Text>
            </Pressable>

            <Text style={{ fontSize: 22, fontWeight: '900', color: '#0B1F3A', textAlign: 'center', fontFamily: 'Times New Roman', marginBottom: 24 } as any}>
              Create your account
            </Text>

            {/* Google button (only when not email-signup flow yet) */}
            {!showEmailSignup && !pendingOAuthUser ? (
              <>
                <Pressable
                  onPress={() => handleOAuth('google')}
                  disabled={loading || oauthLoading !== null}
                  style={({ pressed }) => ({
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10,
                    paddingVertical: 13, paddingHorizontal: 16, gap: 10,
                    backgroundColor: pressed ? '#F9FAFB' : '#FFFFFF',
                    marginBottom: 16,
                  }) as any}>
                  {oauthLoading === 'google'
                    ? <ActivityIndicator size="small" color="#0B1F3A" />
                    : <AntDesign name="google" size={19} color="#EA4335" />}
                  <Text style={{ fontSize: 15, fontWeight: '600', color: '#0B1F3A', fontFamily: 'Times New Roman' } as any}>
                    Continue with Google
                  </Text>
                </Pressable>

                <XStack alignItems="center" gap="$3" marginBottom={16}>
                  <YStack flex={1} height={1} backgroundColor="#E5E7EB" />
                  <Text style={{ fontSize: 13, color: '#6B7280', fontWeight: '600' } as any}>OR</Text>
                  <YStack flex={1} height={1} backgroundColor="#E5E7EB" />
                </XStack>

                <Pressable
                  onPress={() => setShowEmailSignup(true)}
                  style={({ pressed }) => ({
                    backgroundColor: pressed ? '#1a2f4e' : '#0B1F3A',
                    borderRadius: 10, paddingVertical: 15, alignItems: 'center', marginBottom: 16,
                  }) as any}>
                  <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '800', fontFamily: 'Times New Roman' } as any}>
                    Continue with Email
                  </Text>
                </Pressable>
              </>
            ) : null}

            {/* Email signup form */}
            {showEmailSignup || pendingOAuthUser ? (
              <>
                {/* Name (optional) */}
                {!pendingOAuthUser ? (
                  <YStack gap="$1" marginBottom={16}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 6 } as any}>Name (optional)</Text>
                    <XStack alignItems="center" borderWidth={1} borderColor="#D1D5DB" borderRadius={10} paddingHorizontal={12} backgroundColor="#FFFFFF">
                      <MaterialIcons name="person-outline" size={18} color="#9CA3AF" style={{ marginRight: 8 } as any} />
                      <Input
                        {...commonInputProps}
                        flex={1} borderWidth={0} value={name} onChangeText={setName}
                        placeholder="Your name"
                        style={{ height: 46, fontFamily: 'Times New Roman', fontSize: 15, color: '#0B1F3A' } as any}
                      />
                    </XStack>
                  </YStack>
                ) : null}

                {/* Role selection */}
                <YStack gap="$1" marginBottom={16}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 6 } as any}>You are a</Text>
                  <XStack gap="$2">
                    {(['customer', 'provider'] as const).map((r) => (
                      <Pressable
                        key={r}
                        onPress={() => { setSignupRole(r); setSignupProviderSubtype('home_service'); }}
                        style={{
                          flex: 1, borderRadius: 10, paddingVertical: 12,
                          alignItems: 'center', borderWidth: 1,
                          backgroundColor: signupRole === r ? '#0B1F3A' : '#FFFFFF',
                          borderColor: signupRole === r ? '#0B1F3A' : '#D1D5DB',
                        } as any}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: signupRole === r ? '#FFFFFF' : '#374151', fontFamily: 'Times New Roman' } as any}>
                          {r === 'customer' ? 'Customer' : 'Provider'}
                        </Text>
                      </Pressable>
                    ))}
                  </XStack>
                </YStack>

                {/* Provider subtype */}
                {signupRole === 'provider' ? (
                  <YStack gap="$1" marginBottom={16}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 6 } as any}>Provider type</Text>
                    <XStack gap="$2" flexWrap="wrap">
                      {(['home_service', 'property_owner'] as const).map((sub) => (
                        <Pressable
                          key={sub}
                          onPress={() => setSignupProviderSubtype(sub)}
                          style={{
                            flex: 1, borderRadius: 10, paddingVertical: 12,
                            alignItems: 'center', borderWidth: 1, minWidth: 120,
                            backgroundColor: signupProviderSubtype === sub ? '#0B1F3A' : '#FFFFFF',
                            borderColor: signupProviderSubtype === sub ? '#0B1F3A' : '#D1D5DB',
                          } as any}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: signupProviderSubtype === sub ? '#FFFFFF' : '#374151', textAlign: 'center', fontFamily: 'Times New Roman' } as any}>
                            {sub === 'home_service' ? 'Home Service' : 'Property Owner'}
                          </Text>
                        </Pressable>
                      ))}
                    </XStack>
                  </YStack>
                ) : null}

                {/* Email */}
                {!pendingOAuthUser ? (
                  <YStack gap="$1" marginBottom={16}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 6 } as any}>Email</Text>
                    <XStack alignItems="center" borderWidth={1} borderColor="#D1D5DB" borderRadius={10} paddingHorizontal={12} backgroundColor="#F5F7FF">
                      <MaterialIcons name="mail-outline" size={18} color="#9CA3AF" style={{ marginRight: 8 } as any} />
                      <Input
                        {...commonInputProps}
                        flex={1} borderWidth={0} value={email} onChangeText={setEmail}
                        autoCapitalize="none" keyboardType="email-address"
                        placeholder="you@example.com"
                        style={{ height: 46, fontFamily: 'Times New Roman', fontSize: 15, color: '#0B1F3A' } as any}
                      />
                    </XStack>
                  </YStack>
                ) : null}

                {/* Password */}
                {!pendingOAuthUser ? (
                  <YStack gap="$1" marginBottom={16}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 6 } as any}>Password</Text>
                    <XStack alignItems="center" borderWidth={1} borderColor="#D1D5DB" borderRadius={10} paddingHorizontal={12} backgroundColor="#FFFFFF">
                      <MaterialIcons name="lock-outline" size={18} color="#9CA3AF" style={{ marginRight: 8 } as any} />
                      <Input
                        {...commonInputProps}
                        flex={1} borderWidth={0} value={password} onChangeText={setPassword}
                        secureTextEntry={!showPassword}
                        placeholder="Min. 8 characters"
                        style={{ height: 46, fontFamily: 'Times New Roman', fontSize: 15, color: '#0B1F3A' } as any}
                      />
                      <Pressable onPress={() => setShowPassword(!showPassword)} style={{ padding: 4 } as any}>
                        <MaterialIcons name={showPassword ? 'visibility-off' : 'visibility'} size={20} color="#9CA3AF" />
                      </Pressable>
                    </XStack>
                  </YStack>
                ) : null}

                {error ? <Text style={{ color: '#DC2626', fontSize: 13, marginBottom: 12, textAlign: 'center' } as any}>{error}</Text> : null}
                {info  ? <Text style={{ color: '#059669', fontSize: 13, marginBottom: 12, textAlign: 'center' } as any}>{info}</Text>  : null}

                <Pressable
                  onPress={handleSubmit}
                  disabled={loading || oauthLoading !== null}
                  style={({ pressed }) => ({
                    backgroundColor: pressed ? '#1a2f4e' : '#0B1F3A',
                    borderRadius: 10, paddingVertical: 15, alignItems: 'center',
                  }) as any}>
                  {loading
                    ? <ActivityIndicator size="small" color="#FFFFFF" />
                    : <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '800', fontFamily: 'Times New Roman' } as any}>
                        {pendingOAuthUser ? 'Complete Google Sign‑up' : 'Create account'}
                      </Text>}
                </Pressable>
              </>
            ) : null}

            {error && !showEmailSignup && !pendingOAuthUser ? <Text style={{ color: '#DC2626', fontSize: 13, marginTop: 12, textAlign: 'center' } as any}>{error}</Text> : null}
            {info  && !showEmailSignup && !pendingOAuthUser ? <Text style={{ color: '#059669', fontSize: 13, marginTop: 12, textAlign: 'center' } as any}>{info}</Text>  : null}
          </>
        ) : null}

        {/* ── FORGOT PASSWORD ── */}
        {mode === 'forgot' ? (
          <>
            {/* Back link */}
            <Pressable
              onPress={() => { setMode('login'); setForgotStep('request'); setError(null); setInfo(null); setPassword(''); setNewPassword(''); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 20 } as any}>
              <MaterialIcons name="arrow-back" size={18} color="#374151" />
              <Text style={{ fontSize: 14, color: '#374151', fontWeight: '600' } as any}>Back to sign in</Text>
            </Pressable>

            <Text style={{ fontSize: 22, fontWeight: '900', color: '#0B1F3A', textAlign: 'center', fontFamily: 'Times New Roman', marginBottom: 8 } as any}>
              {forgotStep === 'request' ? 'Reset your password' : 'Set new password'}
            </Text>
            <Text style={{ fontSize: 14, color: '#6B7280', textAlign: 'center', marginBottom: 28, lineHeight: 22 } as any}>
              {forgotStep === 'request'
                ? "Enter your email and we'll send you a link to reset your password"
                : 'Set a new password for your account.'}
            </Text>

            {/* Email field */}
            {forgotStep === 'request' ? (
              <YStack gap="$1" marginBottom={24}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 6 } as any}>Email</Text>
                <XStack alignItems="center" borderWidth={1} borderColor="#D1D5DB" borderRadius={10} paddingHorizontal={12} backgroundColor="#FFFFFF">
                  <MaterialIcons name="mail-outline" size={18} color="#9CA3AF" style={{ marginRight: 8 } as any} />
                  <Input
                    {...commonInputProps}
                    flex={1} borderWidth={0} value={email} onChangeText={setEmail}
                    autoCapitalize="none" keyboardType="email-address"
                    placeholder="you@example.com"
                    style={{ height: 46, fontFamily: 'Times New Roman', fontSize: 15, color: '#0B1F3A' } as any}
                  />
                </XStack>
              </YStack>
            ) : (
              <YStack gap="$1" marginBottom={24}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 6 } as any}>New Password</Text>
                <XStack alignItems="center" borderWidth={1} borderColor="#D1D5DB" borderRadius={10} paddingHorizontal={12} backgroundColor="#FFFFFF">
                  <MaterialIcons name="lock-outline" size={18} color="#9CA3AF" style={{ marginRight: 8 } as any} />
                  <Input
                    {...commonInputProps}
                    flex={1} borderWidth={0} value={newPassword} onChangeText={setNewPassword}
                    secureTextEntry
                    placeholder="Enter new password"
                    style={{ height: 46, fontFamily: 'Times New Roman', fontSize: 15, color: '#0B1F3A' } as any}
                  />
                </XStack>
              </YStack>
            )}

            {error ? <Text style={{ color: '#DC2626', fontSize: 13, marginBottom: 12, textAlign: 'center' } as any}>{error}</Text> : null}
            {info  ? <Text style={{ color: '#059669', fontSize: 13, marginBottom: 12, textAlign: 'center' } as any}>{info}</Text>  : null}

            <Pressable
              onPress={handleSubmit}
              disabled={loading}
              style={({ pressed }) => ({
                backgroundColor: pressed ? '#1a2f4e' : '#0B1F3A',
                borderRadius: 10, paddingVertical: 15, alignItems: 'center',
              }) as any}>
              {loading
                ? <ActivityIndicator size="small" color="#FFFFFF" />
                : <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '800', fontFamily: 'Times New Roman' } as any}>
                    {forgotStep === 'request' ? 'Send reset link' : 'Update password'}
                  </Text>}
            </Pressable>
          </>
        ) : null}

      </YStack>
    </ScrollView>
  );
}

