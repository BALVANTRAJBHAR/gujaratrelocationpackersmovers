import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
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
  }, [refreshProfile, session?.user?.id]);

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
            <Text color={theme.info} fontSize={12}>
              Loading...
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
