import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, View } from 'react-native';
import { Button, Input, Paragraph, Text, XStack, YStack } from 'tamagui';

import { getSupabaseUserSafe, setSupabaseSessionSafe, supabase } from '@/lib/supabase';

export default function RegisterDetailsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [userId, setUserId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [countryCode, setCountryCode] = useState('+91');
  const [countryCodePickerOpen, setCountryCodePickerOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpResendCooldown, setOtpResendCooldown] = useState(0);
  const [aadhaarNumber, setAadhaarNumber] = useState('');
  const [aadhaarImageUri, setAadhaarImageUri] = useState<string | null>(null);
  const [aadhaarUploading, setAadhaarUploading] = useState(false);
  const [aadhaarExtracted, setAadhaarExtracted] = useState<string>('');
  const extractingAadhaarRef = useRef(false);

  const labelColor = useMemo(() => '#9CA3AF', []);
  const border = useMemo(() => '#374151', []);

  const verhoeffValidate = (num: string) => {
    const s = String(num ?? '').replace(/\D/g, '');
    if (s.length !== 12) return false;
    const d = [
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
      [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
      [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
      [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
      [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
      [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
      [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
      [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
      [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
    ];
    const p = [
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
      [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
      [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
      [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
      [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
      [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
      [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
    ];
    let c = 0;
    const digits = s.split('').map((x) => Number(x));
    for (let i = 0; i < digits.length; i++) {
      c = d[c][p[i % 8][digits[digits.length - 1 - i]]];
    }
    return c === 0;
  };

  const normalizeOcrText = (lines: string[]) => {
    return (lines ?? []).join(' ').replace(/\s+/g, ' ').trim();
  };

  const extractAadhaarFromOcrLines = (ocrLines: string[]) => {
    const text = normalizeOcrText(ocrLines);
    if (!text) return '';
    const upper = text.toUpperCase();
    const digitOnly = upper.replace(/\D/g, '');
    const hasAadhaarHint = /(AADHAAR|AADHAR|UIDAI|UNIQUE|MY\s*AADHAAR)/i.test(upper);
    const spaced = Array.from(new Set(text.match(/\d{4}\s\d{4}\s\d{4}/g) ?? [])).map((x) => x.replace(/\D/g, ''));
    const spacedValid = spaced.find((c) => verhoeffValidate(c));
    if (spacedValid) return spacedValid;

    const candidates = Array.from(new Set(digitOnly.match(/\d{12}/g) ?? []));

    // Only trust contiguous 12-digit matches when Aadhaar context is present.
    // Otherwise it's too easy to pick unrelated numbers (DOB, IDs) that may even pass checksum.
    if (hasAadhaarHint) {
      const bestValid = candidates.find((c) => verhoeffValidate(c));
      if (bestValid) return bestValid;
    }

    // Conservative fallbacks to avoid wrong autofill:
    // Only accept non-checksum matches when the Aadhaar pattern is very clear.
    if (hasAadhaarHint) {
      if (spaced.length) return spaced[spaced.length - 1] ?? '';
    }

    // If the only thing that looks like Aadhaar is a single spaced 4-4-4 match, accept it.
    if (spaced.length === 1) return spaced[0] ?? '';

    return '';
  };

  const extractAadhaarFromQrPayload = (payload: string) => {
    const text = String(payload ?? '').trim();
    if (!text) return '';

    const m1 = text.match(/\buid\s*=\s*"(\d{12})"/i);
    if (m1?.[1]) return m1[1];

    const digits = text.replace(/\D/g, '');
    const m2 = digits.match(/\d{12}/);
    return m2?.[0] ?? '';
  };

  const decodeAadhaarFromQrWeb = async (inputBlob: Blob) => {
    try {
      const anyWindow = window as any;
      const BarcodeDetectorCtor = anyWindow?.BarcodeDetector;
      if (!BarcodeDetectorCtor) return '';
      const detector = new BarcodeDetectorCtor({ formats: ['qr_code'] });
      const bmp = await createImageBitmap(inputBlob);
      const codes = await detector.detect(bmp);
      const raw = String(codes?.[0]?.rawValue ?? '').trim();
      return extractAadhaarFromQrPayload(raw);
    } catch {
      return '';
    }
  };

  const runAadhaarOcr = async (uri: string) => {
    if (!uri) return;
    if (extractingAadhaarRef.current) return;
    extractingAadhaarRef.current = true;
    try {
      let lines: string[] = [];

      if (Platform.OS === 'web') {
        const preprocessForOcr = async (inputBlob: Blob) => {
          const img = await createImageBitmap(inputBlob);
          const scale = 2;
          const w = Math.max(1, Math.floor(img.width * scale));
          const h = Math.max(1, Math.floor(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) return inputBlob;
          ctx.drawImage(img, 0, 0, w, h);
          const imageData = ctx.getImageData(0, 0, w, h);
          const d = imageData.data;
          for (let i = 0; i < d.length; i += 4) {
            const r = d[i] ?? 0;
            const g = d[i + 1] ?? 0;
            const b = d[i + 2] ?? 0;
            let gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
            gray = Math.min(255, Math.max(0, (gray - 128) * 1.25 + 128));
            d[i] = gray;
            d[i + 1] = gray;
            d[i + 2] = gray;
          }
          ctx.putImageData(imageData, 0, 0);
          return await new Promise<Blob>((resolve) => {
            canvas.toBlob((b) => resolve(b ?? inputBlob), 'image/png');
          });
        };

        const cropBottomForOcr = async (inputBlob: Blob) => {
          const img = await createImageBitmap(inputBlob);
          const scale = 2;
          const w = Math.max(1, Math.floor(img.width * scale));
          const h = Math.max(1, Math.floor(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) return inputBlob;
          ctx.drawImage(img, 0, 0, w, h);

          // Aadhaar number is usually printed near the bottom portion of the card.
          const cropTop = Math.floor(h * 0.55);
          const cropH = Math.max(1, h - cropTop);

          const cropCanvas = document.createElement('canvas');
          cropCanvas.width = w;
          cropCanvas.height = cropH;
          const cropCtx = cropCanvas.getContext('2d');
          if (!cropCtx) return inputBlob;
          cropCtx.drawImage(canvas, 0, cropTop, w, cropH, 0, 0, w, cropH);

          const imageData = cropCtx.getImageData(0, 0, w, cropH);
          const d = imageData.data;
          for (let i = 0; i < d.length; i += 4) {
            const r = d[i] ?? 0;
            const g = d[i + 1] ?? 0;
            const b = d[i + 2] ?? 0;
            let gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
            gray = Math.min(255, Math.max(0, (gray - 128) * 1.35 + 128));
            d[i] = gray;
            d[i + 1] = gray;
            d[i + 2] = gray;
          }
          cropCtx.putImageData(imageData, 0, 0);

          return await new Promise<Blob>((resolve) => {
            cropCanvas.toBlob((b) => resolve(b ?? inputBlob), 'image/png');
          });
        };

        const resp = await fetch(uri);
        const blob = await resp.blob();

        const qrUid = await decodeAadhaarFromQrWeb(blob);
        if (qrUid && qrUid.length === 12) {
          setAadhaarExtracted(qrUid);
          setAadhaarNumber((prev) => {
            const cur = String(prev ?? '').replace(/\D/g, '').slice(0, 12);
            return cur.length === 12 ? cur : qrUid;
          });
          return;
        }

        const preprocessed = await preprocessForOcr(blob);
        const bottomCropped = await cropBottomForOcr(blob);

        const { createWorker } = await import('tesseract.js');
        const worker = await createWorker('eng');

        const out1 = await worker.recognize(preprocessed);
        const text1 = String((out1 as any)?.data?.text ?? '');
        const linesFull = text1.split(/\r?\n/).map((x) => String(x ?? '').trim()).filter(Boolean);

        // Prefer extraction from the bottom-cropped pass (more likely to contain the printed number).
        const outBottom1 = await worker.recognize(bottomCropped);
        const bottomText1 = String((outBottom1 as any)?.data?.text ?? '');
        const linesBottom = bottomText1.split(/\r?\n/).map((x) => String(x ?? '').trim()).filter(Boolean);

        let extracted = extractAadhaarFromOcrLines(linesBottom);
        lines = [...linesBottom, ...linesFull];
        if (!extracted) extracted = extractAadhaarFromOcrLines(lines);

        if (!extracted) {
          try {
            await (worker as any).setParameters({
              tessedit_char_whitelist: '0123456789',
              preserve_interword_spaces: '1',
            });
          } catch {
            // ignore
          }
          const out2 = await worker.recognize(preprocessed);
          const text2 = String((out2 as any)?.data?.text ?? '');
          const lines2 = text2.split(/\r?\n/).map((x) => String(x ?? '').trim()).filter(Boolean);

          const outBottom2 = await worker.recognize(bottomCropped);
          const bottomText2 = String((outBottom2 as any)?.data?.text ?? '');
          const bottomLines2 = bottomText2.split(/\r?\n/).map((x) => String(x ?? '').trim()).filter(Boolean);

          lines = [...bottomLines2, ...lines2, ...lines];
          extracted = extractAadhaarFromOcrLines(bottomLines2);
          if (!extracted) extracted = extractAadhaarFromOcrLines(lines);
        }

        await worker.terminate();
      } else {
        const TextRecognition = (await import('react-native-text-recognition')).default as any;
        lines = (await TextRecognition.recognize(uri)) as string[];
      }

      const extractedFinal = extractAadhaarFromOcrLines(lines);
      if (extractedFinal) {
        setAadhaarExtracted(extractedFinal);
        setAadhaarNumber((prev) => {
          const cur = String(prev ?? '').replace(/\D/g, '').slice(0, 12);
          return cur.length === 12 ? cur : extractedFinal;
        });
      } else {
        setInfo('Could not auto-detect Aadhaar number. Please enter it manually.');
      }
    } catch {
      // ignore OCR errors
    } finally {
      extractingAadhaarRef.current = false;
    }
  };

  const invokeEdgeFunction = async <T,>(name: string, body: unknown): Promise<T> => {
    const extra = (Constants as any)?.expoConfig?.extra ?? (Constants as any)?.manifest?.extra ?? {};
    const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? extra?.supabaseUrl ?? '';
    const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? extra?.supabaseAnonKey ?? '';
    if (!baseUrl || !anonKey) {
      throw new Error('Supabase env vars missing. Check EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.');
    }

    // OTP functions are configured with verify_jwt=false, and some environments may issue
    // ES256 access tokens which can fail gateway verification. Use anon bearer for OTP calls.
    const otpFunctions = new Set(['send-booking-otp', 'verify-booking-otp']);
    const jwt = otpFunctions.has(name)
      ? anonKey
      : (await supabase.auth.getSession()).data.session?.access_token || anonKey;

    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeout = setTimeout(() => ctrl?.abort(), 25000);

    try {
      const headers: Record<string, string> = {
        apikey: anonKey,
        'Content-Type': 'application/json',
      };
      if (jwt) headers.Authorization = `Bearer ${jwt}`;

      const res = await fetch(`${baseUrl}/functions/v1/${name}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body ?? {}),
        signal: ctrl?.signal,
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
    } catch (e: any) {
      const msg = e?.name === 'AbortError' ? 'Timeout calling OTP service. Please try again.' : e?.message;
      throw new Error(msg || 'OTP service failed.');
    } finally {
      clearTimeout(timeout);
    }
  };

  const normalizePhoneDigits = (value: string) => {
    const v = String(value ?? '').replace(/\s+/g, '');
    if (!v) return '';
    return v.replace(/\D/g, '').slice(0, 10);
  };

  const normalizeCountryCode = (value: string) => {
    const v = String(value ?? '').trim();
    if (!v) return '+91';
    if (!v.startsWith('+')) return `+${v.replace(/\D/g, '')}`;
    return `+${v.replace(/\D/g, '')}`;
  };

  const fullPhoneForOtp = () => {
    const cc = normalizeCountryCode(countryCode);
    const digits = normalizePhoneDigits(phone);
    return `${cc}${digits}`;
  };

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          try {
            const url = new URL(window.location.href);
            const hashParams = new URLSearchParams((url.hash ?? '').replace(/^#/, ''));
            const searchParams = url.searchParams;
            const access_token = (hashParams.get('access_token') ?? searchParams.get('access_token') ?? '').trim();
            const refresh_token = (hashParams.get('refresh_token') ?? searchParams.get('refresh_token') ?? '').trim();
            if (access_token && refresh_token) {
              await setSupabaseSessionSafe({ access_token, refresh_token });
              window.history.replaceState({}, '', `${url.origin}${url.pathname}`);
            }
          } catch {
            // ignore
          }
        }

        const { data: userResp } = await getSupabaseUserSafe();
        const user = userResp.user;
        if (!user?.id) {
          if (isMounted) {
            setLoading(false);
            router.replace('/auth/login' as any);
          }
          return;
        }

        if (isMounted) setUserId(user.id);

        const { data: row, error: rowError } = await supabase
          .from('users')
          .select('id, name, phone, role')
          .eq('id', user.id)
          .maybeSingle();

        if (!rowError && row) {
          if (isMounted) {
            setName(String(row.name ?? (user.user_metadata as any)?.name ?? '').trim());
            setPhone(String(row.phone ?? '').replace(/\D/g, '').slice(0, 10));
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

        // Load Aadhaar details from user_documents (schema-aligned)
        try {
          const { data: docs } = await supabase
            .from('user_documents')
            .select('id, document_type, document_number, image_url, created_at')
            .eq('user_id', user.id)
            .in('document_type', ['aadhar', 'aadhaar', 'Aadhaar', 'Aadhar'])
            .order('created_at', { ascending: false })
            .limit(1);

          const doc = (docs ?? [])[0] as any;
          if (doc?.document_number && isMounted) {
            setAadhaarNumber(String(doc.document_number ?? '').trim());
            setAadhaarExtracted(String(doc.document_number ?? '').trim());
          }
        } catch {
          // ignore
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

    const digits = normalizePhoneDigits(phone);
    if (!digits) {
      setError('Phone number is required.');
      return;
    }
    if (digits.length !== 10) {
      setError('Please enter a valid 10-digit phone number.');
      return;
    }

    const normalizedPhone = fullPhoneForOtp();

    setOtpSending(true);
    try {
      await invokeEdgeFunction('send-booking-otp', { phone: normalizedPhone, user_id: userId });
      setInfo('OTP sent.');
      setOtpSent(true);
      setOtpResendCooldown(30);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send OTP.');
    } finally {
      setOtpSending(false);
    }
  };

  const verifyOtp = async () => {
    setError(null);
    setInfo(null);

    const digits = normalizePhoneDigits(phone);
    if (!digits || digits.length !== 10) {
      setError('Please enter a valid 10-digit phone number.');
      return;
    }
    const normalizedPhone = fullPhoneForOtp();
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
            phone: digits,
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
      setInfo('Mobile number verified.');
      setOtpCode('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'OTP verification failed.');
    } finally {
      setOtpVerifying(false);
    }
  };

  useEffect(() => {
    if (!otpResendCooldown) return;
    const t = setInterval(() => {
      setOtpResendCooldown((v) => Math.max(0, (v ?? 0) - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [otpResendCooldown]);

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
      void runAadhaarOcr(uri);
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

    const extractedDigits = String(aadhaarExtracted ?? '').replace(/\D/g, '').slice(0, 12);
    if (extractedDigits.length === 12 && extractedDigits !== aadhaarDigits) {
      setError('Aadhaar number does not match uploaded Aadhaar photo.');
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
        .from('user_documents')
        .upsert(
          {
            user_id: user.id,
            document_type: 'aadhar',
            document_number: aadhaarDigits,
            image_url: path,
          } as any,
          { onConflict: 'user_id,document_type' } as any
        );
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
          <XStack gap="$2" alignItems="center" flexWrap="wrap">
            <Button
              size="$3"
              backgroundColor="#1F2937"
              color="#FFFFFF"
              borderWidth={1}
              borderColor={border}
              disabled={otpVerified}
              onPress={() => setCountryCodePickerOpen((v) => !v)}>
              {normalizeCountryCode(countryCode)}
            </Button>
            <Input
              flex={1}
              value={phone}
              onChangeText={(v) => setPhone(normalizePhoneDigits(v))}
              placeholder="10-digit mobile"
              keyboardType={Platform.OS === 'web' ? 'default' : 'number-pad'}
              editable={!otpVerified}
              maxLength={10}
            />
          </XStack>

          {countryCodePickerOpen ? (
            <YStack gap="$2" paddingTop={8}>
              <XStack gap="$2" flexWrap="wrap">
                {['+91', '+92', '+880', '+977', '+94', '+971', '+966', '+44', '+1'].map((cc) => (
                  <Button
                    key={cc}
                    size="$2"
                    backgroundColor={normalizeCountryCode(countryCode) === cc ? '#10B981' : '#1F2937'}
                    color={normalizeCountryCode(countryCode) === cc ? '#111827' : '#FFFFFF'}
                    borderWidth={1}
                    borderColor={border}
                    onPress={() => {
                      setCountryCode(cc);
                      setCountryCodePickerOpen(false);
                    }}>
                    {cc}
                  </Button>
                ))}
              </XStack>
            </YStack>
          ) : null}
        </YStack>

        {!otpVerified && otpSent ? (
          <YStack gap="$2">
            <Text color={labelColor}>OTP Code</Text>
            <XStack gap="$2" alignItems="center" flexWrap="wrap">
              <Input
                flex={1}
                value={otpCode}
                onChangeText={(v) => setOtpCode(String(v ?? '').replace(/\D/g, '').slice(0, 6))}
                placeholder="6-digit OTP"
                keyboardType={Platform.OS === 'web' ? 'default' : 'number-pad'}
                maxLength={6}
              />
              <Button
                backgroundColor="#10B981"
                color="#111827"
                onPress={verifyOtp}
                disabled={otpVerifying || otpVerified}>
                {otpVerified ? 'Verified' : otpVerifying ? 'Verifying…' : 'Verify OTP'}
              </Button>
            </XStack>
          </YStack>
        ) : null}

        <XStack gap="$2" flexWrap="wrap">
          <Button
            flex={1}
            backgroundColor="#1F4E79"
            color="#FFFFFF"
            onPress={sendOtp}
            disabled={otpSending || otpVerified || otpResendCooldown > 0}>
            {otpVerified
              ? 'OTP Verified'
              : otpSending
              ? 'Sending…'
              : otpSent
              ? otpResendCooldown > 0
                ? `Resend OTP (${otpResendCooldown}s)`
                : 'Resend OTP'
              : 'Send OTP'}
          </Button>
        </XStack>

        {otpVerified ? <Paragraph color="#34D399">Mobile number verified.</Paragraph> : null}

        {otpVerified ? (
          <YStack gap="$3">
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
