import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Button, H2, Input, Paragraph, Text, XStack, YStack } from 'tamagui';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';

export default function LoginScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const pageBg = isDark ? '#0B0B12' : '#FFFFFF';
  const cardBg = isDark ? '#0F172A' : '#FFFFFF';
  const border = isDark ? '#1F2937' : '#E5E7EB';
  const titleColor = isDark ? '#F9FAFB' : '#111827';
  const muted = isDark ? '#94A3B8' : '#6B7280';
  const label = isDark ? '#E5E7EB' : '#111827';
  const idleBtnBg = isDark ? '#111827' : '#F3F4F6';
  const idleBtnText = isDark ? '#E5E7EB' : '#111827';
  const activeBtnBg = '#F97316';
  const activeBtnText = '#0B0B12';
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [forgotStep, setForgotStep] = useState<'request' | 'set_password'>('request');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

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
        const href = window.location.href;
        const hasRecovery = href.includes('type=recovery') || href.includes('recovery');
        const hasAccessToken = href.includes('access_token=');
        const hasCode = href.includes('code=');

        if (hasRecovery || hasAccessToken) {
          setMode('forgot');
          setForgotStep('set_password');
          setInfo('Verifying reset link…');
          setError(null);
        }

        if (hasAccessToken && window.location.hash) {
          const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
          const access_token = params.get('access_token') ?? '';
          const refresh_token = params.get('refresh_token') ?? '';

          if (access_token && refresh_token) {
            await supabase.auth.setSession({ access_token, refresh_token });
          }
        } else if (hasCode) {
          const url = new URL(window.location.href);
          const code = url.searchParams.get('code');
          if (code) {
            await supabase.auth.exchangeCodeForSession(code);
          }
        }

        const { data } = await supabase.auth.getSession();

        if ((hasRecovery || hasAccessToken) && data.session?.user?.id) {
          setMode('forgot');
          setForgotStep('set_password');
          setInfo('Set a new password for your account.');
          setError(null);
          return;
        }

        if (hasRecovery || hasAccessToken) {
          setInfo('Reset link opened. Enter a new password.');
        }
      } catch {
        // ignore
      }
    };

    void openRecoveryIfPresent();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
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
    return 'Login';
  }, [mode]);

  const subtitle = useMemo(() => {
    if (mode === 'signup') return 'Create your account to book and track moves.';
    if (mode === 'forgot') {
      return forgotStep === 'request'
        ? 'We will send a password reset link to your email.'
        : 'Set a new password for your account.';
    }
    return 'Sign in to continue booking and tracking.';
  }, [forgotStep, mode]);

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

        router.replace('/home');
        return;
      }

      if (mode === 'signup') {
        const trimmedName = name.trim();
        const { error: signUpError } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: {
            data: trimmedName ? { name: trimmedName } : undefined,
          },
        });

        if (signUpError) {
          setError(signUpError.message);
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
          setError(resetError.message);
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
    <YStack flex={1} justifyContent="center" alignItems="center" padding="$4" backgroundColor={pageBg}>
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
            onPress={() => {
              setMode('login');
              setError(null);
              setInfo(null);
            }}>
            Login
          </Button>
          <Button
            size="$3"
            backgroundColor={mode === 'signup' ? activeBtnBg : idleBtnBg}
            color={mode === 'signup' ? activeBtnText : idleBtnText}
            onPress={() => {
              setMode('signup');
              setError(null);
              setInfo(null);
            }}>
            Sign up
          </Button>
          <Button
            size="$3"
            backgroundColor={mode === 'forgot' ? activeBtnBg : idleBtnBg}
            color={mode === 'forgot' ? activeBtnText : idleBtnText}
            onPress={() => {
              setMode('forgot');
              setForgotStep('request');
              setError(null);
              setInfo(null);
              setPassword('');
              setNewPassword('');
            }}>
            Forgot password
          </Button>
        </XStack>

        <YStack gap="$3">
          {mode === 'signup' ? (
            <YStack gap="$2">
              <Text color={label}>Name (optional)</Text>
              <Input value={name} onChangeText={setName} placeholder="Your name" />
            </YStack>
          ) : null}

          <YStack gap="$2">
            <Text color={label}>Email</Text>
            <Input
              value={email}
              onChangeText={setEmail}
              editable={!(mode === 'forgot' && forgotStep === 'set_password')}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="you@example.com"
            />
          </YStack>

          {mode !== 'forgot' ? (
            <YStack gap="$2">
              <Text color={label}>Password</Text>
              <Input value={password} onChangeText={setPassword} secureTextEntry placeholder="Password" />
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
              />
            </YStack>
          ) : null}

          {error ? <Paragraph color="#F87171">{error}</Paragraph> : null}
          {info ? <Paragraph color="#34D399">{info}</Paragraph> : null}

          <Button backgroundColor={activeBtnBg} color={activeBtnText} onPress={handleSubmit} disabled={loading}>
            {loading
              ? 'Please wait…'
              : mode === 'login'
                ? 'Sign In'
                : mode === 'signup'
                  ? 'Create account'
                  : forgotStep === 'request'
                    ? 'Send reset link'
                    : 'Update Password'}
          </Button>

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
              router.back();
            }}>
            Back
          </Button>
        </YStack>
      </YStack>
    </YStack>
  );
}
