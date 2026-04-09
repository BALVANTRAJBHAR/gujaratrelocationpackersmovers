import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, View } from 'react-native';
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
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpVerified, setOtpVerified] = useState(false);
  const [aadhaarNumber, setAadhaarNumber] = useState('');
  const [aadhaarImageUri, setAadhaarImageUri] = useState<string | null>(null);
  const [aadhaarUploading, setAadhaarUploading] = useState(false);

  const labelColor = useMemo(() => '#9CA3AF', []);
  const border = useMemo(() => '#374151', []);

  const invokeEdgeFunction = async <T,>(name: string, body: unknown): Promise<T> => {
    const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
    const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
    if (!baseUrl || !anonKey) {
      throw new Error('Supabase env vars missing.');
    }
    const res = await fetch(`${baseUrl}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body ?? {}),
    } as any);
    const text = await res.text();
    let parsed: any = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
    }
    if (!res.ok) {
      const msg = parsed?.error || parsed?.message || text || `Edge Function error (${res.status})`;
      throw new Error(`(${res.status}) ${msg}`);
    }
    return parsed as T;
  };

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
          .select('id, name, phone, role, document_type, document_number, document_image_url')
          .eq('id', user.id)
          .maybeSingle();

        if (!rowError && row) {
          if (isMounted) {
            setName(String(row.name ?? (user.user_metadata as any)?.name ?? '').trim());
            setPhone(String(row.phone ?? '').trim());
            setAadhaarNumber(String((row as any)?.document_number ?? '').trim());
            setOtpVerified(Boolean((user.user_metadata as any)?.phone_verified) || Boolean((row as any)?.is_verified));

            const dbRole = String((row as any)?.role ?? '').trim().toLowerCase();
            const roleIntent = String((user.user_metadata as any)?.role_intent ?? '').trim().toLowerCase();
            const isProvider = dbRole === 'provider' || roleIntent === 'provider';
            if (!isProvider) {
              router.replace('/home');
              return;
            }
          }
        } else {
          if (isMounted) {
            setName(String((user.user_metadata as any)?.name ?? '').trim());
            setOtpVerified(Boolean((user.user_metadata as any)?.phone_verified));

            const roleIntent = String((user.user_metadata as any)?.role_intent ?? '').trim().toLowerCase();
            if (roleIntent !== 'provider') {
              router.replace('/home');
              return;
            }
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

  const sendOtp = async () => {
    setError(null);
    setInfo(null);

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      setError('Phone number is required.');
      return;
    }
    const phoneDigits = normalizedPhone.replace(/[^0-9]/g, '');
    if (phoneDigits.length < 10) {
      setError('Please enter a valid phone number.');
      return;
    }

    setOtpSending(true);
    try {
      await invokeEdgeFunction('send-booking-otp', { phone: normalizedPhone });
      setInfo('OTP sent.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send OTP.');
    } finally {
      setOtpSending(false);
    }
  };

  const verifyOtp = async () => {
    setError(null);
    setInfo(null);

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      setError('Phone number is required.');
      return;
    }
    const code = String(otpCode ?? '').replace(/\D/g, '').slice(0, 6);
    if (code.length !== 6) {
      setError('Enter 6-digit OTP.');
      return;
    }

    setOtpVerifying(true);
    try {
      const resp = await invokeEdgeFunction<{ valid?: boolean; error?: string }>('verify-booking-otp', {
        phone: normalizedPhone,
        code,
      });
      if (!resp?.valid) {
        setError(String((resp as any)?.error ?? 'Invalid OTP.'));
        return;
      }

      const { data: userResp } = await supabase.auth.getUser();
      const user = userResp.user;
      if (!user?.id) throw new Error('Please login again.');

      const { error: upsertError } = await supabase
        .from('users')
        .upsert(
          {
            id: user.id,
            email: user.email ?? null,
            name: name.trim() || null,
            phone: normalizedPhone,
            role: 'provider',
            is_verified: true,
          },
          { onConflict: 'id' }
        );
      if (upsertError) throw new Error(upsertError.message);

      await supabase.auth.updateUser({
        data: {
          ...(user.user_metadata as any),
          phone: normalizedPhone,
          phone_verified: true,
        },
      });

      setOtpVerified(true);
      setInfo('Phone verified.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'OTP verification failed.');
    } finally {
      setOtpVerifying(false);
    }
  };

  const pickAadhaarImage = async () => {
    setError(null);
    try {
      const ImagePicker = await import('expo-image-picker');
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError('Permission required to pick image.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });
      if ((result as any).canceled || !(result as any).assets?.length) return;
      const asset = (result as any).assets[0];
      const uri = String(asset?.uri ?? '').trim();
      if (!uri) return;
      setAadhaarImageUri(uri);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to pick image.');
    }
  };

  const uploadAadhaarAndSave = async () => {
    setError(null);
    setInfo(null);

    if (!otpVerified) {
      setError('Please verify phone first.');
      return;
    }

    const aadhaarDigits = String(aadhaarNumber ?? '').replace(/\D/g, '').slice(0, 12);
    if (aadhaarDigits.length !== 12) {
      setError('Enter valid 12-digit Aadhaar number.');
      return;
    }
    if (!aadhaarImageUri) {
      setError('Please upload Aadhaar photo.');
      return;
    }

    setSaving(true);
    setAadhaarUploading(true);
    try {
      const { data: userResp } = await supabase.auth.getUser();
      const user = userResp.user;
      if (!user?.id) throw new Error('Please login again.');

      const response = await fetch(aadhaarImageUri);
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const arrayBuffer = await response.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      if (!bytes.length) throw new Error('Empty image.');
      if (bytes.length > 10 * 1024 * 1024) throw new Error('Image too large. Max 10MB.');

      const ext = contentType.includes('png') ? 'png' : 'jpg';
      const path = `${user.id}/aadhaar-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage.from('driver-docs').upload(path, bytes, {
        contentType,
        upsert: true,
      } as any);
      if (uploadError) throw new Error(uploadError.message);

      const { error: updateError } = await supabase
        .from('users')
        .update({
          document_type: 'Aadhaar',
          document_number: aadhaarDigits,
          document_image_url: path,
        })
        .eq('id', user.id);
      if (updateError) throw new Error(updateError.message);

      setInfo('Saved.');
      if (Platform.OS !== 'web') {
        Alert.alert('Success', 'Verification saved successfully.');
      }
      router.replace('/home');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save.');
    } finally {
      setAadhaarUploading(false);
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
    <View style={{ flex: 1, backgroundColor: '#111827' } as any}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 } as any} keyboardShouldPersistTaps="handled">
        <YStack gap="$4">
      <YStack gap="$2">
        <Paragraph color="#FFFFFF" fontSize={22} fontWeight="700">
          Provider verification
        </Paragraph>
        <Paragraph color="#9CA3AF">
          Verify phone with OTP and upload Aadhaar details.
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
            editable={!otpVerified}
          />
        </YStack>

        <XStack gap="$2" flexWrap="wrap">
          <Button
            flex={1}
            backgroundColor="#1F4E79"
            color="#FFFFFF"
            onPress={sendOtp}
            disabled={otpSending || otpVerified}>
            {otpVerified ? 'OTP Verified' : otpSending ? 'Sending…' : 'Send OTP'}
          </Button>
          <Button
            flex={1}
            backgroundColor="#10B981"
            color="#111827"
            onPress={verifyOtp}
            disabled={otpVerifying || otpVerified}>
            {otpVerified ? 'Verified' : otpVerifying ? 'Verifying…' : 'Verify OTP'}
          </Button>
        </XStack>

        {!otpVerified ? (
          <YStack gap="$2">
            <Text color={labelColor}>OTP Code</Text>
            <Input
              value={otpCode}
              onChangeText={setOtpCode}
              placeholder="6-digit OTP"
              keyboardType={Platform.OS === 'web' ? 'default' : 'number-pad'}
              maxLength={6}
            />
          </YStack>
        ) : null}

        {otpVerified ? (
          <YStack gap="$3">
            <YStack gap="$2">
              <Text color={labelColor}>Aadhaar Number</Text>
              <Input
                value={aadhaarNumber}
                onChangeText={(v) => setAadhaarNumber(String(v ?? '').replace(/\D/g, '').slice(0, 12))}
                placeholder="12-digit Aadhaar"
                keyboardType={Platform.OS === 'web' ? 'default' : 'number-pad'}
                maxLength={12}
              />
            </YStack>

            <YStack gap="$2">
              <Text color={labelColor}>Aadhaar Photo</Text>
              <Pressable onPress={() => void pickAadhaarImage()} style={{ width: '100%' } as any}>
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: border,
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 12,
                    backgroundColor: '#1F2937',
                  } as any}>
                  <Text color="#FFFFFF" fontWeight="700">
                    {aadhaarImageUri ? 'Photo selected' : 'Upload Aadhaar Photo'}
                  </Text>
                  {aadhaarImageUri ? (
                    <Text color="#9CA3AF" fontSize={12} marginTop={2} numberOfLines={1}>
                      {aadhaarImageUri}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            </YStack>
          </YStack>
        ) : null}

        {error ? <Paragraph color="#F87171">{error}</Paragraph> : null}
        {info ? <Paragraph color="#34D399">{info}</Paragraph> : null}

        <Button
          backgroundColor="#10B981"
          color="#111827"
          onPress={() => void uploadAadhaarAndSave()}
          disabled={saving || aadhaarUploading || !otpVerified}>
          {aadhaarUploading ? 'Saving…' : 'Save & Continue'}
        </Button>

        <Button chromeless color="#9CA3AF" onPress={() => router.replace('/home')}>
          Skip for now
        </Button>
      </YStack>
        </YStack>
      </ScrollView>
    </View>
  );
}
