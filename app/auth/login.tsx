import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { Button, H2, Input, Paragraph, Text, XStack, YStack } from 'tamagui';

import type { AuthChangeEvent } from '@supabase/supabase-js';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';

export default function LoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ redirectTo?: string }>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const pageBg = isDark ? '#0B0B12' : '#FFFFFF';
  const cardBg = isDark ? '#0F172A' : '#FFFFFF';
  const border = isDark ? '#1F2937' : '#E5E7EB';
  const titleColor = isDark ? '#F9FAFB' : '#111827';
  const muted = isDark ? '#94A3B8' : '#6B7280';
  const label = isDark ? '#E5E7EB' : '#111827';
  const activeBtnBg = '#3B82F6'; // Light blue
  const activeBtnText = '#FFFFFF';
  const activeBtnHoverBg = '#2563EB';
  const activeBtnPressBg = '#1D4ED8';
  const idleBtnBg = isDark ? '#1F2937' : '#F9FAFB';
  const idleBtnText = isDark ? '#D1D5DB' : '#6B7280';
  const idleBtnHoverBg = isDark ? '#374151' : '#F3F4F6';
  const idleBtnPressBg = isDark ? '#4B5563' : '#E5E7EB';
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [forgotStep, setForgotStep] = useState<'request' | 'set_password'>('request');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
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
  const [signupProviderServices, setSignupProviderServices] = useState<string[]>([]);
  const [servicesPickerOpen, setServicesPickerOpen] = useState(false);

  const providerServiceOptions = useMemo(
    () => ['AC', 'Carpenter', 'Electrician', 'Plumber', 'Pest Control', 'Deep Cleaning', 'Painting'],
    []
  );

  const resolveDbRole = (intent: 'customer' | 'provider') => {
    return intent === 'provider' ? 'provider' : 'customer';
  };

  const maybeRedirectToRegistration = async () => {
    try {
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;
      if (!userId) return;

      const roleIntent = String((data.user?.user_metadata as any)?.role_intent ?? '').trim().toLowerCase();

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
      const { data } = await supabase.auth.getSession();
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
          await supabase.auth.setSession({ access_token, refresh_token });
        } else if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        }

        const { data } = await supabase.auth.getSession();
        if (data.session?.user?.id) {
          if (isRecovery) {
            setMode('forgot');
            setForgotStep('set_password');
            setInfo('Set a new password for your account.');
            setError(null);
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

      // After successful OAuth, check if user is new and needs role selection
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .single();
        if (!profile?.role) {
          // New user: show role selection UI
          setPendingOAuthUser({ email: user.email ?? '', name: user.user_metadata?.name });
          setShowEmailSignup(true);
          setMode('signup');
          return;
        }
      }

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
        const nextProviderServices =
          signupRole === 'provider'
            ? signupProviderSubtype === 'property_owner'
              ? ['Property Owner']
              : signupProviderServices
            : [];

        if (signupRole === 'provider' && signupProviderSubtype === 'home_service' && nextProviderServices.length === 0) {
          setError('Please select at least 1 service.');
          return;
        }

        // If we have a pending OAuth user, just update metadata and DB; no auth.signUp needed
        if (pendingOAuthUser) {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            await supabase.auth.updateUser({
              data: {
                ...(trimmedName ? { name: trimmedName } : {}),
                role_intent: signupRole,
                provider_subtype: signupRole === 'provider' ? signupProviderSubtype : undefined,
                provider_services: nextProviderServices,
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
                  provider_services: nextProviderServices,
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
            data: {
              ...(trimmedName ? { name: trimmedName } : {}),
              role_intent: signupRole,
              provider_subtype: signupRole === 'provider' ? signupProviderSubtype : undefined,
              provider_services: nextProviderServices,
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
                  provider_services: nextProviderServices,
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
      style={{ flex: 1, backgroundColor: pageBg } as any}
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 16 } as any}
      keyboardShouldPersistTaps="handled">
      <YStack
        width="100%"
        maxWidth={420}
        backgroundColor={cardBg}
        borderRadius={20}
        padding={24}
        gap="$4"
        borderWidth={1}
        borderColor={border}>
        <YStack gap="$2" alignItems="center">
          <H2 color={titleColor} textAlign="center">
            {title}
          </H2>
          <Paragraph color={muted} textAlign="center">
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
              backgroundColor="#FFFFFF"
              color="#111827"
              borderWidth={1}
              borderColor={border}
              hoverStyle={{ backgroundColor: '#F3F4F6' }}
              pressStyle={{ backgroundColor: '#E5E7EB' }}
              onPress={() => handleOAuth('google')}
              disabled={loading || oauthLoading !== null}>
              {oauthLoading === 'google' ? 'Connecting…' : 'Continue with Google'}
            </Button>

            {mode === 'signup' ? (
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
              <Text color={label}>Name (optional)</Text>
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
              <Text color={label}>You are a</Text>
              <XStack gap="$2">
                <Button
                  flex={1}
                  backgroundColor={signupRole === 'customer' ? activeBtnBg : idleBtnBg}
                  color={signupRole === 'customer' ? activeBtnText : idleBtnText}
                  borderWidth={1}
                  borderColor={signupRole === 'customer' ? activeBtnBg : border}
                  hoverStyle={{ backgroundColor: signupRole === 'customer' ? activeBtnHoverBg : idleBtnHoverBg }}
                  pressStyle={{ backgroundColor: signupRole === 'customer' ? activeBtnPressBg : idleBtnPressBg }}
                  onPress={() => {
                    setSignupRole('customer');
                    setSignupProviderSubtype('home_service');
                    setSignupProviderServices([]);
                  }}
                  disabled={loading || oauthLoading !== null}>
                  Customer
                </Button>
                <Button
                  flex={1}
                  backgroundColor={signupRole === 'provider' ? activeBtnBg : idleBtnBg}
                  color={signupRole === 'provider' ? activeBtnText : idleBtnText}
                  borderWidth={1}
                  borderColor={signupRole === 'provider' ? activeBtnBg : border}
                  hoverStyle={{ backgroundColor: signupRole === 'provider' ? activeBtnHoverBg : idleBtnHoverBg }}
                  pressStyle={{ backgroundColor: signupRole === 'provider' ? activeBtnPressBg : idleBtnPressBg }}
                  onPress={() => {
                    setSignupRole('provider');
                    setSignupProviderSubtype('home_service');
                    setSignupProviderServices([]);
                  }}
                  disabled={loading || oauthLoading !== null}>
                  Provider
                </Button>
              </XStack>
            </YStack>
          ) : null}

          {mode === 'signup' && showEmailSignup && signupRole === 'provider' ? (
            <YStack gap="$2">
              <Text color={label}>Provider type</Text>
              <XStack gap="$2" flexWrap="wrap">
                <Button
                  flex={1}
                  backgroundColor={signupProviderSubtype === 'home_service' ? activeBtnBg : idleBtnBg}
                  color={signupProviderSubtype === 'home_service' ? activeBtnText : idleBtnText}
                  borderWidth={1}
                  borderColor={signupProviderSubtype === 'home_service' ? activeBtnBg : border}
                  hoverStyle={{ backgroundColor: signupProviderSubtype === 'home_service' ? activeBtnHoverBg : idleBtnHoverBg }}
                  pressStyle={{ backgroundColor: signupProviderSubtype === 'home_service' ? activeBtnPressBg : idleBtnPressBg }}
                  onPress={() => {
                    setSignupProviderSubtype('home_service');
                    setSignupProviderServices([]);
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
                  borderColor={signupProviderSubtype === 'property_owner' ? activeBtnBg : border}
                  hoverStyle={{ backgroundColor: signupProviderSubtype === 'property_owner' ? activeBtnHoverBg : idleBtnHoverBg }}
                  pressStyle={{ backgroundColor: signupProviderSubtype === 'property_owner' ? activeBtnPressBg : idleBtnPressBg }}
                  onPress={() => {
                    setSignupProviderSubtype('property_owner');
                    setSignupProviderServices([]);
                  }}
                  disabled={loading || oauthLoading !== null}
                  fontFamily="Times New Roman">
                  Property Owner
                </Button>
              </XStack>

              {signupProviderSubtype === 'home_service' ? (
                <YStack gap="$2">
                  <Text color={label}>Services</Text>
                  <Pressable
                    onPress={() => setServicesPickerOpen(true)}
                    style={{ width: '100%' } as any}
                    disabled={loading || oauthLoading !== null}>
                    <View
                      style={{
                        borderWidth: 1,
                        borderColor: border,
                        borderRadius: 12,
                        paddingHorizontal: 12,
                        paddingVertical: 12,
                        backgroundColor: isDark ? '#0B1220' : '#FFFFFF',
                      } as any}>
                      <Text color={titleColor} fontWeight="700">
                        {signupProviderServices.length
                          ? signupProviderServices.join(', ')
                          : 'Select services (AC, Carpenter, ...)'}
                      </Text>
                      <Text color={muted} fontSize={12} marginTop={2}>
                        Tap to open list
                      </Text>
                    </View>
                  </Pressable>
                </YStack>
              ) : (
                <Paragraph color={muted}>
                  Property Owner will be saved in your profile.
                </Paragraph>
              )}
            </YStack>
          ) : null}

          {mode === 'signup' && showEmailSignup && !pendingOAuthUser ? (
            <YStack gap="$2">
              <Text color={label}>Email</Text>
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
              <Text color={label}>Email</Text>
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
              <Text color={label}>Password</Text>
              <Input
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="Password"
                fontFamily="Times New Roman"
              />
            </YStack>
          ) : null}

          {mode === 'forgot' && forgotStep === 'set_password' ? (
            <YStack gap="$2">
              <Text color={label}>New Password</Text>
              <Input
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                placeholder="Enter new password"
                fontFamily="Times New Roman"
              />
            </YStack>
          ) : null}

          {error ? <Paragraph color="#F87171">{error}</Paragraph> : null}
          {info ? <Paragraph color="#34D399">{info}</Paragraph> : null}

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
                  signupRole === 'provider' &&
                  signupProviderSubtype === 'home_service' &&
                  signupProviderServices.length === 0)
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
              color={muted}
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
            color={muted}
            onPress={() => {
              setPendingOAuthUser(null);
              router.back();
            }}>
            Back
          </Button>
        </YStack>
      </YStack>

      <Modal visible={servicesPickerOpen} transparent animationType="fade" onRequestClose={() => setServicesPickerOpen(false)}>
        <Pressable
          onPress={() => setServicesPickerOpen(false)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 16 } as any}>
          <Pressable
            onPress={() => {}}
            style={{
              width: '100%',
              maxWidth: 520,
              alignSelf: 'center',
              backgroundColor: cardBg,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: border,
              padding: 16,
            } as any}>
            <YStack gap="$3">
              <Text color={titleColor} fontWeight="800" fontSize={16}>
                Select services
              </Text>

              <XStack flexWrap="wrap" gap="$2">
                {providerServiceOptions.map((opt) => {
                  const selected = signupProviderServices.includes(opt);
                  return (
                    <Button
                      key={opt}
                      size="$3"
                      backgroundColor={selected ? '#10B981' : idleBtnBg}
                      color={selected ? '#0B0B12' : idleBtnText}
                      borderWidth={1}
                      borderColor={selected ? '#10B981' : border}
                      onPress={() => {
                        setSignupProviderServices((prev) => {
                          if (prev.includes(opt)) return prev.filter((x) => x !== opt);
                          return [...prev, opt];
                        });
                      }}>
                      {opt}
                    </Button>
                  );
                })}
              </XStack>

              <XStack gap="$2" justifyContent="flex-end">
                <Button chromeless color={muted} onPress={() => setSignupProviderServices([])}>
                  Clear
                </Button>
                <Button
                  backgroundColor={activeBtnBg}
                  color={activeBtnText}
                  onPress={() => setServicesPickerOpen(false)}>
                  Done
                </Button>
              </XStack>
            </YStack>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}
