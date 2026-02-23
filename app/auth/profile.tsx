import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable } from 'react-native';
import { Button, H2, Input, Paragraph, Text, XStack, YStack } from 'tamagui';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';

export default function ProfileSetupScreen() {
  const router = useRouter();
  const { session, profile, refreshProfile } = useSession();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const pageBg = isDark ? '#0B1220' : '#FFFFFF';
  const cardBg = isDark ? '#0F172A' : '#FFFFFF';
  const border = isDark ? '#1F2937' : '#E5E7EB';
  const titleColor = isDark ? '#F3F4F6' : '#111827';
  const text = isDark ? '#F9FAFB' : '#111827';
  const muted = isDark ? '#94A3B8' : '#6B7280';
  const badgeBg = isDark ? '#111827' : '#F3F4F6';
  const badgeText = isDark ? '#E5E7EB' : '#111827';
  const activeBtnBg = '#F97316';
  const activeBtnText = '#0B1220';
  const [loading, setLoading] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
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

  return (
    <YStack flex={1} backgroundColor={pageBg} padding={24} minHeight="100%" gap="$4">
      <XStack alignItems="center" justifyContent="space-between">
        <H2 color={titleColor}>Profile</H2>
        <Pressable onPress={() => router.back()}>
          <Text color="#93C5FD" fontWeight="700">
            Back
          </Text>
        </Pressable>
      </XStack>

      <Paragraph color={muted}>Your account details</Paragraph>

      <YStack backgroundColor={cardBg} borderRadius={22} padding={20} borderWidth={1} borderColor={border} gap="$4">
        <XStack alignItems="center" gap="$3">
          <YStack
            width={58}
            height={58}
            borderRadius={999}
            backgroundColor="#1D4ED8"
            alignItems="center"
            justifyContent="center">
            <Text color="#FFFFFF" fontWeight="900" fontSize={18} letterSpacing={1}>
              {initials}
            </Text>
          </YStack>

          <YStack flex={1} gap="$1">
            <Text color={text} fontSize={18} fontWeight="900">
              {profile?.name?.trim() || '—'}
            </Text>
            <Text color={muted} fontSize={13} numberOfLines={1}>
              {displayEmail}
            </Text>
          </YStack>

          <YStack
            paddingHorizontal={12}
            paddingVertical={6}
            borderRadius={999}
            backgroundColor={badgeBg}
            borderWidth={1}
            borderColor={border}>
            <Text color={badgeText} fontSize={12} fontWeight="800">
              {displayRole}
            </Text>
          </YStack>
        </XStack>

        <YStack height={1} backgroundColor={border} />

        <YStack gap="$2">
          <XStack justifyContent="space-between" alignItems="center">
            <Text color={muted} fontSize={12} textTransform="uppercase" letterSpacing={1.3}>
              Business Card
            </Text>

            <Button
              size="$2"
              backgroundColor={editingName ? badgeBg : '#1D4ED8'}
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
                backgroundColor={pageBg}
                color={text}
                borderColor={border}
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
                <Text color={muted}>User ID</Text>
                <Text color={badgeText} fontWeight="800" numberOfLines={1} maxWidth={180}>
                  {session?.user?.id ?? '-'}
                </Text>
              </XStack>
              <XStack justifyContent="space-between" alignItems="center">
                <Text color={muted}>Email</Text>
                <Text color={badgeText} fontWeight="800" numberOfLines={1} maxWidth={220}>
                  {displayEmail}
                </Text>
              </XStack>
              <XStack justifyContent="space-between" alignItems="center">
                <Text color={muted}>Role</Text>
                <Text color={badgeText} fontWeight="800">
                  {displayRole}
                </Text>
              </XStack>
            </YStack>
          )}

          {loading ? (
            <Text color="#93C5FD" fontSize={12}>
              Loading...
            </Text>
          ) : null}

          {error ? (
            <Text color="#FCA5A5" fontSize={12}>
              {error}
            </Text>
          ) : null}
        </YStack>
      </YStack>

      <YStack alignItems="center" marginTop={8}>
        <Text color={muted} fontSize={11}>
          {Platform.OS === 'android' ? 'Android' : Platform.OS}
        </Text>
      </YStack>
    </YStack>
  );
}
