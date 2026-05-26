import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable } from 'react-native';
import { Button, H2, Input, Paragraph, Text, XStack, YStack } from 'tamagui';

import { themes } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';

export default function ProfileSetupScreen() {
  const router = useRouter();
  const { session, profile, refreshProfile } = useSession();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? themes.dark : themes.light;
  const activeBtnBg = '#F97316';
  const activeBtnText = '#0B1220';
  const [loading, setLoading] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [editingPassword, setEditingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPwd, setShowCurrentPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [phoneEditing, setPhoneEditing] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpResendCooldown, setOtpResendCooldown] = useState(0);
  const otpTimerRef = useRef<any>(null);
  const currentPhone = profile?.phone?.trim() || '';

  const displayEmail =
    profile?.email?.trim() ||
    (session?.user?.email ?? '').trim() ||
    '-';

  const displayRole = useMemo(() => {
    const r = (profile?.role ?? '').toString().trim();
    return r ? r.charAt(0).toUpperCase() + r.slice(1) : '-';
  }, [profile?.role]);

  const initials = useMemo(() => {
    const src = (profile?.name || '').trim();
    if (!src) return 'U';
    const parts = src.split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] ?? '';
    const second = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
    return `${first}${second}`.toUpperCase() || 'U';
  }, [profile?.name]);

  const loadedRef = useRef(false);
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    let cancelled = false;
    const load = async () => {
      if (!session?.user?.id) return;
      try {
        setLoading(true);
        await refreshProfile();
        if (cancelled) return;
      } catch {
        if (cancelled) return;
        setError('Unable to fetch profile.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (editingName) return;
    setNameDraft(profile?.name ?? '');
  }, [editingName, profile?.name]);

  const saveName = async () => {
    setError(null);
    if (!session?.user?.id) {
      setError('Session missing. Please login again.');
      return;
    }
    if (!nameDraft.trim()) {
      setError('Name is required.');
      return;
    }

    try {
      setSubmitting(true);
      const { error: updateError } = await supabase
        .from('users')
        .update({
          name: nameDraft.trim(),
        })
        .eq('id', session.user.id);

      if (updateError) {
        setError(updateError.message);
        return;
      }

      await refreshProfile();
      setEditingName(false);
    } catch (err) {
      setError('Unable to save changes. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const savePassword = async () => {
    setError(null);
    if (!newPassword.trim()) {
      setError('New password is required.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    try {
      setSubmitting(true);
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword.trim(),
      });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setEditingPassword(false);
      alert('Password updated successfully!');
    } catch (err) {
      setError('Unable to update password. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const invokeEdgeFunction = async <T,>(name: string, body: unknown): Promise<T> => {
    const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
    const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
    if (!baseUrl || !anonKey) throw new Error('Supabase env vars missing.');
    const u = String(baseUrl).replace(/\/+$/, '');
    const res = await fetch(`${u}/functions/v1/${name}`, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    const text = await res.text();
    let parsed: any = null;
    if (text) try { parsed = JSON.parse(text); } catch { parsed = null; }
    if (!res.ok) throw new Error(parsed?.error || parsed?.message || text || `Status ${res.status}`);
    return (parsed ?? {}) as T;
  };

  useEffect(() => {
    if (!otpResendCooldown) return;
    const id = setInterval(() => {
      setOtpResendCooldown((p) => Math.max(0, p - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [otpResendCooldown]);

  const sendPhoneOtp = async () => {
    setError(null);
    const normalized = phoneDraft.replace(/\D/g, '').slice(-10);
    if (normalized.length !== 10) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }
    try {
      setOtpSending(true);
      await invokeEdgeFunction('send-booking-otp', { phone: normalized, user_id: session?.user?.id ?? '' });
      setOtpSent(true);
      setOtpCode('');
      setOtpVerified(false);
      setOtpResendCooldown(30);
    } catch (e: any) {
      setError(e?.message || 'Failed to send OTP.');
    } finally {
      setOtpSending(false);
    }
  };

  const verifyPhoneOtp = async () => {
    setError(null);
    const code = otpCode.replace(/\D/g, '').slice(0, 6);
    if (code.length !== 6) {
      setError('Enter 6-digit OTP.');
      return;
    }
    try {
      setOtpVerifying(true);
      const resp = await invokeEdgeFunction<{ valid?: boolean; error?: string }>('verify-booking-otp', {
        phone: phoneDraft.replace(/\D/g, '').slice(-10),
        code,
        user_id: session?.user?.id ?? '',
      });
      if (!(resp as any)?.valid) {
        setError(String((resp as any)?.error ?? 'Invalid OTP.'));
        return;
      }
      const normalizedPhone = phoneDraft.replace(/\D/g, '').slice(-10);
      const { error: updateError } = await supabase
        .from('users')
        .update({ phone: normalizedPhone })
        .eq('id', session?.user?.id ?? '');
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setOtpVerified(true);
      await refreshProfile();
      setPhoneEditing(false);
      setOtpSent(false);
      setOtpCode('');
    } catch (e: any) {
      setError(e?.message || 'OTP verification failed.');
    } finally {
      setOtpVerifying(false);
    }
  };

  const startPhoneEdit = () => {
    setError(null);
    setPhoneDraft(currentPhone);
    setOtpSent(false);
    setOtpCode('');
    setOtpVerified(false);
    setPhoneEditing(true);
  };

  const cancelPhoneEdit = () => {
    setPhoneEditing(false);
    setOtpSent(false);
    setOtpCode('');
    setOtpVerified(false);
  };

  return (
    <YStack flex={1} backgroundColor={theme.bg} padding={24} minHeight="100%" gap="$4">
      <XStack alignItems="center" justifyContent="space-between">
        <H2 color={theme.text}>Profile</H2>
        <Pressable onPress={() => router.back()}>
          <Text color={theme.info} fontWeight="700">
            Back
          </Text>
        </Pressable>
      </XStack>

      <Paragraph color={theme.textMuted}>Your account details</Paragraph>

      <YStack backgroundColor={theme.bgCard} borderRadius={22} padding={20} borderWidth={1} borderColor={theme.border} gap="$4">
        <XStack alignItems="center" gap="$3">
          <YStack
            width={58}
            height={58}
            borderRadius={999}
            backgroundColor={theme.primary}
            alignItems="center"
            justifyContent="center">
            <Text color="#FFFFFF" fontWeight="900" fontSize={18} letterSpacing={1}>
              {initials}
            </Text>
          </YStack>

          <YStack flex={1} gap="$1">
            <Text color={theme.text} fontSize={18} fontWeight="900">
              {profile?.name?.trim() || '—'}
            </Text>
            <Text color={theme.textMuted} fontSize={13} numberOfLines={1}>
              {displayEmail}
            </Text>
          </YStack>

          <YStack
            paddingHorizontal={12}
            paddingVertical={6}
            borderRadius={999}
            backgroundColor={theme.bgCardSecondary}
            borderWidth={1}
            borderColor={theme.border}>
            <Text color={theme.text} fontSize={12} fontWeight="800">
              {displayRole}
            </Text>
          </YStack>
        </XStack>

        <YStack height={1} backgroundColor={theme.border} />

        <YStack gap="$2">
          <XStack justifyContent="space-between" alignItems="center">
            <Text color={theme.textMuted} fontSize={12} textTransform="uppercase" letterSpacing={1.3}>
              Business Card
            </Text>

            <Button
              size="$2"
              backgroundColor={editingName ? theme.bgCardSecondary : theme.primary}
              color="#FFFFFF"
              borderRadius={999}
              onPress={() => {
                setError(null);
                if (!editingName) {
                  setNameDraft(profile?.name ?? '');
                }
                setEditingName((p) => !p);
              }}>
              {editingName ? 'Cancel' : 'Edit name'}
            </Button>
          </XStack>

          {editingName ? (
            <YStack gap="$2">
              <Input
                value={nameDraft}
                onChangeText={setNameDraft}
                placeholder="Full name"
                backgroundColor={theme.bg}
                color={theme.text}
                borderColor={theme.border}
              />
              <Button
                onPress={saveName}
                disabled={submitting}
                backgroundColor={activeBtnBg}
                borderRadius={12}
                color={activeBtnText}
                fontWeight="800">
                {submitting ? 'Saving...' : 'Save'}
              </Button>
            </YStack>
          ) : (
            <YStack gap="$2">
              <XStack justifyContent="space-between" alignItems="center">
                <Text color={theme.textMuted}>User ID</Text>
                <Text color={theme.text} fontWeight="800" numberOfLines={1} maxWidth={180}>
                  {session?.user?.id ?? '-'}
                </Text>
              </XStack>
              <XStack justifyContent="space-between" alignItems="center">
                <Text color={theme.textMuted}>Email</Text>
                <Text color={theme.text} fontWeight="800" numberOfLines={1} maxWidth={220}>
                  {displayEmail}
                </Text>
              </XStack>
              <XStack justifyContent="space-between" alignItems="center">
                <Text color={theme.textMuted}>Role</Text>
                <Text color={theme.text} fontWeight="800">
                  {displayRole}
                </Text>
              </XStack>
            </YStack>
          )}

          <YStack height={1} backgroundColor={theme.border} />

        {phoneEditing ? (
          <YStack gap="$2">
            <Text color={theme.textMuted} fontSize={12} textTransform="uppercase" letterSpacing={1.3}>
              {currentPhone ? 'Change Mobile Number' : 'Add Mobile Number'}
            </Text>
            <Input
              value={phoneDraft}
              onChangeText={(v) => {
                setPhoneDraft(v.replace(/\D/g, '').slice(0, 10));
                setOtpVerified(false);
              }}
              placeholder="Enter 10-digit mobile number"
              keyboardType="phone-pad"
              maxLength={10}
              backgroundColor={theme.bg}
              color={theme.text}
              borderColor={theme.border}
              editable={!otpVerified}
            />
            {otpSent ? (
              <YStack gap="$2">
                <Input
                  value={otpCode}
                  onChangeText={(v) => setOtpCode(v.replace(/\D/g, '').slice(0, 6))}
                  placeholder="6-digit OTP"
                  keyboardType="number-pad"
                  maxLength={6}
                  backgroundColor={theme.bg}
                  color={theme.text}
                  borderColor={theme.border}
                />
                <XStack gap="$2">
                  <Button
                    flex={1}
                    onPress={verifyPhoneOtp}
                    disabled={otpVerifying || otpVerified}
                    backgroundColor={activeBtnBg}
                    borderRadius={12}
                    color={activeBtnText}
                    fontWeight="800">
                    {otpVerified ? 'Verified' : otpVerifying ? 'Verifying…' : 'Verify OTP'}
                  </Button>
                </XStack>
              </YStack>
            ) : null}
            <XStack gap="$2">
              <Button
                flex={1}
                onPress={sendPhoneOtp}
                disabled={otpSending || otpVerified || otpResendCooldown > 0}
                backgroundColor={theme.primary}
                borderRadius={12}
                color="#FFFFFF"
                fontWeight="800">
                {otpVerified
                  ? 'Verified'
                  : otpSending
                  ? 'Sending…'
                  : otpSent
                  ? otpResendCooldown > 0
                    ? `Resend (${otpResendCooldown}s)`
                    : 'Resend OTP'
                  : 'Send OTP'}
              </Button>
              <Button
                onPress={cancelPhoneEdit}
                backgroundColor={theme.bgCardSecondary}
                borderRadius={12}
                color={theme.text}
                fontWeight="800">
                Cancel
              </Button>
            </XStack>
          </YStack>
        ) : (
          <YStack gap="$2">
            <XStack justifyContent="space-between" alignItems="center">
              <Text color={theme.textMuted} fontSize={12} textTransform="uppercase" letterSpacing={1.3}>
                Mobile Number
              </Text>
              <Button
                size="$2"
                backgroundColor={currentPhone ? theme.bgCardSecondary : theme.primary}
                color={currentPhone ? theme.text : '#FFFFFF'}
                borderRadius={999}
                onPress={startPhoneEdit}>
                {currentPhone ? 'Change' : 'Add'}
              </Button>
            </XStack>
            <Text color={theme.text} fontWeight="800" fontSize={15}>
              {currentPhone || '—'}
            </Text>
          </YStack>
        )}

          <YStack height={1} backgroundColor={theme.border} />

        <YStack gap="$2">
          <XStack justifyContent="space-between" alignItems="center">
            <Text color={theme.textMuted} fontSize={12} textTransform="uppercase" letterSpacing={1.3}>
              Security
            </Text>

            <Button
              size="$2"
              backgroundColor={editingPassword ? theme.bgCardSecondary : theme.primary}
              color="#FFFFFF"
              borderRadius={999}
              onPress={() => {
                setError(null);
                if (editingPassword) {
                  setCurrentPassword('');
                  setNewPassword('');
                  setConfirmPassword('');
                }
                setEditingPassword((p) => !p);
              }}>
              {editingPassword ? 'Cancel' : 'Change password'}
            </Button>
          </XStack>

          {editingPassword ? (
            <YStack gap="$2">
              <YStack gap="$1">
                <Text color={theme.textMuted} fontSize={12}>
                  New Password
                </Text>
                <XStack alignItems="center" gap="$1">
                  <Input
                    flex={1}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="Enter new password"
                    secureTextEntry={!showNewPwd}
                    backgroundColor={theme.bg}
                    color={theme.text}
                    borderColor={theme.border}
                  />
                  <Pressable
                    onPress={() => setShowNewPwd(!showNewPwd)}
                    style={{ padding: 12 }}>
                    <Text color={theme.primary} fontSize={16}>
                      {showNewPwd ? '👁️' : '👁️‍🗨️'}
                    </Text>
                  </Pressable>
                </XStack>
              </YStack>

              <YStack gap="$1">
                <Text color={theme.textMuted} fontSize={12}>
                  Confirm Password
                </Text>
                <XStack alignItems="center" gap="$1">
                  <Input
                    flex={1}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Confirm password"
                    secureTextEntry={!showConfirmPwd}
                    backgroundColor={theme.bg}
                    color={theme.text}
                    borderColor={theme.border}
                  />
                  <Pressable
                    onPress={() => setShowConfirmPwd(!showConfirmPwd)}
                    style={{ padding: 12 }}>
                    <Text color={theme.primary} fontSize={16}>
                      {showConfirmPwd ? '👁️' : '👁️‍🗨️'}
                    </Text>
                  </Pressable>
                </XStack>
              </YStack>

              <Button
                onPress={savePassword}
                disabled={submitting}
                backgroundColor={activeBtnBg}
                borderRadius={12}
                color={activeBtnText}
                fontWeight="800">
                {submitting ? 'Updating...' : 'Update Password'}
              </Button>
            </YStack>
          ) : (
            <Text color={theme.textMuted} fontSize={13}>
              Manage your account security
            </Text>
          )}
        </YStack>

          {loading ? (
            <Text color={theme.textMuted} fontSize={12}>
              Refreshing profile...
            </Text>
          ) : null}

          {error ? (
            <Text color={theme.danger} fontSize={12}>
              {error}
            </Text>
          ) : null}
        </YStack>
      </YStack>

      <YStack alignItems="center" marginTop={8}>
        <Text color={theme.textMuted} fontSize={11}>
          {Platform.OS === 'android' ? 'Android' : Platform.OS}
        </Text>
      </YStack>
    </YStack>
  );
}
