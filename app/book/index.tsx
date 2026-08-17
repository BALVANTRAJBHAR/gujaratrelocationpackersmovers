import { Audio, ResizeMode, Video } from 'expo-av';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import { Image as ExpoImage } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Linking, Modal, Platform, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RazorpayCheckout from 'react-native-razorpay';
import { Button, Dialog, H4, Input, Paragraph, Text, XStack, YStack } from 'tamagui';

import BookingMapPicker from '@/components/booking-map-picker';
import PageHeader from '@/components/PageHeader';
import { themes } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getRouteDistance, reverseGeocode, searchPlaces } from '@/lib/google-maps';
import { getGoogleMapsKey, getRazorpayKeyId } from '@/lib/public-config';
import { createRazorpayOrder, verifyRazorpaySignature } from '@/lib/razorpay';
import { calculateConvenienceFee } from '@/lib/payment-convenience-fee';
import { supabase } from '@/lib/supabase';

import { findExistingUserByPhone } from '@/lib/user-duplicate-check';
import { useSession } from '@/providers/session-provider';
import { getOrCreateTermsPdfUri, downloadLegalPdf, openLegalPdf } from '@/lib/legal-docs';
import { t } from '@/constants/typography';
import MobileDatePicker from '@/components/MobileDatePicker';
import { getWalletBalance, debitWallet, creditWallet, rewardReferralOnBooking } from '@/lib/wallet';

const resolveVehicleImageUrl = (value: string | null | undefined) => {
  const v = String(value ?? '').trim();
  if (!v) return '';
  if (v.startsWith('http://') || v.startsWith('https://')) return v;
  const { data } = supabase.storage.from('vehicle-images').getPublicUrl(v);
  return data?.publicUrl ?? '';
};

type StepKey = 'info' | 'location' | 'vehicle' | 'items' | 'payment';

type BookingFormState = {
  fullName: string;
  mobile: string;
  email: string;
  moveType: 'home' | 'office' | 'vehicle' | 'storage' | 'local' | 'domestic' | '';

  pickupAddress: string;
  pickupCoords: [number, number] | null;
  pickupFloor: string;
  pickupLift: boolean;

  dropAddress: string;
  dropCoords: [number, number] | null;
  dropFloor: string;
  dropLift: boolean;

  vehicleId: string;
  laborers: number;
  shiftingDate: string;
  preferredTime: string;

  boxCount: number;
  itemDescription: string;
  photos: string[];
  videos: string[];

  coupon: string;
  advanceAmount: number;
  paymentMethod: 'upi' | 'card' | 'wallet' | '';
};

type PlaceItem = {
  id: string;
  place_name: string;
  center: [number, number];
};

type VehicleType = {
  id: string;
  name: string;
  description: string | null;
  capacity: string | null;
  image_url: string | null;
  base_price: number | null;
  per_km_price: number | null;
  labor_price: number | null;
};

type FloorOption = {
  id: string;
  label: string;
  sort_order: number | null;
  charge_with_lift: number | null;
  charge_without_lift: number | null;
  is_active: boolean | null;
};

type CouponRow = {
  id: string;
  code: string;
  title: string | null;
  discount_type: string | null;
  discount_value: number | null;
  max_discount: number | null;
  min_order_amount: number | null;
  is_active: boolean;
  valid_from: string | null;
  valid_until: string | null;
  usage_limit: number | null;
  used_count: number;
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

  return await RazorpayCheckout.open(options);
}

const MOVE_TYPES: { key: BookingFormState['moveType']; title: string; subtitle: string }[] = [
  { key: 'home', title: 'Home Shifting', subtitle: 'Residential relocation' },
  { key: 'office', title: 'Office Shifting', subtitle: 'Corporate moves' },
  { key: 'vehicle', title: 'Vehicle Transport', subtitle: 'Car & Bike' },
  { key: 'storage', title: 'Storage Service', subtitle: 'Warehousing' },
  { key: 'local', title: 'Local Move', subtitle: 'Within city' },
  { key: 'domestic', title: 'Domestic Move', subtitle: 'Interstate' },
];

const stepOrder: StepKey[] = ['info', 'location', 'vehicle', 'items', 'payment'];

const stepMeta: Record<StepKey, { label: string; index: number }> = {
  info: { label: 'Info', index: 0 },
  location: { label: 'Location', index: 1 },
  vehicle: { label: 'Vehicle', index: 2 },
  items: { label: 'Items', index: 3 },
  payment: { label: 'Payment', index: 4 },
};

const roundMoney = (value: number) => Math.round(Number.isFinite(value) ? value : 0);

const currency = (value: number) => `₹${roundMoney(value).toLocaleString('en-IN')}`;

const MAX_IMAGE_BYTES = 500 * 1024;
const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_BYTES = 30 * 1024 * 1024;
const MAX_VIDEO_DURATION_SEC = 300;
const COMPRESS_IMAGE_TARGET_BYTES = 500 * 1024;
const COMPRESS_VIDEO_TARGET_BYTES = 5 * 1024 * 1024;

const isAllowedJpeg = (value: string) => {
  const v = String(value ?? '').toLowerCase();
  return v.endsWith('.jpg') || v.endsWith('.jpeg') || v.includes('image/jpeg');
};

const isAllowedMp4 = (value: string) => {
  const v = String(value ?? '').toLowerCase();
  return v.endsWith('.mp4') || v.includes('video/mp4');
};

const TIME_SLOTS = [
  '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM',
  '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM',
  '5:00 PM', '6:00 PM', '7:00 PM', '8:00 PM', '9:00 PM',
];

const parseDateDdMmYyyy = (value: string) => {
  const v = String(value ?? '').trim();
  const m = /^([0-9]{2})-([0-9]{2})-([0-9]{4})$/.exec(v);
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  if (!dd || !mm || !yyyy) return null;
  const d = new Date(yyyy, mm - 1, dd);
  if (Number.isNaN(d.getTime())) return null;
  if (d.getFullYear() !== yyyy || d.getMonth() !== mm - 1 || d.getDate() !== dd) return null;
  return d;
};

const formatDateDdMmYyyy = (d: Date) => {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return `${dd}-${mm}-${yyyy}`;
};

