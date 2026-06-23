import DateTimePicker from '@react-native-community/datetimepicker';
import { ResizeMode, Video } from 'expo-av';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { Alert, Dimensions, Image, Modal, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { Button, Input, Paragraph, Text, XStack, YStack } from 'tamagui';

import { themes } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { reverseGeocode, reverseGeocodeDetails, reverseGeocodeFeatures, searchPlaces } from '@/lib/mapbox';
import { isAllowedPhotoUri, isAllowedVideoUri } from '@/lib/media-upload-validation';
import { getRazorpayKeyId } from '@/lib/public-config';
import { createRazorpayOrder, verifyRazorpaySignature } from '@/lib/razorpay';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';

const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_DURATION_SEC = 30;
const TEMP_BYPASS_OTP = false; // OTP verification enabled on submit

class UploadError extends Error {}

const dataUriToBlob = (dataUri: string) => {
  const [header, data] = dataUri.split(',');
  const isBase64 = header.includes('base64');
  const mimeMatch = header.match(/data:([^;]+);/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const binary = isBase64 ? atob(data) : decodeURIComponent(data);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    array[i] = binary.charCodeAt(i);
  }
  return new Blob([array], { type: mimeType });
};

const getFileSizeAsync = async (uri: string): Promise<number | null> => {
  if (Platform.OS === 'web') return null;
  try {
    const info = await FileSystem.getInfoAsync(uri, { size: true } as any);
    return typeof info?.size === 'number' ? info.size : null;
  } catch {
    return null;
  }
};

const isAllowedJpeg = (value: string) => {
  const v = String(value ?? '').toLowerCase();
  if (!v) return false;
  // common mime types
  if (v.includes('image/jpeg') || v.includes('image/jpg')) return true;
  // data URIs like data:image/jpeg;... or data:image/jpg;...
  if (v.startsWith('data:image/') && (v.includes('jpeg') || v.includes('jpg'))) return true;
  // file names or URIs containing .jpg/.jpeg (anywhere in the string)
  if (/\.jpe?g(?:[?#]|$)/.test(v) || v.includes('.jpg') || v.includes('.jpeg')) return true;
  return false;
};

const pickContextText = (ctx: Array<{ id?: string; text?: string }> | undefined, prefix: string) => {
  const it = (ctx ?? []).find((c) => String(c.id ?? '').startsWith(prefix));
  return String(it?.text ?? '').trim();
};

const isAllowedMp4 = (value: string) => {
  const v = String(value ?? '').toLowerCase();
  if (!v) return false;
  if (v.includes('video/mp4')) return true;
  if (v.startsWith('data:video/') && v.includes('mp4')) return true;
  if (/\.mp4(?:[?#]|$)/.test(v) || v.includes('.mp4')) return true;
  return false;
};

const normalizePhoneDigits = (value: string) => {
  const v = String(value ?? '').replace(/\s+/g, '');
  if (!v) return '';
  return v.replace(/[^0-9]/g, '');
};

const formatDateDDMMYYYY = (value: Date) => {
  const dd = String(value.getDate()).padStart(2, '0');
  const mm = String(value.getMonth() + 1).padStart(2, '0');
  const yyyy = String(value.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
};

const parseDateDDMMYYYY = (value: string) => {
  const v = String(value ?? '').trim();
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  const d = new Date(yyyy, mm - 1, dd);
  if (Number.isNaN(d.getTime())) return null;
  if (d.getFullYear() !== yyyy || d.getMonth() !== mm - 1 || d.getDate() !== dd) return null;
  return d;
};

const isIsoDate = (value: string) => {
  const v = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime());
};

type WizardStep = 'service' | 'details' | 'uploads' | 'payment' | 'review';

type UploadItem = {
  uri: string;
  kind: 'photo' | 'video';
};

async function loadRazorpayScript(): Promise<boolean> {
  if (Platform.OS !== 'web') return false;
  if (typeof window === 'undefined') return false;
  if ((window as any).Razorpay) return true;

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Razorpay'));
    document.body.appendChild(script);
  });

  return Boolean((window as any).Razorpay);
}

async function openRazorpayCheckout(options: any): Promise<any> {
  if (Platform.OS === 'web') {
    const ok = await loadRazorpayScript();
    if (!ok) throw new Error('Razorpay unavailable on web');

    return await new Promise((resolve, reject) => {
      const Razorpay = (window as any).Razorpay;
      const rz = new Razorpay({
        ...options,
        handler: (response: any) => resolve(response),
        modal: {
          ondismiss: () => reject(new Error('Payment cancelled')),
        },
      });
      rz.open();
    });
  }

  const RazorpayCheckout = require('react-native-razorpay').default;
  return await RazorpayCheckout.open(options);
}

type StateRow = { id: string; name: string };
type CityRow = { id: string; state_id: string; name: string };
type LocalityRow = { id: string; city_id: string; name: string };

const { width: screenWidth } = Dimensions.get('window');

const normalizeMatchKey = (value: string) => String(value ?? '').trim().toLowerCase();

const matchFromOptions = (value: string, options: string[]) => {
  const key = normalizeMatchKey(value);
  if (!key) return '';
  const exact = options.find((o) => normalizeMatchKey(o) === key);
  if (exact) return exact;
  const contains = options.find((o) => normalizeMatchKey(o).includes(key) || key.includes(normalizeMatchKey(o)));
  return contains ?? '';
};

const looksLikeHouse = (value: string) => {
  const v = normalizeMatchKey(value);
  if (!v) return false;
  if (/[0-9]/.test(v)) return true;
  if (v.includes('flat') || v.includes('apt') || v.includes('apartment') || v.includes('society') || v.includes('tower')) return true;
  if (v.includes('house') || v.includes('plot') || v.includes('bungalow') || v.includes('building')) return true;
  return false;
};

const toISODateFromDDMMYYYY = (value: string) => {
  const d = parseDateDDMMYYYY(value);
  if (!d) return '';
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const fromISOToDDMMYYYY = (iso: string) => {
  const v = String(iso ?? '').trim();
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  return `${m[3]}/${m[2]}/${m[1]}`;
};

const stripIndianPin = (value: string) => {
  const v = String(value ?? '').trim();
  if (!v) return '';
  return v
    .replace(/\b\d{6}\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/,\s+/g, ', ')
    .replace(/^,\s*/g, '')
    .replace(/,\s*$/g, '')
    .trim();
};

const cleanParts = (parts: string[]) => parts.map((p) => stripIndianPin(p)).map((p) => p.trim()).filter(Boolean);

export default function HomeServiceRequestScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ service?: string }>();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? themes.dark : themes.light;
  const { session, profile } = useSession();

  const serviceOptions = useMemo(
    () =>
      [
        { key: 'ac', label: 'AC' },
        { key: 'carpenter', label: 'Carpenter' },
        { key: 'electrician', label: 'Electrician' },
        { key: 'plumber', label: 'Plumber' },
        { key: 'pest', label: 'Pest Control' },
        { key: 'cleaning', label: 'Deep Cleaning' },
        { key: 'painting', label: 'Painting' },
      ] as const,
    []
  );

  const containerWidth = screenWidth <= 980 ? '100%' : 980;

  const initialService = String(params.service ?? '').trim().toLowerCase();
  const initialServiceValid = serviceOptions.some((s) => s.key === initialService);

  const [step, setStep] = useState<WizardStep>(initialServiceValid ? 'details' : 'service');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [detailsAttempted, setDetailsAttempted] = useState(false);

  const [serviceKey, setServiceKey] = useState<string>(initialServiceValid ? initialService : '');

  const [customerName, setCustomerName] = useState<string>(String(profile?.name ?? '').trim());
  const [countryCode, setCountryCode] = useState<string>('+91');
  const [countryCodePickerOpen, setCountryCodePickerOpen] = useState(false);
  const [customerPhone, setCustomerPhone] = useState<string>(String(profile?.phone ?? '').trim());
  const [addressLine1, setAddressLine1] = useState<string>('');
  const [addressLine2, setAddressLine2] = useState<string>('');
  const [state, setState] = useState<string>('');
  const [city, setCity] = useState<string>('');
  const [locality, setLocality] = useState<string>('');
  const [preferredDate, setPreferredDate] = useState<string>('');
  const [preferredTime, setPreferredTime] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [paymentOption, setPaymentOption] = useState<'online_now' | 'after_service'>('after_service');
  const [paying, setPaying] = useState(false);

  const [statePickerOpen, setStatePickerOpen] = useState(false);
  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [mediaViewerOpen, setMediaViewerOpen] = useState(false);
  const [mediaViewerKind, setMediaViewerKind] = useState<'photo' | 'video'>('photo');
  const [mediaViewerIndex, setMediaViewerIndex] = useState(0);
  const [otpOpen, setOtpOpen] = useState(false);
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpExpiryTime, setOtpExpiryTime] = useState<Date | null>(null);
  const otpRefs = useRef<Array<any>>([]);
  const submitAfterOtpRef = useRef(false);
  const webDateInputRef = useRef<any>(null);
  const webTimeInputRef = useRef<any>(null);
  const [localitySuggestions, setLocalitySuggestions] = useState<Array<{ id: string; label: string; full: string }>>([]);
  const [localityLoading, setLocalityLoading] = useState(false);
  const [localityTyped, setLocalityTyped] = useState(false);

  const countryCodeOptions = useMemo(
    () =>
      [
        { label: 'India (+91)', value: '+91' },
        { label: 'Pakistan (+92)', value: '+92' },
        { label: 'Bangladesh (+880)', value: '+880' },
        { label: 'Nepal (+977)', value: '+977' },
        { label: 'Sri Lanka (+94)', value: '+94' },
        { label: 'UAE (+971)', value: '+971' },
        { label: 'Saudi Arabia (+966)', value: '+966' },
        { label: 'UK (+44)', value: '+44' },
        { label: 'USA (+1)', value: '+1' },
        { label: 'Canada (+1)', value: '+1' },
      ] as const,
    []
  );

  const fallbackCityByState = useMemo(() => {
    return {
      Gujarat: ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot'],
      Maharashtra: ['Mumbai', 'Pune', 'Nagpur', 'Nashik'],
      Rajasthan: ['Jaipur', 'Jodhpur', 'Udaipur', 'Kota'],
      'Madhya Pradesh': ['Bhopal', 'Indore', 'Jabalpur', 'Gwalior'],
    } as Record<string, string[]>;
  }, []);

  const [states, setStates] = useState<StateRow[]>([]);
  const [cities, setCities] = useState<CityRow[]>([]);
  const [localities, setLocalities] = useState<LocalityRow[]>([]);

  const selectedStateId = useMemo(() => {
    const s = states.find((x) => x.name.toLowerCase() === state.trim().toLowerCase());
    return s?.id ?? null;
  }, [state, states]);

  const selectedCityId = useMemo(() => {
    const c = cities.find((x) => x.name.toLowerCase() === city.trim().toLowerCase());
    return c?.id ?? null;
  }, [cities, city]);

  React.useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const { data, error: fetchError } = await supabase.from('states').select('id,name').order('name');
        if (!active) return;
        if (fetchError) throw new Error(fetchError.message);
        setStates(((data as any) ?? []) as StateRow[]);
      } catch {
        if (!active) return;
        setStates([]);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    let active = true;
    const load = async () => {
      if (!selectedStateId) {
        setCities([]);
        setLocalities([]);
        return;
      }

      try {
        const { data, error: fetchError } = await supabase
          .from('cities')
          .select('id,state_id,name')
          .eq('state_id', selectedStateId)
          .order('name');
        if (!active) return;
        if (fetchError) throw new Error(fetchError.message);
        setCities(((data as any) ?? []) as CityRow[]);
      } catch {
        if (!active) return;
        setCities([]);
        setLocalities([]);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [selectedStateId]);

  React.useEffect(() => {
    let active = true;
    const load = async () => {
      if (!selectedCityId) {
        setLocalities([]);
        return;
      }

      try {
        const { data, error: fetchError } = await supabase
          .from('localities')
          .select('id,city_id,name')
          .eq('city_id', selectedCityId)
          .order('name');
        if (!active) return;
        if (fetchError) throw new Error(fetchError.message);
        setLocalities(((data as any) ?? []) as LocalityRow[]);
      } catch {
        if (!active) return;
        setLocalities([]);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [selectedCityId]);

  const stateOptions = useMemo(() => {
    if (states.length) return states.map((s) => s.name);
    return Object.keys(fallbackCityByState);
  }, [fallbackCityByState, states]);

  const cityOptions = useMemo(() => {
    if (cities.length) return cities.map((c) => c.name);
    return fallbackCityByState[state] ?? [];
  }, [cities, fallbackCityByState, state]);

  React.useEffect(() => {
    if (!state.trim()) return;
    if (city.trim()) return;
    const next = (cityOptions ?? [])[0] ?? '';
    if (next) setCity(next);
  }, [state, city, cityOptions]);

  const localityOptions = useMemo(() => {
    if (localities.length) return localities.map((l) => l.name);
    return [] as string[];
  }, [localities]);

  React.useEffect(() => {
    let active = true;
    const q = locality.trim();
    if (!localityTyped) {
      setLocalitySuggestions([]);
      return;
    }

    if (!q || q.length < 2) {
      setLocalitySuggestions([]);
      return;
    }

    const handle = setTimeout(() => {
      void (async () => {
        try {
          setLocalityLoading(true);
          const results = await searchPlaces(`${q}, ${city || ''} ${state || ''}`.trim());
          if (!active) return;

          const filtered = results
            .filter((x) => {
              const name = String((x as any)?.place_name ?? '').toLowerCase();
              if (state && !name.includes(state.trim().toLowerCase())) return false;
              if (city && !name.includes(city.trim().toLowerCase())) return false;
              return true;
            })
            .map((x) => {
              const place = String((x as any)?.place_name ?? '').trim();
              const label = place.split(',')[0]?.trim() || place;
              return { id: String((x as any)?.id ?? place), label, full: place };
            })
            .slice(0, 6);

          setLocalitySuggestions(filtered);
        } catch {
          if (!active) return;
          setLocalitySuggestions([]);
        } finally {
          if (!active) return;
          setLocalityLoading(false);
        }
      })();
    }, 350);

    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [locality, state, city]);

  const [photos, setPhotos] = useState<string[]>([]);
  const [videos, setVideos] = useState<string[]>([]);

  const createdRequestIdRef = useRef<string | null>(null);
  const processedUploadsRef = useRef<any[]>([]);

  const [backButtonBg, backButtonText] = useMemo(() => {
    const isDark = colorScheme === 'dark';
    return isDark ? ['#374151', '#FFFFFF'] : ['#E5E7EB', '#111827'];
  }, [colorScheme]);

  const detailsBlocker = useMemo(() => {
    if (!customerName.trim()) return 'Name is required.';
    const digits = normalizePhoneDigits(customerPhone);
    if (!digits) return 'Phone number is required.';
    if (digits.length !== 10) return 'Please enter a valid 10-digit phone number.';
    if (!state.trim()) return 'State is required.';
    if (!city.trim()) return 'City is required.';
    if (!locality.trim()) return 'Locality is required.';
    if (!preferredDate.trim()) return 'Preferred date is required.';
    const parsed = parseDateDDMMYYYY(preferredDate);
    if (!parsed) return 'Preferred date must be DD/MM/YYYY.';
    if (!preferredTime.trim()) return 'Preferred time is required.';
    return '';
  }, [city, customerName, customerPhone, locality, preferredDate, preferredTime, state]);

  const renderBackButton = () => {
    return (
      <Pressable onPress={() => (step !== 'service' ? setStep('service') : router.back())}>
        <YStack
          paddingHorizontal={16}
          paddingVertical={12}
          borderRadius={10}
          backgroundColor={backButtonBg}
          alignItems="center"
          justifyContent="center">
          <Text color={backButtonText} fontWeight="700" fontSize={16}>
            Back
          </Text>
        </YStack>
      </Pressable>
    );
  };

  const requireSession = () => {
    if (session?.user?.id) return true;
    router.push({ pathname: '/auth/login', params: { redirectTo: '/home-services/request' } } as any);
    return false;
  };

  const invokeEdgeFunction = async <T,>(name: string, body: unknown): Promise<T> => {
    const extra = (Constants as any)?.expoConfig?.extra ?? (Constants as any)?.manifest?.extra ?? {};
    const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? extra?.supabaseUrl ?? '';
    const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? extra?.supabaseAnonKey ?? '';
    if (!baseUrl || !anonKey) {
      throw new Error('Supabase env vars missing. Check EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.');
    }

    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeout = setTimeout(() => ctrl?.abort(), 60000);

    try {
      const token = typeof session?.access_token === 'string' && session.access_token ? session.access_token : anonKey;
      const res = await fetch(`${baseUrl}/functions/v1/${name}`, {
        method: 'POST',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
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

      return (parsed ?? {}) as T;
    } catch (e: any) {
      const msg = e?.name === 'AbortError' ? `Timeout calling ${name}. Please try again.` : e?.message;
      throw new Error(`Failed to invoke ${name}: ${msg || `${name} service failed.`}`);
    } finally {
      clearTimeout(timeout);
    }
  };

  const sendOtp = async () => {
    setError(null);
    const digits = normalizePhoneDigits(customerPhone);
    if (!digits || digits.length !== 10) {
      setError('Please enter a valid 10-digit phone number.');
      return;
    }

    setOtpSending(true);
    try {
      const phone = `${countryCode}${digits}`;
      if (session?.user?.id) {
        await supabase.from('users').update({ phone: digits }).eq('id', session.user.id);
      }
      const data = await invokeEdgeFunction<{ sent?: boolean; error?: string }>('send-booking-otp', {
        phone,
        purpose: 'booking',
        user_id: session?.user?.id ?? '',
      });
      if (data?.error) {
        setError(String(data.error));
      } else {
        const expiryTime = new Date(Date.now() + 600 * 1000);
        setOtpExpiryTime(expiryTime);
      }
    } catch (e: any) {
      setError(e?.message ? String(e.message) : 'Failed to send OTP.');
    } finally {
      setOtpSending(false);
    }
  };

  React.useEffect(() => {
    if (!otpOpen) return;
    (async () => {
      await sendOtp();
      // focus first OTP input on open (web + native)
      try {
        setTimeout(() => otpRefs.current[0]?.focus?.(), 50);
      } catch {
        // ignore
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otpOpen]);

  const verifyOtpAndSubmit = async () => {
    setError(null);
    const code = otpDigits.join('');
    if (code.length !== 6) {
      setError('Enter 6-digit OTP.');
      return;
    }

    setOtpVerifying(true);
    try {
      const digits = normalizePhoneDigits(customerPhone);
      const phone = `${countryCode}${digits}`;
      const data = await invokeEdgeFunction<{ valid?: boolean; error?: string }>('verify-booking-otp', { phone, code });
      if (!data?.valid) {
        setError(data?.error ? String(data.error) : 'Invalid OTP.');
        return;
      }

      const requestId = await createRequestIfNeeded();
      if (!requestId) return;

      // handle upload errors separately so they surface in Uploads step
      try {
        await uploadMedia(requestId);
      } catch (ue: any) {
        const msg = ue?.message ? String(ue.message) : 'Failed to upload media.';
        setUploadError(msg);
        // close OTP modal and return user to uploads step
        setOtpOpen(false);
        setStep('uploads');
        return;
      }
      await supabase.from('home_service_requests').update({ status: 'pending' }).eq('id', requestId);

      // Notify providers about the new request
      try {
        await invokeEdgeFunction<{ sent?: boolean; providers_notified?: number; error?: string }>('send-home-service-notification', {
          request_id: requestId,
        });
      } catch (e) {
        console.error('Failed to send provider notifications:', e);
      }

      setOtpOpen(false);
      submitAfterOtpRef.current = false;
      Alert.alert('Booking Confirmed ✓',
        `Your service request has been submitted successfully!\n\nService provider will reach you on:\n${preferredDate} at ${preferredTime}\n\nYou'll receive their contact details shortly.`.trim(),
        [{ text: 'OK', onPress: () => router.replace('/home-services/my-requests') }]
      );
      router.replace('/home-services/my-requests');
    } catch (e: any) {
      setError(e?.message ? String(e.message) : 'Failed to verify OTP.');
    } finally {
      setOtpVerifying(false);
    }
  };

  const goNext = () => {
    if (step === 'service') {
      if (!serviceKey) {
        setError('Please select a service.');
        return;
      }
      setError(null);
      setStep('details');
      return;
    }
    if (step === 'details') {
      setDetailsAttempted(true);
      if (detailsBlocker) {
        setError(detailsBlocker);
        return;
      }
      setError(null);
      setStep('uploads');
      return;
    }
    if (step === 'uploads') {
      setError(null);
      setStep('payment');
      return;
    }
    if (step === 'payment') {
      if (!paymentOption) {
        setError('Please select a payment option.');
        return;
      }
      setError(null);
      setStep('review');
      return;
    }
  };

  const goBack = () => {
    if (saving) return;
    if (step === 'service') {
      router.back();
      return;
    }
    if (step === 'details') {
      setDetailsAttempted(false);
      setStep('service');
      return;
    }
    if (step === 'uploads') {
      setStep('details');
      return;
    }
    if (step === 'payment') {
      setStep('uploads');
      return;
    }
    if (step === 'review') {
      setStep('payment');
      return;
    }
  };

  const pickPhotos = async () => {
    setUploadError(null);
    const remaining = Math.max(10 - photos.length, 0);
    if (remaining <= 0) {
      setUploadError('Maximum 10 photos allowed.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
    });

    if (result.canceled) return;

    const accepted: string[] = [];
    for (const asset of result.assets) {
      const uri = asset?.uri;
      if (!uri) continue;

      const photoOk = await isAllowedPhotoUri(uri, asset?.mimeType ?? undefined).catch(() => false);
      if (!photoOk) {
        setUploadError('Only JPG/JPEG images are allowed.');
        continue;
      }

      const size = typeof asset?.fileSize === 'number' ? asset.fileSize : null;
      const finalSize = size ?? (await getFileSizeAsync(uri));
      if (finalSize !== null && finalSize > MAX_IMAGE_UPLOAD_BYTES) {
        setUploadError('Image too large. Please select an image up to 10MB.');
        continue;
      }

      accepted.push(uri);
    }

    if (!accepted.length) return;
    setPhotos((p) => [...p, ...accepted].slice(0, 10));
  };

  const pickVideo = async () => {
    setUploadError(null);
    if (videos.length >= 2) {
      setUploadError('Maximum 2 videos allowed.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 1,
    });

    if (result.canceled) return;
    const asset = result.assets[0];

    const rawDuration = typeof asset?.duration === 'number' ? asset.duration : null;
    const durationSec = rawDuration === null ? null : rawDuration > 300 ? rawDuration / 1000 : rawDuration;
    if (durationSec !== null && durationSec > MAX_VIDEO_DURATION_SEC) {
      setUploadError('Video must be 30 seconds or less.');
      return;
    }

    if (!asset?.uri) return;
    const videoOk = await isAllowedVideoUri(asset.uri, asset?.mimeType ?? undefined).catch(() => false);
    if (!videoOk) {
      setUploadError('Only MP4 videos are allowed.');
      return;
    }

    const size = typeof asset?.fileSize === 'number' ? asset.fileSize : null;
    const finalSize = size ?? (await getFileSizeAsync(asset.uri));
    if (finalSize !== null && finalSize > MAX_VIDEO_BYTES) {
      setUploadError('Video must be 10MB or less.');
      return;
    }

    setVideos((p) => [...p, asset.uri].slice(0, 2));
  };

  const createRequestIfNeeded = async () => {
    if (createdRequestIdRef.current) return createdRequestIdRef.current;

    if (!requireSession()) return null;

    const userId = session?.user?.id ?? '';
    if (!userId) return null;

    const phone = `${countryCode}${normalizePhoneDigits(customerPhone)}`;

    const { data, error: insertError } = await supabase
      .from('home_service_requests')
      .insert({
        user_id: userId,
        service_key: serviceKey,
        customer_name: customerName.trim() || null,
        customer_phone: phone || null,
        address_line1: addressLine1.trim() || null,
        address_line2: addressLine2.trim() || null,
        state: state.trim() || null,
        city: city.trim() || null,
        locality: locality.trim() || null,
        preferred_date: preferredDate.trim() ? toISODateFromDDMMYYYY(preferredDate) : null,
        preferred_time: preferredTime.trim() || null,
        notes: notes.trim() || null,
      })
      .select('id')
      .maybeSingle();

    if (insertError) throw new Error(insertError.message);
    const id = String((data as any)?.id ?? '').trim();
    if (!id) throw new Error('Failed to create request.');

    createdRequestIdRef.current = id;
    return id;
  };

  const uploadMedia = async (requestId: string) => {
    if (!requireSession()) return;

    const rawBucket = 'home-service-uploads-raw';
    const items: UploadItem[] = [
      ...photos.map((uri) => ({ uri, kind: 'photo' as const })),
      ...videos.map((uri) => ({ uri, kind: 'video' as const })),
    ];

    for (const it of items) {
      const fileSize = await getFileSizeAsync(it.uri);

      if (it.kind === 'photo') {
        const ok = await isAllowedPhotoUri(it.uri);
        if (!ok) throw new UploadError('Only JPG/JPEG images are allowed.');
        if (fileSize !== null && fileSize > MAX_IMAGE_UPLOAD_BYTES) throw new UploadError('Image too large. Please select an image up to 10MB.');
      }

      if (it.kind === 'video') {
        const ok = await isAllowedVideoUri(it.uri);
        if (!ok) throw new UploadError('Only MP4 videos are allowed.');
        if (fileSize !== null && fileSize > MAX_VIDEO_BYTES) throw new UploadError('Video must be 10MB or less.');
      }

      let blob;
      try {
        const res = await fetch(it.uri);
        blob = await res.blob();
      } catch (e: any) {
        if (typeof it.uri === 'string' && it.uri.startsWith('data:')) {
          try {
            blob = dataUriToBlob(it.uri);
          } catch {
            throw new UploadError('Failed to decode data URI for selected media. Please reselect the file and try again.');
          }
        } else {
          throw new UploadError(
            `Failed to read selected media for upload (${it.kind}). Please remove and re-add the file, then try again. ${e?.message ?? ''}`.trim()
          );
        }
      }

      const ext = it.kind === 'video' ? 'mp4' : 'jpg';
      const rawPath = `requests/${requestId}/${it.kind}s/${Date.now()}_${Math.random().toString(16).slice(2)}.${ext}`;
      const contentType = it.kind === 'video' ? 'video/mp4' : 'image/jpeg';

      const { error: uploadError } = await supabase.storage.from(rawBucket).upload(rawPath, blob, { contentType, upsert: true });
      if (uploadError) throw new UploadError(uploadError.message);

      // Call the processing edge function using our authenticated wrapper so user JWT is forwarded
      let processed: any = null;
      try {
        const resp = await supabase.functions.invoke('process-home-service-upload', {
          body: JSON.stringify({ request_id: requestId, raw_path: rawPath, kind: it.kind }),
        });
        processed = (resp as any)?.data ?? null;
        const procErr = (resp as any)?.error ?? null;
        if (procErr) {
          const details = procErr?.message ?? JSON.stringify(procErr);
          throw new UploadError(String(details));
        }
      } catch (e: any) {
        console.error('process-home-service-upload invoke failed', e);
        const detail = e?.message ?? String(e);
        throw new UploadError(`Failed to call process-home-service-upload: ${detail}`);
      }

      if (processed?.upload) {
        processedUploadsRef.current = [...processedUploadsRef.current, processed.upload];
      }
    }
  };

  const submitRequest = async (requestId: string, paymentOpt?: string) => {
    try {
      // If pay online now, process Razorpay payment first
      if (paymentOpt === 'online_now') {
        setPaying(true);
        try {
          const order = await createRazorpayOrder({
            amount: 15000, // ₹150 minimum charge as advance
            currency: 'INR',
            receipt: `hs_${Date.now()}`,
            notes: { request_id: requestId, purpose: 'home_service_advance' },
          });

          const razorpayKeyId = await getRazorpayKeyId();
          if (!razorpayKeyId) {
            throw new Error('Payment gateway not configured.');
          }

          const paymentData: any = await openRazorpayCheckout({
            key: razorpayKeyId,
            amount: order.amount,
            currency: order.currency,
            name: 'PackersMovers',
            description: 'Home Service Advance',
            order_id: order.id,
            prefill: {
              name: customerName,
              contact: `${countryCode}${normalizePhoneDigits(customerPhone)}`,
            },
            theme: { color: '#1F4E79' },
          });

          const valid = await verifyRazorpaySignature({
            order_id: order.id,
            payment_id: paymentData.razorpay_payment_id,
            signature: paymentData.razorpay_signature,
          });

          if (!valid) {
            throw new Error('Payment verification failed.');
          }

          // Record payment
          await supabase.from('payments').insert({
            booking_id: null,
            user_id: session?.user?.id,
            amount: 150,
            status: 'paid',
            razorpay_order_id: order.id,
            razorpay_payment_id: paymentData.razorpay_payment_id,
            metadata: {
              request_id: requestId,
              purpose: 'home_service_advance',
              razorpay_signature: paymentData.razorpay_signature,
            },
          });

          // Update request with payment info
          await supabase
            .from('home_service_requests')
            .update({
              payment_option: 'online_now',
              payment_status: 'paid',
              advance_payment: 150,
              razorpay_order_id: order.id,
              razorpay_payment_id: paymentData.razorpay_payment_id,
            })
            .eq('id', requestId);
        } catch (e: any) {
          const msg = e?.message ?? 'Payment failed.';
          if (msg.toLowerCase().includes('cancel')) {
            setError('Payment cancelled. Your request is saved as draft.');
          } else {
            setError(msg);
          }
          setPaying(false);
          return;
        }
        setPaying(false);
      } else {
        // Pay after service — default to cash
        await supabase
          .from('home_service_requests')
          .update({ payment_option: 'after_service', payment_status: 'pending', after_service_payment_method: 'cash' })
          .eq('id', requestId);
      }

      await uploadMedia(requestId);
      await supabase.from('home_service_requests').update({ status: 'pending' }).eq('id', requestId);

      try {
        const resp = await supabase.functions.invoke('send-home-service-notification', {
          body: JSON.stringify({ request_id: requestId }),
        });
        const notifyErr = (resp as any)?.error ?? null;
        if (notifyErr) console.error('Failed to send provider notifications:', notifyErr);
      } catch (e: any) {
        console.error('Failed to send provider notifications:', e);
      }

      setOtpOpen(false);
      submitAfterOtpRef.current = false;
      Alert.alert(
        'Booking Confirmed ✓',
        `Your service request has been submitted successfully!\n\nService provider will reach you on:\n${preferredDate} at ${preferredTime}\n\nYou'll receive their contact details shortly.`.trim(),
        [{ text: 'OK', onPress: () => router.replace('/home-services/my-requests') }]
      );
      router.replace('/home-services/my-requests');
    } catch (e: any) {
      const msg = e?.message ?? 'Failed to submit request.';
      if (e instanceof UploadError) {
        if (step === 'uploads') {
          setUploadError(msg);
        } else {
          setError(msg);
        }
      } else {
        setError(msg);
      }
      setOtpOpen(false);
      submitAfterOtpRef.current = false;
    }
  };

  const handleSubmit = async () => {
    setError(null);

    if (!requireSession()) return;

    try {
      setSaving(true);

      if (!serviceKey) throw new Error('Please select a service.');

      // Validate uploads before sending OTP to avoid unnecessary SMS costs
      if (photos.length || videos.length) {
        for (const p of photos) {
          const ok = await isAllowedPhotoUri(p);
          const size = await getFileSizeAsync(p);
          if (!ok) {
            setUploadError('Only JPG/JPEG images are allowed.');
            return;
          }
          if (size !== null && size > MAX_IMAGE_UPLOAD_BYTES) {
            setUploadError('Image too large. Please select an image up to 10MB.');
            return;
          }
        }
        for (const v of videos) {
          const ok = await isAllowedVideoUri(v);
          const size = await getFileSizeAsync(v);
          if (!ok) {
            setUploadError('Only MP4 videos are allowed.');
            return;
          }
          if (size !== null && size > MAX_VIDEO_BYTES) {
            setUploadError('Video must be 10MB or less.');
            return;
          }
        }
      }

      const requestId = await createRequestIfNeeded();
      if (!requestId) return;

      if (TEMP_BYPASS_OTP) {
        await submitRequest(requestId, paymentOption);
        return;
      }

      submitAfterOtpRef.current = true;
      setOtpDigits(['', '', '', '', '', '']);
      setOtpOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit request.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <YStack backgroundColor="#1F4E79" padding={16} paddingTop={18}>
        <XStack alignItems="center" justifyContent="center" position="relative">
          <Button size="$3" chromeless color="#FFFFFF" position="absolute" left={0} onPress={goBack}>
            ‹
          </Button>
          <YStack alignItems="center">
            <Text color="#FFFFFF" fontSize={18} fontWeight="800">
              Home Service Request
            </Text>
            <Text color={theme.menuText} fontSize={14} fontWeight="600">
              {step === 'service' ? 'Step 1 of 5' : step === 'details' ? 'Step 2 of 5' : step === 'uploads' ? 'Step 3 of 5' : step === 'payment' ? 'Step 4 of 5' : 'Step 5 of 5'}
            </Text>
          </YStack>
        </XStack>
      </YStack>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120, alignItems: 'center' }}>
        <YStack width={containerWidth} gap="$4">
          {step === 'service' ? (
            <YStack backgroundColor={theme.bgCard} borderRadius={14} padding={16} borderWidth={1} borderColor={theme.border} gap="$3">
              <Text fontSize={18} fontWeight="800" color="#1F4E79">
                Select Service
              </Text>
              <XStack flexWrap="wrap" gap="$3" justifyContent="space-between">
                {serviceOptions.map((s) => {
                  const selected = serviceKey === s.key;
                  return (
                    <Pressable key={s.key} onPress={() => setServiceKey(s.key)} style={{ width: screenWidth > 820 ? '32%' : '48%' } as any}>
                      <YStack
                        backgroundColor={selected ? theme.info : theme.bgCard}
                        borderRadius={14}
                        padding={14}
                        borderWidth={2}
                        borderColor={selected ? '#1F4E79' : theme.border}
                        gap="$1">
                        <Text fontWeight="800" color={theme.text}>
                          {s.label}
                        </Text>
                        <Text fontSize={13} color={theme.textSecondary} fontWeight="700">
                          Tap to choose
                        </Text>
                      </YStack>
                    </Pressable>
                  );
                })}
              </XStack>
            </YStack>
          ) : null}

          {step === 'details' ? (
            <YStack backgroundColor={theme.bgCard} borderRadius={14} padding={16} borderWidth={1} borderColor={theme.border} gap="$3">
              <Text fontSize={18} fontWeight="800" color="#1F4E79">
                Your Details
              </Text>

              {detailsAttempted && error ? (
                <YStack backgroundColor={theme.bgCardSecondary} borderRadius={12} padding={12} borderWidth={1} borderColor={theme.danger}>
                  <Text color={theme.danger} fontWeight="800">
                    {error}
                  </Text>
                </YStack>
              ) : null}

              <YStack gap="$2">
                <Text fontSize={14} fontWeight="700" color={theme.textSecondary}>
                  Name
                </Text>
                <Input
                  value={customerName}
                  onChangeText={setCustomerName}
                  placeholder="Your name"
                  backgroundColor={theme.bgCard}
                  borderColor={theme.border}
                  color={theme.text}
                />
              </YStack>

              <YStack gap="$2">
                <Text fontSize={14} fontWeight="700" color={theme.textSecondary}>
                  Phone *
                </Text>
                <XStack gap="$2" flexWrap="wrap" alignItems="center">
                  <Pressable onPress={() => setCountryCodePickerOpen(true)} style={{ flexBasis: '32%' } as any}>
                    <YStack
                      backgroundColor={theme.bgCard}
                      borderRadius={12}
                      padding={12}
                      borderWidth={1}
                      borderColor={theme.border}>
                      <Text fontSize={13} fontWeight="800" color={theme.textMuted}>
                        Code
                      </Text>
                      <Text fontSize={15} fontWeight="900" color={theme.text}>
                        {countryCode}
                      </Text>
                    </YStack>
                  </Pressable>
                  <YStack style={{ flexBasis: '66%' } as any}>
                    <Input
                      value={customerPhone}
                      onChangeText={(v) => setCustomerPhone(normalizePhoneDigits(v).slice(0, 10))}
                      placeholder="10-digit mobile"
                      keyboardType={Platform.OS === 'web' ? 'default' : 'number-pad'}
                      inputMode={Platform.OS === 'web' ? ('numeric' as any) : undefined}
                      maxLength={10}
                      backgroundColor={theme.bgCard}
                      borderColor={theme.border}
                      color={theme.text}
                    />
                  </YStack>
                </XStack>
              </YStack>

              <YStack gap="$2">
                <Text fontSize={14} fontWeight="700" color={theme.textSecondary}>
                  Address line 1
                </Text>
                <Input
                  value={addressLine1}
                  onChangeText={setAddressLine1}
                  placeholder="House no / society"
                  backgroundColor={theme.bgCard}
                  borderColor={theme.border}
                  color={theme.text}
                />
              </YStack>

              <Pressable
                onPress={() => void (async () => {
                  try {
                    setError(null);
                    const { status } = await Location.requestForegroundPermissionsAsync();
                    if (status !== 'granted') {
                      setError('Location permission denied.');
                      return;
                    }
                    const current = await Location.getCurrentPositionAsync({
                      accuracy: Location.Accuracy.Highest,
                      maximumAge: 0,
                      timeout: 12_000,
                      mayShowUserSettingsDialog: true,
                      enableHighAccuracy: true,
                    } as any);
                    const features = await reverseGeocodeFeatures(current.coords.longitude, current.coords.latitude, 8).catch(() => []);
                    const details = (features.find((f) => (f.place_type ?? []).includes('address')) ?? features[0] ?? (await reverseGeocodeDetails(current.coords.longitude, current.coords.latitude))) as any;
                    const placeName = String(details?.place_name ?? (await reverseGeocode(current.coords.longitude, current.coords.latitude)) ?? '').trim();

                    if (__DEV__) {
                      console.log('[HomeServices] current coords:', current.coords.latitude, current.coords.longitude);
                      console.log('[HomeServices] mapbox place:', placeName);
                    }

                    const placeFeature = features.find((f) => (f.place_type ?? []).includes('place')) ?? null;
                    const poiPolice =
                      features.find((f) => {
                        if (!(f.place_type ?? []).includes('poi')) return false;
                        const txt = `${String(f.text ?? '')} ${String(f.place_name ?? '')}`.toLowerCase();
                        if (!txt.trim()) return false;
                        if (txt.includes('police station')) return true;
                        if (txt.includes('policestation')) return true;
                        if (txt.includes('police stn')) return true;
                        if (txt.includes('police')) return true;
                        if (txt.includes('thana')) return true;
                        if (txt.match(/\bps\b/)) return true;
                        return false;
                      }) ?? null;

                    const rawRegion = pickContextText(details?.context, 'region.');
                    const rawPlace = pickContextText(details?.context, 'place.') || String(placeFeature?.text ?? '').trim();
                    const rawNeighborhood = pickContextText(details?.context, 'neighborhood.');
                    const rawLocality = pickContextText(details?.context, 'locality.');
                    const rawPolice = String(poiPolice?.text ?? '').trim();
                    const rawLocalityValue = rawPolice || rawNeighborhood || rawLocality;

                    const houseNumber = String(details?.address ?? '').trim();
                    const streetText = String(details?.text ?? '').trim();

                    const partsRaw = String(placeName)
                      .split(',')
                      .map((x) => x.trim())
                      .filter(Boolean);

                    const parts = cleanParts(partsRaw);

                    if (!parts.length && !rawRegion && !rawPlace && !rawLocalityValue && !houseNumber && !streetText) return;

                    const country = parts.length ? parts[parts.length - 1] : '';
                    const partsNoCountry = normalizeMatchKey(country) === 'india' ? parts.slice(0, -1) : parts;

                    let nextState = matchFromOptions(rawRegion, stateOptions);
                    if (!nextState) {
                      nextState = matchFromOptions(partsNoCountry.slice().reverse().find((p) => matchFromOptions(p, stateOptions)) ?? '', stateOptions);
                    }
                    let nextStateId = states.find((s) => normalizeMatchKey(s.name) === normalizeMatchKey(nextState))?.id ?? null;

                    if (!nextState && rawRegion) {
                      nextState = rawRegion;
                      nextStateId = states.find((s) => normalizeMatchKey(s.name) === normalizeMatchKey(nextState))?.id ?? null;
                    }

                    const likelyCityToken = stripIndianPin(rawPlace || partsNoCountry[partsNoCountry.length - 1] || '');

                    if (!nextState && likelyCityToken) {
                      try {
                        const { data } = await supabase
                          .from('cities')
                          .select('name,state_id')
                          .ilike('name', likelyCityToken)
                          .limit(1);
                        const hit = ((data as any) ?? [])[0] as { name?: string; state_id?: string } | undefined;
                        const stId = hit?.state_id ?? null;
                        const stName = stId ? states.find((s) => String(s.id) === String(stId))?.name ?? '' : '';
                        const stateMatched = stName ? matchFromOptions(stName, stateOptions) : '';
                        if (stateMatched) {
                          nextState = stateMatched;
                          nextStateId = states.find((s) => normalizeMatchKey(s.name) === normalizeMatchKey(nextState))?.id ?? null;
                        }
                      } catch {
                      }
                    }

                    const nextCityOptions = cities.length && nextStateId
                      ? cities.filter((c) => c.state_id === nextStateId).map((c) => c.name)
                      : nextState
                        ? fallbackCityByState[nextState] ?? []
                        : cityOptions;

                    const nextCityCandidate = rawPlace || partsNoCountry.slice().reverse().find((p) => matchFromOptions(p, nextCityOptions)) || likelyCityToken;
                    const nextCity = matchFromOptions(nextCityCandidate, nextCityOptions);
                    const nextLocalityMatched = matchFromOptions(rawLocalityValue, localityOptions);

                    let nextLocality = nextLocalityMatched;
                    if (normalizeMatchKey(nextLocality) === normalizeMatchKey(nextCity)) nextLocality = '';
                    if (normalizeMatchKey(nextLocality) === normalizeMatchKey(nextState)) nextLocality = '';

                    if (!nextLocality && nextCity) {
                      const cityIdx = partsNoCountry.findIndex((p) => normalizeMatchKey(p) === normalizeMatchKey(nextCity));
                      const candidate = cityIdx > 0 ? partsNoCountry[cityIdx - 1] : '';
                      const cleaned = stripIndianPin(candidate);
                      if (
                        cleaned &&
                        normalizeMatchKey(cleaned) !== normalizeMatchKey(nextState) &&
                        normalizeMatchKey(cleaned) !== normalizeMatchKey(nextCity) &&
                        !looksLikeHouse(cleaned)
                      ) {
                        nextLocality = cleaned;
                      }
                    }

                    const stateIndex = nextState ? partsNoCountry.findIndex((p) => normalizeMatchKey(p) === normalizeMatchKey(nextState)) : -1;
                    const cityIndex = nextCity ? partsNoCountry.findIndex((p) => normalizeMatchKey(p) === normalizeMatchKey(nextCity)) : -1;
                    const localityIndex = nextLocality ? partsNoCountry.findIndex((p) => normalizeMatchKey(p) === normalizeMatchKey(nextLocality)) : -1;

                    const stopIndex = (() => {
                      const candidates = [localityIndex, cityIndex, stateIndex].filter((x) => x >= 0);
                      if (!candidates.length) return -1;
                      return Math.min(...candidates);
                    })();
                    const addressPartsRaw = (stopIndex > 0 ? partsNoCountry.slice(0, stopIndex) : partsNoCountry.slice(0, 2)).filter(Boolean);

                    let addressLine1Next = '';
                    let addressLine2Next = '';

                    // Preferred: Mapbox structured fields
                    if (houseNumber) addressLine1Next = houseNumber;
                    if (streetText) {
                      if (addressLine1Next) addressLine2Next = streetText;
                      else addressLine2Next = streetText;
                    }

                    // Fallback: parse from place_name parts
                    if (!addressLine1Next && !addressLine2Next) {
                      if (addressPartsRaw.length >= 2) {
                        const first = addressPartsRaw[0];
                        const second = addressPartsRaw[1];
                        if (!looksLikeHouse(first) && looksLikeHouse(second)) {
                          addressLine1Next = second;
                          addressLine2Next = [first, ...addressPartsRaw.slice(2)].filter(Boolean).join(', ');
                        } else {
                          addressLine1Next = first;
                          addressLine2Next = addressPartsRaw.slice(1).join(', ');
                        }
                      } else if (addressPartsRaw.length === 1) {
                        if (looksLikeHouse(addressPartsRaw[0])) addressLine1Next = addressPartsRaw[0];
                        else addressLine2Next = addressPartsRaw[0];
                      }
                    }

                    setAddressLine1(addressLine1Next || '');
                    setAddressLine2(addressLine2Next || '');

                    if (nextState) {
                      setState(nextState);
                      setCity('');
                      setLocality('');
                    }

                    const finalCity = nextCity || rawPlace;
                    if (finalCity) setCity(finalCity);

                    // IMPORTANT: programmatic fill should NOT trigger Mapbox suggestions
                    setLocalityTyped(false);
                    setLocalitySuggestions([]);

                    // Preferred: Mapbox neighborhood/locality token, then DB/local fallback logic
                    const localityCandidate = rawPolice || rawNeighborhood || rawLocality || nextLocality || matchFromOptions(rawLocalityValue, localityOptions);
                    if (localityCandidate) setLocality(localityCandidate);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'Failed to detect current location.');
                  }
                })()}
                style={{ alignSelf: 'flex-start' } as any}>
                <XStack alignItems="center" gap="$2" paddingVertical={4}>
                  <View
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 10,
                      borderWidth: 2,
                      borderColor: theme.info,
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative',
                    }}>
                    <View style={{ width: 6, height: 6, borderRadius: 6, backgroundColor: theme.info }} />
                    <View style={{ position: 'absolute', width: 16, height: 2, backgroundColor: theme.info }} />
                    <View style={{ position: 'absolute', width: 2, height: 16, backgroundColor: theme.info }} />
                  </View>
                  <Text fontSize={14} fontWeight="900" color={theme.info}>
                    Use Current Location
                  </Text>
                </XStack>
              </Pressable>

              <YStack gap="$2">
                <Text fontSize={14} fontWeight="700" color={theme.textSecondary}>
                  Address line 2
                </Text>
                <Input
                  value={addressLine2}
                  onChangeText={setAddressLine2}
                  placeholder="Street / landmark"
                  backgroundColor={theme.bgCard}
                  borderColor={theme.border}
                  color={theme.text}
                />
              </YStack>

              <YStack gap="$2">
                <Text fontSize={14} fontWeight="700" color={theme.textSecondary}>
                  Locality
                </Text>
                <Input
                  value={locality}
                  onChangeText={(v) => {
                    setLocality(v);
                    setLocalityTyped(true);
                  }}
                  placeholder="Search locality"
                  backgroundColor={theme.bgCard}
                  borderColor={theme.border}
                  color={theme.text}
                />
              </YStack>

              {localityTyped && localityOptions.length && locality.trim() ? (
                <XStack gap="$2" flexWrap="wrap" alignItems="center">
                  <Text fontSize={13} fontWeight="700" color={theme.textMuted}>
                    Locality suggestions:
                  </Text>
                  {localityOptions
                    .filter((x) => x.toLowerCase().includes(locality.trim().toLowerCase()))
                    .slice(0, 6)
                    .map((l) => (
                      <Pressable
                        key={l}
                        onPress={() => {
                          setLocalityTyped(false);
                          setLocality(l);
                          setLocalitySuggestions([]);
                        }}>
                        <Text fontSize={13} fontWeight="900" color={theme.info}>
                          {l}
                        </Text>
                      </Pressable>
                    ))}
                </XStack>
              ) : null}

              {localityTyped && localitySuggestions.length ? (
                <YStack gap="$2">
                  {localitySuggestions.map((s) => (
                    <Pressable
                      key={s.id}
                      onPress={() => {
                        setLocalityTyped(false);
                        setLocality(s.label);
                        setLocalitySuggestions([]);
                      }}>
                      <YStack borderWidth={1} borderColor={theme.border} borderRadius={12} padding={10} backgroundColor={theme.bgCardSecondary}>
                        <Text color={theme.text} fontWeight="900" numberOfLines={1}>
                          {s.label}
                        </Text>
                        <Text color={theme.textMuted} fontSize={13} numberOfLines={1}>
                          {s.full}
                        </Text>
                      </YStack>
                    </Pressable>
                  ))}
                </YStack>
              ) : localityTyped && localityLoading ? (
                <Text color={theme.textMuted} fontSize={13}>
                  Searching...
                </Text>
              ) : null}

              <XStack gap="$2" flexWrap="wrap" justifyContent="space-between">
                <YStack gap="$2" style={{ flexBasis: '49%' } as any}>
                  <Text fontSize={14} fontWeight="700" color={theme.textSecondary}>
                    State
                  </Text>
                  <Pressable onPress={() => setStatePickerOpen(true)}>
                    <YStack backgroundColor={theme.bgCard} borderRadius={12} padding={12} borderWidth={1} borderColor={theme.border}>
                      <Text fontSize={13} fontWeight="800" color={theme.textMuted}>
                        Select
                      </Text>
                      <Text fontSize={15} fontWeight="900" color={theme.text} numberOfLines={1}>
                        {state || 'State'}
                      </Text>
                    </YStack>
                  </Pressable>
                </YStack>
                <YStack gap="$2" style={{ flexBasis: '49%' } as any}>
                  <Text fontSize={14} fontWeight="700" color={theme.textSecondary}>
                    City
                  </Text>
                  <Pressable onPress={() => setCityPickerOpen(true)}>
                    <YStack backgroundColor={theme.bgCard} borderRadius={12} padding={12} borderWidth={1} borderColor={theme.border}>
                      <Text fontSize={13} fontWeight="800" color={theme.textMuted}>
                        Select
                      </Text>
                      <Text fontSize={15} fontWeight="900" color={theme.text} numberOfLines={1}>
                        {city || 'City'}
                      </Text>
                    </YStack>
                  </Pressable>
                </YStack>
              </XStack>

              <XStack gap="$2" flexWrap="wrap" justifyContent="space-between">
                <YStack gap="$2" style={{ flexBasis: '49%' } as any}>
                  <Text fontSize={14} fontWeight="700" color={theme.textSecondary}>
                    Preferred date
                  </Text>
                  {Platform.OS === 'web'
                    ? React.createElement('input', {
                        type: 'date',
                        min: new Date().toISOString().slice(0, 10),
                        value: toISODateFromDDMMYYYY(preferredDate) || '',
                        style: {
                          width: '100%',
                          maxWidth: '100%',
                          minWidth: 0,
                          boxSizing: 'border-box',
                          display: 'block',
                          height: 46,
                          fontSize: 16,
                          padding: '10px 12px',
                          borderRadius: 12,
                          border: '1px solid ' + theme.border,
                          outline: 'none',
                          background: theme.bgCard,
                          color: theme.text,
                        },
                        onFocus: (e: any) => {
                          try {
                            e?.target?.showPicker?.();
                          } catch {}
                        },
                        onClick: (e: any) => {
                          try {
                            e?.target?.showPicker?.();
                          } catch {}
                        },
                        onChange: (e: any) => {
                          const iso = String(e?.target?.value ?? '');
                          const next = fromISOToDDMMYYYY(iso);
                          if (next) setPreferredDate(next);
                        },
                      } as any)
                    : (
                        <Pressable onPress={() => setDatePickerOpen(true)}>
                          <Input
                            value={preferredDate}
                            editable={false}
                            placeholder="DD/MM/YYYY"
                            backgroundColor={theme.bgCard}
                            borderColor={theme.border}
                            color={theme.text}
                          />
                        </Pressable>
                      )}
                </YStack>
                <YStack gap="$2" style={{ flexBasis: '49%' } as any}>
                  <Text fontSize={14} fontWeight="700" color={theme.textSecondary}>
                    Preferred time
                  </Text>
                  {Platform.OS === 'web'
                    ? React.createElement('input', {
                        type: 'time',
                        value: preferredTime || '',
                        style: {
                          width: '100%',
                          maxWidth: '100%',
                          minWidth: 0,
                          boxSizing: 'border-box',
                          display: 'block',
                          height: 46,
                          fontSize: 16,
                          padding: '10px 12px',
                          borderRadius: 12,
                          border: '1px solid ' + theme.border,
                          outline: 'none',
                          background: theme.bgCard,
                          color: theme.text,
                        },
                        onFocus: (e: any) => {
                          try {
                            e?.target?.showPicker?.();
                          } catch {}
                        },
                        onClick: (e: any) => {
                          try {
                            e?.target?.showPicker?.();
                          } catch {}
                        },
                        onChange: (e: any) => {
                          const t = String(e?.target?.value ?? '').trim();
                          if (t) setPreferredTime(t);
                        },
                      } as any)
                    : (
                        <Pressable onPress={() => setTimePickerOpen(true)}>
                          <Input
                            value={preferredTime}
                            editable={false}
                            placeholder="Select time"
                            backgroundColor={theme.bgCard}
                            borderColor={theme.border}
                            color={theme.text}
                          />
                        </Pressable>
                      )}
                </YStack>
              </XStack>

              <YStack gap="$2">
                <Text fontSize={14} fontWeight="700" color={theme.textSecondary}>
                  Notes
                </Text>
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Describe the issue"
                  placeholderTextColor={theme.textMuted}
                  multiline
                  style={{
                    borderWidth: 1,
                    borderColor: theme.border,
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    minHeight: 90,
                    backgroundColor: theme.bgCard,
                    color: theme.text,
                    textAlignVertical: 'top',
                  }}
                />
              </YStack>
            </YStack>
          ) : null}

          {step === 'uploads' ? (
            <YStack backgroundColor={theme.bgCard} borderRadius={14} padding={16} borderWidth={1} borderColor={theme.border} gap="$3">
              <Text fontSize={18} fontWeight="800" color="#1F4E79">
                Upload Photos / Videos
              </Text>
              <Paragraph color={theme.textMuted}>
                JPG/JPEG only. Videos: MP4 only (max 30s, 10MB). Images max 10MB upload; will be compressed server-side.
              </Paragraph>

              <XStack gap="$2" flexWrap="wrap">
                <Button backgroundColor="#1F4E79" color="#FFFFFF" hoverStyle={{ backgroundColor: '#1F4E79' }} pressStyle={{ backgroundColor: '#1F4E79' }} onPress={() => void pickPhotos()}>
                  Add Photos ({photos.length}/10)
                </Button>
                <Button backgroundColor={theme.bgSecondary} color="#FFFFFF" onPress={() => void pickVideo()}>
                  Add Video ({videos.length}/2)
                </Button>
              </XStack>

              {photos.length || videos.length ? (
                <YStack gap="$2">
                  <Text fontWeight="800" color={theme.text}>
                    Selected
                  </Text>
                  {photos.map((u) => (
                    <XStack key={u} alignItems="center" justifyContent="space-between" gap="$2">
                      <Pressable
                        onPress={() => {
                          setMediaViewerKind('photo');
                          setMediaViewerIndex(Math.max(0, photos.findIndex((x) => x === u)));
                          setMediaViewerOpen(true);
                        }}
                        style={{ flex: 1 } as any}>
                        <XStack flex={1} alignItems="center" gap="$2">
                          <View style={{ width: 44, height: 34, borderRadius: 8, overflow: 'hidden', backgroundColor: theme.bgCardSecondary }}>
                            <Image source={{ uri: u }} style={{ width: 44, height: 34 }} resizeMode="cover" />
                          </View>
                          <Text numberOfLines={1} color={theme.textMuted}>
                            Photo
                          </Text>
                        </XStack>
                      </Pressable>
                      <Button
                        size="$2"
                        backgroundColor={theme.danger}
                        color="#FFFFFF"
                        onPress={() => setPhotos((p) => p.filter((x) => x !== u))}>
                        Remove
                      </Button>
                    </XStack>
                  ))}
                  {videos.map((u) => (
                    <XStack key={u} alignItems="center" justifyContent="space-between" gap="$2">
                      <Pressable
                        onPress={() => {
                          setMediaViewerKind('video');
                          setMediaViewerIndex(Math.max(0, videos.findIndex((x) => x === u)));
                          setMediaViewerOpen(true);
                        }}
                        style={{ flex: 1 } as any}>
                        <XStack flex={1} alignItems="center" gap="$2">
                          <View style={{ width: 44, height: 34, borderRadius: 8, overflow: 'hidden', backgroundColor: theme.bg }}>
                            <Video
                              source={{ uri: u }}
                              style={{ width: 44, height: 34 }}
                              resizeMode={ResizeMode.COVER}
                              isMuted
                              shouldPlay={false}
                            />
                          </View>
                          <Text numberOfLines={1} color={theme.textMuted}>
                            Video
                          </Text>
                        </XStack>
                      </Pressable>
                      <Button
                        size="$2"
                        backgroundColor={theme.danger}
                        color="#FFFFFF"
                        onPress={() => setVideos((p) => p.filter((x) => x !== u))}>
                        Remove
                      </Button>
                    </XStack>
                  ))}
                </YStack>
              ) : null}
              {uploadError ? (
                <YStack backgroundColor={theme.danger} borderRadius={12} padding={10} borderWidth={0} marginTop={12}>
                  <Text color="#FFFFFF" fontWeight="800">{uploadError}</Text>
                </YStack>
              ) : null}
            </YStack>
          ) : null}

          {step === 'payment' ? (
            <YStack backgroundColor={theme.bgCard} borderRadius={14} padding={16} borderWidth={1} borderColor={theme.border} gap="$3">
              <Text fontSize={18} fontWeight="800" color="#1F4E79">
                Payment Option
              </Text>
              <Paragraph color={theme.textMuted}>
                Choose how you would like to pay for this service.
              </Paragraph>

              <Pressable
                onPress={() => setPaymentOption('online_now')}
                style={({ pressed }: any) => [{
                  padding: 14,
                  borderRadius: 12,
                  borderWidth: 2,
                  borderColor: paymentOption === 'online_now' ? '#22C55E' : theme.border,
                  backgroundColor: paymentOption === 'online_now' ? '#052E16' : theme.bgCardSecondary,
                  opacity: pressed ? 0.85 : 1,
                } as any]}>
                <YStack gap="$1">
                  <Text color={paymentOption === 'online_now' ? '#22C55E' : theme.text} fontWeight="900" fontSize={17}>
                    Pay Online Now
                  </Text>
                  <Text color={paymentOption === 'online_now' ? '#86EFAC' : theme.textMuted} fontSize={14}>
                    Pay ₹150 advance now via card/UPI/net banking. Review summary then pay.
                  </Text>
                </YStack>
              </Pressable>

              <Pressable
                onPress={() => setPaymentOption('after_service')}
                style={({ pressed }: any) => [{
                  padding: 14,
                  borderRadius: 12,
                  borderWidth: 2,
                  borderColor: paymentOption === 'after_service' ? '#22C55E' : theme.border,
                  backgroundColor: paymentOption === 'after_service' ? '#052E16' : theme.bgCardSecondary,
                  opacity: pressed ? 0.85 : 1,
                } as any]}>
                <YStack gap="$1">
                  <Text color={paymentOption === 'after_service' ? '#22C55E' : theme.text} fontWeight="900" fontSize={17}>
                    Pay After Service
                  </Text>
                  <Text color={paymentOption === 'after_service' ? '#86EFAC' : theme.textMuted} fontSize={14}>
                    No upfront payment. Pay online or in cash after the service is completed.
                  </Text>
                </YStack>
              </Pressable>
            </YStack>
          ) : null}

          {step === 'review' ? (
            <YStack backgroundColor={theme.bgCard} borderRadius={14} padding={16} borderWidth={1} borderColor={theme.border} gap="$3">
              <Text fontSize={18} fontWeight="800" color="#1F4E79">
                Review
              </Text>

              <YStack gap="$1">
                <Text color={theme.textMuted} fontWeight="700">
                  Name
                </Text>
                <Text color={theme.text} fontWeight="900" style={{ fontFamily: 'Times New Roman', color: theme.textSecondary } as any}>
                  {customerName.trim() || 'Not provided'}
                </Text>
              </YStack>

              <YStack gap="$1">
                <Text color={theme.textMuted} fontWeight="700">
                  Service
                </Text>
                <Text color={theme.text} fontWeight="900" style={{ fontFamily: 'Times New Roman', color: theme.textSecondary } as any}>
                  {serviceOptions.find((x) => x.key === serviceKey)?.label ?? serviceKey}
                </Text>
              </YStack>

              <YStack gap="$1">
                <Text color={theme.textMuted} fontWeight="700">
                  Phone
                </Text>
                <Text color={theme.text} fontWeight="900" style={{ fontFamily: 'Times New Roman', color: theme.textSecondary } as any}>
                  {countryCode}{normalizePhoneDigits(customerPhone)}
                </Text>
              </YStack>

              <YStack gap="$1">
                <Text color={theme.textMuted} fontWeight="700">
                  Location
                </Text>
                <Text color={theme.text} fontWeight="900" style={{ fontFamily: 'Times New Roman', color: theme.textSecondary } as any}>
                  {addressLine1 || addressLine2 || locality || city || state
                    ? `${addressLine1}${addressLine1 ? ', ' : ''}${addressLine2}${addressLine2 ? ', ' : ''}${locality}${locality ? ', ' : ''}${city}${city ? ', ' : ''}${state}`
                    : 'Not provided'}
                </Text>
              </YStack>

              <YStack gap="$1">
                <Text color={theme.textMuted} fontWeight="700">
                  Preferred date & time
                </Text>
                <Text color={theme.text} fontWeight="900" style={{ fontFamily: 'Times New Roman', color: theme.textSecondary } as any}>
                  {preferredDate && preferredTime ? `${preferredDate}, ${preferredTime}` : 'Not provided'}
                </Text>
              </YStack>

              <YStack gap="$1">
                <Text color={theme.textMuted} fontWeight="700">
                  Remark
                </Text>
                <Text color={theme.text} fontWeight="900" style={{ fontFamily: 'Times New Roman', color: theme.textSecondary } as any}>
                  {notes.trim() || 'Not provided'}
                </Text>
              </YStack>

              <YStack gap="$1">
                <Text color={theme.textMuted} fontWeight="700">
                  Payment
                </Text>
                <Text color={theme.text} fontWeight="900" style={{ fontFamily: 'Times New Roman', color: theme.textSecondary } as any}>
                  {paymentOption === 'online_now' ? 'Pay Online Now (₹150 advance)' : 'Pay After Service'}
                </Text>
              </YStack>

              <YStack gap="$1">
                <Text color={theme.textMuted} fontWeight="700">
                  Uploads
                </Text>
                <XStack gap="$3" flexWrap="wrap" alignItems="center">
                  <Pressable
                    disabled={!photos.length}
                    onPress={() => {
                      if (!photos.length) return;
                      setMediaViewerKind('photo');
                      setMediaViewerIndex(0);
                      setMediaViewerOpen(true);
                    }}>
                    <Text
                      color={photos.length ? theme.info : theme.textMuted}
                      fontWeight="900"
                      style={{ textDecorationLine: photos.length ? 'underline' : 'none', fontFamily: 'Times New Roman' } as any}>
                      {photos.length} photos (View)
                    </Text>
                  </Pressable>

                  <Pressable
                    disabled={!videos.length}
                    onPress={() => {
                      if (!videos.length) return;
                      setMediaViewerKind('video');
                      setMediaViewerIndex(0);
                      setMediaViewerOpen(true);
                    }}>
                    <Text
                      color={videos.length ? theme.info : theme.textMuted}
                      fontWeight="900"
                      style={{ textDecorationLine: videos.length ? 'underline' : 'none', fontFamily: 'Times New Roman' } as any}>
                      {videos.length} videos (View)
                    </Text>
                  </Pressable>
                </XStack>
              </YStack>
            </YStack>
          ) : null}

          {error && step !== 'details' ? (
            <YStack backgroundColor={theme.bgCardSecondary} borderRadius={12} padding={12} borderWidth={1} borderColor={theme.danger}>
              <Text color={theme.danger} fontWeight="800">
                {error}
              </Text>
            </YStack>
          ) : null}
        </YStack>
      </ScrollView>

      <YStack position="absolute" bottom={0} left={0} right={0} backgroundColor={theme.bgCard} padding={14} borderTopWidth={1} borderTopColor={theme.border}>
        <XStack gap="$2" justifyContent="space-between" alignItems="center" flexWrap="wrap">
          <Button
            disabled={saving}
            backgroundColor={theme.bgSecondary}
            borderWidth={1}
            borderColor={theme.border}
            color={theme.text}
            hoverStyle={{ backgroundColor: theme.bgCard, borderColor: theme.border, color: theme.text } as any}
            pressStyle={{ backgroundColor: theme.bgCard, borderColor: theme.border, color: theme.text } as any}
            focusStyle={{ backgroundColor: theme.bgCard, borderColor: theme.border, color: theme.text } as any}
            onPress={goBack}>
            Back
          </Button>

          {step === 'details' && detailsAttempted && detailsBlocker ? (
            <Text color={theme.danger} fontSize={13} fontWeight="800" style={{ flex: 1, textAlign: 'center' } as any} numberOfLines={2}>
              {detailsBlocker}
            </Text>
          ) : (
            <View style={{ flex: 1 }} />
          )}

          {step !== 'review' ? (
            <Button
              disabled={saving}
              backgroundColor={theme.success}
              color="#FFFFFF"
hoverStyle={{ backgroundColor: theme.success, color: '#FFFFFF' } as any}
            pressStyle={{ backgroundColor: theme.primaryHover, color: '#FFFFFF' } as any}
            focusStyle={{ backgroundColor: theme.success, color: '#FFFFFF' } as any}
              onPress={goNext}>
              Next
            </Button>
          ) : (
            <Button
              disabled={saving}
              backgroundColor={theme.success}
              color="#FFFFFF"
hoverStyle={{ backgroundColor: theme.success, color: '#FFFFFF' } as any}
            pressStyle={{ backgroundColor: theme.primaryHover, color: '#FFFFFF' } as any}
            focusStyle={{ backgroundColor: theme.success, color: '#FFFFFF' } as any}
              onPress={() => void handleSubmit()}>
              {saving ? 'Submitting…' : 'Submit Request'}
            </Button>
          )}
        </XStack>
      </YStack>

      <Modal visible={countryCodePickerOpen} transparent animationType="fade" onRequestClose={() => setCountryCodePickerOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'center', padding: 16 }} onPress={() => setCountryCodePickerOpen(false)}>
          <Pressable onPress={() => {}} style={{ backgroundColor: theme.bgCard, borderRadius: 16, padding: 14, maxHeight: 420 }}>
            <XStack alignItems="center" justifyContent="space-between" marginBottom={10}>
              <Text color={theme.text} fontSize={18} fontWeight="900">
                Select Country Code
              </Text>
              <Pressable onPress={() => setCountryCodePickerOpen(false)}>
                <Text color={theme.textMuted} fontSize={26} fontWeight="900">
                  ×
                </Text>
              </Pressable>
            </XStack>
            <ScrollView showsVerticalScrollIndicator={false}>
              {countryCodeOptions.map((c) => (
                <Pressable
                  key={c.label}
                  onPress={() => {
                    setCountryCode(c.value);
                    setCountryCodePickerOpen(false);
                  }}>
                  <XStack
                    alignItems="center"
                    justifyContent="space-between"
                    paddingVertical={12}
                    paddingHorizontal={12}
                    borderRadius={12}
                    backgroundColor={c.value === countryCode ? theme.bgCardSecondary : 'transparent'}>
                    <Text color={theme.text} fontWeight="800">
                      {c.label}
                    </Text>
                    <Text color={theme.textMuted} fontWeight="900">
                      {c.value === countryCode ? '✓' : ''}
                    </Text>
                  </XStack>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={statePickerOpen} transparent animationType="fade" onRequestClose={() => setStatePickerOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'center', padding: 16 }} onPress={() => setStatePickerOpen(false)}>
          <Pressable onPress={() => {}} style={{ backgroundColor: theme.bgCard, borderRadius: 16, padding: 14, maxHeight: 420 }}>
            <XStack alignItems="center" justifyContent="space-between" marginBottom={10}>
              <Text color={theme.text} fontSize={18} fontWeight="900">
                Select State
              </Text>
              <Pressable onPress={() => setStatePickerOpen(false)}>
                <Text color={theme.textMuted} fontSize={26} fontWeight="900">
                  ×
                </Text>
              </Pressable>
            </XStack>
            <ScrollView showsVerticalScrollIndicator={false}>
              {stateOptions.map((st) => (
                <Pressable
                  key={st}
                  onPress={() => {
                    setState(st);
                    setCity('');
                    setLocality('');
                    setStatePickerOpen(false);
                  }}>
                  <XStack
                    alignItems="center"
                    justifyContent="space-between"
                    paddingVertical={12}
                    paddingHorizontal={12}
                    borderRadius={12}
                    backgroundColor={st === state ? theme.bgCardSecondary : 'transparent'}>
                    <Text color={theme.text} fontWeight="800">
                      {st}
                    </Text>
                    <Text color={theme.textMuted} fontWeight="900">
                      {st === state ? '✓' : ''}
                    </Text>
                  </XStack>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={cityPickerOpen} transparent animationType="fade" onRequestClose={() => setCityPickerOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'center', padding: 16 }} onPress={() => setCityPickerOpen(false)}>
          <Pressable onPress={() => {}} style={{ backgroundColor: theme.bgCard, borderRadius: 16, padding: 14, maxHeight: 420 }}>
            <XStack alignItems="center" justifyContent="space-between" marginBottom={10}>
              <Text color={theme.text} fontSize={18} fontWeight="900">
                Select City
              </Text>
              <Pressable onPress={() => setCityPickerOpen(false)}>
                <Text color={theme.textMuted} fontSize={26} fontWeight="900">
                  ×
                </Text>
              </Pressable>
            </XStack>
            <ScrollView showsVerticalScrollIndicator={false}>
              {!state ? (
                <Text color={theme.textMuted} paddingHorizontal={12} paddingVertical={8}>
                  Select a state first.
                </Text>
              ) : null}
              {(cityOptions ?? []).map((ct) => (
                <Pressable
                  key={ct}
                  onPress={() => {
                    setCity(ct);
                    setLocality('');
                    setCityPickerOpen(false);
                  }}>
                  <XStack
                    alignItems="center"
                    justifyContent="space-between"
                    paddingVertical={12}
                    paddingHorizontal={12}
                    borderRadius={12}
                    backgroundColor={ct === city ? theme.bgCardSecondary : 'transparent'}>
                    <Text color={theme.text} fontWeight="800">
                      {ct}
                    </Text>
                    <Text color={theme.textMuted} fontWeight="900">
                      {ct === city ? '✓' : ''}
                    </Text>
                  </XStack>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {Platform.OS !== 'web' && datePickerOpen ? (
        <DateTimePicker
          value={parseDateDDMMYYYY(preferredDate) ?? new Date()}
          minimumDate={new Date()}
          mode="date"
          display="default"
          onChange={(_, date) => {
            setDatePickerOpen(false);
            if (date) setPreferredDate(formatDateDDMMYYYY(date));
          }}
        />
      ) : null}

      {Platform.OS !== 'web' && timePickerOpen ? (
        <DateTimePicker
          value={new Date()}
          mode="time"
          display="default"
          onChange={(_, date) => {
            setTimePickerOpen(false);
            if (!date) return;
            const t = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            setPreferredTime(t);
          }}
        />
      ) : null}

      {Platform.OS === 'web' && datePickerOpen ? null : null}

      {Platform.OS === 'web' && timePickerOpen ? null : null}

      <Modal visible={mediaViewerOpen} transparent animationType="fade" onRequestClose={() => setMediaViewerOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(2, 6, 23, 0.92)', padding: 16, justifyContent: 'center' }}>
          <XStack alignItems="center" justifyContent="space-between" marginBottom={12}>
            <Text color="#FFFFFF" fontSize={18} fontWeight="900">
              {mediaViewerKind === 'photo' ? 'Photo' : 'Video'} {mediaViewerIndex + 1}/
              {mediaViewerKind === 'photo' ? photos.length : videos.length}
            </Text>
            <Pressable onPress={() => setMediaViewerOpen(false)}>
              <Text color={theme.textMuted} fontSize={28} fontWeight="900">
                ×
              </Text>
            </Pressable>
          </XStack>

          <View style={{ backgroundColor: theme.bg, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(148, 163, 184, 0.35)' }}>
            {mediaViewerKind === 'photo' ? (
              <Image
                key={mediaViewerIndex}
                source={{ uri: photos[mediaViewerIndex] }}
                style={{ width: '100%', height: Math.min(520, Math.max(260, screenWidth * 0.5)) }}
                resizeMode="contain"
              />
            ) : (
              <Video
                key={mediaViewerIndex}
                source={{ uri: videos[mediaViewerIndex] }}
                style={{ width: '100%', height: Math.min(520, Math.max(260, screenWidth * 0.5)) }}
                resizeMode={ResizeMode.CONTAIN}
                useNativeControls
                shouldPlay
              />
            )}
          </View>

          <XStack marginTop={12} gap="$2" justifyContent="space-between" alignItems="center" flexWrap="wrap">
            <Button
              backgroundColor={theme.bgSecondary}
              color={theme.text}
              borderWidth={1}
              borderColor={theme.border}
              disabled={mediaViewerIndex <= 0}
              onPress={() => setMediaViewerIndex((i) => Math.max(0, i - 1))}>
              Prev
            </Button>
            <Button
              backgroundColor={theme.bgSecondary}
              color={theme.text}
              borderWidth={1}
              borderColor={theme.border}
              disabled={mediaViewerIndex >= (mediaViewerKind === 'photo' ? photos.length - 1 : videos.length - 1)}
              onPress={() =>
                setMediaViewerIndex((i) =>
                  Math.min(mediaViewerKind === 'photo' ? photos.length - 1 : videos.length - 1, i + 1)
                )
              }>
              Next
            </Button>
          </XStack>
        </View>
      </Modal>

      <Modal
        visible={otpOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (otpVerifying) return;
          setOtpOpen(false);
        }}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.65)', justifyContent: 'center', padding: 16 }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: theme.bgCard, borderRadius: 16, padding: 18, width: '100%', maxWidth: 720, alignSelf: 'center' }}>
            <XStack alignItems="center" justifyContent="space-between" marginBottom={8}>
              <Text color={theme.text} fontSize={18} fontWeight="900">
                Verify OTP
              </Text>
              <Pressable
                onPress={() => {
                  if (otpVerifying) return;
                  setOtpOpen(false);
                }}>
                <Text color={theme.textMuted} fontSize={26} fontWeight="900">
                  ×
                </Text>
              </Pressable>
            </XStack>

            <YStack marginBottom={12} gap="$1">
              <Paragraph color={theme.textSecondary} fontWeight="700">
                Enter the 6-digit code sent to {countryCode}
                {normalizePhoneDigits(customerPhone)}
              </Paragraph>
              {otpExpiryTime ? (
                <Text color={theme.textMuted} fontSize={14} fontWeight="600">
                  Code expires in 10 minutes
                </Text>
              ) : null}
            </YStack>

            <XStack gap="$2" justifyContent="space-between" marginBottom={12}>
              {otpDigits.map((d, idx) => (
                <TextInput
                  key={idx}
                  ref={(r) => {
                    otpRefs.current[idx] = r;
                  }}
                  value={d}
                  onChangeText={(v) => {
                    const digit = String(v ?? '').replace(/\D/g, '').slice(-1);
                    setOtpDigits((prev) => {
                      const next = [...prev];
                      next[idx] = digit;
                      return next;
                    });
                    if (digit && idx < 5) {
                      try {
                        otpRefs.current[idx + 1]?.focus?.();
                      } catch {
                        // ignore
                      }
                    }
                  }}
                  onKeyPress={(e: any) => {
                    const key = e?.nativeEvent?.key;
                    if (key === 'Enter' || key === 'Return') {
                      // if Enter pressed on last input, trigger verify
                      if (idx === 5) {
                        void verifyOtpAndSubmit();
                        return;
                      }
                      return;
                    }
                    if (key !== 'Backspace') return;
                    if (otpDigits[idx]) return;
                    if (idx <= 0) return;
                    try {
                      otpRefs.current[idx - 1]?.focus?.();
                    } catch {
                      // ignore
                    }
                  }}
                  keyboardType={Platform.OS === 'web' ? 'default' : 'number-pad'}
                  inputMode={Platform.OS === 'web' ? ('numeric' as any) : undefined}
                  maxLength={1}
                  style={{
                    width: 56,
                    height: 64,
                    borderWidth: 1,
                    borderColor: theme.border,
                    borderRadius: 14,
                    textAlign: 'center',
                    fontSize: 22,
                    fontWeight: '900',
                    color: theme.text,
                    backgroundColor: theme.bgCard,
                  }}
                />
              ))}
            </XStack>

            {error ? (
              <YStack backgroundColor={theme.danger} borderRadius={12} padding={10} borderWidth={0} marginBottom={12}>
                <Text color="#FFFFFF" fontWeight="800">
                  {error}
                </Text>
              </YStack>
            ) : null}

            <XStack gap="$2" justifyContent="space-between" flexWrap="wrap">
              <Button backgroundColor={theme.bgSecondary} color={theme.text} borderWidth={1} borderColor={theme.border} disabled={otpSending || otpVerifying} onPress={() => void sendOtp()} style={{ minWidth: 140, padding: 12, borderRadius: 10 }}>
                <Text fontWeight="700" color={theme.text}>{otpSending ? 'Sending...' : 'Resend OTP'}</Text>
              </Button>
              <Button backgroundColor="#1F4E79" color="#FFFFFF" hoverStyle={{ backgroundColor: '#1539AB' }} pressStyle={{ backgroundColor: '#0E2B5F' }} disabled={otpVerifying} style={{ padding: 12, borderRadius: 10 }}>
                <Text fontWeight="700" color="#FFFFFF" onPress={() => void verifyOtpAndSubmit()}>{otpVerifying ? 'Verifying...' : 'Verify & Submit'}</Text>
              </Button>
            </XStack>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
