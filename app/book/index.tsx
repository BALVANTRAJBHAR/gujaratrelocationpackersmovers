import { Audio, ResizeMode, Video } from 'expo-av';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import { Image as ExpoImage } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Modal, Platform, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import RazorpayCheckout from 'react-native-razorpay';
import { Button, Dialog, H4, Input, Paragraph, Text, XStack, YStack } from 'tamagui';

import AppDateTimePicker from '@/components/AppDateTimePicker';
import BookingMapPicker from '@/components/booking-map-picker';
import { themes } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getRouteDistance, reverseGeocode, searchPlaces } from '@/lib/mapbox';
import { getMapboxToken, getRazorpayKeyId } from '@/lib/public-config';
import { createRazorpayOrder, verifyRazorpaySignature } from '@/lib/razorpay';
import { supabase } from '@/lib/supabase';
import { findExistingUserByPhone } from '@/lib/user-duplicate-check';
import { useSession } from '@/providers/session-provider';

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
  '10:00 AM', '11:00 AM', '12:00 PM',
  '2:00 PM', '3:00 PM', '4:00 PM',
  '5:00 PM', '6:00 PM', '7:00 PM',
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
  const { session, profile, refreshProfile } = useSession();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isWide = screenWidth >= 820;
  const mediaViewerWidth = Math.min(screenWidth - 32, 720);
  const mediaViewerHeight = Math.min(screenHeight * 0.65, 520);
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? themes.dark : themes.light;

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
      borderColor: '#1F4E79',
      color: theme.inputText,
      placeholderTextColor: theme.textMuted,
      hoverStyle: {
        backgroundColor: theme.inputBg,
        borderColor: '#1F4E79',
        color: theme.inputText,
      } as any,
      focusStyle: {
        backgroundColor: theme.inputBg,
        borderColor: '#1F4E79',
        color: theme.inputText,
      } as any,
      pressStyle: {
        backgroundColor: theme.inputBg,
        borderColor: '#1F4E79',
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

  const [mapboxToken, setMapboxToken] = useState('');
  const [mapPickerOpen, setMapPickerOpen] = useState(false);
  const [mapPickerTarget, setMapPickerTarget] = useState<'pickup' | 'drop'>('pickup');
  const [mapPickerCoord, setMapPickerCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [mapPickerBusy, setMapPickerBusy] = useState(false);

  const [floorPickerOpen, setFloorPickerOpen] = useState(false);
  const [floorPickerTarget, setFloorPickerTarget] = useState<'pickup' | 'drop'>('pickup');

  const [laborPickerOpen, setLaborPickerOpen] = useState(false);
  const [vehiclePickerOpen, setVehiclePickerOpen] = useState(false);
  const [mediaViewerOpen, setMediaViewerOpen] = useState(false);
  const [mediaViewerIndex, setMediaViewerIndex] = useState(0);
  const [mediaViewerList, setMediaViewerList] = useState<{ uri: string; type: 'photo' | 'video' }[]>([]);
  const [viewerVideoPlaying, setViewerVideoPlaying] = useState(true);
  const viewerVideoRef = useRef<Video>(null);
  const viewerWebVideoRef = useRef<HTMLVideoElement | null>(null);
  const [shiftingDateValue, setShiftingDateValue] = useState<Date | null>(null);
  const [timePickerOpen, setTimePickerOpen] = useState(false);

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
  const otpRefs = useRef<Array<any>>([]);
  const mobileRef = useRef<any>(null);
  const pickupRef = useRef<any>(null);
  const vehicleFieldRef = useRef<any>(null);
  const vehicleAutoOpenedRef = useRef(false);
  const locationStepMountedRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(null);

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

  const withTimeout = async <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
    let timer: any;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    });
    try {
      return await Promise.race([promise, timeout]);
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

  const confirmMapPicker = async () => {
    if (!mapPickerCoord) return;
    setMapPickerBusy(true);
    try {
      const coords: [number, number] = [mapPickerCoord.lng, mapPickerCoord.lat];
      let address = '';
      try {
        address = await reverseGeocode(mapPickerCoord.lng, mapPickerCoord.lat);
      } catch {
        address = '';
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

  useEffect(() => {
    if (!form.shiftingDate) {
      setShiftingDateValue(null);
      return;
    }
    const parsed = parseDateDdMmYyyy(form.shiftingDate);
    if (parsed) setShiftingDateValue(parsed);
  }, [form.shiftingDate]);

  const onShiftingDateChange = (_e: any, picked?: Date) => {
    if (!picked) return;
    const min = shiftingMinDate();
    const max = shiftingMaxDate();
    const clamped = new Date(Math.min(Math.max(picked.getTime(), min.getTime()), max.getTime()));
    setShiftingDateValue(clamped);
    setForm((p) => ({ ...p, shiftingDate: formatDateDdMmYyyy(clamped) }));
  };

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
    const items: Array<{ uri: string; kind: 'photo' | 'video' }> = [
      ...form.photos.map((uri) => ({ uri, kind: 'photo' as const })),
      ...form.videos.map((uri) => ({ uri, kind: 'video' as const })),
    ];
    if (!items.length) return;

    for (const it of items) {
      const fileInfo = await FileSystem.getInfoAsync(it.uri, { size: true });
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

  const addressTextRef = useRef('');
  useEffect(() => {
    let cancelled = false;
    const query = activeLocationField === 'pickup' ? form.pickupAddress : form.dropAddress;
    if (query === addressTextRef.current) return;
    addressTextRef.current = query;

    if (!activeLocationField || !query.trim()) {
      setPlaceResults([]);
      return;
    }

    const timeout = setTimeout(async () => {
      try {
        setLoadingPlaces(true);
        const data = await searchPlaces(query);
        if (cancelled) return;
        setPlaceResults(data as PlaceItem[]);
      } catch {
        if (cancelled) return;
        setPlaceResults([]);
      } finally {
        if (cancelled) return;
        setLoadingPlaces(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
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
    getMapboxToken()
      .then((t) => {
        if (!cancelled) setMapboxToken(t);
      })
      .catch(() => {
        if (!cancelled) setMapboxToken('');
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

  const pickupFloorCharge = useMemo(() => {
    const opt = floorOptions.find((f) => f.label === form.pickupFloor) ?? null;
    if (!opt) return 0;
    const withLift = typeof opt.charge_with_lift === 'number' ? opt.charge_with_lift : 0;
    const withoutLift = typeof opt.charge_without_lift === 'number' ? opt.charge_without_lift : 0;
    return form.pickupLift ? withLift : withoutLift;
  }, [floorOptions, form.pickupFloor, form.pickupLift]);

  const dropFloorCharge = useMemo(() => {
    const opt = floorOptions.find((f) => f.label === form.dropFloor) ?? null;
    if (!opt) return 0;
    const withLift = typeof opt.charge_with_lift === 'number' ? opt.charge_with_lift : 0;
    const withoutLift = typeof opt.charge_without_lift === 'number' ? opt.charge_without_lift : 0;
    return form.dropLift ? withLift : withoutLift;
  }, [floorOptions, form.dropFloor, form.dropLift]);

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

  const discountAmount = useMemo(() => {
    const d = roundMoney(Math.max(couponDiscount, 0));
    return Math.min(d, subtotal);
  }, [couponDiscount, subtotal]);

  const discountedSubtotal = useMemo(() => roundMoney(Math.max(subtotal - discountAmount, 0)), [subtotal, discountAmount]);
  const gst = useMemo(() => roundMoney(discountedSubtotal * 0.18), [discountedSubtotal]);
  const total = useMemo(() => roundMoney(discountedSubtotal + gst), [discountedSubtotal, gst]);

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
    if (step === 'payment') return form.advanceAmount > 0;
    return false;
  }, [form, isEmailValid, isMobileValid, isNameValid, step]);

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

    if (step === 'location') {
      if (distanceKm === null) {
        setError('Distance unavailable. Please reselect pickup/drop.');
        return;
      }
      gotoStepIndex(stepIndex + 1);
      return;
    }

    if (step === 'payment') {
      if (!Number.isFinite(form.advanceAmount) || form.advanceAmount < 500) {
        setError('Advance amount must be at least ₹500.');
        return;
      }
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
        {loadingPlaces ? <Text color="#64748B">Loading suggestions…</Text> : null}
        {placeResults.length ? (
          <>
            <Text fontSize={14} color="#64748B">
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
      const remainingAmount = Math.max(total - (form.advanceAmount ?? 0), 0);
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
          status: 'pending',
          payment_status: 'pending',
          estimated_price: total,
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
            subtotal,
            gst,
            total,
          },
          advance_amount: form.advanceAmount,
          remaining_amount: remainingAmount,
          payment_method: form.paymentMethod,
          pickup_otp: pickupOtp,
          delivery_otp: deliveryOtp,
          otp_verified: true,
        })
        .select('id')
        .single();

      if (insertError) {
        setError(insertError.message);
        return;
      }

      setBookingId(data.id);

      try {
        await supabase.functions.invoke('send-booking-status-push', {
          body: { booking_id: data.id, status: 'pending' },
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
      setOtpOpen(false);
      router.replace('/(tabs)/bookings' as any);
    } catch {
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
      const remainingAmount = Math.max(total - (form.advanceAmount ?? 0), 0);
      const scheduledDate = form.shiftingDate ? normalizeToIsoDate(form.shiftingDate) : null;

      const generateOtp = () => String(Math.floor(1000 + Math.random() * 9000));
      const pickupOtp = generateOtp();
      const deliveryOtp = generateOtp();

      const payAmountRupees = paymentMode === 'full' ? Math.round(total) : Math.round(form.advanceAmount ?? 0);
      const order = await createRazorpayOrder({
        amount: Math.round(payAmountRupees * 100),
        currency: 'INR',
        receipt: `bk_${Date.now()}`,
      });

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
        theme: { color: '#1F4E79' },
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
          status: 'pending',
          payment_status: 'paid',
          estimated_price: total,
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
            subtotal,
            gst,
            total,
          },
          advance_amount: form.advanceAmount,
          remaining_amount: remainingAmount,
          payment_method: form.paymentMethod,
          pickup_otp: pickupOtp,
          delivery_otp: deliveryOtp,
          otp_verified: true,
        })
        .select('id')
        .single();

      if (insertError || !booking?.id) {
        const reason = insertError?.message ?? 'Booking insert returned no ID';
        await supabase.from('payments').insert({
          booking_id: null,
          user_id: session.user.id,
          amount: (order.amount ?? 0) / 100,
          status: 'paid',
          razorpay_order_id: order.id,
          razorpay_payment_id: paymentData.razorpay_payment_id,
          error: { booking_insert_error: reason },
          metadata: {
            mode: paymentMode,
            razorpay_signature: paymentData.razorpay_signature,
          },
        });

        setError(`Payment succeeded, but booking creation failed: ${reason}. Please contact support.`);
        return;
      }

      const createdBookingId = booking.id;

      try {
        await supabase.functions.invoke('send-booking-status-push', {
          body: { booking_id: createdBookingId, status: 'pending' },
        });
      } catch {
        // ignore push failures
      }

      try {
        await uploadBookingUploads(createdBookingId);
      } catch (e: any) {
        console.error('[Booking] Upload failed after booking created:', e);
      }

      const { error: paymentInsertError } = await supabase.from('payments').insert({
        booking_id: createdBookingId,
        user_id: session.user.id,
        amount: (order.amount ?? 0) / 100,
        status: 'paid',
        razorpay_order_id: order.id,
        razorpay_payment_id: paymentData.razorpay_payment_id,
        error: null,
        metadata: {
          mode: paymentMode,
          razorpay_signature: paymentData.razorpay_signature,
        },
      });

      if (paymentInsertError) {
        console.error('[Booking] Payment record insert failed after booking created:', paymentInsertError);
      }

      setBookingId(createdBookingId);

      try {
        await supabase.functions.invoke('send-booking-bill', {
          body: { booking_id: createdBookingId },
        });
      } catch {
        // ignore email failures
      }

      setOtpOpen(false);
      router.replace({ pathname: '/(tabs)/bookings', params: { toastBookingId: createdBookingId } } as any);
    } catch (e) {
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
      const info = size === null ? await FileSystem.getInfoAsync(uri, { size: true }) : null;
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
    const info = size === null ? await FileSystem.getInfoAsync(asset.uri, { size: true }) : null;
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
      <YStack backgroundColor="#1F4E79" padding={16} paddingTop={18}>
        <XStack alignItems="center" justifyContent="center" position="relative">
          <Button
            size="$3"
            chromeless
            color="#FFFFFF"
            position="absolute"
            left={0}
            onPress={() => {
              handleBack();
            }}>
            ‹
          </Button>
          <YStack alignItems="center">
            <Text color="#FFFFFF" fontSize={18} fontWeight="800">
              Book Your Move
            </Text>
            <Text color="#CFE3F4" fontSize={14} fontWeight="600">
              Step {stepIndex + 1} of 5
            </Text>
          </YStack>
        </XStack>
      </YStack>

      <YStack backgroundColor={theme.bgCard} padding={14} borderBottomWidth={1} borderBottomColor={theme.border}>
        <XStack justifyContent="space-between" alignItems="center">
          {stepOrder.map((k, idx) => {
            const done = idx < stepIndex;
            const active = idx === stepIndex;
            const bg = done ? theme.success : active ? '#1F4E79' : theme.border;
            const color = done || active ? '#FFFFFF' : theme.textMuted;
            return (
              <XStack key={k} flex={1} alignItems="center">
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
                    fontSize={13}
                    color={active ? theme.text : theme.textMuted}
                    textAlign="center"
                    numberOfLines={2}
                    height={28}
                    lineHeight={14}>
                    {stepMeta[k].label}
                  </Text>
                </YStack>
                {idx < stepOrder.length - 1 ? (
                  <YStack height={2} flex={1} backgroundColor={done ? theme.success : theme.border} />
                ) : null}
              </XStack>
            );
          })}
        </XStack>
      </YStack>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120, alignItems: 'center' }}>
        <YStack width={containerWidth} gap="$4">
          {step === 'info' ? (
            <>
              <YStack backgroundColor={theme.bgCard} borderRadius={14} padding={16} borderWidth={1} borderColor={theme.border} gap="$3">
                <XStack alignItems="center" gap="$2">
                  <Text fontSize={18} fontWeight="800" color="#2d56afff">
                    Customer Information
                  </Text>
                </XStack>
                <YStack gap="$2">
                  <Text fontSize={14} fontWeight="700" color="#456bbeff">
                    Full Name *
                  </Text>
                  <Input
                    {...inputUi}
                    value={form.fullName}
                    onChangeText={(v) => setForm((p) => ({ ...p, fullName: v }))}
                    placeholder="Enter full name"
                  />
                  {!isNameValid && form.fullName.trim() ? (
                    <Text fontSize={13} color="#991B1B">
                      Name must be at least 3 characters.
                    </Text>
                  ) : null}
                </YStack>
                <YStack gap="$2">
                  <Text fontSize={14} fontWeight="700" color="#3d5faaff">
                    Mobile Number *
                  </Text>
                  <Input
                    {...inputUi}
                    value={form.mobile}
                    keyboardType="number-pad"
                    ref={mobileRef}
                    onChangeText={(v) => {
                      const digits = v.replace(/\D/g, '').slice(0, 10);
                      setForm((p) => ({ ...p, mobile: digits }));
                    }}
                    placeholder="10 digit mobile"
                  />
                  {!isMobileValid && form.mobile.trim() ? (
                    <Text fontSize={13} color="#991B1B">
                      Enter a valid 10 digit mobile number.
                    </Text>
                  ) : null}
                  <Text fontSize={13} color={theme.textMuted}>
                    OTP will be sent to this number
                  </Text>
                </YStack>
                <YStack gap="$2">
                  <Text fontSize={14} fontWeight="700" color="#3d60acff">
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
                    <Text fontSize={13} color="#991B1B">
                      Enter a valid email address.
                    </Text>
                  ) : null}
                </YStack>
              </YStack>

              <YStack backgroundColor={theme.bgCard} borderRadius={14} padding={16} borderWidth={1} borderColor={theme.border} gap="$3">
                <Text fontSize={18} fontWeight="800" color="#3c5ea8ff">
                  Type of Shifting
                </Text>
                <XStack flexWrap="wrap" gap="$3" justifyContent="space-between">
                  {MOVE_TYPES.map((t) => {
                    const selected = form.moveType === t.key;
                    return (
                      <Pressable
                        key={t.key}
                        onPress={() => setForm((p) => ({ ...p, moveType: t.key }))}
                        style={{ width: isWide ? '32%' : '48%' }}>
                        <YStack
                          backgroundColor={selected ? theme.bgSecondary : '#FFFFFF'}
                          borderRadius={14}
                          padding={14}
                          borderWidth={2}
                          borderColor={selected ? '#1F4E79' : theme.border}
                          gap="$1">
                          <Text fontWeight="800" color="#2f52a0ff">
                            {t.title}
                          </Text>
                          <Text fontSize={13} color="#64748B">
                            {t.subtitle}
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
              <Text fontSize={18} fontWeight="800" color="#355cafff">
                Location
              </Text>

              <YStack gap="$3">
                <Text fontSize={15} fontWeight="800" color="#335aadff">
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
                    <Text fontSize={14} fontWeight="700" color="#3c5facff">
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
                      <Text fontSize={13} color="#991B1B">
                        {floorError}
                      </Text>
                    ) : null}
                  </YStack>
                  <YStack flex={1} minWidth={220} gap="$2">
                    <Text fontSize={14} fontWeight="700" color="#4062acff">
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
                        <Text fontWeight="700" color="#3d5ea5ff">
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
                </XStack>

                <YStack height={1} backgroundColor={theme.bgSecondary} marginVertical={8} />

                <Text fontSize={15} fontWeight="800" color="#4163adff">
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
                    <Text fontSize={14} fontWeight="700" color="#4163adff">
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
                  <YStack flex={1} minWidth={220} gap="$2">
                    <Text fontSize={14} fontWeight="700" color="#4163adff">
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
                        <Text fontWeight="700" color="#4163adff">
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
                </XStack>

                <XStack justifyContent="space-between" alignItems="center">
                  <Text color="#64748B">Distance</Text>
                  <Text fontWeight="800" color="#4163adff">
                    {distanceKm === null ? '—' : `${distanceKm.toFixed(1)} km`}
                  </Text>
                </XStack>

                <XStack justifyContent="space-between" alignItems="center">
                  <Text color="#64748B">Floor charges</Text>
                  <Text fontWeight="800" color="#4163adff">
                    {currency(pickupFloorCharge + dropFloorCharge)}
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
            token={mapboxToken}
            coord={mapPickerCoord}
            onCoordChange={setMapPickerCoord}
            onConfirm={confirmMapPicker}
            busy={mapPickerBusy}
            isWide={isWide}
          />

          <Dialog open={floorPickerOpen} onOpenChange={setFloorPickerOpen}>
            <Dialog.Portal>
              <Dialog.Overlay opacity={0.6} backgroundColor="#6289e4ff" />
              <Dialog.Content
                backgroundColor={theme.bgCard}
                borderRadius={16}
                padding={16}
                width={isWide ? 520 : '92%'}>
                <YStack gap="$3">
                  <Text fontSize={18} fontWeight="900" color="#3a5fafff">
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
                            backgroundColor={selected ? '#1F4E79' : theme.bgSecondary}
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
                  <Button backgroundColor={theme.bgSecondary} color="#4163adff" onPress={() => setFloorPickerOpen(false)}>
                    Close
                  </Button>
                </YStack>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog>

          {step === 'vehicle' ? (
            <>
              <YStack backgroundColor={theme.bgCard} borderRadius={14} padding={16} borderWidth={1} borderColor={theme.border} gap="$3">
                <Text fontSize={18} fontWeight="800" color="#4163adff">
                  Select Vehicle
                </Text>

                <YStack gap="$3">
                  {loadingVehicles ? <Text color="#64748B">Loading vehicles…</Text> : null}
                  {vehicleError ? <Text color="#991B1B">{vehicleError}</Text> : null}

                  <YStack gap="$2">
                    <Text fontSize={14} fontWeight="700" color="#4163adff">
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
                      <Text fontSize={18} fontWeight="900" color="#4163adff">
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
                                borderColor={selected ? '#1F4E79' : theme.border}
                                padding={14}
                                gap="$2">
                                <XStack gap="$3" alignItems="center">
                                  {v.image_url ? (
                                    <ExpoImage source={{ uri: v.image_url }} style={{ width: 64, height: 52, borderRadius: 10 }} contentFit="cover" />
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
                                      <Text color="#64748B" fontSize={12} fontWeight="700">
                                        NO IMAGE
                                      </Text>
                                    </YStack>
                                  )}

                                  <YStack flex={1} gap="$1" justifyContent="center">
                                    <Text fontWeight="900" color={theme.text}>
                                      {v.name}
                                    </Text>
                                    <Text fontSize={13} color="#64748B" numberOfLines={2}>
                                      {v.description ?? 'Premium moving vehicle'}
                                    </Text>
                                    <Text fontSize={13} color="#64748B">
                                      {v.capacity ?? '—'}
                                    </Text>
                                    <Text fontWeight="900" color="#1F4E79">
                                      {currency(baseFare)}{' '}
                                      <Text color="#64748B" fontWeight="600">
                                        + {currency(perKm)}/km
                                      </Text>
                                    </Text>
                                  </YStack>

                                  {selected ? (
                                    <YStack
                                      width={22}
                                      height={22}
                                      borderRadius={999}
                                      backgroundColor="#1F4E79"
                                      alignItems="center"
                                      justifyContent="center">
                                      <Text color="#FFFFFF" fontWeight="900">
                                        ✓
                                      </Text>
                                    </YStack>
                                  ) : (
                                    <YStack width={22} height={22} borderRadius={999} borderWidth={2} borderColor="#CBD5E1" />
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
                <Text fontSize={18} fontWeight="800" color={theme.text}>
                  Schedule & Labor
                </Text>

                <YStack gap="$3">
                  <YStack gap="$2">
                    <Text fontSize={14} fontWeight="700" color={theme.text}>
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
                    <Text fontSize={13} color="#64748B">
                      Charges will be calculated automatically.
                    </Text>
                  </YStack>

                  <XStack gap="$3" flexWrap="wrap">
                    <YStack flex={1} minWidth={240} gap="$2">
                      <Text fontSize={14} fontWeight="700" color={theme.text}>
                        Shifting Date
                      </Text>
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
                        <YStack
                          position="absolute"
                          top={0}
                          left={0}
                          right={0}
                          bottom={0}
                          opacity={Platform.OS === 'web' ? 0.02 : 0.01}
                          pointerEvents="auto">
                          <AppDateTimePicker
                            value={shiftingDateValue ?? shiftingMinDate()}
                            mode="date"
                            display="default"
                            minimumDate={shiftingMinDate()}
                            maximumDate={shiftingMaxDate()}
                            onChange={onShiftingDateChange}
                            style={{ height: 48, padding: '0 12px' }}
                          />
                        </YStack>
                      </YStack>
                    </YStack>
                    <YStack flex={1} minWidth={240} gap="$2">
                      <Text fontSize={14} fontWeight="700" color={theme.text}>
                        Preferred Time
                      </Text>
                      <Pressable onPress={() => setTimePickerOpen(true)}>
                        <YStack pointerEvents="none">
                          <Input {...inputUi} value={form.preferredTime} placeholder="Select time" />
                        </YStack>
                      </Pressable>
                    </YStack>
                  </XStack>

                  <YStack
                    backgroundColor="#1F4E79"
                    borderRadius={14}
                    padding={16}
                    justifyContent="space-between"
                    flexDirection="row"
                    alignItems="center">
                    <YStack>
                      <Text color="#CFE3F4" fontSize={14} fontWeight="700">
                        Estimated Price
                      </Text>
                      <Text color="#FFFFFF" fontSize={28} fontWeight="900">
                        {currency(total)}
                      </Text>
                    </YStack>
                    <YStack alignItems="flex-end">
                      <Text color="#CFE3F4" fontSize={14} fontWeight="700">
                        Pay Advance
                      </Text>
                      <Text color="#FFFFFF" fontSize={20} fontWeight="900">
                        {currency(form.advanceAmount)}
                      </Text>
                    </YStack>
                  </YStack>
                </YStack>
              </YStack>
            </>
          ) : null}

          <Dialog open={laborPickerOpen} onOpenChange={setLaborPickerOpen}>
            <Dialog.Portal>
              <Dialog.Overlay opacity={0.6} backgroundColor="#0F172A" />
              <Dialog.Content backgroundColor={theme.bgCard} borderRadius={16} padding={16} width={isWide ? 520 : '92%'}>
                <YStack gap="$3">
                  <Text fontSize={18} fontWeight="900" color={theme.text}>
                    Select Laborers
                  </Text>
                  <YStack gap="$2">
                    {Array.from({ length: 10 }, (_, idx) => idx + 1).map((n) => {
                      const selected = form.laborers === n;
                      return (
                        <Button
                          key={n}
                          backgroundColor={selected ? '#1F4E79' : theme.bgSecondary}
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

          <Dialog open={timePickerOpen} onOpenChange={setTimePickerOpen}>
            <Dialog.Portal>
              <Dialog.Overlay opacity={0.6} backgroundColor="#0F172A" />
              <Dialog.Content backgroundColor={theme.bgCard} borderRadius={16} padding={16} width={isWide ? 520 : '92%'}>
                <YStack gap="$3">
                  <Text fontSize={18} fontWeight="900" color={theme.text}>
                    Select Preferred Time (IST)
                  </Text>
                  <XStack gap="$2" flexWrap="wrap" justifyContent="center">
                    {TIME_SLOTS.map((t) => {
                      const selected = form.preferredTime === t;
                      return (
                        <Button
                          key={t}
                          backgroundColor={selected ? '#1F4E79' : theme.bgSecondary}
                          color={selected ? '#FFFFFF' : theme.text}
                          borderWidth={1}
                          borderColor={selected ? '#1F4E79' : theme.border}
                          borderRadius={12}
                          paddingHorizontal={16}
                          paddingVertical={10}
                          minWidth={100}
                          onPress={() => {
                            setForm((p) => ({ ...p, preferredTime: t }));
                            setTimePickerOpen(false);
                          }}>
                          {t}
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
              <Text fontSize={18} fontWeight="800" color={theme.text}>
                Items
              </Text>
              <YStack gap="$3">
                <YStack borderWidth={2} borderStyle="dashed" borderColor="#CBD5E1" borderRadius={14} padding={18} alignItems="center" gap="$2">
                  <Text color="#64748B" fontWeight="700">
                    Upload Photos of Items
                  </Text>
                  <Text color={theme.textMuted} fontSize={13}>
                    Max 10 photos · Compressed to ~500 KB each
                  </Text>
                  <Button backgroundColor="#1F4E79" color="#FFFFFF" hoverStyle={{ backgroundColor: '#1F4E79' }} pressStyle={{ backgroundColor: '#1F4E79' }} onPress={pickPhotos}>
                    Add Photos
                  </Button>
                  <Text color="#64748B" fontSize={13}>
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

                <YStack borderWidth={2} borderStyle="dashed" borderColor="#CBD5E1" borderRadius={14} padding={18} alignItems="center" gap="$2">
                  <Text color="#64748B" fontWeight="700">
                    Upload Video (Optional)
                  </Text>
                  <Text color={theme.textMuted} fontSize={13}>
                    Max 2 videos, {MAX_VIDEO_DURATION_SEC} sec each · Compressed to ~5 MB
                  </Text>
                  <Button backgroundColor="#1F4E79" color="#FFFFFF" hoverStyle={{ backgroundColor: '#1F4E79' }} pressStyle={{ backgroundColor: '#1F4E79' }} onPress={pickVideo}>
                    Add Video
                  </Button>
                  <Text color="#64748B" fontSize={13}>
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
                              <Text color="#FFFFFF" fontSize={12} fontWeight="800">
                                VIDEO
                              </Text>
                            </YStack>
                          </YStack>
                        </Pressable>
                      ))}
                    </YStack>
                  ) : null}
                </YStack>

                <YStack gap="$2">
                  <Text fontSize={14} fontWeight="700" color={theme.text}>
                    Item Description (Optional)
                  </Text>
                  <Input
                    {...inputUi}
                    value={form.itemDescription}
                    onChangeText={(v) => setForm((p) => ({ ...p, itemDescription: v }))}
                    placeholder="Describe your items (e.g., 2 beds, 1 sofa, 5 boxes, refrigerator...)"
                  />
                </YStack>

                <YStack backgroundColor="#FEF9C3" borderRadius={12} padding={12} borderWidth={1} borderColor="#F59E0B">
                  <Text color="#92400E" fontWeight="800">
                    Upload clear photos/videos of your items for accurate vehicle recommendation and price estimation.
                  </Text>
                </YStack>
              </YStack>
            </YStack>
          ) : null}

          {step === 'payment' ? (
            <YStack gap="$4">
              <YStack backgroundColor={theme.bgCard} borderRadius={14} padding={16} borderWidth={1} borderColor={theme.border} gap="$3">
                <Text fontSize={18} fontWeight="800" color={theme.text}>
                  Booking Summary
                </Text>
                <YStack gap="$2">
                  <XStack justifyContent="space-between">
                    <Text color="#64748B">Pickup</Text>
                    <Text fontWeight="800" color={theme.text} textAlign="right" flexShrink={1} maxWidth="70%">
                      {form.pickupAddress || '-'}
                    </Text>
                  </XStack>
                  <XStack justifyContent="space-between">
                    <Text color="#64748B">Drop</Text>
                    <Text fontWeight="800" color={theme.text} textAlign="right" flexShrink={1} maxWidth="70%">
                      {form.dropAddress || '-'}
                    </Text>
                  </XStack>
                  <XStack justifyContent="space-between">
                    <Text color="#64748B">Date & Time</Text>
                    <Text fontWeight="800" color={theme.text} textAlign="right" flexShrink={1} maxWidth="70%">
                      {(form.shiftingDate || '-') + (form.preferredTime ? ` at ${form.preferredTime}` : '')}
                    </Text>
                  </XStack>
                  <XStack justifyContent="space-between">
                    <Text color="#64748B">Vehicle</Text>
                    <Text fontWeight="800" color={theme.text} textAlign="right" flexShrink={1} maxWidth="70%">
                      {selectedVehicle?.name ?? '-'}
                    </Text>
                  </XStack>
                  <XStack justifyContent="space-between">
                    <Text color="#64748B">Laborers</Text>
                    <Text fontWeight="800" color={theme.text} textAlign="right" flexShrink={1} maxWidth="70%">
                      {form.laborers} worker
                    </Text>
                  </XStack>
                  {form.itemDescription?.trim() ? (
                    <XStack justifyContent="space-between" alignItems="flex-start" gap="$2">
                      <Text color="#64748B">Items note</Text>
                      <Text fontWeight="700" color={theme.text} textAlign="right" flexShrink={1} maxWidth="70%">
                        {form.itemDescription.trim()}
                      </Text>
                    </XStack>
                  ) : null}
                </YStack>

                {summaryMediaList.length > 0 ? (
                  <YStack gap="$2" marginTop={4}>
                    <Text color="#64748B" fontSize={14} fontWeight="700">
                      Photos & Videos ({summaryMediaList.length})
                    </Text>
                    <Text color={theme.textMuted} fontSize={13}>
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
                                  <Text color="#FFFFFF" fontSize={11} fontWeight="800">
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
                <Text fontSize={18} fontWeight="800" color={theme.text}>
                  Payment Type
                </Text>
                <XStack gap="$2">
                  <Button
                    flex={1}
                    backgroundColor={paymentMode === 'advance' ? '#1F4E79' : theme.bgSecondary}
                    color={paymentMode === 'advance' ? '#FFFFFF' : theme.text}
                    borderWidth={1}
                    borderColor={theme.border}
                    borderRadius={12}
                    onPress={() => setPaymentMode('advance')}>
                    Advance
                  </Button>
                  <Button
                    flex={1}
                    backgroundColor={paymentMode === 'full' ? '#1F4E79' : theme.bgSecondary}
                    color={paymentMode === 'full' ? '#FFFFFF' : theme.text}
                    borderWidth={1}
                    borderColor={theme.border}
                    borderRadius={12}
                    onPress={() => setPaymentMode('full')}>
                    Full Payment
                  </Button>
                </XStack>
                <Text fontSize={13} color="#64748B">
                  Default: Advance
                </Text>
              </YStack>

              <YStack backgroundColor={theme.bgCard} borderRadius={14} padding={16} borderWidth={1} borderColor={theme.border} gap="$3">
                <Text fontSize={18} fontWeight="800" color={theme.text}>
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
                  <YStack backgroundColor="#DCFCE7" borderRadius={12} padding={12} borderWidth={1} borderColor={theme.success}>
                    <Text color="#166534" fontWeight="800">
                      Applied: {couponApplied.code}
                    </Text>
                    {couponApplied.title ? (
                      <Text color="#166534" fontSize={14}>
                        {couponApplied.title}
                      </Text>
                    ) : null}
                  </YStack>
                ) : null}
              </YStack>

              <YStack backgroundColor={theme.bgCard} borderRadius={14} padding={16} borderWidth={1} borderColor={theme.border} gap="$3">
                <Text fontSize={18} fontWeight="800" color={theme.text}>
                  Price Breakdown
                </Text>
                <YStack gap="$2">
                  <XStack justifyContent="space-between">
                    <Text color="#64748B">Base Fare</Text>
                    <Text fontWeight="800" color={theme.text}>{currency(vehiclePricing?.baseFare ?? 0)}</Text>
                  </XStack>
                  <XStack justifyContent="space-between">
                    <Text color="#64748B">Distance ({distanceKm ? Math.round(distanceKm) : 0} km)</Text>
                    <Text fontWeight="800" color={theme.text}>{currency((distanceKm ?? 0) * (vehiclePricing?.perKm ?? 0))}</Text>
                  </XStack>
                  <XStack justifyContent="space-between">
                    <Text color="#64748B">Floor charges</Text>
                    <Text fontWeight="800" color={theme.text}>{currency(pickupFloorCharge + dropFloorCharge)}</Text>
                  </XStack>
                  <XStack justifyContent="space-between">
                    <Text color="#64748B">Labor ({form.laborers} Worker)</Text>
                    <Text fontWeight="800" color={theme.text}>{currency(form.laborers * (vehiclePricing?.laborUnit ?? 0))}</Text>
                  </XStack>
                  <XStack justifyContent="space-between">
                    <Text color="#64748B">GST (18%)</Text>
                    <Text fontWeight="800" color={theme.text}>{currency(gst)}</Text>
                  </XStack>

                  {discountAmount > 0 ? (
                    <XStack justifyContent="space-between">
                      <Text color="#64748B">Discount</Text>
                      <Text fontWeight="800" color={theme.text}>- {currency(discountAmount)}</Text>
                    </XStack>
                  ) : null}
                  <YStack height={1} backgroundColor={theme.bgSecondary} marginVertical={8} />
                  <XStack justifyContent="space-between">
                    <Text fontSize={18} fontWeight="900">Total</Text>
                    <Text fontSize={18} fontWeight="900">{currency(total)}</Text>
                  </XStack>

                  <XStack justifyContent="space-between" marginTop={6}>
                    <Text color="#64748B">Advance Payment</Text>
                    <Text fontWeight="800" color="#16A34A">
                      - {currency(form.advanceAmount)}
                    </Text>
                  </XStack>
                  <XStack justifyContent="space-between">
                    <Text fontSize={18} fontWeight="900">Remaining</Text>
                    <Text fontSize={18} fontWeight="900">{currency(Math.max(total - form.advanceAmount, 0))}</Text>
                  </XStack>
                </YStack>
              </YStack>

              {paymentMode === 'advance' ? (
                <YStack backgroundColor={theme.bgCard} borderRadius={14} padding={16} borderWidth={1} borderColor={theme.border} gap="$3">
                  <Text fontSize={18} fontWeight="800" color={theme.text}>
                    Select Advance Amount
                  </Text>
                  <XStack gap="$2" flexWrap="wrap">
                    {[500, 1000, 2000].map((amt) => (
                      <Button
                        key={amt}
                        backgroundColor={form.advanceAmount === amt ? '#1F4E79' : 'transparent'}
                        borderWidth={2}
                        borderColor={form.advanceAmount === amt ? '#1F4E79' : theme.border}
                        color={form.advanceAmount === amt ? '#FFFFFF' : theme.text}
                        onPress={() => {
                          setIsCustomAdvance(false);
                          setForm((p) => ({ ...p, advanceAmount: amt }));
                        }}>
                        {currency(amt)}
                      </Button>
                    ))}
                    <Button
                      backgroundColor={form.advanceAmount > 2000 ? '#1F4E79' : 'transparent'}
                      borderWidth={2}
                      borderColor={form.advanceAmount > 2000 ? '#1F4E79' : theme.border}
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
                      <Text fontSize={14} fontWeight="700" color={theme.text}>
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
                      <Text fontSize={13} color="#64748B">
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
                      <Text color="#B45309" fontSize={14} flexShrink={1}>
                        Pay now to confirm booking
                      </Text>
                      <Text color="#B45309" fontSize={13} flexShrink={1}>
                        Remaining {currency(Math.max(total - form.advanceAmount, 0))} will be collected after delivery
                      </Text>
                    </YStack>
                    <Text
                      color="#92400E"
                      fontSize={22}
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
                <Text fontSize={18} fontWeight="800" color={theme.text}>
                  Payment Method
                </Text>

                <YStack backgroundColor="#DCFCE7" borderRadius={14} padding={14} borderWidth={1} borderColor={theme.success}>
                  <Text color="#166534" fontWeight="900">
                    100% Secure Payment
                  </Text>
                  <Text color="#166534" fontSize={14}>
                    Your payment is protected with bank-grade security
                  </Text>
                </YStack>
              </YStack>
            </YStack>
          ) : null}

          {error ? (
            <YStack backgroundColor="#FEE2E2" borderRadius={12} padding={12} borderWidth={1} borderColor="#FCA5A5">
              <Text color="#991B1B" fontWeight="800">
                {error}
              </Text>
            </YStack>
          ) : null}

          {bookingId ? (
            <YStack backgroundColor="#DCFCE7" borderRadius={12} padding={12} borderWidth={1} borderColor={theme.success}>
              <Text color="#166534" fontWeight="900">
                Booking created: {bookingId}
              </Text>
            </YStack>
          ) : null}
        </YStack>
      </ScrollView>

      <YStack
        position="absolute"
        bottom={0}
        left={0}
        right={0}
        backgroundColor={theme.bgCard}
        borderTopWidth={1}
        borderTopColor={theme.border}
        padding={12}>
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
            backgroundColor={canContinue ? '#1F4E79' : theme.textMuted}
            color="#FFFFFF"
            borderRadius={12}
            onPress={handleContinue}
            disabled={!canContinue}>
            {step === 'payment' ? 'Pay Online' : 'Continue'}
          </Button>
        </XStack>
      </YStack>

      <Dialog open={otpOpen} onOpenChange={setOtpOpen}>
        <Dialog.Portal>
          <Dialog.Overlay opacity={0.6} backgroundColor="#0F172A" />
          <Dialog.Content width={isWide ? 520 : '92%'} borderRadius={18} backgroundColor={theme.bgCard} padding={18}>
            <YStack gap="$3" alignItems="center">
              <YStack width={72} height={72} borderRadius={999} backgroundColor="#1F4E79" alignItems="center" justifyContent="center">
                <Text color="#FFFFFF" fontSize={30} fontWeight="900">
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
                <Text color={theme.textMuted} fontSize={13} fontWeight="600">
                  OTP expires in 5 minutes
                </Text>
                {error ? (
                  <Text color="#DC2626" fontSize={14} textAlign="center">
                    {error}
                  </Text>
                ) : null}
              </YStack>

              <XStack gap="$2" justifyContent="center" flexWrap="wrap">
                {otpDigits.map((d, i) => (
                  <Input
                    key={i}
                    {...otpInputUi}
                    value={d}
                    keyboardType="number-pad"
                    maxLength={6}
                    width={52}
                    height={60}
                    textAlign="center"
                    fontSize={22}
                    fontWeight="900"
                    borderWidth={2}
                    borderRadius={12}
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
                color="#1F4E79"
                onPress={sendOtp}
                disabled={otpSending || otpVerifying || submitting}>
                {otpSending ? 'Sending…' : 'Resend OTP'}
              </Button>

              <YStack backgroundColor="#FEF3C7" borderRadius={14} padding={14} borderWidth={1} borderColor="#F59E0B" width="100%" gap="$3" flexDirection="row" alignItems="center">
                <YStack flex={1} minWidth={0}>
                  <Text color="#92400E" fontWeight="900">Advance Payment</Text>
                  <Text color="#B45309" fontSize={14} flexShrink={1}>Pay now to confirm booking</Text>
                </YStack>
                <Text
                  color="#92400E"
                  fontSize={20}
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
                  backgroundColor="#1F4E79"
                  color="#FFFFFF"
                  borderRadius={12}
                  hoverStyle={{ backgroundColor: '#1F4E79' } as any}
                  focusStyle={{ backgroundColor: '#1F4E79' } as any}
                  pressStyle={{ backgroundColor: '#1F4E79' } as any}
                  onPress={verifyOtpAndPay}
                  disabled={submitting || otpSending || otpVerifying}>
                  {otpVerifying ? 'Verifying…' : otpSending ? 'Sending…' : 'Verify & Pay'}
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
            <Text color="#CBD5E1" fontSize={15} fontWeight="700" marginTop={14}>
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
