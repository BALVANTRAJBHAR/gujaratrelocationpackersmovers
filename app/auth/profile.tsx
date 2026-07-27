import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Pressable } from 'react-native';
import { Button, H2, Input, Paragraph, Text, XStack, YStack } from 'tamagui';

import { themes } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { findExistingUserByPhone } from '@/lib/user-duplicate-check';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';
import { t } from '@/constants/typography';

type PhoneFlowStep = 'idle' | 'verify_current' | 'enter_new';

export default function ProfileSetupScreen() {
  const router = useRouter();
  const { session, profile, refreshProfile, loading: sessionLoading } = useSession();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? themes.dark : themes.light;
  const activeBtnBg = '#F97316';
  const activeBtnText = '#0B1220';
  const inputUi = useMemo(
    () => ({
      backgroundColor: theme.inputBg,
      borderColor: theme.inputBorder,
      color: theme.inputText,
      placeholderTextColor: theme.textMuted,
    }),
    [theme]
  );
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
  const [phoneFlow, setPhoneFlow] = useState<PhoneFlowStep>('idle');
  const [phoneDraft, setPhoneDraft] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [currentPhoneVerified, setCurrentPhoneVerified] = useState(false);
  const [otpResendCooldown, setOtpResendCooldown] = useState(0);
  const currentPhone = profile?.phone?.trim() || '';
  const displayPhone = currentPhone || '—';

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

  const normalizePhone10 = (value: string) => value.replace(/\D/g, '').slice(-10);

  const sendPhoneOtp = async (targetPhone?: string) => {
    setError(null);
    const normalized = normalizePhone10(targetPhone ?? phoneDraft);
    if (normalized.length !== 10) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }
    try {
      setOtpSending(true);
      await invokeEdgeFunction('send-booking-otp', {
        phone: normalized,
        purpose: 'profile',
        user_id: session?.user?.id ?? '',
      });
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

    const otpPhone =
      phoneFlow === 'verify_current' ? normalizePhone10(currentPhone) : normalizePhone10(phoneDraft);
    if (otpPhone.length !== 10) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }

    try {
      setOtpVerifying(true);
      const resp = await invokeEdgeFunction<{ valid?: boolean; error?: string }>('verify-booking-otp', {
        phone: otpPhone,
        code,
      });
      if (!(resp as any)?.valid) {
        setError(String((resp as any)?.error ?? 'Invalid OTP.'));
        return;
      }

      if (phoneFlow === 'verify_current') {
        setCurrentPhoneVerified(true);
        setPhoneFlow('enter_new');
        setPhoneDraft('');
        setOtpSent(false);
        setOtpCode('');
        setOtpVerified(false);
        return;
      }

      const normalizedPhone = normalizePhone10(phoneDraft);
      if (!session?.user?.id) {
        setError('Session missing. Please login again.');
        return;
      }

      const ownedByOther = await findExistingUserByPhone(supabase, normalizedPhone, session.user.id);
      if (ownedByOther) {
        setError('This mobile number is already registered with another account.');
        return;
      }

      const { error: updateError } = await supabase
        .from('users')
        .update({ phone: normalizedPhone })
        .eq('id', session.user.id);
      if (updateError) {
        setError(updateError.message);
        return;
      }

      setOtpVerified(true);
      await refreshProfile();
      cancelPhoneEdit();
    } catch (e: any) {
      setError(e?.message || 'OTP verification failed.');
    } finally {
      setOtpVerifying(false);
    }
  };

  const startPhoneEdit = () => {
    setError(null);
    setOtpSent(false);
    setOtpCode('');
    setOtpVerified(false);
    setCurrentPhoneVerified(false);
    setPhoneEditing(true);

    if (currentPhone) {
      setPhoneFlow('verify_current');
      setPhoneDraft(currentPhone);
      void sendPhoneOtp(currentPhone);
      return;
    }

    setPhoneFlow('enter_new');
    setPhoneDraft('');
  };

  const cancelPhoneEdit = () => {
    setPhoneEditing(false);
    setPhoneFlow('idle');
    setOtpSent(false);
    setOtpCode('');
    setOtpVerified(false);
    setCurrentPhoneVerified(false);
    setPhoneDraft('');
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

      {sessionLoading && !profile ? (
        <Text color={theme.textMuted} fontSize={t(15)}>
          Loading profile…
        </Text>
      ) : null}

      <YStack backgroundColor={theme.bgCard} borderRadius={22} padding={20} borderWidth={1} borderColor={theme.border} gap="$4">
        <XStack alignItems="center" gap="$3">
          <YStack
            width={58}
            height={58}
            borderRadius={999}
            backgroundColor={theme.primary}
            alignItems="center"
            justifyContent="center">
            <Text color="#FFFFFF" fontWeight="900" fontSize={t(20)} letterSpacing={1}>
              {initials}
            </Text>
          </YStack>

          <YStack flex={1} gap="$1">
            <Text color={theme.text} fontSize={t(20)} fontWeight="900">
              {profile?.name?.trim() || '—'}
            </Text>
            <Text color={theme.textMuted} fontSize={t(15)} numberOfLines={1}>
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
            <Text color={theme.text} fontSize={t(14)} fontWeight="800">
              {displayRole}
            </Text>
          </YStack>
        </XStack>

        <YStack height={1} backgroundColor={theme.border} />

        <YStack gap="$2">
          <XStack justifyContent="space-between" alignItems="center">
            <Text color={theme.textMuted} fontSize={t(14)} textTransform="uppercase" letterSpacing={1.3}>
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
              <Input {...inputUi} value={nameDraft} onChangeText={setNameDraft} placeholder="Full name" />
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

          {!phoneEditing ? (
            <XStack justifyContent="space-between" alignItems="center" gap="$2">
              <Text color={theme.textMuted}>Mobile Number</Text>
              <XStack alignItems="center" gap="$2" flexShrink={1}>
                <Text color={theme.text} fontWeight="800" numberOfLines={1}>
                  {displayPhone}
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
            </XStack>
          ) : null}

          {phoneEditing ? (
            <YStack gap="$2" marginTop={4}>
              <Text color={theme.textMuted} fontSize={t(14)} textTransform="uppercase" letterSpacing={1.3}>
                {phoneFlow === 'verify_current'
                  ? 'Verify Current Mobile'
                  : currentPhone
                  ? 'Enter New Mobile Number'
                  : 'Add Mobile Number'}
              </Text>

              {phoneFlow === 'verify_current' ? (
                <Text color={theme.textSecondary} fontSize={t(15)}>
                  OTP sent to {currentPhone.slice(0, 2)}****{currentPhone.slice(-4)}
                </Text>
              ) : (
                <Input
                  {...inputUi}
                  value={phoneDraft}
                  onChangeText={(v) => {
                    const d = v.replace(/\D/g, '');
                    if (d.length > 10) return;
                    setPhoneDraft(d);
                    setOtpVerified(false);
                    setOtpSent(false);
                    setOtpCode('');
                  }}
                  placeholder="Enter 10-digit mobile number"
                  keyboardType="phone-pad"
                  maxLength={10}
                  editable={!otpVerified}
                />
              )}

              {otpSent ? (
                <YStack gap="$2">
                  <Input
                    {...inputUi}
                    value={otpCode}
                    onChangeText={(v) => setOtpCode(v.replace(/\D/g, '').slice(0, 6))}
                    placeholder="6-digit OTP"
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                  <Button
                    onPress={verifyPhoneOtp}
                    disabled={otpVerifying || (phoneFlow === 'enter_new' && otpVerified)}
                    backgroundColor={activeBtnBg}
                    borderRadius={12}
                    color={activeBtnText}
                    fontWeight="800">
                    {phoneFlow === 'verify_current'
                      ? otpVerifying
                        ? 'Verifying…'
                        : 'Verify Current Number'
                      : otpVerifying
                      ? 'Verifying…'
                      : 'Verify & Save'}
                  </Button>
                </YStack>
              ) : null}

              <XStack gap="$2">
                {phoneFlow === 'enter_new' ? (
                  <Button
                    flex={1}
                    onPress={() => void sendPhoneOtp()}
                    disabled={otpSending || otpVerified || otpResendCooldown > 0}
                    backgroundColor={theme.primary}
                    borderRadius={12}
                    color="#FFFFFF"
                    fontWeight="800">
                    {otpSending
                      ? 'Sending…'
                      : otpSent
                      ? otpResendCooldown > 0
                        ? `Resend (${otpResendCooldown}s)`
                        : 'Resend OTP'
                      : 'Send OTP'}
                  </Button>
                ) : (
                  <Button
                    flex={1}
                    onPress={() => void sendPhoneOtp(currentPhone)}
                    disabled={otpSending || otpResendCooldown > 0}
                    backgroundColor={theme.primary}
                    borderRadius={12}
                    color="#FFFFFF"
                    fontWeight="800">
                    {otpSending
                      ? 'Sending…'
                      : otpResendCooldown > 0
                      ? `Resend (${otpResendCooldown}s)`
                      : 'Resend OTP'}
                  </Button>
                )}
                <Button
                  onPress={cancelPhoneEdit}
                  backgroundColor={theme.bgCardSecondary}
                  borderRadius={12}
                  color={theme.text}
                  fontWeight="800">
                  Cancel
                </Button>
              </XStack>

              {phoneFlow === 'enter_new' && currentPhone && currentPhoneVerified ? (
                <Text color={theme.success} fontSize={t(14)} fontWeight="700">
                  Current number verified. Enter your new mobile and verify OTP.
                </Text>
              ) : null}
            </YStack>
          ) : null}

          <YStack height={1} backgroundColor={theme.border} />

        <YStack gap="$2">
          <XStack justifyContent="space-between" alignItems="center">
            <Text color={theme.textMuted} fontSize={t(14)} textTransform="uppercase" letterSpacing={1.3}>
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
                <Text color={theme.textMuted} fontSize={t(14)}>
                  New Password
                </Text>
                <XStack alignItems="center" gap="$1">
                  <Input
                    {...inputUi}
                    flex={1}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="Enter new password"
                    secureTextEntry={!showNewPwd}
                  />
                  <Pressable
                    onPress={() => setShowNewPwd(!showNewPwd)}
                    style={{ padding: 12 }}>
                    <Text color={theme.primary} fontSize={t(18)}>
                      {showNewPwd ? '👁️' : '👁️‍🗨️'}
                    </Text>
                  </Pressable>
                </XStack>
              </YStack>

              <YStack gap="$1">
                <Text color={theme.textMuted} fontSize={t(14)}>
                  Confirm Password
                </Text>
                <XStack alignItems="center" gap="$1">
                  <Input
                    {...inputUi}
                    flex={1}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Confirm password"
                    secureTextEntry={!showConfirmPwd}
                  />
                  <Pressable
                    onPress={() => setShowConfirmPwd(!showConfirmPwd)}
                    style={{ padding: 12 }}>
                    <Text color={theme.primary} fontSize={t(18)}>
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
            <Text color={theme.textMuted} fontSize={t(15)}>
              Manage your account security
            </Text>
          )}
        </YStack>

          {error ? (
            <Text color={theme.danger} fontSize={t(14)}>
              {error}
            </Text>
          ) : null}
        </YStack>
      </YStack>

      {/* Refer & Earn Section */}
      <YStack backgroundColor={theme.bgCard} borderRadius={22} padding={20} borderWidth={1} borderColor={theme.border} gap="$3">
        <Text fontSize={t(18)} fontWeight="900" color={theme.text}>
          Refer & Earn
        </Text>
        <Text color={theme.textMuted} fontSize={t(13)}>
          Share your referral link with friends. You both get ₹500 on their first booking!
        </Text>
        <YStack backgroundColor={theme.bgCardSecondary} borderRadius={12} padding={14} alignItems="center" gap="$2">
          <Text color={theme.textMuted} fontSize={t(12)}>
            Your Referral Link
          </Text>
          <Text fontSize={t(14)} fontWeight="700" color={theme.primary} numberOfLines={2} textAlign="center" selectable>
            {session?.user?.id ? `gujaratrelocationpackers.com/auth/login?ref=${session.user.id.slice(0, 8)}...` : 'Login to get link'}
          </Text>
        </YStack>
        <XStack gap="$2" flexWrap="wrap">
          <Button
            flex={1}
            backgroundColor="#25D366"
            color="#FFFFFF"
            borderRadius={12}
            fontWeight="700"
            paddingVertical={14}
            minHeight={48}
            onPress={() => {
              const link = `https://gujaratrelocationpackers.com/auth/login?ref=${session?.user?.id || ''}`;
              const msg = `Get ₹500 cashback on GR Packers! Sign up using this link: ${link}`;
              const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
              if (Platform.OS === 'web') window.open(url, '_blank');
              else Linking.openURL(url);
            }}>
            WhatsApp
          </Button>
          <Button
            flex={1}
            backgroundColor="#1877F2"
            color="#FFFFFF"
            borderRadius={12}
            fontWeight="700"
            paddingVertical={14}
            minHeight={48}
            onPress={() => {
              const link = `https://gujaratrelocationpackers.com/auth/login?ref=${session?.user?.id || ''}`;
              const msg = `Get ₹500 cashback on GR Packers! Sign up using this link: ${link}`;
              const url = `https://www.facebook.com/sharer/sharer.php?quote=${encodeURIComponent(msg)}`;
              if (Platform.OS === 'web') window.open(url, '_blank');
            }}>
            Facebook
          </Button>
          <Button
            flex={1}
            backgroundColor="#E4405F"
            color="#FFFFFF"
            borderRadius={12}
            fontWeight="700"
            paddingVertical={14}
            minHeight={48}
            onPress={() => {
              const link = `https://gujaratrelocationpackers.com/auth/login?ref=${session?.user?.id || ''}`;
              const msg = `Get ₹500 cashback on GR Packers! Sign up using this link: ${link}`;
              if (Platform.OS === 'web') {
                navigator.clipboard.writeText(msg);
                alert('Referral link copied! Share on Instagram!');
              }
            }}>
            Instagram
          </Button>
          <Button
            flex={1}
            backgroundColor={theme.bgSecondary}
            color={theme.text}
            borderRadius={12}
            borderWidth={1}
            borderColor={theme.border}
            fontWeight="700"
            paddingVertical={14}
            minHeight={48}
            onPress={() => {
              const link = `https://gujaratrelocationpackers.com/auth/login?ref=${session?.user?.id || ''}`;
              if (Platform.OS === 'web') navigator.clipboard.writeText(link);
            }}>
            Copy Link
          </Button>
        </XStack>
      </YStack>

      <YStack alignItems="center" marginTop={8}>
        <Text color={theme.textMuted} fontSize={t(13)}>
          {Platform.OS === 'android' ? 'Android' : Platform.OS}
        </Text>
      </YStack>
    </YStack>
  );
}
