import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView } from 'react-native';
import { Button, H2, Input, Paragraph, Text, XStack, YStack } from 'tamagui';

import type { AuthChangeEvent } from '@supabase/supabase-js';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { themes } from '@/constants/theme';
import { getSupabaseSessionSafe, runSupabaseAuth, setSupabaseSessionSafe, supabase } from '@/lib/supabase';

export default function LoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ redirectTo?: string }>();
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
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'facebook' | null>(null);
  const [pendingOAuthUser, setPendingOAuthUser] = useState<{ email: string; name?: string } | null>(null);
  const [showEmailSignup, setShowEmailSignup] = useState(false);

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

  const maybeStartOAuthProfileCompletion = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) return false;

      const { data: profile, error: profileError } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle();
      if (profileError) return false;

      const dbRole = String((profile as any)?.role ?? '').trim().toLowerCase();
      const roleIntent = String((user.user_metadata as any)?.role_intent ?? '').trim().toLowerCase();
      const providerSubtype = String((user.user_metadata as any)?.provider_subtype ?? '').trim().toLowerCase();
      const hasAnyRole = Boolean(dbRole) || Boolean(roleIntent);
      const isProvider = dbRole === 'provider' || roleIntent === 'provider';
      const needsSubtype = isProvider && !providerSubtype;
      if (hasAnyRole && !needsSubtype) return false;

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
      if (!userId) return;

      const roleIntent = String((data.user?.user_metadata as any)?.role_intent ?? '').trim().toLowerCase();

      if (roleIntent === 'provider') {
        router.replace('/auth/register' as any);
        return true;
      }

      const { data: row, error: rowError } = await supabase
        .from('users')
        .select('id, phone, role')
        .eq('id', userId)
        .maybeSingle();

      if (rowError) return;

      const dbRole = String((row as any)?.role ?? '').trim().toLowerCase();
      const isProvider = dbRole === 'provider' || roleIntent === 'provider';

      if (!row?.phone && isProvider) {
        router.replace('/auth/register' as any);
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  };

  const redirectAfterAuth = async () => {
    const redirect = String(params.redirectTo ?? '').trim();
    if (redirect) {
      router.replace(redirect as any);
      return;
    }
    const didRedirect = await maybeRedirectToRegistration();
    if (!didRedirect) router.replace('/home');
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
        const url = new URL(window.location.href);

        const hashParams = new URLSearchParams((url.hash ?? '').replace(/^#/, ''));
        const searchParams = url.searchParams;

        const type = (hashParams.get('type') || searchParams.get('type') || '').trim();
        const isRecovery = type === 'recovery';
        const access_token = (hashParams.get('access_token') ?? '').trim();
        const refresh_token = (hashParams.get('refresh_token') ?? '').trim();
        const code = (searchParams.get('code') ?? '').trim();

        if (isRecovery) {
          setMode('forgot');
          setForgotStep('set_password');
          setInfo('Verifying reset link…');
          setError(null);
        }

        if (access_token && refresh_token) {
          await setSupabaseSessionSafe({ access_token, refresh_token });
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
            if (typeof window !== 'undefined') {
              window.history.replaceState({}, '', `${url.origin}${url.pathname}`);
            }
            return;
          }

          await redirectAfterAuth();
          if (typeof window !== 'undefined') {
            window.history.replaceState({}, '', `${url.origin}${url.pathname}`);
          }
          return;
        }
      } catch {
        // ignore
      }
    };

    void openRecoveryIfPresent();
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

    setOauthLoading(provider);

    try {
      const redirectTo =
        Platform.OS === 'web'
          ? typeof window === 'undefined'
            ? ''
            : `${window.location.origin}/auth/login`
          : Linking.createURL('/auth/login');

      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
        },
      });

      if (oauthError) {
        setError(oauthError.message);
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
      if (result.type !== 'success' || !result.url) {
        return;
      }

      const parsed = Linking.parse(result.url);
      const code = String((parsed.queryParams as any)?.code ?? '').trim();
      if (!code) {
        setError('Sign-in did not return a code. Please try again.');
        return;
      }

      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) {
        setError(exchangeError.message);
        return;
      }

      const didStartCompletion = await maybeStartOAuthProfileCompletion();
      if (didStartCompletion) return;

      const redirect = String(params.redirectTo ?? '').trim();
      if (redirect) {
        router.replace(redirect as any);
      } else {
        const didRedirect = await maybeRedirectToRegistration();
        if (!didRedirect) router.replace('/home');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'OAuth sign-in failed');
    } finally {
      setOauthLoading(null);
    }
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
          setError(signInError.message);
          return;
        }

        const redirectTo = String(params.redirectTo ?? '').trim();
        if (redirectTo) {
          router.replace(redirectTo as any);
        } else {
          const didRedirect = await maybeRedirectToRegistration();
          if (!didRedirect) router.replace('/home');
        }
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
                  provider_type: signupRole === 'provider' ? signupProviderSubtype : null,
                },
                { onConflict: 'id' }
              );
            // Redirect based on role
            if (signupRole === 'provider') {
              router.replace('/auth/register' as any);
            } else {
              router.replace('/home');
            }
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
            },
          },
        });

        if (signUpError) {
          setError(signUpError.message);
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
          try {
            await supabase
              .from('users')
              .upsert(
                {
                  id: createdUserId,
                  email: trimmedEmail,
                  name: trimmedName || null,
                  role: resolveDbRole(signupRole),
                  provider_type: signupRole === 'provider' ? signupProviderSubtype : null,
                },
                { onConflict: 'id' }
              );
          } catch {
            // ignore
          }

          if (signupRole === 'provider') {
            router.replace('/auth/register' as any);
          } else {
            router.replace('/home');
          }
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
          const anyErr = resetError as any;
          const status = typeof anyErr?.status === 'number' ? ` (status ${anyErr.status})` : '';
          const name = typeof anyErr?.name === 'string' ? ` [${anyErr.name}]` : '';
          setError(`${resetError.message}${status}${name}`);
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
        setError(updateError.message);
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
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg } as any}
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 16 } as any}
      keyboardShouldPersistTaps="handled">
      <YStack
        width="100%"
        maxWidth={420}
        backgroundColor={theme.bgCard}
        borderRadius={20}
        padding={24}
        gap="$4"
        borderWidth={1}
        borderColor={theme.border}>
        <YStack gap="$2" alignItems="center">
          <H2 color={theme.text} textAlign="center">
            {title}
          </H2>
          <Paragraph color={theme.textMuted} textAlign="center">
            {subtitle}
          </Paragraph>
        </YStack>

        <XStack gap="$2" justifyContent="center" flexWrap="wrap">
          <Button
            size="$3"
            backgroundColor={mode === 'login' ? activeBtnBg : idleBtnBg}
            color={mode === 'login' ? activeBtnText : idleBtnText}
            hoverStyle={{ backgroundColor: mode === 'login' ? activeBtnHoverBg : idleBtnHoverBg }}
            pressStyle={{ backgroundColor: mode === 'login' ? activeBtnPressBg : idleBtnPressBg }}
            onPress={() => {
              setMode('login');
              setShowEmailSignup(false);
              setPendingOAuthUser(null);
              setError(null);
              setInfo(null);
            }}
            fontFamily="Times New Roman">
            Sign In
          </Button>
          <Button
            size="$3"
            backgroundColor={mode === 'signup' ? activeBtnBg : idleBtnBg}
            color={mode === 'signup' ? activeBtnText : idleBtnText}
            hoverStyle={{ backgroundColor: mode === 'signup' ? activeBtnHoverBg : idleBtnHoverBg }}
            pressStyle={{ backgroundColor: mode === 'signup' ? activeBtnPressBg : idleBtnPressBg }}
            onPress={() => {
              setMode('signup');
              setForgotStep('request');
              setShowEmailSignup(false);
              setPendingOAuthUser(null);
              setError(null);
              setInfo(null);
            }}
            fontFamily="Times New Roman">
            Sign Up
          </Button>
          <Button
            size="$3"
            backgroundColor={mode === 'forgot' ? activeBtnBg : idleBtnBg}
            color={mode === 'forgot' ? activeBtnText : idleBtnText}
            hoverStyle={{ backgroundColor: mode === 'forgot' ? activeBtnHoverBg : idleBtnHoverBg }}
            pressStyle={{ backgroundColor: mode === 'forgot' ? activeBtnPressBg : idleBtnPressBg }}
            onPress={() => {
              setMode('forgot');
              setShowEmailSignup(false);
              setPendingOAuthUser(null);
              setForgotStep('request');
              setError(null);
              setInfo(null);
              setPassword('');
              setNewPassword('');
            }}
            fontFamily="Times New Roman">
            Forgot password
          </Button>
        </XStack>

        {mode !== 'forgot' ? (
          <YStack gap="$2">
            <Button
              backgroundColor={theme.bgCard}
              color={theme.text}
              borderWidth={1}
              borderColor={theme.border}
              hoverStyle={{ backgroundColor: theme.bgCardSecondary }}
              pressStyle={{ backgroundColor: theme.border }}
              onPress={() => handleOAuth('google')}
              disabled={loading || oauthLoading !== null}>
              {oauthLoading === 'google' ? 'Connecting…' : 'Continue with Google'}
            </Button>

            {mode === 'signup' && !showEmailSignup ? (
              <Button
                backgroundColor={activeBtnBg}
                color={activeBtnText}
                hoverStyle={{ backgroundColor: activeBtnHoverBg }}
                pressStyle={{ backgroundColor: activeBtnPressBg }}
                onPress={() => setShowEmailSignup(true)}
                disabled={loading || oauthLoading !== null}>
                Continue with Email
              </Button>
            ) : null}
          </YStack>
        ) : null}

        <YStack gap="$3">
          {mode === 'signup' && showEmailSignup ? (
            <YStack gap="$2">
              <Text color={theme.textSecondary}>Name (optional)</Text>
              <Input
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                editable={!pendingOAuthUser}
              />
            </YStack>
          ) : null}

          {mode === 'signup' && showEmailSignup ? (
            <YStack gap="$2">
              <Text color={theme.textSecondary}>You are a</Text>
              <XStack gap="$2">
                <Button
                  flex={1}
                  backgroundColor={signupRole === 'customer' ? activeBtnBg : idleBtnBg}
                  color={signupRole === 'customer' ? activeBtnText : idleBtnText}
                  borderWidth={1}
                  borderColor={signupRole === 'customer' ? activeBtnBg : theme.border}
                  hoverStyle={{ backgroundColor: signupRole === 'customer' ? activeBtnHoverBg : idleBtnHoverBg }}
                  pressStyle={{ backgroundColor: signupRole === 'customer' ? activeBtnPressBg : idleBtnPressBg }}
                  onPress={() => {
                    setSignupRole('customer');
                    setSignupProviderSubtype('home_service');
                  }}
                  disabled={loading || oauthLoading !== null}>
                  Customer
                </Button>
                <Button
                  flex={1}
                  backgroundColor={signupRole === 'provider' ? activeBtnBg : idleBtnBg}
                  color={signupRole === 'provider' ? activeBtnText : idleBtnText}
                  borderWidth={1}
                  borderColor={signupRole === 'provider' ? activeBtnBg : theme.border}
                  hoverStyle={{ backgroundColor: signupRole === 'provider' ? activeBtnHoverBg : idleBtnHoverBg }}
                  pressStyle={{ backgroundColor: signupRole === 'provider' ? activeBtnPressBg : idleBtnPressBg }}
                  onPress={() => {
                    setSignupRole('provider');
                    setSignupProviderSubtype('home_service');
                  }}
                  disabled={loading || oauthLoading !== null}>
                  Provider
                </Button>
              </XStack>
            </YStack>
          ) : null}

          {mode === 'signup' && showEmailSignup && signupRole === 'provider' ? (
            <YStack gap="$2">
              <Text color={theme.textSecondary}>Provider type</Text>
              <XStack gap="$2" flexWrap="wrap">
                <Button
                  flex={1}
                  backgroundColor={signupProviderSubtype === 'home_service' ? activeBtnBg : idleBtnBg}
                  color={signupProviderSubtype === 'home_service' ? activeBtnText : idleBtnText}
                  borderWidth={1}
                  borderColor={signupProviderSubtype === 'home_service' ? activeBtnBg : theme.border}
                  hoverStyle={{ backgroundColor: signupProviderSubtype === 'home_service' ? activeBtnHoverBg : idleBtnHoverBg }}
                  pressStyle={{ backgroundColor: signupProviderSubtype === 'home_service' ? activeBtnPressBg : idleBtnPressBg }}
                  onPress={() => {
                    setSignupProviderSubtype('home_service');
                  }}
                  disabled={loading || oauthLoading !== null}
                  fontFamily="Times New Roman">
                  Home Service Provider
                </Button>
                <Button
                  flex={1}
                  backgroundColor={signupProviderSubtype === 'property_owner' ? activeBtnBg : idleBtnBg}
                  color={signupProviderSubtype === 'property_owner' ? activeBtnText : idleBtnText}
                  borderWidth={1}
                  borderColor={signupProviderSubtype === 'property_owner' ? activeBtnBg : theme.border}
                  hoverStyle={{ backgroundColor: signupProviderSubtype === 'property_owner' ? activeBtnHoverBg : idleBtnHoverBg }}
                  pressStyle={{ backgroundColor: signupProviderSubtype === 'property_owner' ? activeBtnPressBg : idleBtnPressBg }}
                  onPress={() => {
                    setSignupProviderSubtype('property_owner');
                  }}
                  disabled={loading || oauthLoading !== null}
                  fontFamily="Times New Roman">
                  Property Owner
                </Button>
              </XStack>

            </YStack>
          ) : null}

          {mode === 'signup' && showEmailSignup && !pendingOAuthUser ? (
            <YStack gap="$2">
              <Text color={theme.textSecondary}>Email</Text>
              <Input
                value={email}
                onChangeText={setEmail}
                editable={forgotStep !== 'set_password'}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="you@example.com"
              />
            </YStack>
          ) : null}
          {mode !== 'signup' ? (
            <YStack gap="$2">
              <Text color={theme.textSecondary}>Email</Text>
              <Input
                value={email}
                onChangeText={setEmail}
                editable={forgotStep !== 'set_password'}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="you@example.com"
              />
            </YStack>
          ) : null}

          {mode !== 'forgot' && (mode !== 'signup' || showEmailSignup) && !pendingOAuthUser ? (
            <YStack gap="$2">
              <Text color={theme.textSecondary}>Password</Text>
              <XStack alignItems="center" borderWidth={1} borderColor={theme.border} borderRadius={6} paddingHorizontal={12} gap="$2">
                <Input
                  flex={1}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  placeholder="Password"
                  fontFamily="Times New Roman"
                  borderWidth={0}
                />
                <Pressable
                  onPress={() => setShowPassword(!showPassword)}
                  style={{ padding: 8, justifyContent: 'center', alignItems: 'center' } as any}>
                  <Text color={theme.textMuted} fontSize={13} fontWeight="700" userSelect="none">
                    {showPassword ? 'Hide' : 'Show'}
                  </Text>
                </Pressable>
              </XStack>
            </YStack>
          ) : null}

          {mode === 'forgot' && forgotStep === 'set_password' ? (
            <YStack gap="$2">
              <Text color={theme.textSecondary}>New Password</Text>
              <XStack alignItems="center" borderWidth={1} borderColor={theme.border} borderRadius={6} paddingHorizontal={12} gap="$2">
                <Input
                  flex={1}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry={!showNewPassword}
                  placeholder="Enter new password"
                  fontFamily="Times New Roman"
                  borderWidth={0}
                />
                <Pressable
                  onPress={() => setShowNewPassword(!showNewPassword)}
                  style={{ padding: 8, justifyContent: 'center', alignItems: 'center' } as any}>
                  <Text color={theme.textMuted} fontSize={13} fontWeight="700" userSelect="none">
                    {showNewPassword ? 'Hide' : 'Show'}
                  </Text>
                </Pressable>
              </XStack>
            </YStack>
          ) : null}

          {error ? <Paragraph color={theme.danger}>{error}</Paragraph> : null}
          {info ? <Paragraph color={theme.success}>{info}</Paragraph> : null}

          {mode !== 'signup' || showEmailSignup ? (
            <Button
              backgroundColor={activeBtnBg}
              color={activeBtnText}
              hoverStyle={{ backgroundColor: activeBtnHoverBg }}
              pressStyle={{ backgroundColor: activeBtnPressBg }}
              onPress={handleSubmit}
              disabled={
                loading ||
                (mode === 'signup' &&
                  showEmailSignup &&
                  !name.trim())
              }
              fontFamily="Times New Roman"
              fontWeight="bold">
              {loading
                ? 'Please wait…'
                : mode === 'login'
                  ? 'Sign In'
                  : mode === 'signup'
                    ? pendingOAuthUser ? 'Complete Google Sign‑up' : 'Create account'
                    : forgotStep === 'request'
                      ? 'Send reset link'
                      : 'Update Password'}
            </Button>
          ) : null}

          {mode === 'forgot' && forgotStep !== 'request' ? (
            <Button
              chromeless
              color={theme.textMuted}
              onPress={() => {
                setForgotStep('request');
                setNewPassword('');
                setError(null);
                setInfo(null);
              }}>
              Change email
            </Button>
          ) : null}

          <Button
            chromeless
            color={theme.textMuted}
            onPress={() => {
              setPendingOAuthUser(null);
              router.back();
            }}>
            Back
          </Button>
        </YStack>
      </YStack>

    </ScrollView>
  );
}