const normalizeToIsoDate = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const parsed = parseDateDdMmYyyy(trimmed);
  if (parsed) {
    const yyyy = parsed.getFullYear();
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    const dd = String(parsed.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  const m = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (!m) return null;

  const dd = m[1].padStart(2, '0');
  const mm = m[2].padStart(2, '0');
  const yyyy = m[3];
  return `${yyyy}-${mm}-${dd}`;
};

const shiftingMinDate = () => {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
};

const shiftingMaxDate = () => {
  const t = new Date();
  t.setFullYear(t.getFullYear() + 2);
  t.setHours(23, 59, 59, 999);
  return t;
};

export default function BookingWizardScreen() {
  const router = useRouter();
  const { session, profile, refreshProfile, loading } = useSession();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isWide = screenWidth >= 820;
  const mediaViewerWidth = Math.min(screenWidth - 32, 720);
  const mediaViewerHeight = Math.min(screenHeight * 0.65, 520);
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? themes.dark : themes.light;
  const accentColor = colorScheme === 'dark' ? '#60A5FA' : '#1F4E79';
  const onAccentTextColor = colorScheme === 'dark' ? '#0F172A' : '#FFFFFF';
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace('/auth/login' as any);
    }
  }, [loading, session, router]);
  if (loading || !session) return null;
  const sharePdf = async (data: any): Promise<boolean> => {
    try {
      const { shareBookingPdf } = await import('@/lib/generate-booking-pdf');
      return await shareBookingPdf(data);
    } catch {
      return false;
    }
  };
  const downloadPdf = async (data: any): Promise<boolean> => {
    try {
      const { downloadBookingPdf } = await import('@/lib/generate-booking-pdf');
      return await downloadBookingPdf(data);
    } catch {
      return false;
    }
  };

  const inputUi = useMemo(
    () => ({
      backgroundColor: theme.inputBg,
      borderColor: theme.inputBorder,
      color: theme.inputText,
    }),
    [theme]
  );

  const otpInputUi = useMemo(
    () => ({
      backgroundColor: theme.inputBg,
      borderColor: accentColor,
      color: theme.inputText,
      placeholderTextColor: theme.textMuted,
      hoverStyle: {
        backgroundColor: theme.inputBg,
        borderColor: accentColor,
        color: theme.inputText,
      } as any,
      focusStyle: {
        backgroundColor: theme.inputBg,
        borderColor: accentColor,
        color: theme.inputText,
      } as any,
      pressStyle: {
        backgroundColor: theme.inputBg,
        borderColor: accentColor,
        color: theme.inputText,
      } as any,
      ...(Platform.OS === 'web'
        ? {
            style: {
              color: theme.inputText,
              WebkitTextFillColor: theme.inputText,
              caretColor: theme.inputText,
            } as any,
          }
        : { style: { color: theme.inputText } as any }),
    }),
    [theme]
  );

  const [step, setStep] = useState<StepKey>('info');
  const stepIndex = stepMeta[step].index;

  const [form, setForm] = useState<BookingFormState>({
    fullName: profile?.name ?? '',
    mobile: String(profile?.phone ?? '').trim(),
    email: profile?.email ?? '',
    moveType: '',

    pickupAddress: '',
    pickupCoords: null,
    pickupFloor: 'Ground Floor',
    pickupLift: false,

    dropAddress: '',
    dropCoords: null,
    dropFloor: 'Ground Floor',
    dropLift: false,

    vehicleId: '',
    laborers: 1,
    shiftingDate: '',
    preferredTime: '',

    boxCount: 0,
    itemDescription: '',
    photos: [],
    videos: [],

    coupon: '',
    advanceAmount: 1000,
    paymentMethod: 'upi',
  });

  const [activeLocationField, setActiveLocationField] = useState<'pickup' | 'drop' | null>(null);
  const [placeResults, setPlaceResults] = useState<PlaceItem[]>([]);
  const [loadingPlaces, setLoadingPlaces] = useState<boolean>(false);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [termsPdfUrl, setTermsPdfUrl] = useState<string | null>(null);

  const [googleMapsKey, setGoogleMapsKey] = useState('');
  const [mapPickerOpen, setMapPickerOpen] = useState(false);
  const [mapPickerTarget, setMapPickerTarget] = useState<'pickup' | 'drop'>('pickup');
  const [mapPickerCoord, setMapPickerCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [mapPickerBusy, setMapPickerBusy] = useState(false);

  const [floorPickerOpen, setFloorPickerOpen] = useState(false);
  const [floorPickerTarget, setFloorPickerTarget] = useState<'pickup' | 'drop'>('pickup');

  const [laborPickerOpen, setLaborPickerOpen] = useState(false);
  const [vehiclePickerOpen, setVehiclePickerOpen] = useState(false);
  const [boxPickerOpen, setBoxPickerOpen] = useState(false);
  const [mediaViewerOpen, setMediaViewerOpen] = useState(false);
  const [mediaViewerIndex, setMediaViewerIndex] = useState(0);
  const [mediaViewerList, setMediaViewerList] = useState<{ uri: string; type: 'photo' | 'video' }[]>([]);
  const [viewerVideoPlaying, setViewerVideoPlaying] = useState(true);
  const viewerVideoRef = useRef<Video>(null);
  const viewerWebVideoRef = useRef<HTMLVideoElement | null>(null);
  const [shiftingDateValue, setShiftingDateValue] = useState<Date | null>(null);
  const [shiftingDatePickerOpen, setShiftingDatePickerOpen] = useState(false);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const minDate = useMemo(() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; }, []);
  const maxDate = useMemo(() => { const t = new Date(); t.setFullYear(t.getFullYear() + 2); t.setHours(23, 59, 59, 999); return t; }, []);
  const [walletBalance, setWalletBalance] = useState(0);
  const [walletAmount, setWalletAmount] = useState(0);

  useEffect(() => {
    if (step !== 'info') return;
    const t = setTimeout(() => {
      mobileRef.current?.focus?.();
    }, 200);
    return () => clearTimeout(t);
  }, [step]);

  useEffect(() => {
    if (step === 'location') {
      if (!locationStepMountedRef.current) {
        locationStepMountedRef.current = true;
        const t = setTimeout(() => {
          setActiveLocationField('pickup');
          pickupRef.current?.focus?.();
        }, 200);
        return () => clearTimeout(t);
      }
    }

    if (step === 'vehicle') {
      const t = setTimeout(() => {
        if (!vehicleAutoOpenedRef.current) {
          vehicleAutoOpenedRef.current = true;
          setVehiclePickerOpen(true);
        }
        vehicleFieldRef.current?.focus?.();
      }, 200);
      return () => clearTimeout(t);
    }
  }, [step]);

  const [isCustomAdvance, setIsCustomAdvance] = useState(false);
  const [customAdvanceText, setCustomAdvanceText] = useState('');
  const [paymentMode, setPaymentMode] = useState<'advance' | 'full'>('advance');

  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponApplied, setCouponApplied] = useState<CouponRow | null>(null);
  const [couponApplying, setCouponApplying] = useState(false);

  useEffect(() => {
    if (!isCustomAdvance) return;
    setCustomAdvanceText((prev) => (prev ? prev : String(form.advanceAmount || '')));
  }, [form.advanceAmount, isCustomAdvance]);

  const [otpOpen, setOtpOpen] = useState(false);
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const otpRefs = useRef<any[]>([]);
  const mobileRef = useRef<any>(null);
  const pickupRef = useRef<any>(null);
  const vehicleFieldRef = useRef<any>(null);
  const vehicleAutoOpenedRef = useRef(false);
  const locationStepMountedRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [processingOpen, setProcessingOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [bookingData, setBookingData] = useState<any>(null);

  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [vehicleError, setVehicleError] = useState<string | null>(null);

  const [floorOptions, setFloorOptions] = useState<FloorOption[]>([]);
  const [loadingFloors, setLoadingFloors] = useState(false);
  const [floorError, setFloorError] = useState<string | null>(null);

  const selectedVehicle = useMemo(
    () => vehicleTypes.find((v) => v.id === form.vehicleId) ?? null,
    [form.vehicleId, vehicleTypes]
  );

  const withTimeout = async <T,>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> => {
    let timer: any;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    });
    try {
      return await Promise.race([Promise.resolve(promise), timeout]);
    } finally {
      clearTimeout(timer);
    }
  };

  const openMapPicker = (target: 'pickup' | 'drop') => {
    setError(null);
    setActiveLocationField(null);
    setPlaceResults([]);
    setMapPickerTarget(target);
    const existing = target === 'pickup' ? form.pickupCoords : form.dropCoords;
    if (existing?.length === 2) {
      setMapPickerCoord({ lng: existing[0], lat: existing[1] });
    } else {
      setMapPickerCoord({ lng: 72.8777, lat: 19.076 });
    }
    setMapPickerOpen(true);
  };

  /**
   * confirmMapPicker — called by BookingMapPicker on confirm.
   *
   * On mobile (native): the picker component performs Google reverse geocode
   * internally and passes the resolved address as `nativeResolvedAddress`.
   * We use that directly — no geocoding call needed on mobile.
   *
   * On web: nativeResolvedAddress is undefined, so we fall back to the
   * existing reverseGeocode() call (behaviour unchanged).
   */
  const confirmMapPicker = async (nativeResolvedAddress?: string) => {
    if (!mapPickerCoord) return;
    setMapPickerBusy(true);
    try {
      const coords: [number, number] = [mapPickerCoord.lng, mapPickerCoord.lat];
      let address = nativeResolvedAddress ?? '';

      // Web fallback: use reverse geocode if native didn't supply address
      if (!address && Platform.OS === 'web') {
        try {
          address = await reverseGeocode(mapPickerCoord.lng, mapPickerCoord.lat);
        } catch {
          address = '';
        }
      }

      if (mapPickerTarget === 'pickup') {
        setForm((p) => ({
          ...p,
          pickupCoords: coords,
          pickupAddress: address ? address : p.pickupAddress,
        }));
      } else {
        setForm((p) => ({
          ...p,
          dropCoords: coords,
          dropAddress: address ? address : p.dropAddress,
        }));
      }
      setActiveLocationField(null);
      setPlaceResults([]);
      setMapPickerOpen(false);
    } finally {
      setMapPickerBusy(false);
    }
  };

  const vehiclePricing = useMemo(() => {
    if (!selectedVehicle) return null;
    const baseFare = typeof selectedVehicle.base_price === 'number' ? selectedVehicle.base_price : 0;
    const perKm = typeof selectedVehicle.per_km_price === 'number' ? selectedVehicle.per_km_price : 0;
    const laborUnit = typeof selectedVehicle.labor_price === 'number' ? selectedVehicle.labor_price : 500;
    return { baseFare, perKm, laborUnit };
  }, [selectedVehicle]);

  const invokeEdgeFunction = async <T,>(name: string, body: unknown): Promise<T> => {
    const extra = (Constants as any)?.expoConfig?.extra ?? (Constants as any)?.manifest?.extra ?? {};
    const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? extra?.supabaseUrl ?? '';
    const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? extra?.supabaseAnonKey ?? '';
    if (!baseUrl || !anonKey) {
      throw new Error('Supabase env vars missing. Check EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.');
    }

    const u = String(baseUrl ?? '').trim();
    if (!/^https?:\/\//i.test(u)) {
      throw new Error(`Supabase URL is invalid: ${u || '(empty)'} (must start with https://<project>.supabase.co)`);
    }
    if ((Platform.OS === 'android' || Platform.OS === 'ios') && (u.includes('localhost') || u.includes('127.0.0.1'))) {
      throw new Error(`Supabase URL points to localhost (${u}). On a real device this will fail. Use https://<project>.supabase.co`);
    }

    const run = async () => {
      let res: Response;
      try {
        res = await fetch(`${u}/functions/v1/${name}`, {
          method: 'POST',
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body ?? {}),
        });
      } catch (e: any) {
        const msg = e?.message ? String(e.message) : 'Network request failed';
        throw new Error(`${msg} (Supabase URL: ${u})`);
      }

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
        const msg =
          parsed?.error ||
          parsed?.message ||
          text ||
          `Edge Function returned status ${res.status}`;
        throw new Error(`${msg} (status ${res.status}, Supabase URL: ${u})`);
      }

      return (parsed ?? {}) as T;
    };

    return await withTimeout(run(), 60000, name);
  };

  const sendOtp = async () => {
    setError(null);
    const phone = form.mobile;
    if (!phone || phone.replace(/\D/g, '').length !== 10) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }

    setOtpSending(true);
    try {
      const data = await invokeEdgeFunction<{ sent?: boolean; error?: string }>('send-booking-otp', {
        phone,
        purpose: 'booking',
        user_id: session?.user?.id ?? '',
      });
      if (data?.error) setError(String(data.error));
    } catch (e: any) {
      setError(e?.message ? String(e.message) : 'Failed to send OTP.');
    } finally {
      setOtpSending(false);
    }
  };

  useEffect(() => {
    if (!otpOpen) return;
    void sendOtp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otpOpen]);

  useEffect(() => {
    if (!otpOpen) return;
    if (Platform.OS !== 'android') return;

    let cancelled = false;
    let removeListener: null | (() => void) = null;

    const startListener = async () => {
      try {
        const mod = require('react-native-otp-verify');
        const RNOtpVerify = (mod?.default ?? mod) as any;
        if (!RNOtpVerify?.getOtp || !RNOtpVerify?.addListener) return;

        await RNOtpVerify.getOtp();
        const handler = (message: string) => {
          if (cancelled) return;
          const match = message?.match(/\b(\d{6})\b/);
          const code = match?.[1];
          if (!code) return;
          setOtpDigits(code.split(''));
        };
        RNOtpVerify.addListener(handler);
        removeListener = () => {
          try {
            RNOtpVerify.removeListener?.();
          } catch {
            // ignore
          }
        };
      } catch {
        // ignore - library may not be available in Expo Go / web
      }
    };

    void startListener();

    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, [otpOpen]);

  useEffect(() => {
    let cancelled = false;
    const fetchVehicleTypes = async () => {
      setVehicleError(null);
      setLoadingVehicles(true);
      try {
        const { data, error: fetchError } = await supabase
          .from('vehicle_types')
          .select(
            'id, name, description, capacity, image_url, base_price, per_km_price, labor_price, is_active'
          )
          .eq('is_active', true)
          .order('base_price', { ascending: true });

        if (fetchError) {
          setVehicleError(fetchError.message);
          return;
        }
        if (cancelled) return;
        setVehicleTypes((data ?? []) as VehicleType[]);
      } catch (e) {
        if (cancelled) return;
        setVehicleError(e instanceof Error ? e.message : 'Failed to load vehicles');
      } finally {
        if (cancelled) return;
        setLoadingVehicles(false);
      }
    };
    fetchVehicleTypes();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedVehicleLabel = useMemo(() => {
    if (!selectedVehicle) return '';
    const baseFare = typeof selectedVehicle.base_price === 'number' ? selectedVehicle.base_price : 0;
    const perKm = typeof selectedVehicle.per_km_price === 'number' ? selectedVehicle.per_km_price : 0;
    const cap = selectedVehicle.capacity ? ` • ${selectedVehicle.capacity}` : '';
    return `${selectedVehicle.name}${cap} • ${currency(baseFare)} + ${currency(perKm)}/km`;
  }, [selectedVehicle]);

  const uploadBookingUploads = async (createdBookingId: string) => {
    if (!session?.user?.id) return;
    const rawBucket = 'booking-uploads-raw';
    const items: { uri: string; kind: 'photo' | 'video' }[] = [
      ...form.photos.map((uri) => ({ uri, kind: 'photo' as const })),
      ...form.videos.map((uri) => ({ uri, kind: 'video' as const })),
    ];
    if (!items.length) return;

    for (const it of items) {
      const fileInfo = await FileSystem.getInfoAsync(it.uri, { size: true } as any);
      const fileSize = typeof (fileInfo as any)?.size === 'number' ? Number((fileInfo as any).size) : null;
      if (it.kind === 'photo') {
        if (!isAllowedJpeg(it.uri)) throw new Error('Only JPG/JPEG images are allowed.');
        if (fileSize !== null && fileSize > MAX_IMAGE_UPLOAD_BYTES) {
          throw new Error('Image too large. Please select an image up to 10MB.');
        }
      }
      if (it.kind === 'video') {
        if (!isAllowedMp4(it.uri)) throw new Error('Only MP4 videos are allowed.');
        if (fileSize !== null && fileSize > MAX_VIDEO_BYTES) {
          throw new Error('Video must be 5MB or less.');
        }
      }

      const res = await fetch(it.uri);
      const blob = await res.blob();
      const ext = it.kind === 'video' ? 'mp4' : 'jpg';
      const rawPath = `bookings/${createdBookingId}/${it.kind}s/${Date.now()}_${Math.random().toString(16).slice(2)}.${ext}`;
      const contentType = it.kind === 'video' ? 'video/mp4' : 'image/jpeg';

      const { error: uploadError } = await supabase.storage
        .from(rawBucket)
        .upload(rawPath, blob, { contentType, upsert: true });
      if (uploadError) throw new Error(uploadError.message);

      const { data: processed, error: processError } = await supabase.functions.invoke('process-booking-upload', {
        body: { booking_id: createdBookingId, raw_path: rawPath, kind: it.kind },
      });
      if (processError) throw new Error(processError.message);
      if (!(processed as any)?.ok) {
        const msg = String((processed as any)?.error ?? '').trim();
        throw new Error(msg || 'Failed to process upload.');
      }
    }
  };

  useEffect(() => {
    let cancelled = false;
    const fetchFloors = async () => {
      setFloorError(null);
      setLoadingFloors(true);
      try {
        const { data, error: fetchError } = await supabase
          .from('floor_options')
          .select('id, label, sort_order, charge_with_lift, charge_without_lift, is_active')
          .eq('is_active', true)
          .order('sort_order', { ascending: true });

        if (fetchError) {
          setFloorError(fetchError.message);
          return;
        }
        if (cancelled) return;
        setFloorOptions((data ?? []) as FloorOption[]);
      } catch (e) {
        if (cancelled) return;
        setFloorError(e instanceof Error ? e.message : 'Failed to load floors');
      } finally {
        if (cancelled) return;
        setLoadingFloors(false);
      }
    };

    fetchFloors();
    return () => {
      cancelled = true;
    };
  }, []);

  // Search suggestions on input fields are disabled as per user request.
  // Location selection is now preferred via "Select on Map".
  useEffect(() => {
    setPlaceResults([]);
  }, [form.dropAddress, form.pickupAddress, activeLocationField]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!form.pickupCoords || !form.dropCoords) {
        setDistanceKm(null);
        return;
      }

      try {
        const km = await getRouteDistance(form.pickupCoords, form.dropCoords);
        if (cancelled) return;
        setDistanceKm(km);
      } catch {
        if (cancelled) return;
        setDistanceKm(null);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [form.pickupCoords, form.dropCoords]);

  useEffect(() => {
    setForm((prev) => {
      const nextFullName = (!prev.fullName || !prev.fullName.trim()) && profile?.name ? profile.name : prev.fullName;
      const nextEmail = (!prev.email || !prev.email.trim()) && profile?.email ? profile.email : prev.email;

      if (nextFullName === prev.fullName && nextEmail === prev.email) return prev;
      return {
        ...prev,
        fullName: nextFullName,
        email: nextEmail,
      };
    });
  }, [form.fullName, form.mobile, profile?.email, step]);

  useEffect(() => {
    let cancelled = false;
    getGoogleMapsKey()
      .then((t) => {
        if (!cancelled) setGoogleMapsKey(t);
      })
      .catch(() => {
        if (!cancelled) setGoogleMapsKey('');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const mobileDigits = useMemo(() => form.mobile.replace(/\D/g, ''), [form.mobile]);
  const isMobileValid = mobileDigits.length === 10;

  const nameTrimmed = useMemo(() => form.fullName.trim(), [form.fullName]);
  const isNameValid = nameTrimmed.length >= 3;

  const emailTrimmed = useMemo(() => form.email.trim(), [form.email]);
  const isEmailValid = useMemo(() => {
    if (!emailTrimmed) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed);
  }, [emailTrimmed]);

  const isGroundFloor = (floor: string) => floor.toLowerCase().includes('ground');

  const calcFloorCharge = (floor: string, liftAvailable: boolean) => {
    if (!floor || isGroundFloor(floor)) return 0;
    if (liftAvailable) return 0;
    return 500;
  };

  const pickupFloorCharge = useMemo(() => {
    return calcFloorCharge(form.pickupFloor, form.pickupLift);
  }, [form.pickupFloor, form.pickupLift]);

  const dropFloorCharge = useMemo(() => {
    return calcFloorCharge(form.dropFloor, form.dropLift);
  }, [form.dropFloor, form.dropLift]);

  const pickupFloorSort = useMemo(() => {
    const opt = floorOptions.find((f) => f.label === form.pickupFloor) ?? null;
    return typeof opt?.sort_order === 'number' ? opt.sort_order : 0;
  }, [floorOptions, form.pickupFloor]);

  const dropFloorSort = useMemo(() => {
    const opt = floorOptions.find((f) => f.label === form.dropFloor) ?? null;
    return typeof opt?.sort_order === 'number' ? opt.sort_order : 0;
  }, [floorOptions, form.dropFloor]);

  const summaryMediaList = useMemo(
    () => [
      ...form.photos.map((uri) => ({ uri, type: 'photo' as const })),
      ...form.videos.map((uri) => ({ uri, type: 'video' as const })),
    ],
    [form.photos, form.videos]
  );

  const subtotal = useMemo(() => {
    if (!vehiclePricing) return 0;
    const km = distanceKm ?? 0;
    const laborFee = form.laborers * vehiclePricing.laborUnit;
    const floorFee = pickupFloorCharge + dropFloorCharge;
    return roundMoney(vehiclePricing.baseFare + km * vehiclePricing.perKm + laborFee + floorFee);
  }, [distanceKm, dropFloorCharge, form.laborers, pickupFloorCharge, vehiclePricing]);

  const boxCharge = useMemo(() => {
    return roundMoney(form.boxCount * 55);
  }, [form.boxCount]);

  const discountAmount = useMemo(() => {
    const d = roundMoney(Math.max(couponDiscount, 0));
    return Math.min(d, subtotal);
  }, [couponDiscount, subtotal]);

  const discountedSubtotal = useMemo(() => roundMoney(Math.max(subtotal - discountAmount, 0)), [subtotal, discountAmount]);
  const taxableAmount = useMemo(() => roundMoney(discountedSubtotal + boxCharge), [discountedSubtotal, boxCharge]);
  const gst = useMemo(() => roundMoney(taxableAmount * 0.18), [taxableAmount]);
  const total = useMemo(() => roundMoney(taxableAmount + gst), [taxableAmount, gst]);
  const paymentBaseAmount = useMemo(
    () => (paymentMode === 'full' ? total : Math.max(form.advanceAmount ?? 0, 0)),
    [form.advanceAmount, paymentMode, total]
  );
  // Razorpay's convenience fee is charged on the amount the customer actually
  // pays right now (selected advance/full/custom amount), not on the full
  // booking total, so every preset/custom change refreshes the fee immediately.
  const { convenienceFee, finalPayable: payNowTotal } = useMemo(
    () => calculateConvenienceFee(paymentBaseAmount),
    [paymentBaseAmount]
  );
  const amountDueNow = payNowTotal;
  // Final Payable = booking total + the fee charged on the selected payment.
  const totalPayable = useMemo(() => roundMoney(total + convenienceFee), [convenienceFee, total]);

  useEffect(() => {
    if (paymentMode !== 'full') return;
    setIsCustomAdvance(false);
    setCustomAdvanceText('');
    setForm((p) => ({ ...p, advanceAmount: Math.round(total) }));
  }, [paymentMode, total]);

  useEffect(() => {
    setCouponDiscount(0);
    setCouponApplied(null);
  }, [subtotal]);

  useEffect(() => {
    if (step !== 'payment' || !session?.user?.id) return;
    getWalletBalance(session.user.id).then(setWalletBalance).catch(() => {});
  }, [step, session?.user?.id]);

  useEffect(() => {
    setWalletAmount(0);
  }, [step]);

  const applyCoupon = async () => {
    setError(null);
    const raw = form.coupon.trim();
    if (!raw) {
      setCouponDiscount(0);
      setCouponApplied(null);
      setError('Enter coupon code.');
      return;
    }

    try {
      setCouponApplying(true);
      const code = raw.toUpperCase();
      const query = supabase
        .from('coupons')
        .select(
          'id, code, title, discount_type, discount_value, max_discount, min_order_amount, is_active, valid_from, valid_until, usage_limit, used_count'
        )
        .eq('code', code)
        .eq('is_active', true)
        .maybeSingle();

      const { data, error: fetchError } = await withTimeout(query, 10000, 'applyCoupon');

      if (fetchError) {
        setError(fetchError.message);
        return;
      }
      if (!data) {
        setError('Invalid coupon code.');
        setCouponDiscount(0);
        setCouponApplied(null);
        return;
      }

      const today = new Date();
      const validFrom = data.valid_from ? new Date(`${data.valid_from}T00:00:00`) : null;
      const validUntil = data.valid_until ? new Date(`${data.valid_until}T23:59:59`) : null;
      if (validFrom && today < validFrom) {
        setError('Coupon not active yet.');
        return;
      }
      if (validUntil && today > validUntil) {
        setError('Coupon expired.');
        return;
      }

      const minOrder = typeof data.min_order_amount === 'number' ? data.min_order_amount : 0;
      if (subtotal < minOrder) {
        setError(`Minimum order amount is ${currency(minOrder)}.`);
        return;
      }

      const usageLimit = typeof data.usage_limit === 'number' ? data.usage_limit : null;
      const usedCount = typeof data.used_count === 'number' ? data.used_count : 0;
      if (usageLimit !== null && usedCount >= usageLimit) {
        setError('Coupon usage limit reached.');
        return;
      }

      const dtype = (data.discount_type ?? '').toLowerCase();
      const dval = typeof data.discount_value === 'number' ? data.discount_value : 0;
      let discount = 0;
      if (dtype === 'percent' || dtype === 'percentage') {
        discount = roundMoney((subtotal * dval) / 100);
      } else {
        discount = roundMoney(dval);
      }

      const max = typeof data.max_discount === 'number' ? data.max_discount : null;
      if (max !== null) discount = Math.min(discount, max);

      discount = Math.min(discount, subtotal);

      setCouponApplied(data as any);
      setCouponDiscount(discount);
    } catch {
      setError('Failed to apply coupon.');
    } finally {
      setCouponApplying(false);
    }
  };

  const canContinue = useMemo(() => {
    if (step === 'info') return isNameValid && isMobileValid && isEmailValid && form.moveType;
    if (step === 'location') return form.pickupCoords && form.dropCoords;
    if (step === 'vehicle') return form.vehicleId && form.shiftingDate && form.preferredTime;
    if (step === 'items') return true;
    if (step === 'payment') return (paymentMode === 'full' ? true : form.advanceAmount > 0) && acceptedTerms;
    return false;
  }, [form, isEmailValid, isMobileValid, isNameValid, step, acceptedTerms]);

  const gotoStepIndex = (idx: number) => {
    const next = stepOrder[Math.max(0, Math.min(idx, stepOrder.length - 1))];
    setStep(next);
    setError(null);
  };

  const handleBack = () => {
    if (stepIndex === 0) {
      router.replace('/home');
      return;
    }
    gotoStepIndex(stepIndex - 1);
  };

  const handleContinue = async () => {
    setError(null);

    if (!canContinue) {
      setError('Please complete required fields.');
      return;
    }

    if (step === 'info') {
      const normalized = form.mobile.replace(/\D/g, '').slice(0, 10);
      if (normalized.length === 10 && session?.user?.id) {
        const ownedByOther = await findExistingUserByPhone(supabase, normalized, session.user.id);
        if (ownedByOther) {
          setError('This mobile number is already registered with another user.');
          return;
        }
      }
      gotoStepIndex(stepIndex + 1);
      return;
    }

    if (step === 'location') {
      if (distanceKm === null) {
        setError('Distance unavailable. Please reselect pickup/drop.');
        return;
      }
      gotoStepIndex(stepIndex + 1);
      return;
    }

    if (step === 'payment') {
      // if (!Number.isFinite(form.advanceAmount) || form.advanceAmount < 500) {
      //   setError('Advance amount must be at least ₹500.');
      //   return;
      // }
      setOtpDigits(['', '', '', '', '', '']);
      setOtpOpen(true);
      return;
    }

    gotoStepIndex(stepIndex + 1);
  };

  const selectPlace = (item: PlaceItem) => {
    if (activeLocationField === 'pickup') {
      setForm((prev) => ({
        ...prev,
        pickupAddress: item.place_name,
        pickupCoords: item.center,
      }));
    }
    if (activeLocationField === 'drop') {
      setForm((prev) => ({
        ...prev,
        dropAddress: item.place_name,
        dropCoords: item.center,
      }));
    }
    setActiveLocationField(null);
    setPlaceResults([]);
  };

  const renderActiveSuggestions = () => {
    if (!activeLocationField) return null;
    if (!loadingPlaces && !placeResults.length) return null;
    return (
      <YStack gap="$2" marginTop={8}>
        {loadingPlaces ? <Text color={theme.textMuted}>Loading suggestions…</Text> : null}
        {placeResults.length ? (
          <>
            <Text fontSize={t(14)} color={theme.textMuted}>
              Suggestions
            </Text>
            <YStack gap="$2">
              {placeResults.map((item, idx) => (
                <Pressable key={`${String(item.id ?? '').trim() || String(item.place_name ?? '').trim() || 'place'}-${idx}`} onPress={() => selectPlace(item)}>
                  <YStack padding={12} borderRadius={12} backgroundColor={theme.bgSecondary} borderWidth={1} borderColor={theme.border}>
                    <Text color="#28b467ff">{item.place_name}</Text>
                  </YStack>
                </Pressable>
              ))}
            </YStack>
          </>
        ) : null}
      </YStack>
    );
  };

  const selectFloorLabel = (label: string) => {
    if (floorPickerTarget === 'pickup') {
      setForm((p) => ({ ...p, pickupFloor: label }));
    } else {
      setForm((p) => ({ ...p, dropFloor: label }));
    }
    setFloorPickerOpen(false);
  };

  const createBooking = async () => {
    setError(null);
    setSubmitting(true);

    try {
      if (!session?.user?.id) {
        setError('Please login first.');
        return;
      }
      if (!form.pickupCoords || !form.dropCoords) {
        setError('Pickup and drop are missing.');
        return;
      }
      if (!selectedVehicle) {
        setError('Vehicle is missing.');
        return;
      }
      if (!vehiclePricing) {
        setError('Vehicle pricing is missing.');
        return;
      }

      const km = distanceKm ?? 0;
      const remainingAmount = Math.max(totalPayable - amountDueNow, 0);
      const scheduledDate = form.shiftingDate ? normalizeToIsoDate(form.shiftingDate) : null;

      const generateOtp = () => String(Math.floor(1000 + Math.random() * 9000));
      const pickupOtp = generateOtp();
      const deliveryOtp = generateOtp();

      const { data, error: insertError } = await supabase
        .from('bookings')
        .insert({
          user_id: session.user.id,
          pickup_address: form.pickupAddress,
          drop_address: form.dropAddress,
          pickup_lat: form.pickupCoords[1],
          pickup_lng: form.pickupCoords[0],
          drop_lat: form.dropCoords[1],
          drop_lng: form.dropCoords[0],
          distance_km: km,
          status: 'confirmed',
          payment_status: 'pending',
          estimated_price: totalPayable,
          final_price: null,
          vehicle_type_id: selectedVehicle.id,
          pickup_floor: pickupFloorSort,
          drop_floor: dropFloorSort,
          pickup_lift_available: form.pickupLift,
          drop_lift_available: form.dropLift,
          labor_count: form.laborers,
          scheduled_date: scheduledDate,
          scheduled_time: form.preferredTime ? form.preferredTime : null,
          items_description: form.itemDescription ? form.itemDescription : null,
          fare_breakdown: {
            base_fare: vehiclePricing.baseFare,
            per_km: vehiclePricing.perKm,
            labor_unit: vehiclePricing.laborUnit,
            vehicle_type_id: selectedVehicle.id,
            distance_km: km,
            labor_count: form.laborers,
            labor_fee: form.laborers * vehiclePricing.laborUnit,
            pickup_floor_label: form.pickupFloor,
            drop_floor_label: form.dropFloor,
            pickup_lift_available: form.pickupLift,
            drop_lift_available: form.dropLift,
            pickup_floor_charge: pickupFloorCharge,
            drop_floor_charge: dropFloorCharge,
            floor_fee: pickupFloorCharge + dropFloorCharge,
            box_count: form.boxCount,
            box_charge: boxCharge,
            subtotal,
            gst,
            total,
            convenience_fee: convenienceFee,
            final_payable: totalPayable,
          },
          advance_amount: amountDueNow,
          remaining_amount: remainingAmount,
          payment_method: form.paymentMethod,
          pickup_otp: pickupOtp,
          delivery_otp: deliveryOtp,
          otp_verified: true,
        })
        .select('id, booking_number')
        .single();

      if (insertError) {
        setError(insertError.message);
        return;
      }

      setBookingId(data.id);

      try {
        await supabase.functions.invoke('send-booking-status-push', {
          body: { booking_id: data.id, status: 'confirmed' },
        });
      } catch {
        // ignore push failures
      }

      try {
        await supabase.functions.invoke('send-booking-bill', {
          body: { booking_id: data.id },
        });
      } catch {
        // ignore email failures
      }

      try {
        await rewardReferralOnBooking(session.user.id, data.id);
      } catch {
        // ignore referral reward failures
      }

      setOtpOpen(false);

      const pdfData = {
        id: data.id,
        booking_number: data.booking_number,
        pickup_address: form.pickupAddress,
        drop_address: form.dropAddress,
        distance_km: km,
        estimated_price: totalPayable,
        advance_amount: amountDueNow,
        remaining_amount: remainingAmount,
        status: 'confirmed',
        payment_status: 'pending',
        scheduled_date: scheduledDate,
        scheduled_time: form.preferredTime,
        labor_count: form.laborers,
        vehicle_type_name: selectedVehicle?.name ?? null,
        pickup_floor: form.pickupFloor,
        drop_floor: form.dropFloor,
        pickup_lift_available: form.pickupLift,
        drop_lift_available: form.dropLift,
        items_description: form.itemDescription,
        fare_breakdown: {
          base_fare: vehiclePricing.baseFare,
          per_km: vehiclePricing.perKm,
          labor_unit: vehiclePricing.laborUnit,
          vehicle_type_id: selectedVehicle.id,
          distance_km: km,
          labor_count: form.laborers,
          labor_fee: form.laborers * vehiclePricing.laborUnit,
          pickup_floor_label: form.pickupFloor,
          drop_floor_label: form.dropFloor,
          pickup_lift_available: form.pickupLift,
          drop_lift_available: form.dropLift,
          pickup_floor_charge: pickupFloorCharge,
          drop_floor_charge: dropFloorCharge,
          floor_fee: pickupFloorCharge + dropFloorCharge,
          box_count: form.boxCount,
          box_charge: boxCharge,
          subtotal,
          gst,
          total,
        },
        created_at: new Date().toISOString(),
      };

      setBookingData(pdfData);
      setProcessingOpen(false);
      setSuccessOpen(true);

      if (Platform.OS === 'web') {
        await downloadPdf(pdfData);
      }
    } catch {
      setProcessingOpen(false);
      setError('Failed to create booking.');
    } finally {
      setSubmitting(false);
    }
  };

    
  const createBookingAndTakePayment = async () => {
    setError(null);
    setSubmitting(true);

    try {
      if (!session?.user?.id) {
        setError('Please login first.');
        return;
      }
      if (!form.pickupCoords || !form.dropCoords) {
        setError('Pickup and drop are missing.');
        return;
      }
      if (!selectedVehicle || !vehiclePricing) {
        setError('Vehicle is missing.');
        return;
      }

      const km = distanceKm ?? 0;
      const remainingAmount = Math.max(totalPayable - amountDueNow, 0);
      const scheduledDate = form.shiftingDate ? normalizeToIsoDate(form.shiftingDate) : null;

      const generateOtp = () => String(Math.floor(1000 + Math.random() * 9000));
      const pickupOtp = generateOtp();
      const deliveryOtp = generateOtp();

      const walletUsed = Math.min(walletAmount, amountDueNow);
      const payAmountRupees = Math.max(amountDueNow - walletUsed, 0);

      if (walletUsed > 0) {
        await debitWallet({
          userId: session.user.id,
          amount: walletUsed,
          referenceType: 'booking_payment',
          referenceId: null,
          description: `Used ₹${walletUsed} from wallet for shifting booking`,
        });
      }

      const order = payAmountRupees > 0 ? await createRazorpayOrder({
        amount: Math.round(payAmountRupees * 100),
        currency: 'INR',
        receipt: `bk_${Date.now()}`,
      }) : null;

      let razorpayPaymentId: string | null = null;

      if (order) {
        const razorpayKeyId = await getRazorpayKeyId();

        const options: any = {
          key: razorpayKeyId,
          amount: order.amount,
          currency: order.currency,
          name: 'Gujarat Relocation PackersMovers',
          description: paymentMode === 'full' ? 'Full Payment' : 'Advance Payment',
          order_id: order.id,
          prefill: {
            name: form.fullName,
            email: form.email,
            contact: form.mobile,
          },
          theme: { color: accentColor },
        };

        if (!options.key) {
          setError('Missing Razorpay public key. Configure RAZORPAY_KEY_ID in Supabase secrets.');
          return;
        }

        const paymentData: any = await openRazorpayCheckout(options);

        const valid = await verifyRazorpaySignature({
          order_id: order.id,
          payment_id: paymentData.razorpay_payment_id,
          signature: paymentData.razorpay_signature,
        });

        if (!valid) {
          setError('Payment verification failed.');
          return;
        }

        razorpayPaymentId = paymentData.razorpay_payment_id;
      }

      const { data: booking, error: insertError } = await supabase
        .from('bookings')
        .insert({
          user_id: session.user.id,
          pickup_address: form.pickupAddress,
          drop_address: form.dropAddress,
          pickup_lat: form.pickupCoords[1],
          pickup_lng: form.pickupCoords[0],
          drop_lat: form.dropCoords[1],
          drop_lng: form.dropCoords[0],
          distance_km: km,
          status: 'confirmed',
          payment_status: 'paid',
          estimated_price: totalPayable,
          final_price: null,
          vehicle_type_id: selectedVehicle.id,
          pickup_floor: pickupFloorSort,
          drop_floor: dropFloorSort,
          pickup_lift_available: form.pickupLift,
          drop_lift_available: form.dropLift,
          labor_count: form.laborers,
          scheduled_date: scheduledDate,
          scheduled_time: form.preferredTime ? form.preferredTime : null,
          items_description: form.itemDescription ? form.itemDescription : null,
          fare_breakdown: {
            base_fare: vehiclePricing.baseFare,
            per_km: vehiclePricing.perKm,
            labor_unit: vehiclePricing.laborUnit,
            vehicle_type_id: selectedVehicle.id,
            distance_km: km,
            labor_count: form.laborers,
            labor_fee: form.laborers * vehiclePricing.laborUnit,
            pickup_floor_label: form.pickupFloor,
            drop_floor_label: form.dropFloor,
            pickup_lift_available: form.pickupLift,
            drop_lift_available: form.dropLift,
            pickup_floor_charge: pickupFloorCharge,
            drop_floor_charge: dropFloorCharge,
            floor_fee: pickupFloorCharge + dropFloorCharge,
            box_count: form.boxCount,
            box_charge: boxCharge,
            subtotal,
            gst,
            total,
            convenience_fee: convenienceFee,
            final_payable: totalPayable,
          },
          advance_amount: amountDueNow,
          remaining_amount: remainingAmount,
          payment_method: form.paymentMethod,
          pickup_otp: pickupOtp,
          delivery_otp: deliveryOtp,
          otp_verified: true,
        })
        .select('id, booking_number')
        .single();

      if (insertError || !booking?.id) {
        const reason = insertError?.message ?? 'Booking insert returned no ID';
        if (order) {
          await supabase.from('payments').insert({
            booking_id: null,
            user_id: session.user.id,
            amount: (order.amount ?? 0) / 100,
            status: 'paid',
            razorpay_order_id: order.id,
            razorpay_payment_id: razorpayPaymentId,
            error: { booking_insert_error: reason },
            metadata: {
              mode: paymentMode,
            },
          });
        }

        setError(`Payment succeeded, but booking creation failed: ${reason}. Please contact support.`);
        return;
      }

      const createdBookingId = booking.id;

      try {
        await supabase.functions.invoke('send-booking-status-push', {
          body: { booking_id: createdBookingId, status: 'confirmed' },
        });
      } catch {
        // ignore push failures
      }

      try {
        await uploadBookingUploads(createdBookingId);
      } catch (e: any) {
        console.error('[Booking] Upload failed after booking created:', e);
      }

      if (order) {
        const { error: paymentInsertError } = await supabase.from('payments').insert({
          booking_id: createdBookingId,
          user_id: session.user.id,
          amount: (order.amount ?? 0) / 100,
          status: 'paid',
          razorpay_order_id: order.id,
          razorpay_payment_id: razorpayPaymentId,
          error: null,
          metadata: {
            mode: paymentMode,
          },
        });
        if (paymentInsertError) {
          console.error('[Booking] Payment record insert failed after booking created:', paymentInsertError);
        }
      }

      // Credit excess payment to wallet
      const totalPaid = walletUsed + (order ? (order.amount ?? 0) / 100 : 0);
      const requiredAmount = amountDueNow;
      const excessAmount = totalPaid - requiredAmount;
      if (excessAmount > 0) {
        try {
          await creditWallet({
            userId: session.user.id,
            amount: excessAmount,
            referenceType: 'booking_refund',
            referenceId: createdBookingId,
            description: `Excess payment of ₹${excessAmount} credited to wallet (Booking: ${createdBookingId.slice(0, 8)})`,
          });
        } catch (e) {
          console.error('[Booking] Failed to credit excess to wallet:', e);
        }
      }

      try {
        await rewardReferralOnBooking(session.user.id, createdBookingId);
      } catch {
        // ignore referral reward failures
      }

      setError(null);
      setOtpOpen(false);

      const pdfData = {
        id: createdBookingId,
        booking_number: booking.booking_number,
        pickup_address: form.pickupAddress,
        drop_address: form.dropAddress,
        distance_km: km,
        estimated_price: totalPayable,
        advance_amount: amountDueNow,
        remaining_amount: remainingAmount,
        status: 'confirmed',
        payment_status: 'paid',
        scheduled_date: scheduledDate,
        scheduled_time: form.preferredTime,
        labor_count: form.laborers,
        vehicle_type_name: selectedVehicle?.name ?? null,
        pickup_floor: form.pickupFloor,
        drop_floor: form.dropFloor,
        pickup_lift_available: form.pickupLift,
        drop_lift_available: form.dropLift,
        items_description: form.itemDescription,
        fare_breakdown: {
          base_fare: vehiclePricing.baseFare,
          per_km: vehiclePricing.perKm,
          labor_unit: vehiclePricing.laborUnit,
          vehicle_type_id: selectedVehicle.id,
          distance_km: km,
          labor_count: form.laborers,
          labor_fee: form.laborers * vehiclePricing.laborUnit,
          pickup_floor_label: form.pickupFloor,
          drop_floor_label: form.dropFloor,
          pickup_lift_available: form.pickupLift,
          drop_lift_available: form.dropLift,
          pickup_floor_charge: pickupFloorCharge,
          drop_floor_charge: dropFloorCharge,
          floor_fee: pickupFloorCharge + dropFloorCharge,
          box_count: form.boxCount,
          box_charge: boxCharge,
          subtotal,
          gst,
          total,
          convenience_fee: convenienceFee,
          final_payable: totalPayable,
        },
        created_at: new Date().toISOString(),
      };

      setBookingData(pdfData);
      setBookingId(createdBookingId);
      setProcessingOpen(false);
      setSuccessOpen(true);

      if (Platform.OS === 'web') {
        await downloadPdf(pdfData);
      }

      try {
        await supabase.functions.invoke('send-booking-bill', {
          body: { booking_id: createdBookingId },
        });
      } catch {
        // ignore email failures
      }
    } catch (e) {
      setProcessingOpen(false);
      const msg = e instanceof Error ? e.message : 'Payment cancelled/failed.';
      setError(msg.toLowerCase().includes('cancel') ? 'Payment cancelled.' : msg);
    } finally {
      setSubmitting(false);
    }
  };

  const verifyOtpAndPay = async () => {
    const code = otpDigits.join('');
    if (code.length !== 6) {
      setError('Enter 6-digit OTP.');
      return;
    }

    setOtpVerifying(true);
    setProcessingOpen(true);
    try {
      const phone = form.mobile;
      const data = await invokeEdgeFunction<{ valid?: boolean; error?: string }>('verify-booking-otp', { phone, code });
      if (!data?.valid) {
        setError(data?.error ? String(data.error) : 'Invalid OTP.');
        return;
      }

      const normalized = phone.replace(/\D/g, '').slice(0, 10);
      if (session?.user?.id && normalized.length === 10) {
        const ownedByOther = await findExistingUserByPhone(supabase, normalized, session.user.id);
        if (!ownedByOther) {
          const { error: phoneErr } = await supabase
            .from('users')
            .update({ phone: normalized })
            .eq('id', session.user.id);
          if (!phoneErr) {
            await refreshProfile();
          }
        }
      }

      await createBookingAndTakePayment();
    } catch (e: any) {
      setProcessingOpen(false);
      setError(e?.message ? String(e.message) : 'Failed to verify OTP.');
    } finally {
      setOtpVerifying(false);
    }
  };

  const timeOptions = useMemo(
    () => ['08:00 AM', '09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '01:00 PM', '02:00 PM', '03:00 PM', '04:00 PM', '05:00 PM', '06:00 PM', '07:00 PM', '08:00 PM'],
    []
  );

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const pickPhotos = async () => {
    setError(null);
    const remaining = Math.max(10 - form.photos.length, 0);
    if (remaining <= 0) {
      setError('Maximum 10 photos allowed.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.6,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
    });

    if (result.canceled) return;
    const accepted: string[] = [];
    for (const asset of result.assets) {
      const uri = asset?.uri;
      if (!uri) continue;

      if (!isAllowedJpeg(asset?.fileName ?? '') && !isAllowedJpeg(asset?.mimeType ?? '') && !isAllowedJpeg(uri)) {
        setError('Only JPG/JPEG images are allowed.');
        continue;
      }

      const size = typeof asset?.fileSize === 'number' ? asset.fileSize : null;
      const info = size === null ? await FileSystem.getInfoAsync(uri, { size: true } as any) : null;
      const finalSize = size ?? (typeof (info as any)?.size === 'number' ? Number((info as any).size) : null);
      if (finalSize !== null && finalSize > MAX_IMAGE_UPLOAD_BYTES) {
        setError(`Image too large (${formatBytes(finalSize)}). Max ${formatBytes(MAX_IMAGE_UPLOAD_BYTES)}.`);
        continue;
      }

      accepted.push(uri);
    }

    if (!accepted.length) return;
    setForm((p) => ({ ...p, photos: [...p.photos, ...accepted].slice(0, 10) }));
  };

  const pickVideo = async () => {
    setError(null);
    if (form.videos.length >= 2) {
      setError('Maximum 2 videos allowed.');
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
      setError(`Video must be ${MAX_VIDEO_DURATION_SEC} seconds or less.`);
      return;
    }
    if (!asset?.uri) return;

    if (!isAllowedMp4(asset?.fileName ?? '') && !isAllowedMp4(asset?.mimeType ?? '') && !isAllowedMp4(asset.uri)) {
      setError('Only MP4 videos are allowed.');
      return;
    }

    const size = typeof asset?.fileSize === 'number' ? asset.fileSize : null;
    const info = size === null ? await FileSystem.getInfoAsync(asset.uri, { size: true } as any) : null;
    const finalSize = size ?? (typeof (info as any)?.size === 'number' ? Number((info as any).size) : null);
    if (finalSize !== null && finalSize > MAX_VIDEO_BYTES) {
      setError(`Video too large (${formatBytes(finalSize)}). Max ${formatBytes(MAX_VIDEO_BYTES)}.`);
      return;
    }

    setForm((p) => ({ ...p, videos: [...p.videos, asset.uri].slice(0, 2) }));
  };

  const openMediaViewer = (list: { uri: string; type: 'photo' | 'video' }[], index: number) => {
    setMediaViewerList(list);
    setMediaViewerIndex(index);
    setViewerVideoPlaying(true);
    setMediaViewerOpen(true);
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true }).catch(() => {});
  };

  useEffect(() => {
    if (!mediaViewerOpen) return;
    setViewerVideoPlaying(true);
    const item = mediaViewerList[mediaViewerIndex];
    if (item?.type !== 'video') return;
    if (Platform.OS === 'web') {
      const el = viewerWebVideoRef.current;
      if (el) {
        void el.play().catch(() => {});
      }
      return;
    }
    void viewerVideoRef.current?.playAsync?.().catch(() => {});
  }, [mediaViewerOpen, mediaViewerIndex, mediaViewerList]);

  const toggleViewerVideo = async (play: boolean) => {
    setViewerVideoPlaying(play);
    if (Platform.OS === 'web') {
      const el = viewerWebVideoRef.current;
      if (!el) return;
      if (play) void el.play().catch(() => {});
      else el.pause();
      return;
    }
    if (play) await viewerVideoRef.current?.playAsync?.().catch(() => {});
    else await viewerVideoRef.current?.pauseAsync?.().catch(() => {});
  };

  const renderSquareMediaThumb = (item: { uri: string; type: 'photo' | 'video' }, size = 64) => {
    if (item.type === 'photo') {
      return <ExpoImage source={{ uri: item.uri }} style={{ width: size, height: size }} contentFit="cover" />;
    }
    if (Platform.OS === 'web') {
      return (
        <video
          src={item.uri}
          muted
          playsInline
          style={{ width: size, height: size, objectFit: 'cover', backgroundColor: '#000' } as any}
        />
      );
    }
    return (
      <Video
        source={{ uri: item.uri }}
        style={{ width: size, height: size, backgroundColor: '#000' }}
        resizeMode={ResizeMode.COVER}
        isMuted
        shouldPlay={false}
      />
    );
  };

  const renderMediaViewerContent = () => {
    const item = mediaViewerList[mediaViewerIndex];
    if (!item?.uri) return null;

    if (Platform.OS === 'web') {
      if (item.type === 'video') {
        return (
          <video
            key={item.uri}
            ref={viewerWebVideoRef}
            src={item.uri}
            controls
            playsInline
            autoPlay
            onPlay={() => setViewerVideoPlaying(true)}
            onPause={() => setViewerVideoPlaying(false)}
            style={{
              width: mediaViewerWidth,
              height: mediaViewerHeight,
              borderRadius: 12,
              backgroundColor: '#000',
              objectFit: 'contain',
            }}
          />
        );
      }
      return (
        <img
          key={item.uri}
          src={item.uri}
          alt="Item preview"
          style={{
            width: mediaViewerWidth,
            height: mediaViewerHeight,
            objectFit: 'contain',
            borderRadius: 12,
            backgroundColor: '#0F172A',
          }}
        />
      );
    }

    if (item.type === 'video') {
      return (
        <Video
          key={item.uri}
          ref={viewerVideoRef}
          source={{ uri: item.uri }}
          style={{ width: mediaViewerWidth, height: mediaViewerHeight, borderRadius: 12, backgroundColor: '#000' }}
          useNativeControls
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay={viewerVideoPlaying}
          onPlaybackStatusUpdate={(status) => {
            if (!status.isLoaded) return;
            setViewerVideoPlaying(status.isPlaying);
          }}
        />
      );
    }

    return (
      <ExpoImage
        key={item.uri}
        source={{ uri: item.uri }}
        style={{ width: mediaViewerWidth, height: mediaViewerHeight, borderRadius: 12, backgroundColor: '#0F172A' }}
        contentFit="contain"
      />
    );
  };

  const containerWidth = isWide ? 980 : '100%';

  return (
    <YStack flex={1} backgroundColor={theme.bg}>
      <PageHeader dark title="Book Your Move" subtitle={`Step ${stepIndex + 1} of 5`} onBack={handleBack} />

      <YStack backgroundColor={theme.bgCard} padding={14} borderBottomWidth={1} borderBottomColor={theme.border}>
        <XStack justifyContent="space-between" alignItems="center">
          {stepOrder.map((k, idx) => {
            const done = idx < stepIndex;
            const active = idx === stepIndex;
            const bg = done ? theme.success : active ? accentColor : theme.border;
            const color = done ? '#FFFFFF' : active ? (colorScheme === 'dark' ? '#0F172A' : '#FFFFFF') : theme.textMuted;
            return (
              <XStack key={k} flex={2} alignItems="center">
                <YStack alignItems="center" flex={1} gap="$1">
                  <YStack
                    width={32}
                    height={32}
                    borderRadius={999}
                    backgroundColor={bg}
                    alignItems="center"
                    justifyContent="center">
                    <Text color={color} fontWeight="800">
                      {done ? '✓' : idx + 1}
                    </Text>
                  </YStack>
                  <Text
                    fontSize={t(13)}
                    color={active ? theme.text : theme.textMuted}
                    textAlign="center"
                    numberOfLines={1}>
                    {stepMeta[k].label}
                  </Text>
                </YStack>
                {idx < stepOrder.length - 1 ? (
                  <YStack height={2} flex={0.1} backgroundColor={done ? theme.success : theme.border} />
                ) : null}
              </XStack>
            );
          })}
        </XStack>
      </YStack>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 + insets.bottom, alignItems: 'center' }}>
        <YStack width={containerWidth} gap="$4">
          {step === 'info' ? (
            <>
              <YStack backgroundColor={theme.bgCard} borderRadius={14} padding={16} borderWidth={1} borderColor={theme.border} gap="$3">
                <XStack alignItems="center" gap="$2">
                  <Text fontSize={t(18)} fontWeight="800" color={theme.text}>
                    Customer Information
                  </Text>
                </XStack>
                <YStack gap="$2">
                  <Text fontSize={t(14)} fontWeight="700" color={theme.text}>
                    Full Name *
                  </Text>
                  <Input
                    {...inputUi}
                    value={form.fullName}
                    onChangeText={(v) => setForm((p) => ({ ...p, fullName: v }))}
                    placeholder="Enter full name"
                  />
                  {!isNameValid && form.fullName.trim() ? (
                    <Text fontSize={t(13)} color={theme.danger}>
                      Name must be at least 3 characters.
                    </Text>
                  ) : null}
                </YStack>
                <YStack gap="$2">
                  <Text fontSize={t(14)} fontWeight="700" color={theme.text}>
                    Mobile Number *
                  </Text>
                  <Input
                    {...inputUi}
                    value={form.mobile}
                    keyboardType="number-pad"
                    maxLength={10}
                    ref={mobileRef}
                    onChangeText={(text) => {
                      setForm((p) => ({ ...p, mobile: text.replace(/[^0-9]/g, '') }));
                    }}
                    placeholder="10 digit mobile"
                  />
                  {!isMobileValid && form.mobile.trim() ? (
                    <Text fontSize={t(13)} color={theme.danger}>
                      Enter a valid 10 digit mobile number.
                    </Text>
                  ) : null}
                  <Text fontSize={t(13)} color={theme.textMuted}>
                    OTP will be sent to this number
                  </Text>
                </YStack>
                <YStack gap="$2">
                  <Text fontSize={t(14)} fontWeight="700" color={theme.text}>
                    Email (Optional)
                  </Text>
                  <Input
                    {...inputUi}
                    value={form.email}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    onChangeText={(v) => setForm((p) => ({ ...p, email: v }))}
                    placeholder="name@example.com"
                  />
                  {!isEmailValid && form.email.trim() ? (
                    <Text fontSize={t(13)} color={theme.danger}>
                      Enter a valid email address.
                    </Text>
                  ) : null}
                </YStack>
              </YStack>

              <YStack backgroundColor={theme.bgCard} borderRadius={14} padding={16} borderWidth={1} borderColor={theme.border} gap="$3">
                <Text fontSize={t(18)} fontWeight="800" color={theme.text}>
                  Type of Shifting
                </Text>
                <XStack flexWrap="wrap" gap="$3" justifyContent="center">
                  {MOVE_TYPES.map((moveType) => {
                    const selected = form.moveType === moveType.key;
                    return (
                      <Pressable
                        key={moveType.key}
                        onPress={() => setForm((p) => ({ ...p, moveType: moveType.key }))}
                        style={{ width: isWide ? '30%' : '46%' }}>
                        <YStack
                          backgroundColor={selected ? (colorScheme === 'dark' ? '#1E3A5F' : '#DBEAFE') : theme.bgCard}
                          borderRadius={14}
                          padding={14}
                          borderWidth={2}
                          borderColor={selected ? (colorScheme === 'dark' ? '#60A5FA' : accentColor) : theme.border}
                          gap="$1"
                          height={90}
                          justifyContent="center">
                          <Text fontWeight="800" color={theme.text}>
                            {moveType.title}
                          </Text>
                          <Text fontSize={t(13)} color={theme.textMuted}>
                            {moveType.subtitle}
                          </Text>
                        </YStack>
                      </Pressable>
                    );
                  })}
                </XStack>
              </YStack>
            </>
          ) : null}

          {step === 'location' ? (
            <YStack backgroundColor={theme.bgCard} borderRadius={14} padding={16} borderWidth={1} borderColor={theme.border} gap="$3">
              <Text fontSize={t(18)} fontWeight="800" color={theme.text}>
                Location
              </Text>

              <YStack gap="$3">
                <Text fontSize={t(15)} fontWeight="800" color={theme.text}>
                  Pickup Address
                </Text>
                <XStack gap="$2" alignItems="center">
                  <YStack flex={1}>
                    <Input
                      {...inputUi}
                      value={form.pickupAddress}
                      onChangeText={(v) => {
                        setForm((p) => ({ ...p, pickupAddress: v }));
                        setActiveLocationField('pickup');
                      }}
                      onFocus={() => setActiveLocationField('pickup')}
                      ref={pickupRef}
                      placeholder="Enter pickup location"
                    />
                  </YStack>
                  <Button
                    size="$3"
                    backgroundColor={theme.accent}
                    borderColor={theme.border}
                    borderWidth={1}
                    color="#FFFFFF"
                    onPress={() => openMapPicker('pickup')}>
                    Select on map
                  </Button>
                </XStack>

                {activeLocationField === 'pickup' ? renderActiveSuggestions() : null}

                <XStack gap="$3" flexWrap="wrap">
                  <YStack flex={1} minWidth={220} gap="$2">
                    <Text fontSize={t(14)} fontWeight="700" color={theme.text}>
                      Floor
                    </Text>
                    <Pressable
                      onPress={() => {
                        setFloorPickerTarget('pickup');
                        setFloorPickerOpen(true);
                      }}>
                      <YStack pointerEvents="none">
                        <Input
                          {...inputUi}
                          value={form.pickupFloor}
                          placeholder={loadingFloors ? 'Loading floors…' : 'Select floor'}
                        />
                      </YStack>
                    </Pressable>
                    {floorError ? (
                      <Text fontSize={t(13)} color={theme.danger}>
                        {floorError}
                      </Text>
                    ) : null}
                  </YStack>
                  {!isGroundFloor(form.pickupFloor) ? (
                    <YStack flex={1} minWidth={220} gap="$2">
                      <Text fontSize={t(14)} fontWeight="700" color={theme.text}>
                        Lift
                      </Text>
                      <Pressable onPress={() => setForm((p) => ({ ...p, pickupLift: !p.pickupLift }))}>
                        <YStack
                          backgroundColor={theme.bgSecondary}
                          borderRadius={12}
                          paddingHorizontal={14}
                          borderWidth={1}
                          borderColor={theme.border}
                          height={48}
                          justifyContent="center"
                          flexDirection="row"
                          alignItems="center">
                          <Text fontWeight="700" color={theme.text}>
                            Lift Available?
                          </Text>
                          <YStack
                            width={42}
                            height={24}
                            borderRadius={999}
                            backgroundColor={form.pickupLift ? theme.success : theme.border}
                            justifyContent="center"
                            paddingHorizontal={3}>
                            <YStack
                              width={18}
                              height={18}
                              borderRadius={999}
                              backgroundColor={theme.bgCard}
                              alignSelf={form.pickupLift ? 'flex-end' : 'flex-start'}
                            />
                          </YStack>
                        </YStack>
                      </Pressable>
                    </YStack>
                  ) : null}
                </XStack>

                <YStack height={1} backgroundColor={theme.bgSecondary} marginVertical={8} />

                <Text fontSize={t(15)} fontWeight="800" color={theme.text}>
                  Drop Address
                </Text>
                <XStack gap="$2" alignItems="center">
                  <YStack flex={1}>
                    <Input
                      {...inputUi}
                      value={form.dropAddress}
                      onChangeText={(v) => {
                        setForm((p) => ({ ...p, dropAddress: v }));
                        setActiveLocationField('drop');
                      }}
                      onFocus={() => setActiveLocationField('drop')}
                      placeholder="Enter drop location"
                    />
                  </YStack>
                  <Button
                    size="$3"
                    backgroundColor={theme.accent}
                    borderColor={theme.border}
                    borderWidth={1}
                    color="#FFFFFF"
                    onPress={() => openMapPicker('drop')}>
                    Select on map
                  </Button>
                </XStack>

                {activeLocationField === 'drop' ? renderActiveSuggestions() : null}

                <XStack gap="$3" flexWrap="wrap">
                  <YStack flex={1} minWidth={220} gap="$2">
                    <Text fontSize={t(14)} fontWeight="700" color={theme.text}>
                      Floor
                    </Text>
                    <Pressable
                      onPress={() => {
                        setFloorPickerTarget('drop');
                        setFloorPickerOpen(true);
                      }}>
                      <YStack pointerEvents="none">
                        <Input
                          {...inputUi}
                          value={form.dropFloor}
                          placeholder={loadingFloors ? 'Loading floors…' : 'Select floor'}
                        />
                      </YStack>
                    </Pressable>
                  </YStack>
                  {!isGroundFloor(form.dropFloor) ? (
                    <YStack flex={1} minWidth={220} gap="$2">
                      <Text fontSize={t(14)} fontWeight="700" color={theme.text}>
                        Lift
                      </Text>
                      <Pressable onPress={() => setForm((p) => ({ ...p, dropLift: !p.dropLift }))}>
                        <YStack
                          backgroundColor={theme.bgSecondary}
                          borderRadius={12}
                          paddingHorizontal={14}
                          borderWidth={1}
                          borderColor={theme.border}
                          height={48}
                          justifyContent="center"
                          flexDirection="row"
                          alignItems="center">
                          <Text fontWeight="700" color={theme.text}>
                            Lift Available?
                          </Text>
                          <YStack
                            width={42}
                            height={24}
                            borderRadius={999}
                            backgroundColor={form.dropLift ? theme.success : theme.border}
                            justifyContent="center"
                            paddingHorizontal={3}>
                            <YStack
                              width={18}
                              height={18}
                              borderRadius={999}
                              backgroundColor={theme.bgCard}
                              alignSelf={form.dropLift ? 'flex-end' : 'flex-start'}
                            />
                          </YStack>
                        </YStack>
                      </Pressable>
                    </YStack>
                  ) : null}
                </XStack>

                <XStack justifyContent="space-between" alignItems="center">
                  <Text color={theme.textMuted}>Distance</Text>
                  <Text fontWeight="800" color={theme.text}>
                    {distanceKm === null ? '—' : `${distanceKm.toFixed(1)} km`}
                  </Text>
                </XStack>



              </YStack>
            </YStack>
          ) : null}

          <BookingMapPicker
            open={mapPickerOpen}
            onOpenChange={setMapPickerOpen}
            resetKey={mapPickerTarget}
            title={`Select ${mapPickerTarget === 'pickup' ? 'Pickup' : 'Drop'} Location`}
            token={googleMapsKey}
            coord={mapPickerCoord}
            onCoordChange={setMapPickerCoord}
            onConfirm={confirmMapPicker}
            busy={mapPickerBusy}
            isWide={isWide}
          />

          <Dialog open={floorPickerOpen} onOpenChange={setFloorPickerOpen}>
            <Dialog.Portal>
              <Dialog.Overlay opacity={0.6} backgroundColor="#0F172A" />
              <Dialog.Content
                backgroundColor={theme.bgCard}
                borderRadius={16}
                padding={16}
                width={isWide ? 520 : '92%'}>
                <YStack gap="$3">
                  <Text fontSize={t(18)} fontWeight="900" color={theme.text}>
                    Select Floor — {floorPickerTarget === 'pickup' ? 'Pickup' : 'Drop'}
                  </Text>
                  {loadingFloors ? <Text color={theme.textMuted}>Loading floors…</Text> : null}
                  {floorError ? <Text color={theme.danger}>{floorError}</Text> : null}
                  <ScrollView
                    style={{ maxHeight: 320 }}
                    showsVerticalScrollIndicator
                    nestedScrollEnabled
                    keyboardShouldPersistTaps="handled">
                    <YStack gap="$2" paddingBottom={4}>
                      {(floorOptions.length ? floorOptions : [{ id: 'default', label: 'Ground Floor' } as any]).map((opt: any) => {
                        const label = String(opt.label ?? '');
                        const selected =
                          floorPickerTarget === 'pickup'
                            ? label === form.pickupFloor
                            : label === form.dropFloor;
                        return (
                          <Button
                            key={String(opt.id)}
                            backgroundColor={selected ? accentColor : theme.bgSecondary}
                            color={selected ? '#FFFFFF' : '#4163adff'}
                            borderWidth={1}
                            borderColor={theme.border}
                            borderRadius={12}
                            justifyContent="flex-start"
                            onPress={() => selectFloorLabel(label)}>
                            {label}
                          </Button>
                        );
                      })}
                    </YStack>
                  </ScrollView>
                  <Button backgroundColor={theme.bgSecondary} color={theme.text} onPress={() => setFloorPickerOpen(false)}>
                    Close
                  </Button>
                </YStack>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog>

          {step === 'vehicle' ? (
            <>
              <YStack backgroundColor={theme.bgCard} borderRadius={14} padding={16} borderWidth={1} borderColor={theme.border} gap="$3">
                <Text fontSize={t(18)} fontWeight="800" color={theme.text}>
                  Select Vehicle
                </Text>

                <YStack gap="$3">
                  {loadingVehicles ? <Text color={theme.textMuted}>Loading vehicles…</Text> : null}
                  {vehicleError ? <Text color={theme.danger}>{vehicleError}</Text> : null}

                  <YStack gap="$2">
                    <Text fontSize={t(14)} fontWeight="700" color={theme.text}>
                      Selected Vehicle
                    </Text>
                    <Pressable onPress={() => setVehiclePickerOpen(true)}>
                      <YStack pointerEvents="none">
                        <Input
                          {...inputUi}
                          value={selectedVehicleLabel}
                          placeholder="Select vehicle"
                          ref={vehicleFieldRef}
                        />
                      </YStack>
                    </Pressable>
                  </YStack>
                </YStack>
              </YStack>

              <Dialog open={vehiclePickerOpen} onOpenChange={setVehiclePickerOpen}>
                <Dialog.Portal>
                  <Dialog.Overlay opacity={0.6} backgroundColor="#0F172A" />
                  <Dialog.Content backgroundColor={theme.bgCard} borderRadius={16} padding={16} width={isWide ? 620 : '92%'}>
                    <YStack gap="$3">
                      <Text fontSize={t(18)} fontWeight="900" color={theme.text}>
                        Select Vehicle
                      </Text>
                      <YStack gap="$2">
                        {vehicleTypes.map((v) => {
                          const selected = form.vehicleId === v.id;
                          const baseFare = typeof v.base_price === 'number' ? v.base_price : 0;
                          const perKm = typeof v.per_km_price === 'number' ? v.per_km_price : 0;

                          return (
                            <Pressable
                              key={v.id}
                              onPress={() => {
                                setForm((p) => ({ ...p, vehicleId: v.id }));
                                setVehiclePickerOpen(false);
                              }}>
                              <YStack
                                backgroundColor={theme.bgCard}
                                borderRadius={14}
                                borderWidth={2}
                                borderColor={selected ? accentColor : theme.border}
                                padding={14}
                                gap="$2">
                                <XStack gap="$3" alignItems="center">
                                  {v.image_url ? (
                                    <ExpoImage source={{ uri: resolveVehicleImageUrl(v.image_url) }} style={{ width: 64, height: 52, borderRadius: 10 }} contentFit="cover" />
                                  ) : (
                                    <YStack
                                      width={64}
                                      height={52}
                                      borderRadius={10}
                                      backgroundColor={theme.bgSecondary}
                                      borderWidth={1}
                                      borderColor={theme.border}
                                      alignItems="center"
                                      justifyContent="center">
                                      <Text color={theme.textMuted} fontSize={t(12)} fontWeight="700">
                                        NO IMAGE
                                      </Text>
                                    </YStack>
                                  )}

                                  <YStack flex={1} gap="$1" justifyContent="center">
                                    <Text fontWeight="900" color={theme.text}>
                                      {v.name}
                                    </Text>
                                    <Text fontSize={t(13)} color={theme.textMuted} numberOfLines={2}>
                                      {v.description ?? 'Premium moving vehicle'}
                                    </Text>
                                    <Text fontSize={t(13)} color={theme.textMuted}>
                                      {v.capacity ?? '—'}
                                    </Text>
                                    <Text fontWeight="900" color={accentColor}>
                                      {currency(baseFare)}{' '}
                                      <Text color={theme.textMuted} fontWeight="600">
                                        + {currency(perKm)}/km
                                      </Text>
                                    </Text>
                                  </YStack>

                                  {selected ? (
                                    <YStack
                                      width={22}
                                      height={22}
                                      borderRadius={999}
                                      backgroundColor={accentColor}
                                      alignItems="center"
                                      justifyContent="center">
                                      <Text color={onAccentTextColor} fontWeight="900">
                                        ✓
                                      </Text>
                                    </YStack>
                                  ) : (
                                    <YStack width={22} height={22} borderRadius={999} borderWidth={2} borderColor={theme.border} />
                                  )}
                                </XStack>
                              </YStack>
                            </Pressable>
                          );
                        })}
                      </YStack>
                      <Button backgroundColor={theme.bgSecondary} color={theme.text} onPress={() => setVehiclePickerOpen(false)}>
                        Close
                      </Button>
                    </YStack>
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog>

              <YStack backgroundColor={theme.bgCard} borderRadius={14} padding={16} borderWidth={1} borderColor={theme.border} gap="$3">
                <Text fontSize={t(18)} fontWeight="800" color={theme.text}>
                  Schedule & Labor
                </Text>

                <YStack gap="$3">
                  <YStack gap="$2">
                    <Text fontSize={t(14)} fontWeight="700" color={theme.text}>
                      Number of Laborers
                    </Text>
                    <Pressable onPress={() => setLaborPickerOpen(true)}>
                      <YStack pointerEvents="none">
                        <Input
                          {...inputUi}
                          value={`${form.laborers} ${form.laborers === 1 ? 'Worker' : 'Workers'}`}
                          placeholder="Select laborers"
                        />
                      </YStack>
                    </Pressable>
                    <Text fontSize={t(13)} color={theme.textMuted}>
                      Charges will be calculated automatically.
                    </Text>
                  </YStack>

                  <XStack gap="$3" flexWrap="wrap">
                    <YStack flex={1} minWidth={240} gap="$2">
                      <Text fontSize={t(14)} fontWeight="700" color={theme.text}>
                        Shifting Date
                      </Text>
                      <Pressable onPress={() => setShiftingDatePickerOpen(true)}>
                        <YStack
                          borderWidth={1}
                          borderColor={theme.inputBorder}
                          borderRadius={12}
                          overflow="hidden"
                          backgroundColor={theme.inputBg}
                          position="relative">
                          <YStack padding={12}>
                            <Text color={theme.inputText} fontWeight="700">
                              {shiftingDateValue
                                ? formatDateDdMmYyyy(shiftingDateValue)
                                : form.shiftingDate || 'Select date'}
                            </Text>
                          </YStack>
                        </YStack>
                      </Pressable>
                      <MobileDatePicker
                        value={shiftingDateValue ?? minDate}
                        minDate={minDate}
                        maxDate={maxDate}
                        open={shiftingDatePickerOpen}
                        onClose={() => setShiftingDatePickerOpen(false)}
                        onChange={(d) => {
                          setShiftingDateValue(d);
                          setForm((p) => ({ ...p, shiftingDate: formatDateDdMmYyyy(d) }));
                        }}
                      />
                    </YStack>
                    <YStack flex={1} minWidth={240} gap="$2">
                      <Text fontSize={t(14)} fontWeight="700" color={theme.text}>
                        Preferred Time
                      </Text>
                      <Pressable onPress={() => setTimePickerOpen(true)}>
                        <YStack pointerEvents="none">
                          <Input {...inputUi} value={form.preferredTime} placeholder="Select time" />
                        </YStack>
                      </Pressable>
                    </YStack>
                  </XStack>

                </YStack>
              </YStack>
            </>
          ) : null}

          <Dialog open={laborPickerOpen} onOpenChange={setLaborPickerOpen}>
            <Dialog.Portal>
              <Dialog.Overlay opacity={0.6} backgroundColor="#0F172A" />
              <Dialog.Content backgroundColor={theme.bgCard} borderRadius={16} padding={16} width={isWide ? 520 : '92%'}>
                <YStack gap="$3">
                  <Text fontSize={t(18)} fontWeight="900" color={theme.text}>
                    Select Laborers
                  </Text>
                  <YStack gap="$2">
                    {Array.from({ length: 10 }, (_, idx) => idx + 1).map((n) => {
                      const selected = form.laborers === n;
                      return (
                        <Button
                          key={n}
                          backgroundColor={selected ? accentColor : theme.bgSecondary}
                          color={selected ? '#FFFFFF' : theme.text}
                          borderWidth={1}
                          borderColor={theme.border}
                          borderRadius={12}
                          justifyContent="flex-start"
                          onPress={() => {
                            setForm((p) => ({ ...p, laborers: n }));
                            setLaborPickerOpen(false);
                          }}>
                          <Text color={selected ? '#FFFFFF' : theme.text} fontWeight="800">
                            {n} {n === 1 ? 'Worker' : 'Workers'}
                          </Text>
                        </Button>
                      );
                    })}
                  </YStack>
                  <Button backgroundColor={theme.bgSecondary} color={theme.text} onPress={() => setLaborPickerOpen(false)}>
                    Close
                  </Button>
                </YStack>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog>

          <Dialog open={boxPickerOpen} onOpenChange={setBoxPickerOpen}>
            <Dialog.Portal>
              <Dialog.Overlay opacity={0.6} backgroundColor="#0F172A" />
              <Dialog.Content backgroundColor={theme.bgCard} borderRadius={16} padding={16} width={isWide ? 520 : '92%'} maxHeight="80%">
                <YStack gap="$3">
                  <Text fontSize={t(18)} fontWeight="900" color={theme.text}>
                    Select Number of Boxes
                  </Text>
                  <Text fontSize={t(13)} color={theme.textMuted}>
                    ₹55 per box · GST included below
                  </Text>
                  <ScrollView style={{ maxHeight: 400 }}>
                    <YStack gap="$1">
                      {Array.from({ length: 100 }, (_, idx) => idx + 1).map((n) => {
                        const selected = form.boxCount === n;
                        const charge = n * 55;
                        return (
                          <Button
                            key={n}
                            backgroundColor={selected ? accentColor : theme.bgSecondary}
                            color={selected ? '#FFFFFF' : theme.text}
                            borderWidth={1}
                            borderColor={theme.border}
                            borderRadius={12}
                            justifyContent="space-between"
                            paddingHorizontal={14}
                            onPress={() => {
                              setForm((p) => ({ ...p, boxCount: n }));
                              setBoxPickerOpen(false);
                            }}>
                            <Text color={selected ? '#FFFFFF' : theme.text} fontWeight="800">
                              {n} {n === 1 ? 'Box' : 'Boxes'}
                            </Text>
                            <Text color={selected ? '#CFE3F4' : theme.textMuted} fontSize={t(12)}>
                              {charge > 0 ? `+₹${charge.toLocaleString('en-IN')}` : 'Free'}
                            </Text>
                          </Button>
                        );
                      })}
                    </YStack>
                  </ScrollView>
                  <Button backgroundColor={theme.bgSecondary} color={theme.text} onPress={() => setBoxPickerOpen(false)}>
                    Close
                  </Button>
                </YStack>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog>

          <Dialog open={timePickerOpen} onOpenChange={setTimePickerOpen}>
            <Dialog.Portal>
              <Dialog.Overlay opacity={0.6} backgroundColor="#0F172A" />
              <Dialog.Content backgroundColor={theme.bgCard} borderRadius={16} padding={16} width={isWide ? 520 : '92%'}>
                <YStack gap="$3">
                  <Text fontSize={t(18)} fontWeight="900" color={theme.text}>
                    Select Preferred Time (IST)
                  </Text>
                  <XStack gap="$2" flexWrap="wrap" justifyContent="center">
                    {TIME_SLOTS.map((slot) => {
                      const selected = form.preferredTime === slot;
                      return (
                        <Button
                          key={slot}
                          backgroundColor={selected ? accentColor : theme.bgSecondary}
                          color={selected ? '#FFFFFF' : theme.text}
                          borderWidth={1}
                          borderColor={selected ? accentColor : theme.border}
                          borderRadius={12}
                          paddingHorizontal={16}
                          paddingVertical={10}
                          minWidth={100}
                          onPress={() => {
                            setForm((p) => ({ ...p, preferredTime: slot }));
                            setTimePickerOpen(false);
                          }}>
                          {slot}
                        </Button>
                      );
                    })}
                  </XStack>
                  <Button backgroundColor={theme.bgSecondary} color={theme.text} onPress={() => setTimePickerOpen(false)}>
                    Close
                  </Button>
                </YStack>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog>

          {step === 'items' ? (
            <YStack backgroundColor={theme.bgCard} borderRadius={14} padding={16} borderWidth={1} borderColor={theme.border} gap="$3">
              <Text fontSize={t(18)} fontWeight="800" color={theme.text}>
                Items
              </Text>
              <YStack gap="$3">
                <YStack borderWidth={2} borderStyle="dashed" borderColor={theme.border} borderRadius={14} padding={18} alignItems="center" gap="$2">
                  <Text color={theme.textMuted} fontWeight="700">
                    Upload Photos of Items
                  </Text>
                  <Text color={theme.textMuted} fontSize={t(13)}>
                    Max 10 photos · Compressed to ~500 KB each
                  </Text>
                  <Button backgroundColor={accentColor} color={onAccentTextColor} hoverStyle={{ backgroundColor: accentColor }} pressStyle={{ backgroundColor: accentColor }} onPress={pickPhotos}>
                    Add Photos
                  </Button>
                  <Text color={theme.textMuted} fontSize={t(13)}>
                    Selected: {form.photos.length}/10
                  </Text>
                  {form.photos.length ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 84 } as any}>
                      <XStack gap="$2" paddingVertical={6}>
                        {form.photos.map((uri, idx) => (
                          <Pressable
                            key={`${String(uri ?? '').trim() || 'photo'}-${idx}`}
                            onPress={() => {
                              const list = form.photos.map((u) => ({ uri: u, type: 'photo' as const }));
                              openMediaViewer(list, idx);
                            }}>
                            <YStack width={74} height={74} borderRadius={12} overflow="hidden" backgroundColor={theme.bgSecondary} borderWidth={1} borderColor={theme.border}>
                              <ExpoImage source={{ uri }} style={{ width: 74, height: 74 }} contentFit="cover" />
                            </YStack>
                          </Pressable>
                        ))}
                      </XStack>
                    </ScrollView>
                  ) : null}
                </YStack>

                <YStack borderWidth={2} borderStyle="dashed" borderColor={theme.border} borderRadius={14} padding={18} alignItems="center" gap="$2">
                  <Text color={theme.textMuted} fontWeight="700">
                    Upload Video (Optional)
                  </Text>
                  <Text color={theme.textMuted} fontSize={t(13)}>
                    Max 2 videos, {MAX_VIDEO_DURATION_SEC} sec each · Compressed to ~5 MB
                  </Text>
                  <Button backgroundColor={accentColor} color={onAccentTextColor} hoverStyle={{ backgroundColor: accentColor }} pressStyle={{ backgroundColor: accentColor }} onPress={pickVideo}>
                    Add Video
                  </Button>
                  <Text color={theme.textMuted} fontSize={t(13)}>
                    Selected: {form.videos.length}/2
                  </Text>
                  {form.videos.length ? (
                    <YStack gap="$2">
                      {form.videos.map((uri, idx) => (
                        <Pressable
                          key={`${String(uri ?? '').trim() || 'video'}-${idx}`}
                          onPress={() => {
                            const list = form.videos.map((u) => ({ uri: u, type: 'video' as const }));
                            openMediaViewer(list, idx);
                          }}>
                          <YStack
                            width={140}
                            height={88}
                            borderRadius={12}
                            overflow="hidden"
                            backgroundColor="#000"
                            borderWidth={1}
                            borderColor={theme.border}
                            alignItems="center"
                            justifyContent="center">
                            {Platform.OS === 'web' ? (
                              <video
                                src={uri}
                                muted
                                playsInline
                                style={{ width: 140, height: 88, objectFit: 'cover' } as any}
                              />
                            ) : (
                              <Video
                                source={{ uri }}
                                style={{ width: 140, height: 88 }}
                                resizeMode={ResizeMode.COVER}
                                isMuted
                                shouldPlay={false}
                              />
                            )}
                            <YStack
                              position="absolute"
                              bottom={4}
                              right={4}
                              backgroundColor="rgba(0,0,0,0.65)"
                              paddingHorizontal={6}
                              paddingVertical={2}
                              borderRadius={6}>
                              <Text color="#FFFFFF" fontSize={t(12)} fontWeight="800">
                                VIDEO
                              </Text>
                            </YStack>
                          </YStack>
                        </Pressable>
                      ))}
                    </YStack>
                  ) : null}
                </YStack>

                <YStack borderWidth={1} borderColor={theme.border} borderRadius={12} padding={14} gap="$2">
                  <Text fontSize={t(14)} fontWeight="700" color={theme.text}>
                    Number of Boxes
                  </Text>
                  <Text fontSize={t(12)} color={theme.textMuted}>
                    ₹55 per box
                  </Text>
                  <Button
                    backgroundColor={theme.bgSecondary}
                    color={theme.text}
                    borderWidth={1}
                    borderColor={theme.border}
                    borderRadius={12}
                    justifyContent="space-between"
                    paddingHorizontal={14}
                    onPress={() => setBoxPickerOpen(true)}>
                    <Text color={theme.text} fontWeight="800">
                      {form.boxCount > 0 ? `${form.boxCount} Box${form.boxCount > 1 ? 'es' : ''}` : 'Select boxes'}
                    </Text>
                    <Text color={theme.textMuted} fontSize={t(12)}>
                      {form.boxCount > 0 ? `+₹${boxCharge.toLocaleString('en-IN')}` : ''}
                    </Text>
                  </Button>
                </YStack>

                <YStack gap="$2">
                  <Text fontSize={t(14)} fontWeight="700" color={theme.text}>
                    Item Description (Optional)
                  </Text>
                  <Input
                    {...inputUi}
                    value={form.itemDescription}
                    onChangeText={(v) => setForm((p) => ({ ...p, itemDescription: v }))}
                    placeholder="Describe your items (e.g., 2 beds, 1 sofa, 5 boxes, refrigerator...)"
                  />
                </YStack>

                <YStack backgroundColor={colorScheme === 'dark' ? '#422006' : '#FEF9C3'} borderRadius={12} padding={12} borderWidth={1} borderColor={theme.warning}>
                  <Text color={colorScheme === 'dark' ? '#FDE68A' : '#92400E'} fontWeight="800">
                    Upload clear photos/videos of your items for accurate vehicle recommendation and price estimation.
                  </Text>
                </YStack>
              </YStack>
            </YStack>
          ) : null}

          {step === 'payment' ? (
            <YStack gap="$4">
              <YStack backgroundColor={theme.bgCard} borderRadius={14} padding={16} borderWidth={1} borderColor={theme.border} gap="$3">
                <Text fontSize={t(18)} fontWeight="800" color={theme.text}>
                  Booking Summary
                </Text>
                <YStack gap="$2">
                  <XStack justifyContent="space-between">
                    <Text color={theme.textMuted}>Pickup</Text>
                    <Text fontWeight="800" color={theme.text} textAlign="right" flexShrink={1} maxWidth="70%">
                      {form.pickupAddress || '-'}
                    </Text>
                  </XStack>
                  <XStack justifyContent="space-between">
                    <Text color={theme.textMuted}>Drop</Text>
                    <Text fontWeight="800" color={theme.text} textAlign="right" flexShrink={1} maxWidth="70%">
                      {form.dropAddress || '-'}
                    </Text>
                  </XStack>
                  <XStack justifyContent="space-between">
                    <Text color={theme.textMuted}>Date & Time</Text>
                    <Text fontWeight="800" color={theme.text} textAlign="right" flexShrink={1} maxWidth="70%">
                      {(form.shiftingDate || '-') + (form.preferredTime ? ` at ${form.preferredTime}` : '')}
                    </Text>
                  </XStack>
                  <XStack justifyContent="space-between">
                    <Text color={theme.textMuted}>Vehicle</Text>
                    <Text fontWeight="800" color={theme.text} textAlign="right" flexShrink={1} maxWidth="70%">
                      {selectedVehicle?.name ?? '-'}
                    </Text>
                  </XStack>
                  <XStack justifyContent="space-between">
                    <Text color={theme.textMuted}>Laborers</Text>
                    <Text fontWeight="800" color={theme.text} textAlign="right" flexShrink={1} maxWidth="70%">
                      {form.laborers} worker
                    </Text>
                  </XStack>
                  {form.itemDescription?.trim() ? (
                    <XStack justifyContent="space-between" alignItems="flex-start" gap="$2">
                      <Text color={theme.textMuted}>Items note</Text>
                      <Text fontWeight="700" color={theme.text} textAlign="right" flexShrink={1} maxWidth="70%">
                        {form.itemDescription.trim()}
                      </Text>
                    </XStack>
                  ) : null}
                </YStack>

                {summaryMediaList.length > 0 ? (
                  <YStack gap="$2" marginTop={4}>
                    <Text color={theme.textMuted} fontSize={t(14)} fontWeight="700">
                      Photos & Videos ({summaryMediaList.length})
                    </Text>
                    <Text color={theme.textMuted} fontSize={t(13)}>
                      Tap to preview · swipe arrows for next/prev
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <XStack gap="$2" paddingVertical={4}>
                        {summaryMediaList.map((item, idx) => (
                          <Pressable
                            key={`${item.type}-${item.uri}-${idx}`}
                            onPress={() => openMediaViewer(summaryMediaList, idx)}>
                            <YStack
                              width={64}
                              height={64}
                              borderRadius={10}
                              overflow="hidden"
                              backgroundColor={theme.bgSecondary}
                              borderWidth={1}
                              borderColor={theme.border}
                              alignItems="center"
                              justifyContent="center">
                              {renderSquareMediaThumb(item, 64)}
                              {item.type === 'video' ? (
                                <YStack
                                  position="absolute"
                                  bottom={3}
                                  right={3}
                                  backgroundColor="rgba(0,0,0,0.7)"
                                  paddingHorizontal={5}
                                  paddingVertical={2}
                                  borderRadius={4}>
                                  <Text color="#FFFFFF" fontSize={t(11)} fontWeight="800">
                                    ▶
                                  </Text>
                                </YStack>
                              ) : null}
                            </YStack>
                          </Pressable>
                        ))}
                      </XStack>
                    </ScrollView>
                  </YStack>
                ) : null}
              </YStack>

              <YStack backgroundColor={theme.bgCard} borderRadius={14} padding={16} borderWidth={1} borderColor={theme.border} gap="$3">
                <Text fontSize={t(18)} fontWeight="800" color={theme.text}>
                  Payment Type
                </Text>
                <XStack gap="$2">
                  <Button
                    flex={1}
                    backgroundColor={paymentMode === 'advance' ? accentColor : theme.bgSecondary}
                    color={paymentMode === 'advance' ? '#FFFFFF' : theme.text}
                    borderWidth={1}
                    borderColor={theme.border}
                    borderRadius={12}
                    onPress={() => setPaymentMode('advance')}>
                    Advance
                  </Button>
                  <Button
                    flex={1}
                    backgroundColor={paymentMode === 'full' ? accentColor : theme.bgSecondary}
                    color={paymentMode === 'full' ? '#FFFFFF' : theme.text}
                    borderWidth={1}
                    borderColor={theme.border}
                    borderRadius={12}
                    onPress={() => setPaymentMode('full')}>
                    Full Payment
                  </Button>
                </XStack>
                <Text fontSize={t(13)} color={theme.textMuted}>
                  Default: Advance
                </Text>
              </YStack>

              <YStack backgroundColor={theme.bgCard} borderRadius={14} padding={16} borderWidth={1} borderColor={theme.border} gap="$3">
                <Text fontSize={t(18)} fontWeight="800" color={theme.text}>
                  Apply Coupon
                </Text>
                <XStack gap="$2">
                  <Input
                    flex={1}
                    {...inputUi}
                    value={form.coupon}
                    onChangeText={(v) => setForm((p) => ({ ...p, coupon: v }))}
                    placeholder="ENTER COUPON CODE"
                  />
                  <Button backgroundColor={theme.bgSecondary} color={theme.text} onPress={applyCoupon} disabled={couponApplying} opacity={couponApplying ? 0.6 : 1}>
                    {couponApplying ? 'Applying…' : 'Apply'}
                  </Button>
                </XStack>

                {couponApplied ? (
                  <YStack backgroundColor={theme.couponBg} borderRadius={12} padding={12} borderWidth={1} borderColor={theme.success}>
                    <Text color={theme.couponText} fontWeight="800">
                      Applied: {couponApplied.code}
                    </Text>
                    {couponApplied.title ? (
                      <Text color={theme.couponText} fontSize={t(14)}>
                        {couponApplied.title}
                      </Text>
                    ) : null}
                  </YStack>
                ) : null}
              </YStack>

              {walletBalance > 0 ? (
                <YStack backgroundColor={theme.bgCard} borderRadius={14} padding={16} borderWidth={1} borderColor={theme.border} gap="$3">
                  <XStack justifyContent="space-between" alignItems="center">
                    <Text fontSize={t(16)} fontWeight="800" color={theme.text}>
                      Wallet Balance
                    </Text>
                    <Text fontSize={t(16)} fontWeight="900" color={theme.success}>
                      ₹{walletBalance.toLocaleString('en-IN')}
                    </Text>
                  </XStack>
                  <XStack gap="$2" alignItems="center">
                    <Input
                      flex={1}
                      placeholder="Enter amount"
                      value={walletAmount > 0 ? String(walletAmount) : ''}
                      onChangeText={(v) => setWalletAmount(Math.min(parseInt(v || '0', 10) || 0, walletBalance, amountDueNow))}
                      keyboardType="number-pad"
                      backgroundColor={theme.inputBg}
                      borderColor={theme.inputBorder}
                      color={theme.inputText}
                      placeholderTextColor={theme.textMuted}
                    />
                    <Button
                      backgroundColor={theme.bgSecondary}
                      color={theme.text}
                      borderRadius={10}
                      onPress={() => setWalletAmount(Math.min(walletBalance, amountDueNow))}
                      fontWeight="700">
                      Max
                    </Button>
                  </XStack>
                  {walletAmount > 0 ? (
                    <XStack justifyContent="space-between">
                      <Text fontSize={t(14)} color={theme.textMuted}>Using Wallet</Text>
                      <Text fontSize={t(14)} fontWeight="800" color={theme.text}>- ₹{walletAmount.toLocaleString('en-IN')}</Text>
                    </XStack>
                  ) : null}
                </YStack>
              ) : null}

              <YStack backgroundColor={theme.bgCard} borderRadius={14} padding={16} borderWidth={1} borderColor={theme.border} gap="$3">
                <Text fontSize={t(18)} fontWeight="800" color={theme.text}>
                  Price Breakdown
                </Text>
                <YStack gap="$2">
                  <XStack justifyContent="space-between">
                    <Text fontSize={t(14)} color={theme.textMuted}>Base Fare</Text>
                    <Text fontSize={t(14)} fontWeight="800" color={theme.text}>{currency(vehiclePricing?.baseFare ?? 0)}</Text>
                  </XStack>
                  <XStack justifyContent="space-between">
                    <Text fontSize={t(14)} color={theme.textMuted}>Distance ({distanceKm ? Math.round(distanceKm) : 0} km)</Text>
                    <Text fontSize={t(14)} fontWeight="800" color={theme.text}>{currency((distanceKm ?? 0) * (vehiclePricing?.perKm ?? 0))}</Text>
                  </XStack>
                  <XStack justifyContent="space-between">
                    <Text fontSize={t(14)} color={theme.textMuted}>Floor charges</Text>
                    <Text fontSize={t(14)} fontWeight="800" color={theme.text}>{currency(pickupFloorCharge + dropFloorCharge)}</Text>
                  </XStack>
                  <XStack justifyContent="space-between">
                    <Text fontSize={t(14)} color={theme.textMuted}>Labor ({form.laborers} Worker)</Text>
                    <Text fontSize={t(14)} fontWeight="800" color={theme.text}>{currency(form.laborers * (vehiclePricing?.laborUnit ?? 0))}</Text>
                  </XStack>
                  {form.boxCount > 0 ? (
                    <XStack justifyContent="space-between">
                      <Text fontSize={t(14)} color={theme.textMuted}>Boxes ({form.boxCount} × ₹55)</Text>
                      <Text fontSize={t(14)} fontWeight="800" color={theme.text}>{currency(boxCharge)}</Text>
                    </XStack>
                  ) : null}
                  <XStack justifyContent="space-between">
                    <Text fontSize={t(14)} color={theme.textMuted}>GST (18%)</Text>
                    <Text fontSize={t(14)} fontWeight="800" color={theme.text}>{currency(gst)}</Text>
                  </XStack>

                  {discountAmount > 0 ? (
                    <XStack justifyContent="space-between">
                      <Text fontSize={t(14)} color={theme.textMuted}>Discount</Text>
                      <Text fontSize={t(14)} fontWeight="800" color={theme.text}>- {currency(discountAmount)}</Text>
                    </XStack>
                  ) : null}
                  <XStack justifyContent="space-between">
                    <Text fontSize={t(14)} color={theme.textMuted}>Booking Total</Text>
                    <Text fontSize={t(14)} fontWeight="800" color={theme.text}>{currency(total)}</Text>
                  </XStack>
                  <XStack justifyContent="space-between">
                    <Text fontSize={t(14)} color={theme.textMuted}>Convenience Fee (2.36%)</Text>
                    <Text fontSize={t(14)} fontWeight="800" color={theme.text}>{currency(convenienceFee)}</Text>
                  </XStack>
                  <Text fontSize={t(11)} color={theme.textMuted}>Applied on the amount you pay now (selected advance or full payment)</Text>
                  <YStack height={1} backgroundColor={theme.bgSecondary} marginVertical={8} />
                  <XStack justifyContent="space-between">
                    <Text fontSize={t(20)} fontWeight="900">Final Payable</Text>
                    <Text fontSize={t(20)} fontWeight="900">{currency(totalPayable)}</Text>
                  </XStack>

                  <XStack justifyContent="space-between" marginTop={6}>
                    <Text fontSize={t(14)} color={theme.textMuted}>{paymentMode === 'full' ? 'Selected Full Payment' : 'Selected Advance Payment'}</Text>
                    <Text fontSize={t(14)} fontWeight="800" color={theme.text}>{currency(paymentBaseAmount)}</Text>
                  </XStack>
                  <XStack justifyContent="space-between" marginTop={6}>
                    <Text fontSize={t(14)} color={theme.textMuted}>Amount Due Now</Text>
                    <Text fontSize={t(14)} fontWeight="800" color={theme.success}>
                      {currency(amountDueNow)}
                    </Text>
                  </XStack>
                  <XStack justifyContent="space-between">
                    <Text fontSize={t(20)} fontWeight="900">Remaining</Text>
                    <Text fontSize={t(20)} fontWeight="900">{currency(Math.max(totalPayable - amountDueNow, 0))}</Text>
                  </XStack>
                </YStack>
              </YStack>

              <YStack backgroundColor={theme.bgCard} borderRadius={14} padding={16} borderWidth={1} borderColor={theme.border} gap="$3">
                <XStack gap="$2.5" alignItems="flex-start">
                  <Pressable
                    onPress={() => setAcceptedTerms(!acceptedTerms)}
                    style={{ width: 22, height: 22, marginTop: 2, borderRadius: 4, borderWidth: 2, borderColor: acceptedTerms ? '#D97706' : theme.border, backgroundColor: acceptedTerms ? '#D97706' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                    {acceptedTerms ? <Text color="#FFFFFF" fontSize={t(12)} fontWeight="900">✓</Text> : null}
                  </Pressable>
                  <YStack flex={1} minWidth={0}>
                    <Text fontSize={t(14)} color={theme.text} lineHeight={20}>
                      I have read and agree to the{' '}
                      <Text
                        color="#D97706"
                        fontWeight="800"
                        textDecorationLine="underline"
                        onPress={async () => {
                          try {
                            const uri = await getOrCreateTermsPdfUri();
                            setTermsPdfUrl(uri);
                            if (uri) await openLegalPdf(uri);
                          } catch (e) {
                            console.error('[Booking] T&C link error:', e);
                            Alert.alert('Error', `Could not open PDF.\n${String(e)}`);
                          }
                        }}>
                        Terms & Conditions
                      </Text>
                    </Text>
                  </YStack>
                </XStack>
                {!acceptedTerms ? (
                  <Text color="#EF4444" fontSize={t(12)} fontWeight="600">
                    You must accept the Terms & Conditions to proceed.
                  </Text>
                ) : null}
                <Pressable
                  onPress={async () => {
                    try {
                      const uri = await getOrCreateTermsPdfUri();
                      setTermsPdfUrl(uri);
                      if (uri) await downloadLegalPdf(uri, 'Gujarat_Relocation_Terms_and_Conditions.pdf');
                    } catch (e) {
                      console.error('[Booking] Download PDF error:', e);
                      Alert.alert('Error', `Could not download PDF.\n${String(e)}`);
                    }
                  }}>
                  <Text color={theme.textMuted} fontSize={t(13)} fontWeight="700" textDecorationLine="underline">
                    Download PDF
                  </Text>
                </Pressable>
              </YStack>

              {paymentMode === 'advance' ? (
                <YStack backgroundColor={theme.bgCard} borderRadius={14} padding={16} borderWidth={1} borderColor={theme.border} gap="$3">
                  <Text fontSize={t(18)} fontWeight="800" color={theme.text}>
                    Select Advance Amount
                  </Text>
                  <XStack gap="$2" flexWrap="wrap">
                    {[100, 200, 500, 1000, 2000, 5000].filter((amt) => amt <= Math.round(total)).map((amt) => (
                      <Button
                        key={amt}
                        backgroundColor={form.advanceAmount === amt ? accentColor : 'transparent'}
                        borderWidth={2}
                        borderColor={form.advanceAmount === amt ? accentColor : theme.border}
                        color={form.advanceAmount === amt ? '#FFFFFF' : theme.text}
                        onPress={() => {
                          setIsCustomAdvance(false);
                          setForm((p) => ({ ...p, advanceAmount: amt }));
                        }}>
                        {currency(amt)}
                      </Button>
                    ))}
                    <Button
                      backgroundColor={form.advanceAmount > 2000 ? accentColor : 'transparent'}
                      borderWidth={2}
                      borderColor={form.advanceAmount > 2000 ? accentColor : theme.border}
                      color={form.advanceAmount > 2000 ? '#FFFFFF' : theme.text}
                      onPress={() => {
                        setIsCustomAdvance(true);
                        setForm((p) => ({ ...p, advanceAmount: p.advanceAmount > 0 ? p.advanceAmount : 2500 }));
                      }}>
                      Custom
                    </Button>
                  </XStack>

                  {isCustomAdvance ? (
                    <YStack gap="$2">
                      <Text fontSize={t(14)} fontWeight="700" color={theme.text}>
                        Enter custom advance amount
                      </Text>
                      <Input
                        {...inputUi}
                        keyboardType="numeric"
                        value={customAdvanceText}
                        placeholder="Minimum 500"
                        onChangeText={(v) => {
                          const onlyDigits = v.replace(/\D/g, '');
                          setCustomAdvanceText(onlyDigits);
                          const parsed = Number(onlyDigits || 0);
                          setForm((p) => ({ ...p, advanceAmount: parsed }));
                        }}
                      />
                      <Text fontSize={t(13)} color={theme.textMuted}>
                        Only numbers. Minimum ₹500.
                      </Text>
                    </YStack>
                  ) : null}
                  <YStack
                    backgroundColor="#FEF3C7"
                    borderRadius={14}
                    padding={14}
                    borderWidth={1}
                    borderColor="#F59E0B"
                    gap="$3"
                    flexDirection="row"
                    alignItems="center">
                    <YStack gap="$1" flex={1} minWidth={0}>
                      <Text color="#92400E" fontWeight="900">
                        Advance Payment
                      </Text>
                      <Text color="#B45309" fontSize={t(14)} flexShrink={1}>
                        Pay now to confirm booking
                      </Text>
                      <Text color="#B45309" fontSize={t(13)} flexShrink={1}>
                        Remaining {currency(Math.max(totalPayable - amountDueNow, 0))} will be collected after delivery
                      </Text>
                    </YStack>
                    <Text
                      color="#92400E"
                      fontSize={t(22)}
                      fontWeight="900"
                      flexShrink={0}
                      maxWidth="40%"
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.75}
                      textAlign="right">
                      {currency(form.advanceAmount)}
                    </Text>
                  </YStack>
                </YStack>
              ) : null}

              <YStack backgroundColor={theme.bgCard} borderRadius={14} padding={16} borderWidth={1} borderColor={theme.border} gap="$3">
                <Text fontSize={t(18)} fontWeight="800" color={theme.text}>
                  Payment Method
                </Text>

                <YStack backgroundColor={theme.couponBg} borderRadius={14} padding={14} borderWidth={1} borderColor={theme.success}>
                  <Text color={theme.couponText} fontWeight="900">
                    100% Secure Payment
                  </Text>
                  <Text color={theme.couponText} fontSize={t(14)}>
                    Your payment is protected with bank-grade security
                  </Text>
                </YStack>
              </YStack>
            </YStack>
          ) : null}

          {error ? (
            <YStack backgroundColor={colorScheme === 'dark' ? '#450A0A' : '#FEE2E2'} borderRadius={12} padding={12} borderWidth={1} borderColor={colorScheme === 'dark' ? '#EF4444' : '#FCA5A5'}>
              <Text color={theme.danger} fontWeight="800">
                {error}
              </Text>
            </YStack>
          ) : null}

          {bookingId ? (
            <YStack backgroundColor={theme.couponBg} borderRadius={14} padding={20} borderWidth={2} borderColor={theme.success} gap="$4" alignItems="center">
              <Text fontSize={t(28)}>✅</Text>
              <Text color={theme.couponText} fontSize={t(18)} fontWeight="900" textAlign="center">
                Booking Confirmed!
              </Text>
              <Text color={theme.couponText} fontSize={t(14)} textAlign="center" lineHeight={20}>
                Your shifting booking has been created successfully.
              </Text>
              <YStack backgroundColor="#FFFFFF" borderRadius={10} padding={12} width="100%">
                <Text color="#374151" fontSize={t(12)}>Booking ID</Text>
                <Text color="#111827" fontSize={t(14)} fontWeight="700" selectable>{bookingId}</Text>
              </YStack>
              <XStack gap="$3" width="100%">
                <Button
                  flex={1}
                  backgroundColor={accentColor}
                  color={onAccentTextColor}
                  borderRadius={12}
                  minHeight={48}
                  fontWeight="700"
                  onPress={async () => {
                    if (bookingData) {
                      const { downloadBookingPdf } = await import('@/lib/generate-booking-pdf');
                      await downloadBookingPdf(bookingData);
                    }
                  }}>
                  Download PDF
                </Button>
                <Button
                  flex={1}
                  backgroundColor={theme.bgCard}
                  borderWidth={1}
                  borderColor={theme.border}
                  color={theme.text}
                  borderRadius={12}
                  minHeight={48}
                  fontWeight="700"
                  onPress={async () => {
                    if (bookingData) {
                      const { shareBookingPdf } = await import('@/lib/generate-booking-pdf');
                      await shareBookingPdf(bookingData);
                    }
                  }}>
                  Share PDF
                </Button>
              </XStack>
              <XStack gap="$3" width="100%">
                <Button
                  flex={1}
                  backgroundColor={theme.bgCard}
                  borderWidth={1}
                  borderColor={theme.border}
                  color={theme.text}
                  borderRadius={12}
                  minHeight={48}
                  fontWeight="700"
                  onPress={() => router.replace('/' as any)}>
                  Home
                </Button>
                <Button
                  flex={1}
                  backgroundColor={accentColor}
                  color={onAccentTextColor}
                  borderRadius={12}
                  minHeight={48}
                  fontWeight="700"
                  onPress={() => router.replace({ pathname: '/(tabs)/bookings', params: { toastBookingId: bookingId } } as any)}>
                  View Booking
                </Button>
              </XStack>
            </YStack>
          ) : null}
        </YStack>
      </ScrollView>

      {!bookingId ? (
        <YStack
          position="absolute"
          bottom={0}
          left={0}
          right={0}
          backgroundColor={theme.bgCard}
          borderTopWidth={1}
          borderTopColor={theme.border}
          padding={12}
          paddingBottom={insets.bottom + 12}>
          <XStack gap="$3" justifyContent="space-between" alignItems="center" alignSelf="center" width={containerWidth}>
            <Button
              flex={1}
              backgroundColor={theme.bgCard}
              borderWidth={1}
              borderColor={theme.border}
              color={theme.text}
              borderRadius={12}
              onPress={handleBack}
              disabled={false}>
              Back
            </Button>
            <Button
              flex={1.2}
              backgroundColor={canContinue ? accentColor : theme.textMuted}
              color={onAccentTextColor}
              borderRadius={12}
              onPress={handleContinue}
              disabled={!canContinue}>
              {step === 'payment' ? 'Pay Online' : 'Continue'}
            </Button>
          </XStack>
        </YStack>
      ) : null}

      <Dialog open={otpOpen} onOpenChange={setOtpOpen}>
        <Dialog.Portal>
          <Dialog.Overlay opacity={0.6} backgroundColor="#0F172A" />
          <Dialog.Content width={isWide ? 520 : '92%'} borderRadius={18} backgroundColor={theme.bgCard} padding={18}>
            <YStack gap="$3" alignItems="center">
              <YStack width={72} height={72} borderRadius={999} backgroundColor={accentColor} alignItems="center" justifyContent="center">
                <Text color={onAccentTextColor} fontSize={t(30)} fontWeight="900">
                  🔒
                </Text>
              </YStack>

              <YStack alignItems="center" gap="$1">
                <Dialog.Title asChild>
                  <H4 color={theme.text}>Verify Your Number</H4>
                </Dialog.Title>
                <Dialog.Description asChild>
                  <Paragraph textAlign="center" color={theme.textMuted}>
                    We&apos;ve sent a 6-digit OTP to {form.mobile ? `${form.mobile.slice(0, 2)}****${form.mobile.slice(-4)}` : 'your number'}
                  </Paragraph>
                </Dialog.Description>
                <Text color={theme.textMuted} fontSize={t(13)} fontWeight="600">
                  OTP expires in 5 minutes
                </Text>
                {error ? (
                  <Text color="#DC2626" fontSize={t(14)} textAlign="center">
                    {error}
                  </Text>
                ) : null}
              </YStack>

              <XStack gap="$1.5" justifyContent="center" alignItems="center" width="100%" flexWrap="nowrap">
                {otpDigits.map((d, i) => (
                  <Input
                    key={i}
                    {...otpInputUi}
                    value={d}
                    keyboardType="number-pad"
                    maxLength={1}
                    width={50}
                    height={54}
                    textAlign="center"
                    fontSize={t(18)}
                    fontWeight="900"
                    padding={0}
                    borderWidth={2}
                    borderRadius={10}
                    ref={(r: any) => {
                      otpRefs.current[i] = r;
                    }}
                    onChangeText={(v) => {
                      const digits = v.replace(/\D/g, '');
                      if (!digits) {
                        setOtpDigits((prev) => {
                          const next = [...prev];
                          next[i] = '';
                          return next;
                        });
                        return;
                      }

                      if (digits.length > 1) {
                        setOtpDigits((prev) => {
                          const next = [...prev];
                          for (let j = 0; j < digits.length && i + j < next.length; j += 1) {
                            next[i + j] = digits[j];
                          }
                          return next;
                        });
                        const focusIndex = Math.min(i + digits.length, otpRefs.current.length - 1);
                        otpRefs.current[focusIndex]?.focus?.();
                        return;
                      }

                      const digit = digits.slice(0, 1);
                      setOtpDigits((prev) => {
                        const next = [...prev];
                        next[i] = digit;
                        return next;
                      });
                      if (i < otpRefs.current.length - 1) {
                        otpRefs.current[i + 1]?.focus?.();
                      }
                    }}
                    onKeyPress={(e: any) => {
                      const key = e?.nativeEvent?.key;
                      if (key === 'Backspace' && !otpDigits[i] && i > 0) {
                        otpRefs.current[i - 1]?.focus?.();
                      }
                    }}
                  />
                ))}
              </XStack>

              <Button
                chromeless
                color={accentColor}
                marginTop={8}
                onPress={sendOtp}
                disabled={otpSending || otpVerifying || submitting}>
                {otpSending ? 'Sending…' : 'Resend OTP'}
              </Button>

              <YStack backgroundColor="#FEF3C7" borderRadius={14} padding={14} borderWidth={1} borderColor="#F59E0B" width="100%" gap="$3" flexDirection="row" alignItems="center">
                <YStack flex={1} minWidth={0}>
                  <Text color="#92400E" fontWeight="900">Advance Payment</Text>
                  <Text color="#B45309" fontSize={t(14)} flexShrink={1}>Pay now to confirm booking</Text>
                </YStack>
                <Text
                  color="#92400E"
                  fontSize={t(20)}
                  fontWeight="900"
                  flexShrink={0}
                  maxWidth="40%"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                  textAlign="right">
                  {currency(form.advanceAmount)}
                </Text>
              </YStack>

              <XStack gap="$2" width="100%">
                <Button
                  flex={1}
                  backgroundColor={theme.bgSecondary}
                  borderWidth={1}
                  borderColor={theme.border}
                  color={theme.text}
                  borderRadius={12}
                  hoverStyle={{ backgroundColor: theme.bgCard, borderColor: theme.border, color: theme.text } as any}
                  focusStyle={{ backgroundColor: theme.bgCard, borderColor: theme.border, color: theme.text } as any}
                  pressStyle={{ backgroundColor: theme.bgCard, borderColor: theme.border, color: theme.text } as any}
                  onPress={() => {
                    setError(null);
                    setOtpOpen(false);
                  }}
                  disabled={submitting}>
                  Cancel
                </Button>
                <Button
                  flex={1}
                  backgroundColor={accentColor}
                  color={onAccentTextColor}
                  borderRadius={12}
                  hoverStyle={{ backgroundColor: accentColor } as any}
                  focusStyle={{ backgroundColor: accentColor } as any}
                  pressStyle={{ backgroundColor: accentColor } as any}
                  onPress={verifyOtpAndPay}
                  disabled={submitting || otpSending || otpVerifying}>
                  {otpVerifying ? 'Verifying…' : otpSending ? 'Sending…' : 'Verify & Pay'}
                </Button>
              </XStack>
            </YStack>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>

      <Dialog open={processingOpen} onOpenChange={setProcessingOpen}>
        <Dialog.Portal>
          <Dialog.Overlay opacity={0.6} backgroundColor="#0F172A" />
          <Dialog.Content width={isWide ? 400 : '85%'} borderRadius={18} backgroundColor={theme.bgCard} padding={28}>
            <YStack gap="$4" alignItems="center">
              <YStack width={80} height={80} borderRadius={999} backgroundColor={accentColor} alignItems="center" justifyContent="center">
                <ActivityIndicator size="large" color={onAccentTextColor} />
              </YStack>
              <Text color={theme.text} fontSize={t(18)} fontWeight="900" textAlign="center">
                Processing Payment
              </Text>
              <Text color={theme.textMuted} fontSize={t(14)} textAlign="center">
                Please wait while we process your payment and confirm your booking...
              </Text>
              <YStack width="100%" height={6} borderRadius={3} backgroundColor={theme.border} overflow="hidden">
                <YStack width="100%" height={6} borderRadius={3} backgroundColor="#22C55E" animation="lazy">
                  <YStack
                    position="absolute"
                    width="30%"
                    height={6}
                    borderRadius={3}
                    backgroundColor={theme.success}
                    animation={undefined}
                  />
                </YStack>
              </YStack>
            </YStack>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>

      <Dialog open={successOpen} onOpenChange={setSuccessOpen}>
        <Dialog.Portal>
          <Dialog.Overlay opacity={0.6} backgroundColor="#0F172A" />
          <Dialog.Content width={isWide ? 480 : '92%'} borderRadius={18} backgroundColor={theme.bgCard} padding={24}>
            <YStack gap="$4" alignItems="center">
              <YStack width={72} height={72} borderRadius={999} backgroundColor={theme.couponBg} alignItems="center" justifyContent="center">
                <Text fontSize={t(36)}>✅</Text>
              </YStack>
              <Text color={theme.text} fontSize={t(20)} fontWeight="900" textAlign="center">
                Booking Confirmed!
              </Text>
              <Text color={theme.textMuted} fontSize={t(14)} textAlign="center" lineHeight={20}>
                Your shifting booking has been created successfully.
              </Text>
              <YStack backgroundColor={theme.inputBg} borderRadius={10} padding={14} width="100%">
                <Text color={theme.textMuted} fontSize={t(12)}>Booking ID</Text>
                <Text color={theme.text} fontSize={t(14)} fontWeight="700" selectable>
                  {bookingId}
                </Text>
              </YStack>
              <XStack gap="$3" width="100%">
                <Button
                  flex={1}
                  backgroundColor={accentColor}
                  color={onAccentTextColor}
                  borderRadius={12}
                  minHeight={48}
                  fontWeight="700"
                  onPress={async () => {
                    if (bookingData) {
                      const { downloadBookingPdf } = await import('@/lib/generate-booking-pdf');
                      await downloadBookingPdf(bookingData);
                    }
                  }}>
                  Download PDF
                </Button>
                <Button
                  flex={1}
                  backgroundColor={theme.bgCard}
                  borderWidth={1}
                  borderColor={theme.border}
                  color={theme.text}
                  borderRadius={12}
                  minHeight={48}
                  fontWeight="700"
                  onPress={async () => {
                    if (bookingData) {
                      const { shareBookingPdf } = await import('@/lib/generate-booking-pdf');
                      await shareBookingPdf(bookingData);
                    }
                  }}>
                  Share PDF
                </Button>
              </XStack>
              <XStack gap="$3" width="100%">
                <Button
                  flex={1}
                  backgroundColor={theme.bgCard}
                  borderWidth={1}
                  borderColor={theme.border}
                  color={theme.text}
                  borderRadius={12}
                  minHeight={48}
                  fontWeight="700"
                  onPress={() => {
                    setSuccessOpen(false);
                    router.replace('/' as any);
                  }}>
                  Home
                </Button>
                <Button
                  flex={1}
                  backgroundColor={accentColor}
                  color={onAccentTextColor}
                  borderRadius={12}
                  minHeight={48}
                  fontWeight="700"
                  onPress={() => {
                    setSuccessOpen(false);
                    router.replace({ pathname: '/(tabs)/bookings', params: { toastBookingId: bookingId } } as any);
                  }}>
                  View Booking
                </Button>
              </XStack>
            </YStack>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>

      <Modal visible={mediaViewerOpen} transparent animationType="fade" onRequestClose={() => setMediaViewerOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center', padding: 16 }}
          onPress={() => setMediaViewerOpen(false)}>
          <Pressable onPress={() => {}} style={{ width: '100%', maxWidth: 760, alignItems: 'center' }}>
            <XStack width="100%" justifyContent="space-between" alignItems="center" marginBottom={12}>
              <Button
                backgroundColor="rgba(255,255,255,0.15)"
                color="#FFFFFF"
                borderRadius={20}
                width={44}
                height={44}
                padding={0}
                onPress={() => {
                  if (mediaViewerIndex > 0) setMediaViewerIndex((i) => i - 1);
                }}
                disabled={mediaViewerIndex <= 0}
                opacity={mediaViewerIndex <= 0 ? 0.35 : 1}>
                ←
              </Button>
              <Button
                backgroundColor="rgba(255,255,255,0.15)"
                color="#FFFFFF"
                borderRadius={20}
                width={44}
                height={44}
                padding={0}
                onPress={() => setMediaViewerOpen(false)}>
                ✕
              </Button>
              <Button
                backgroundColor="rgba(255,255,255,0.15)"
                color="#FFFFFF"
                borderRadius={20}
                width={44}
                height={44}
                padding={0}
                onPress={() => {
                  if (mediaViewerIndex < mediaViewerList.length - 1) setMediaViewerIndex((i) => i + 1);
                }}
                disabled={mediaViewerIndex >= mediaViewerList.length - 1}
                opacity={mediaViewerIndex >= mediaViewerList.length - 1 ? 0.35 : 1}>
                →
              </Button>
            </XStack>
            <YStack
              width={mediaViewerWidth}
              height={mediaViewerHeight}
              alignItems="center"
              justifyContent="center"
              borderRadius={12}
              overflow="hidden">
              {renderMediaViewerContent()}
            </YStack>
            {mediaViewerList[mediaViewerIndex]?.type === 'video' ? (
              <XStack gap="$2" marginTop={12}>
                <Button
                  backgroundColor={viewerVideoPlaying ? 'rgba(255,255,255,0.2)' : '#F97316'}
                  color="#FFFFFF"
                  borderRadius={10}
                  onPress={() => void toggleViewerVideo(true)}>
                  Play
                </Button>
                <Button
                  backgroundColor={!viewerVideoPlaying ? 'rgba(255,255,255,0.2)' : '#64748B'}
                  color="#FFFFFF"
                  borderRadius={10}
                  onPress={() => void toggleViewerVideo(false)}>
                  Pause
                </Button>
              </XStack>
            ) : null}
            <Text color={theme.border} fontSize={t(15)} fontWeight="700" marginTop={14}>
              {mediaViewerIndex + 1} / {mediaViewerList.length}
              {mediaViewerList[mediaViewerIndex]?.type === 'photo' ? ' · Photo' : ''}
              {mediaViewerList[mediaViewerIndex]?.type === 'video' ? ' · Video' : ''}
            </Text>
          </Pressable>
        </Pressable>
      </Modal>
    </YStack>
  );
}
