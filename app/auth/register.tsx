import React, { useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Input, Paragraph, Text, XStack, YStack } from 'tamagui';

import { supabase } from '@/lib/supabase';

export default function RegisterDetailsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<string>('customer');

  const labelColor = useMemo(() => '#9CA3AF', []);
  const border = useMemo(() => '#374151', []);

  const normalizePhone = (value: string) => {
    const v = String(value ?? '').replace(/\s+/g, '');
    if (!v) return '';
    const digits = v.replace(/[^0-9+]/g, '');
    return digits;
  };

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const { data: userResp } = await supabase.auth.getUser();
        const user = userResp.user;
        if (!user?.id) {
          if (isMounted) {
            setLoading(false);
            router.replace('/auth/login' as any);
          }
          return;
        }

        const { data: row, error: rowError } = await supabase
          .from('users')
          .select('id, name, phone, role')
          .eq('id', user.id)
          .maybeSingle();

        if (!rowError && row) {
          if (isMounted) {
            setName(String(row.name ?? (user.user_metadata as any)?.name ?? '').trim());
            setPhone(String(row.phone ?? '').trim());
            setRole(String(row.role ?? 'customer'));
          }
        } else {
          if (isMounted) {
            setName(String((user.user_metadata as any)?.name ?? '').trim());
            setRole(String((user.user_metadata as any)?.role_intent ?? 'customer'));
          }
        }
      } catch (e) {
        if (isMounted) setError(e instanceof Error ? e.message : 'Failed to load profile.');
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [router]);

  const handleSave = async () => {
    setError(null);
    setInfo(null);

    const trimmedName = name.trim();
    const normalizedPhone = normalizePhone(phone);

    if (!normalizedPhone) {
      setError('Phone number is required.');
      return;
    }

    // basic validation for Indian numbers; still allows + prefix
    const phoneDigits = normalizedPhone.replace(/[^0-9]/g, '');
    if (phoneDigits.length < 10) {
      setError('Please enter a valid phone number.');
      return;
    }

    setSaving(true);
    try {
      const { data: userResp } = await supabase.auth.getUser();
      const user = userResp.user;
      if (!user?.id) {
        setError('Session expired. Please sign in again.');
        router.replace('/auth/login' as any);
        return;
      }

      const nextRole = String(role ?? 'customer').toLowerCase();

      const { error: upsertError } = await supabase
        .from('users')
        .upsert(
          {
            id: user.id,
            email: user.email ?? null,
            name: trimmedName || null,
            phone: normalizedPhone,
            role: nextRole,
          },
          { onConflict: 'id' }
        );

      if (upsertError) {
        setError(upsertError.message);
        return;
      }

      // Keep auth metadata roughly in sync for future
      await supabase.auth.updateUser({
        data: {
          ...(user.user_metadata as any),
          name: trimmedName || (user.user_metadata as any)?.name,
          role_intent: nextRole,
        },
      });

      setInfo('Saved.');
      router.replace('/home');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center" backgroundColor="#111827" padding="$4">
        <Paragraph color="#9CA3AF">Loading…</Paragraph>
      </YStack>
    );
  }

  return (
    <YStack flex={1} backgroundColor="#111827" padding="$4" gap="$4">
      <YStack gap="$2">
        <Paragraph color="#FFFFFF" fontSize={22} fontWeight="700">
          Complete your registration
        </Paragraph>
        <Paragraph color="#9CA3AF">
          Please provide the details below to continue.
        </Paragraph>
      </YStack>

      <YStack gap="$3">
        <YStack gap="$2">
          <Text color={labelColor}>Name</Text>
          <Input value={name} onChangeText={setName} placeholder="Your name" />
        </YStack>

        <YStack gap="$2">
          <Text color={labelColor}>Phone</Text>
          <Input
            value={phone}
            onChangeText={setPhone}
            placeholder={Platform.OS === 'web' ? '+91XXXXXXXXXX' : 'Phone number'}
            keyboardType={Platform.OS === 'web' ? 'default' : 'phone-pad'}
          />
        </YStack>

        <YStack gap="$2">
          <Text color={labelColor}>Account type</Text>
          <XStack gap="$2">
            <Button
              flex={1}
              borderWidth={1}
              borderColor={role === 'customer' ? '#10B981' : border}
              backgroundColor={role === 'customer' ? '#065F46' : '#1F2937'}
              color="#FFFFFF"
              onPress={() => setRole('customer')}>
              Customer
            </Button>
            <Button
              flex={1}
              borderWidth={1}
              borderColor={role === 'driver' ? '#10B981' : border}
              backgroundColor={role === 'driver' ? '#065F46' : '#1F2937'}
              color="#FFFFFF"
              onPress={() => setRole('driver')}>
              Provider
            </Button>
          </XStack>
        </YStack>

        {error ? <Paragraph color="#F87171">{error}</Paragraph> : null}
        {info ? <Paragraph color="#34D399">{info}</Paragraph> : null}

        <Button backgroundColor="#10B981" color="#111827" onPress={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save & Continue'}
        </Button>

        <Button chromeless color="#9CA3AF" onPress={() => router.replace('/home')}>
          Skip for now
        </Button>
      </YStack>
    </YStack>
  );
}
