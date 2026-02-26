import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Platform, Pressable, ScrollView } from 'react-native';
import RazorpayCheckout from 'react-native-razorpay';
import { Button, Dialog, H4, Image, Input, Paragraph, Text, XStack, YStack } from 'tamagui';

import { getRouteDistance, searchPlaces } from '@/lib/mapbox';
import { getRazorpayKeyId } from '@/lib/public-config';
import { createRazorpayOrder, verifyRazorpaySignature } from '@/lib/razorpay';
import { supabase } from '@/lib/supabase';
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

const normalizeToIsoDate = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const m = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (!m) return null;

  const dd = m[1].padStart(2, '0');
  const mm = m[2].padStart(2, '0');
  const yyyy = m[3];
  return `${yyyy}-${mm}-${dd}`;
};

export default function BookingWizardScreen() {
  const router = useRouter();
  const { session, profile } = useSession();
  const screenWidth = Dimensions.get('window').width;
  const isWide = screenWidth >= 820;

  const inputUi = useMemo(
    () => ({
      backgroundColor: '#FFFFFF',
      borderColor: '#E5E7EB',
      color: '#405ea0ff',
    }),
    []
  );

  const [step, setStep] = useState<StepKey>('info');
  const stepIndex = stepMeta[step].index;

  const [form, setForm] = useState<BookingFormState>({
    fullName: profile?.name ?? '',
    mobile: '',
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

  const [floorPickerOpen, setFloorPickerOpen] = useState(false);
  const [floorPickerTarget, setFloorPickerTarget] = useState<'pickup' | 'drop'>('pickup');

  const [laborPickerOpen, setLaborPickerOpen] = useState(false);
  const [vehiclePickerOpen, setVehiclePickerOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
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
      const t = setTimeout(() => {
        setActiveLocationField('pickup');
        pickupRef.current?.focus?.();
      }, 200);
      return () => clearTimeout(t);
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
  const dayWheelRef = useRef<any>(null);
  const monthWheelRef = useRef<any>(null);
  const yearWheelRef = useRef<any>(null);
  const vehicleAutoOpenedRef = useRef(false);
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

    return await withTimeout(run(), 25000, name);
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
      if (session?.user?.id) {
        const normalized = phone.replace(/\D/g, '').slice(0, 10);
        await supabase.from('users').update({ phone: normalized }).eq('id', session.user.id);
      }
      const data = await invokeEdgeFunction<{ sent?: boolean; error?: string }>('send-booking-otp', { phone });
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

  const dateItemHeight = 46;
  const wheelControlHeight = 40;
  const pad2 = (n: number) => String(n).padStart(2, '0');

  const today = useMemo(() => new Date(), []);
  const currentYear = useMemo(() => today.getFullYear(), [today]);
  const yearOptions = useMemo(() => [currentYear, currentYear + 1, currentYear + 2], [currentYear]);
  const monthOptions = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);
  const [wheelYear, setWheelYear] = useState(currentYear);
  const [wheelMonth, setWheelMonth] = useState(new Date().getMonth() + 1);
  const [wheelDay, setWheelDay] = useState(new Date().getDate());

  useEffect(() => {
    if (!form.shiftingDate) return;
    const m = /^([0-9]{2})-([0-9]{2})-([0-9]{4})$/.exec(form.shiftingDate.trim());
    if (!m) return;
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yy = Number(m[3]);
    if (yy) setWheelYear(yy);
    if (mm) setWheelMonth(mm);
    if (dd) setWheelDay(dd);
  }, [form.shiftingDate]);

  const daysInMonth = useMemo(() => {
    return new Date(wheelYear, wheelMonth, 0).getDate();
  }, [wheelMonth, wheelYear]);
  const dayOptions = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth]);

  useEffect(() => {
    if (wheelDay > daysInMonth) setWheelDay(daysInMonth);
  }, [daysInMonth, wheelDay]);

  const shiftingDatePreview = useMemo(() => {
    return `${pad2(wheelDay)}-${pad2(wheelMonth)}-${wheelYear}`;
  }, [wheelDay, wheelMonth, wheelYear]);

  const scrollWheelTo = (target: 'day' | 'month' | 'year', value: number) => {
    const ref = target === 'day' ? dayWheelRef : target === 'month' ? monthWheelRef : yearWheelRef;
    const options = target === 'day' ? dayOptions : target === 'month' ? monthOptions : yearOptions;
    const idx = Math.max(0, options.indexOf(value));
    const y = idx * dateItemHeight;
    try {
      ref.current?.scrollTo?.({ y, animated: true });
    } catch {
      // ignore
    }
  };

  const bumpWheel = (target: 'day' | 'month' | 'year', dir: -1 | 1) => {
    if (target === 'day') {
      const next = Math.max(1, Math.min(wheelDay + dir, dayOptions[dayOptions.length - 1] ?? wheelDay));
      setWheelDay(next);
      scrollWheelTo('day', next);
      return;
    }
    if (target === 'month') {
      const next = Math.max(1, Math.min(wheelMonth + dir, 12));
      setWheelMonth(next);
      scrollWheelTo('month', next);
      return;
    }
    const minY = yearOptions[0] ?? wheelYear;
    const maxY = yearOptions[yearOptions.length - 1] ?? wheelYear;
    const next = Math.max(minY, Math.min(wheelYear + dir, maxY));
    setWheelYear(next);
    scrollWheelTo('year', next);
  };

  useEffect(() => {
    if (!datePickerOpen) return;
    const t = setTimeout(() => {
      scrollWheelTo('day', wheelDay);
      scrollWheelTo('month', wheelMonth);
      scrollWheelTo('year', wheelYear);
    }, 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datePickerOpen]);

  const confirmShiftingDate = () => {
    setForm((p) => ({ ...p, shiftingDate: shiftingDatePreview }));
    setDatePickerOpen(false);
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
    const bucket = 'booking-uploads';
    const items: Array<{ uri: string; kind: 'photo' | 'video' }> = [
      ...form.photos.map((uri) => ({ uri, kind: 'photo' as const })),
      ...form.videos.map((uri) => ({ uri, kind: 'video' as const })),
    ];
    if (!items.length) return;

    for (const it of items) {
      const res = await fetch(it.uri);
      const blob = await res.blob();
      const ext = it.kind === 'video' ? 'mp4' : 'jpg';
      const filePath = `bookings/${createdBookingId}/${it.kind}s/${Date.now()}_${Math.random().toString(16).slice(2)}.${ext}`;
      const contentType = it.kind === 'video' ? 'video/mp4' : 'image/jpeg';

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, blob, { contentType, upsert: true });
      if (uploadError) throw new Error(uploadError.message);

      const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
      const fileUrl = data?.publicUrl ?? '';
      if (!fileUrl) throw new Error('Upload URL missing');

      const { error: insertErr } = await supabase.from('booking_uploads').insert({
        booking_id: createdBookingId,
        file_url: fileUrl,
        file_type: it.kind,
        file_name: filePath.split('/').pop() ?? null,
        file_size: blob.size ?? null,
      });
      if (insertErr) throw new Error(insertErr.message);
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

  useEffect(() => {
    let cancelled = false;

    if (!activeLocationField) {
      setPlaceResults([]);
      return;
    }

    const query = activeLocationField === 'pickup' ? form.pickupAddress : form.dropAddress;
    if (!query.trim()) {
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
  }, [activeLocationField, form.dropAddress, form.pickupAddress]);

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
  }, [profile?.email, profile?.name]);

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
            <Text fontSize={12} color="#64748B">
              Suggestions
            </Text>
            <YStack gap="$2">
              {placeResults.map((item, idx) => (
                <Pressable key={`${String(item.id ?? '').trim() || String(item.place_name ?? '').trim() || 'place'}-${idx}`} onPress={() => selectPlace(item)}>
                  <YStack padding={12} borderRadius={12} backgroundColor="#F8FAFC" borderWidth={1} borderColor="#E5E7EB">
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
        name: 'PackersMovers',
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
        await supabase.from('payments').insert({
          booking_id: null,
          user_id: session.user.id,
          amount: (order.amount ?? 0) / 100,
          status: 'paid',
          razorpay_order_id: order.id,
          razorpay_payment_id: paymentData.razorpay_payment_id,
          error: { booking_insert_error: insertError?.message ?? 'Booking insert failed' },
          metadata: {
            mode: paymentMode,
            razorpay_signature: paymentData.razorpay_signature,
          },
        });

        setError('Payment succeeded, but booking creation failed. Please contact support.');
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

      await createBookingAndTakePayment();
    } catch (e: any) {
      setError(e?.message ? String(e.message) : 'Failed to verify OTP.');
    } finally {
      setOtpVerifying(false);
    }
  };

  const istDateLabel = (date: Date) => {
    const dtf = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const parts = dtf.formatToParts(date);
    const dd = parts.find((p) => p.type === 'day')?.value ?? '';
    const mm = parts.find((p) => p.type === 'month')?.value ?? '';
    const yyyy = parts.find((p) => p.type === 'year')?.value ?? '';
    return `${dd}-${mm}-${yyyy}`;
  };

  const dateOptions = useMemo(() => {
    const list: string[] = [];
    const now = new Date();
    for (let i = 0; i < 60; i += 1) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      list.push(istDateLabel(d));
    }
    return Array.from(new Set(list));
  }, []);

  const timeOptions = useMemo(
    () => ['08:00 AM', '09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '01:00 PM', '02:00 PM', '03:00 PM', '04:00 PM', '05:00 PM', '06:00 PM', '07:00 PM', '08:00 PM'],
    []
  );

  const pickPhotos = async () => {
    setError(null);
    const remaining = Math.max(10 - form.photos.length, 0);
    if (remaining <= 0) {
      setError('Maximum 10 photos allowed.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
    });

    if (result.canceled) return;
    const uris = result.assets.map((a) => a.uri).filter(Boolean);
    setForm((p) => ({ ...p, photos: [...p.photos, ...uris].slice(0, 10) }));
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
    if (durationSec !== null && durationSec > 30) {
      setError('Video must be 30 seconds or less.');
      return;
    }
    if (!asset?.uri) return;
    setForm((p) => ({ ...p, videos: [...p.videos, asset.uri].slice(0, 2) }));
  };

  const containerWidth = isWide ? 980 : '100%';

  return (
    <YStack flex={1} backgroundColor="#F3F4F6">
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
            <Text color="#FFFFFF" fontSize={16} fontWeight="800">
              Book Your Move
            </Text>
            <Text color="#CFE3F4" fontSize={12} fontWeight="600">
              Step {stepIndex + 1} of 5
            </Text>
          </YStack>
        </XStack>
      </YStack>

      <YStack backgroundColor="#FFFFFF" padding={14} borderBottomWidth={1} borderBottomColor="#E5E7EB">
        <XStack justifyContent="space-between" alignItems="center">
          {stepOrder.map((k, idx) => {
            const done = idx < stepIndex;
            const active = idx === stepIndex;
            const bg = done ? '#22C55E' : active ? '#1F4E79' : '#E5E7EB';
            const color = done || active ? '#FFFFFF' : '#94A3B8';
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
                    fontSize={11}
                    color={active ? '#111827' : '#94A3B8'}
                    textAlign="center"
                    numberOfLines={2}
                    height={28}
                    lineHeight={14}>
                    {stepMeta[k].label}
                  </Text>
                </YStack>
                {idx < stepOrder.length - 1 ? (
                  <YStack height={2} flex={1} backgroundColor={done ? '#22C55E' : '#E5E7EB'} />
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
              <YStack backgroundColor="#FFFFFF" borderRadius={14} padding={16} borderWidth={1} borderColor="#E5E7EB" gap="$3">
                <XStack alignItems="center" gap="$2">
                  <Text fontSize={16} fontWeight="800" color="#2d56afff">
                    Customer Information
                  </Text>
                </XStack>
                <YStack gap="$2">
                  <Text fontSize={12} fontWeight="700" color="#456bbeff">
                    Full Name *
                  </Text>
                  <Input
                    {...inputUi}
                    value={form.fullName}
                    onChangeText={(v) => setForm((p) => ({ ...p, fullName: v }))}
                    placeholder="Enter full name"
                  />
                  {!isNameValid && form.fullName.trim() ? (
                    <Text fontSize={11} color="#991B1B">
                      Name must be at least 3 characters.
                    </Text>
                  ) : null}
                </YStack>
                <YStack gap="$2">
                  <Text fontSize={12} fontWeight="700" color="#3d5faaff">
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
                    <Text fontSize={11} color="#991B1B">
                      Enter a valid 10 digit mobile number.
                    </Text>
                  ) : null}
                  <Text fontSize={11} color="#94A3B8">
                    OTP will be sent to this number
                  </Text>
                </YStack>
                <YStack gap="$2">
                  <Text fontSize={12} fontWeight="700" color="#3d60acff">
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
                    <Text fontSize={11} color="#991B1B">
                      Enter a valid email address.
                    </Text>
                  ) : null}
                </YStack>
              </YStack>

              <YStack backgroundColor="#FFFFFF" borderRadius={14} padding={16} borderWidth={1} borderColor="#E5E7EB" gap="$3">
                <Text fontSize={16} fontWeight="800" color="#3c5ea8ff">
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
                          backgroundColor={selected ? '#EFF6FF' : '#FFFFFF'}
                          borderRadius={14}
                          padding={14}
                          borderWidth={2}
                          borderColor={selected ? '#1F4E79' : '#E5E7EB'}
                          gap="$1">
                          <Text fontWeight="800" color="#2f52a0ff">
                            {t.title}
                          </Text>
                          <Text fontSize={11} color="#64748B">
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
            <YStack backgroundColor="#FFFFFF" borderRadius={14} padding={16} borderWidth={1} borderColor="#E5E7EB" gap="$3">
              <Text fontSize={16} fontWeight="800" color="#355cafff">
                Location
              </Text>

              <YStack gap="$3">
                <Text fontSize={13} fontWeight="800" color="#335aadff">
                  Pickup Address
                </Text>
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

                {activeLocationField === 'pickup' ? renderActiveSuggestions() : null}

                <XStack gap="$3" flexWrap="wrap">
                  <YStack flex={1} minWidth={220} gap="$2">
                    <Text fontSize={12} fontWeight="700" color="#3c5facff">
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
                      <Text fontSize={11} color="#991B1B">
                        {floorError}
                      </Text>
                    ) : null}
                  </YStack>
                  <YStack flex={1} minWidth={220} gap="$2">
                    <Text fontSize={12} fontWeight="700" color="#4062acff">
                      Lift
                    </Text>
                    <Pressable onPress={() => setForm((p) => ({ ...p, pickupLift: !p.pickupLift }))}>
                      <YStack
                        backgroundColor="#F8FAFC"
                        borderRadius={12}
                        padding={14}
                        borderWidth={1}
                        borderColor="#E5E7EB"
                        minHeight={52}
                        justifyContent="space-between"
                        flexDirection="row"
                        alignItems="center">
                        <Text fontWeight="700" color="#3d5ea5ff">
                          Lift Available?
                        </Text>
                        <YStack
                          width={42}
                          height={24}
                          borderRadius={999}
                          backgroundColor={form.pickupLift ? '#22C55E' : '#E5E7EB'}
                          justifyContent="center"
                          paddingHorizontal={3}>
                          <YStack
                            width={18}
                            height={18}
                            borderRadius={999}
                            backgroundColor="#FFFFFF"
                            alignSelf={form.pickupLift ? 'flex-end' : 'flex-start'}
                          />
                        </YStack>
                      </YStack>
                    </Pressable>
                  </YStack>
                </XStack>

                <YStack height={1} backgroundColor="#E5E7EB" marginVertical={8} />

                <Text fontSize={13} fontWeight="800" color="#4163adff">
                  Drop Address
                </Text>
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

                {activeLocationField === 'drop' ? renderActiveSuggestions() : null}

                <XStack gap="$3" flexWrap="wrap">
                  <YStack flex={1} minWidth={220} gap="$2">
                    <Text fontSize={12} fontWeight="700" color="#4163adff">
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
                    <Text fontSize={12} fontWeight="700" color="#4163adff">
                      Lift
                    </Text>
                    <Pressable onPress={() => setForm((p) => ({ ...p, dropLift: !p.dropLift }))}>
                      <YStack
                        backgroundColor="#F8FAFC"
                        borderRadius={12}
                        padding={14}
                        borderWidth={1}
                        borderColor="#E5E7EB"
                        minHeight={52}
                        justifyContent="space-between"
                        flexDirection="row"
                        alignItems="center">
                        <Text fontWeight="700" color="#4163adff">
                          Lift Available?
                        </Text>
                        <YStack
                          width={42}
                          height={24}
                          borderRadius={999}
                          backgroundColor={form.dropLift ? '#22C55E' : '#E5E7EB'}
                          justifyContent="center"
                          paddingHorizontal={3}>
                          <YStack
                            width={18}
                            height={18}
                            borderRadius={999}
                            backgroundColor="#FFFFFF"
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

          <Dialog open={floorPickerOpen} onOpenChange={setFloorPickerOpen}>
            <Dialog.Portal>
              <Dialog.Overlay opacity={0.6} backgroundColor="#6289e4ff" />
              <Dialog.Content
                backgroundColor="#FFFFFF"
                borderRadius={16}
                padding={16}
                width={isWide ? 520 : '92%'}>
                <YStack gap="$3">
                  <Text fontSize={16} fontWeight="900" color="#3a5fafff">
                    Select Floor
                  </Text>
                  <YStack gap="$2">
                    {(floorOptions.length ? floorOptions : [{ id: 'default', label: 'Ground Floor' } as any]).map((opt: any) => {
                      const label = String(opt.label ?? '');
                      const selected =
                        floorPickerTarget === 'pickup'
                          ? label === form.pickupFloor
                          : label === form.dropFloor;
                      return (
                        <Button
                          key={String(opt.id)}
                          backgroundColor={selected ? '#1F4E79' : '#F8FAFC'}
                          color={selected ? '#FFFFFF' : '#4163adff'}
                          borderWidth={1}
                          borderColor="#E5E7EB"
                          borderRadius={12}
                          justifyContent="flex-start"
                          onPress={() => selectFloorLabel(label)}>
                          {label}
                        </Button>
                      );
                    })}
                  </YStack>
                  <Button backgroundColor="#E5E7EB" color="#4163adff" onPress={() => setFloorPickerOpen(false)}>
                    Close
                  </Button>
                </YStack>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog>

          {step === 'vehicle' ? (
            <>
              <YStack backgroundColor="#FFFFFF" borderRadius={14} padding={16} borderWidth={1} borderColor="#E5E7EB" gap="$3">
                <Text fontSize={16} fontWeight="800" color="#4163adff">
                  Select Vehicle
                </Text>

                <YStack gap="$3">
                  {loadingVehicles ? <Text color="#64748B">Loading vehicles…</Text> : null}
                  {vehicleError ? <Text color="#991B1B">{vehicleError}</Text> : null}

                  <YStack gap="$2">
                    <Text fontSize={12} fontWeight="700" color="#4163adff">
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
                  <Dialog.Content backgroundColor="#FFFFFF" borderRadius={16} padding={16} width={isWide ? 620 : '92%'}>
                    <YStack gap="$3">
                      <Text fontSize={16} fontWeight="900" color="#4163adff">
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
                                backgroundColor="#FFFFFF"
                                borderRadius={14}
                                borderWidth={2}
                                borderColor={selected ? '#1F4E79' : '#E5E7EB'}
                                padding={14}
                                gap="$2">
                                <XStack gap="$3" alignItems="center">
                                  {v.image_url ? (
                                    <Image source={{ uri: v.image_url }} width={64} height={52} borderRadius={10} />
                                  ) : (
                                    <YStack
                                      width={64}
                                      height={52}
                                      borderRadius={10}
                                      backgroundColor="#F1F5F9"
                                      borderWidth={1}
                                      borderColor="#E5E7EB"
                                      alignItems="center"
                                      justifyContent="center">
                                      <Text color="#64748B" fontSize={10} fontWeight="700">
                                        NO IMAGE
                                      </Text>
                                    </YStack>
                                  )}

                                  <YStack flex={1} gap="$1" justifyContent="center">
                                    <Text fontWeight="900" color="#111827">
                                      {v.name}
                                    </Text>
                                    <Text fontSize={11} color="#64748B" numberOfLines={2}>
                                      {v.description ?? 'Premium moving vehicle'}
                                    </Text>
                                    <Text fontSize={11} color="#64748B">
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
                      <Button backgroundColor="#E5E7EB" color="#111827" onPress={() => setVehiclePickerOpen(false)}>
                        Close
                      </Button>
                    </YStack>
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog>

              <YStack backgroundColor="#FFFFFF" borderRadius={14} padding={16} borderWidth={1} borderColor="#E5E7EB" gap="$3">
                <Text fontSize={16} fontWeight="800" color="#111827">
                  Schedule & Labor
                </Text>

                <YStack gap="$3">
                  <YStack gap="$2">
                    <Text fontSize={12} fontWeight="700" color="#111827">
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
                    <Text fontSize={11} color="#64748B">
                      Charges will be calculated automatically.
                    </Text>
                  </YStack>

                  <XStack gap="$3" flexWrap="wrap">
                    <YStack flex={1} minWidth={240} gap="$2">
                      <Text fontSize={12} fontWeight="700" color="#111827">
                        Shifting Date
                      </Text>
                      <Pressable onPress={() => setDatePickerOpen(true)}>
                        <YStack pointerEvents="none">
                          <Input {...inputUi} value={form.shiftingDate} placeholder="Select date" />
                        </YStack>
                      </Pressable>
                    </YStack>
                    <YStack flex={1} minWidth={240} gap="$2">
                      <Text fontSize={12} fontWeight="700" color="#111827">
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
                      <Text color="#CFE3F4" fontSize={12} fontWeight="700">
                        Estimated Price
                      </Text>
                      <Text color="#FFFFFF" fontSize={26} fontWeight="900">
                        {currency(total)}
                      </Text>
                    </YStack>
                    <YStack alignItems="flex-end">
                      <Text color="#CFE3F4" fontSize={12} fontWeight="700">
                        Pay Advance
                      </Text>
                      <Text color="#FFFFFF" fontSize={18} fontWeight="900">
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
              <Dialog.Content backgroundColor="#FFFFFF" borderRadius={16} padding={16} width={isWide ? 520 : '92%'}>
                <YStack gap="$3">
                  <Text fontSize={16} fontWeight="900" color="#111827">
                    Select Laborers
                  </Text>
                  <YStack gap="$2">
                    {Array.from({ length: 10 }, (_, idx) => idx + 1).map((n) => {
                      const selected = form.laborers === n;
                      return (
                        <Button
                          key={n}
                          backgroundColor={selected ? '#1F4E79' : '#F8FAFC'}
                          color={selected ? '#FFFFFF' : '#111827'}
                          borderWidth={1}
                          borderColor="#E5E7EB"
                          borderRadius={12}
                          justifyContent="flex-start"
                          onPress={() => {
                            setForm((p) => ({ ...p, laborers: n }));
                            setLaborPickerOpen(false);
                          }}>
                          <Text color={selected ? '#FFFFFF' : '#111827'} fontWeight="800">
                            {n} {n === 1 ? 'Worker' : 'Workers'}
                          </Text>
                        </Button>
                      );
                    })}
                  </YStack>
                  <Button backgroundColor="#E5E7EB" color="#111827" onPress={() => setLaborPickerOpen(false)}>
                    Close
                  </Button>
                </YStack>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog>

          <Dialog open={datePickerOpen} onOpenChange={setDatePickerOpen}>
            <Dialog.Portal>
              <Dialog.Overlay opacity={0.6} backgroundColor="#0F172A" />
              <Dialog.Content backgroundColor="#FFFFFF" borderRadius={16} padding={16} width={isWide ? 520 : '92%'}>
                <YStack gap="$3">
                  <Text fontSize={16} fontWeight="900" color="#111827">
                    Select Shifting Date (IST)
                  </Text>
                  <XStack gap="$2">
                    <YStack flex={1} height={dateItemHeight * 7} overflow="hidden" borderRadius={14} borderWidth={1} borderColor="#E5E7EB">
                      <XStack
                        position="absolute"
                        top={6}
                        left={10}
                        right={10}
                        height={wheelControlHeight}
                        justifyContent="space-between"
                        alignItems="center"
                        zIndex={5}>
                        <Button size="$2" backgroundColor="#F8FAFC" color="#111827" onPress={() => bumpWheel('day', -1)}>
                          ↑
                        </Button>
                        <Button size="$2" backgroundColor="#F8FAFC" color="#111827" onPress={() => bumpWheel('day', 1)}>
                          ↓
                        </Button>
                      </XStack>
                      <ScrollView
                        ref={dayWheelRef}
                        showsVerticalScrollIndicator={false}
                        snapToInterval={dateItemHeight}
                        decelerationRate="fast"
                        contentContainerStyle={{ paddingVertical: dateItemHeight * 3 + wheelControlHeight } as any}
                        onMomentumScrollEnd={(e) => {
                          const y = e.nativeEvent.contentOffset.y;
                          const idx = Math.round(y / dateItemHeight);
                          const chosen = dayOptions[Math.max(0, Math.min(idx, dayOptions.length - 1))];
                          if (chosen) setWheelDay(chosen);
                        }}>
                        {dayOptions.map((d) => {
                          const selected = wheelDay === d;
                          return (
                            <YStack
                              key={d}
                              height={dateItemHeight}
                              justifyContent="center"
                              alignItems="center"
                              backgroundColor={selected ? '#EFF6FF' : '#FFFFFF'}>
                              <Text color={selected ? '#1F4E79' : '#111827'} fontWeight={selected ? '900' : '700'}>
                                {pad2(d)}
                              </Text>
                            </YStack>
                          );
                        })}
                      </ScrollView>
                      <YStack
                        position="absolute"
                        left={0}
                        right={0}
                        top={wheelControlHeight + dateItemHeight * 3}
                        height={dateItemHeight}
                        borderTopWidth={1}
                        borderBottomWidth={1}
                        borderColor="#1F4E79"
                        pointerEvents="none"
                      />
                    </YStack>

                    <YStack flex={1} height={dateItemHeight * 7} overflow="hidden" borderRadius={14} borderWidth={1} borderColor="#E5E7EB">
                      <XStack
                        position="absolute"
                        top={6}
                        left={10}
                        right={10}
                        height={wheelControlHeight}
                        justifyContent="space-between"
                        alignItems="center"
                        zIndex={5}>
                        <Button size="$2" backgroundColor="#F8FAFC" color="#111827" onPress={() => bumpWheel('month', -1)}>
                          ↑
                        </Button>
                        <Button size="$2" backgroundColor="#F8FAFC" color="#111827" onPress={() => bumpWheel('month', 1)}>
                          ↓
                        </Button>
                      </XStack>
                      <ScrollView
                        ref={monthWheelRef}
                        showsVerticalScrollIndicator={false}
                        snapToInterval={dateItemHeight}
                        decelerationRate="fast"
                        contentContainerStyle={{ paddingVertical: dateItemHeight * 3 + wheelControlHeight } as any}
                        onMomentumScrollEnd={(e) => {
                          const y = e.nativeEvent.contentOffset.y;
                          const idx = Math.round(y / dateItemHeight);
                          const chosen = monthOptions[Math.max(0, Math.min(idx, monthOptions.length - 1))];
                          if (chosen) setWheelMonth(chosen);
                        }}>
                        {monthOptions.map((m) => {
                          const selected = wheelMonth === m;
                          return (
                            <YStack
                              key={m}
                              height={dateItemHeight}
                              justifyContent="center"
                              alignItems="center"
                              backgroundColor={selected ? '#EFF6FF' : '#FFFFFF'}>
                              <Text color={selected ? '#1F4E79' : '#111827'} fontWeight={selected ? '900' : '700'}>
                                {pad2(m)}
                              </Text>
                            </YStack>
                          );
                        })}
                      </ScrollView>
                      <YStack
                        position="absolute"
                        left={0}
                        right={0}
                        top={wheelControlHeight + dateItemHeight * 3}
                        height={dateItemHeight}
                        borderTopWidth={1}
                        borderBottomWidth={1}
                        borderColor="#1F4E79"
                        pointerEvents="none"
                      />
                    </YStack>

                    <YStack flex={1.2} height={dateItemHeight * 7} overflow="hidden" borderRadius={14} borderWidth={1} borderColor="#E5E7EB">
                      <XStack
                        position="absolute"
                        top={6}
                        left={10}
                        right={10}
                        height={wheelControlHeight}
                        justifyContent="space-between"
                        alignItems="center"
                        zIndex={5}>
                        <Button size="$2" backgroundColor="#F8FAFC" color="#111827" onPress={() => bumpWheel('year', -1)}>
                          ↑
                        </Button>
                        <Button size="$2" backgroundColor="#F8FAFC" color="#111827" onPress={() => bumpWheel('year', 1)}>
                          ↓
                        </Button>
                      </XStack>
                      <ScrollView
                        ref={yearWheelRef}
                        showsVerticalScrollIndicator={false}
                        snapToInterval={dateItemHeight}
                        decelerationRate="fast"
                        contentContainerStyle={{ paddingVertical: dateItemHeight * 3 + wheelControlHeight } as any}
                        onMomentumScrollEnd={(e) => {
                          const y = e.nativeEvent.contentOffset.y;
                          const idx = Math.round(y / dateItemHeight);
                          const chosen = yearOptions[Math.max(0, Math.min(idx, yearOptions.length - 1))];
                          if (chosen) setWheelYear(chosen);
                        }}>
                        {yearOptions.map((y) => {
                          const selected = wheelYear === y;
                          return (
                            <YStack
                              key={y}
                              height={dateItemHeight}
                              justifyContent="center"
                              alignItems="center"
                              backgroundColor={selected ? '#EFF6FF' : '#FFFFFF'}>
                              <Text color={selected ? '#1F4E79' : '#111827'} fontWeight={selected ? '900' : '700'}>
                                {y}
                              </Text>
                            </YStack>
                          );
                        })}
                      </ScrollView>
                      <YStack
                        position="absolute"
                        left={0}
                        right={0}
                        top={wheelControlHeight + dateItemHeight * 3}
                        height={dateItemHeight}
                        borderTopWidth={1}
                        borderBottomWidth={1}
                        borderColor="#1F4E79"
                        pointerEvents="none"
                      />
                    </YStack>
                  </XStack>
                  <XStack gap="$2" justifyContent="flex-end">
                    <Button backgroundColor="#E5E7EB" color="#111827" onPress={() => setDatePickerOpen(false)}>
                      Close
                    </Button>
                    <Button backgroundColor="#1F4E79" color="#FFFFFF" onPress={confirmShiftingDate}>
                      OK
                    </Button>
                  </XStack>
                </YStack>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog>

          <Dialog open={timePickerOpen} onOpenChange={setTimePickerOpen}>
            <Dialog.Portal>
              <Dialog.Overlay opacity={0.6} backgroundColor="#0F172A" />
              <Dialog.Content backgroundColor="#FFFFFF" borderRadius={16} padding={16} width={isWide ? 520 : '92%'}>
                <YStack gap="$3">
                  <Text fontSize={16} fontWeight="900" color="#111827">
                    Select Preferred Time (IST)
                  </Text>
                  <YStack gap="$2">
                    {timeOptions.map((t) => {
                      const selected = form.preferredTime === t;
                      return (
                        <Button
                          key={t}
                          backgroundColor={selected ? '#1F4E79' : '#F8FAFC'}
                          color={selected ? '#FFFFFF' : '#111827'}
                          borderWidth={1}
                          borderColor="#E5E7EB"
                          borderRadius={12}
                          justifyContent="flex-start"
                          onPress={() => {
                            setForm((p) => ({ ...p, preferredTime: t }));
                            setTimePickerOpen(false);
                          }}>
                          {t}
                        </Button>
                      );
                    })}
                  </YStack>
                  <Button backgroundColor="#E5E7EB" color="#111827" onPress={() => setTimePickerOpen(false)}>
                    Close
                  </Button>
                </YStack>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog>

          {step === 'items' ? (
            <YStack backgroundColor="#FFFFFF" borderRadius={14} padding={16} borderWidth={1} borderColor="#E5E7EB" gap="$3">
              <Text fontSize={16} fontWeight="800" color="#111827">
                Items
              </Text>
              <YStack gap="$3">
                <YStack borderWidth={2} borderStyle="dashed" borderColor="#CBD5E1" borderRadius={14} padding={18} alignItems="center" gap="$2">
                  <Text color="#64748B" fontWeight="700">
                    Upload Photos of Items
                  </Text>
                  <Text color="#94A3B8" fontSize={11}>
                    Max 10 photos
                  </Text>
                  <Button backgroundColor="#1F4E79" color="#FFFFFF" onPress={pickPhotos}>
                    Add Photos
                  </Button>
                  <Text color="#64748B" fontSize={11}>
                    Selected: {form.photos.length}/10
                  </Text>
                  {form.photos.length ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 84 } as any}>
                      <XStack gap="$2" paddingVertical={6}>
                        {form.photos.map((uri, idx) => (
                          <YStack
                            key={`${String(uri ?? '').trim() || 'photo'}-${idx}`}
                            width={74}
                            height={74}
                            borderRadius={12}
                            overflow="hidden"
                            backgroundColor="#F1F5F9"
                            borderWidth={1}
                            borderColor="#E5E7EB">
                            <Image source={{ uri }} width={74} height={74} />
                          </YStack>
                        ))}
                      </XStack>
                    </ScrollView>
                  ) : null}
                </YStack>

                <YStack borderWidth={2} borderStyle="dashed" borderColor="#CBD5E1" borderRadius={14} padding={18} alignItems="center" gap="$2">
                  <Text color="#64748B" fontWeight="700">
                    Upload Video (Optional)
                  </Text>
                  <Text color="#94A3B8" fontSize={11}>
                    Max 2 videos, 30 seconds each
                  </Text>
                  <Button backgroundColor="#1F4E79" color="#FFFFFF" onPress={pickVideo}>
                    Add Video
                  </Button>
                  <Text color="#64748B" fontSize={11}>
                    Selected: {form.videos.length}/2
                  </Text>
                  {form.videos.length ? (
                    <YStack gap="$2">
                      {form.videos.map((uri, idx) => (
                        <YStack
                          key={`${String(uri ?? '').trim() || 'video'}-${idx}`}
                          backgroundColor="#F8FAFC"
                          borderRadius={12}
                          padding={12}
                          borderWidth={1}
                          borderColor="#E5E7EB">
                          <Text color="#111827" fontWeight="700" fontSize={12}>
                            VIDEO
                          </Text>
                          <Text color="#64748B" fontSize={11} numberOfLines={2}>
                            {uri}
                          </Text>
                        </YStack>
                      ))}
                    </YStack>
                  ) : null}
                </YStack>

                <YStack gap="$2">
                  <Text fontSize={12} fontWeight="700" color="#111827">
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
              <YStack backgroundColor="#FFFFFF" borderRadius={14} padding={16} borderWidth={1} borderColor="#E5E7EB" gap="$3">
                <Text fontSize={16} fontWeight="800" color="#111827">
                  Booking Summary
                </Text>
                <YStack gap="$2">
                  <XStack justifyContent="space-between">
                    <Text color="#64748B">Pickup</Text>
                    <Text fontWeight="800" color="#111827" textAlign="right" flexShrink={1} maxWidth="70%">
                      {form.pickupAddress || '-'}
                    </Text>
                  </XStack>
                  <XStack justifyContent="space-between">
                    <Text color="#64748B">Drop</Text>
                    <Text fontWeight="800" color="#111827" textAlign="right" flexShrink={1} maxWidth="70%">
                      {form.dropAddress || '-'}
                    </Text>
                  </XStack>
                  <XStack justifyContent="space-between">
                    <Text color="#64748B">Date & Time</Text>
                    <Text fontWeight="800" color="#111827" textAlign="right" flexShrink={1} maxWidth="70%">
                      {(form.shiftingDate || '-') + (form.preferredTime ? ` at ${form.preferredTime}` : '')}
                    </Text>
                  </XStack>
                  <XStack justifyContent="space-between">
                    <Text color="#64748B">Vehicle</Text>
                    <Text fontWeight="800" color="#111827" textAlign="right" flexShrink={1} maxWidth="70%">
                      {selectedVehicle?.name ?? '-'}
                    </Text>
                  </XStack>
                  <XStack justifyContent="space-between">
                    <Text color="#64748B">Laborers</Text>
                    <Text fontWeight="800" color="#111827" textAlign="right" flexShrink={1} maxWidth="70%">
                      {form.laborers} worker
                    </Text>
                  </XStack>
                </YStack>
              </YStack>

              <YStack backgroundColor="#FFFFFF" borderRadius={14} padding={16} borderWidth={1} borderColor="#E5E7EB" gap="$3">
                <Text fontSize={16} fontWeight="800" color="#111827">
                  Payment Type
                </Text>
                <XStack gap="$2">
                  <Button
                    flex={1}
                    backgroundColor={paymentMode === 'advance' ? '#1F4E79' : '#F8FAFC'}
                    color={paymentMode === 'advance' ? '#FFFFFF' : '#111827'}
                    borderWidth={1}
                    borderColor="#E5E7EB"
                    borderRadius={12}
                    onPress={() => setPaymentMode('advance')}>
                    Advance
                  </Button>
                  <Button
                    flex={1}
                    backgroundColor={paymentMode === 'full' ? '#1F4E79' : '#F8FAFC'}
                    color={paymentMode === 'full' ? '#FFFFFF' : '#111827'}
                    borderWidth={1}
                    borderColor="#E5E7EB"
                    borderRadius={12}
                    onPress={() => setPaymentMode('full')}>
                    Full Payment
                  </Button>
                </XStack>
                <Text fontSize={11} color="#64748B">
                  Default: Advance
                </Text>
              </YStack>

              <YStack backgroundColor="#FFFFFF" borderRadius={14} padding={16} borderWidth={1} borderColor="#E5E7EB" gap="$3">
                <Text fontSize={16} fontWeight="800" color="#111827">
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
                  <Button backgroundColor="#E5E7EB" color="#111827" onPress={applyCoupon} disabled={couponApplying} opacity={couponApplying ? 0.6 : 1}>
                    {couponApplying ? 'Applying…' : 'Apply'}
                  </Button>
                </XStack>

                {couponApplied ? (
                  <YStack backgroundColor="#DCFCE7" borderRadius={12} padding={12} borderWidth={1} borderColor="#22C55E">
                    <Text color="#166534" fontWeight="800">
                      Applied: {couponApplied.code}
                    </Text>
                    {couponApplied.title ? (
                      <Text color="#166534" fontSize={12}>
                        {couponApplied.title}
                      </Text>
                    ) : null}
                  </YStack>
                ) : null}
              </YStack>

              <YStack backgroundColor="#FFFFFF" borderRadius={14} padding={16} borderWidth={1} borderColor="#E5E7EB" gap="$3">
                <Text fontSize={16} fontWeight="800" color="#111827">
                  Price Breakdown
                </Text>
                <YStack gap="$2">
                  <XStack justifyContent="space-between">
                    <Text color="#64748B">Base Fare</Text>
                    <Text fontWeight="800" color="#111827">{currency(vehiclePricing?.baseFare ?? 0)}</Text>
                  </XStack>
                  <XStack justifyContent="space-between">
                    <Text color="#64748B">Distance ({distanceKm ? Math.round(distanceKm) : 0} km)</Text>
                    <Text fontWeight="800" color="#111827">{currency((distanceKm ?? 0) * (vehiclePricing?.perKm ?? 0))}</Text>
                  </XStack>
                  <XStack justifyContent="space-between">
                    <Text color="#64748B">Floor charges</Text>
                    <Text fontWeight="800" color="#111827">{currency(pickupFloorCharge + dropFloorCharge)}</Text>
                  </XStack>
                  <XStack justifyContent="space-between">
                    <Text color="#64748B">Labor ({form.laborers} Worker)</Text>
                    <Text fontWeight="800" color="#111827">{currency(form.laborers * (vehiclePricing?.laborUnit ?? 0))}</Text>
                  </XStack>
                  <XStack justifyContent="space-between">
                    <Text color="#64748B">GST (18%)</Text>
                    <Text fontWeight="800" color="#111827">{currency(gst)}</Text>
                  </XStack>

                  {discountAmount > 0 ? (
                    <XStack justifyContent="space-between">
                      <Text color="#64748B">Discount</Text>
                      <Text fontWeight="800" color="#111827">- {currency(discountAmount)}</Text>
                    </XStack>
                  ) : null}
                  <YStack height={1} backgroundColor="#E5E7EB" marginVertical={8} />
                  <XStack justifyContent="space-between">
                    <Text fontSize={16} fontWeight="900">Total</Text>
                    <Text fontSize={16} fontWeight="900">{currency(total)}</Text>
                  </XStack>

                  <XStack justifyContent="space-between" marginTop={6}>
                    <Text color="#64748B">Advance Payment</Text>
                    <Text fontWeight="800" color="#16A34A">
                      - {currency(form.advanceAmount)}
                    </Text>
                  </XStack>
                  <XStack justifyContent="space-between">
                    <Text fontSize={16} fontWeight="900">Remaining</Text>
                    <Text fontSize={16} fontWeight="900">{currency(Math.max(total - form.advanceAmount, 0))}</Text>
                  </XStack>
                </YStack>
              </YStack>

              {paymentMode === 'advance' ? (
                <YStack backgroundColor="#FFFFFF" borderRadius={14} padding={16} borderWidth={1} borderColor="#E5E7EB" gap="$3">
                  <Text fontSize={16} fontWeight="800" color="#111827">
                    Select Advance Amount
                  </Text>
                  <XStack gap="$2" flexWrap="wrap">
                    {[500, 1000, 2000].map((amt) => (
                      <Button
                        key={amt}
                        backgroundColor={form.advanceAmount === amt ? '#EFF6FF' : '#FFFFFF'}
                        borderWidth={2}
                        borderColor={form.advanceAmount === amt ? '#1F4E79' : '#E5E7EB'}
                        color="#111827"
                        onPress={() => {
                          setIsCustomAdvance(false);
                          setForm((p) => ({ ...p, advanceAmount: amt }));
                        }}>
                        {currency(amt)}
                      </Button>
                    ))}
                    <Button
                      backgroundColor={form.advanceAmount > 2000 ? '#EFF6FF' : '#FFFFFF'}
                      borderWidth={2}
                      borderColor={form.advanceAmount > 2000 ? '#1F4E79' : '#E5E7EB'}
                      color="#111827"
                      onPress={() => {
                        setIsCustomAdvance(true);
                        setForm((p) => ({ ...p, advanceAmount: p.advanceAmount > 0 ? p.advanceAmount : 2500 }));
                      }}>
                      Custom
                    </Button>
                  </XStack>

                  {isCustomAdvance ? (
                    <YStack gap="$2">
                      <Text fontSize={12} fontWeight="700" color="#111827">
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
                      <Text fontSize={11} color="#64748B">
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
                    justifyContent="space-between"
                    flexDirection="row"
                    alignItems="center">
                    <YStack gap="$1">
                      <Text color="#92400E" fontWeight="900">
                        Advance Payment
                      </Text>
                      <Text color="#B45309" fontSize={12}>
                        Pay now to confirm booking
                      </Text>
                      <Text color="#B45309" fontSize={11}>
                        Remaining {currency(Math.max(total - form.advanceAmount, 0))} will be collected after delivery
                      </Text>
                    </YStack>
                    <Text color="#92400E" fontSize={20} fontWeight="900">
                      {currency(form.advanceAmount)}
                    </Text>
                  </YStack>
                </YStack>
              ) : null}

              <YStack backgroundColor="#FFFFFF" borderRadius={14} padding={16} borderWidth={1} borderColor="#E5E7EB" gap="$3">
                <Text fontSize={16} fontWeight="800" color="#111827">
                  Payment Method
                </Text>

                <YStack backgroundColor="#DCFCE7" borderRadius={14} padding={14} borderWidth={1} borderColor="#22C55E">
                  <Text color="#166534" fontWeight="900">
                    100% Secure Payment
                  </Text>
                  <Text color="#166534" fontSize={12}>
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
            <YStack backgroundColor="#DCFCE7" borderRadius={12} padding={12} borderWidth={1} borderColor="#22C55E">
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
        backgroundColor="#FFFFFF"
        borderTopWidth={1}
        borderTopColor="#E5E7EB"
        padding={12}>
        <XStack gap="$3" justifyContent="space-between" alignItems="center" alignSelf="center" width={containerWidth}>
          <Button
            flex={1}
            backgroundColor="#FFFFFF"
            borderWidth={1}
            borderColor="#E5E7EB"
            color="#111827"
            borderRadius={12}
            onPress={handleBack}
            disabled={false}>
            Back
          </Button>
          <Button
            flex={1.2}
            backgroundColor={canContinue ? '#1F4E79' : '#94A3B8'}
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
          <Dialog.Content width={isWide ? 520 : '92%'} borderRadius={18} backgroundColor="#FFFFFF" padding={18}>
            <YStack gap="$3" alignItems="center">
              <YStack width={72} height={72} borderRadius={999} backgroundColor="#1F4E79" alignItems="center" justifyContent="center">
                <Text color="#FFFFFF" fontSize={28} fontWeight="900">
                  🔒
                </Text>
              </YStack>

              <YStack alignItems="center" gap="$1">
                <Dialog.Title asChild>
                  <H4>Verify Your Number</H4>
                </Dialog.Title>
                <Dialog.Description asChild>
                  <Paragraph textAlign="center" color="#64748B">
                    We&apos;ve sent a 6-digit OTP to {form.mobile ? `${form.mobile.slice(0, 2)}****${form.mobile.slice(-4)}` : 'your number'}
                  </Paragraph>
                </Dialog.Description>
                {error ? (
                  <Text color="#DC2626" fontSize={12} textAlign="center">
                    {error}
                  </Text>
                ) : null}
              </YStack>

              <XStack gap="$2" justifyContent="center" flexWrap="wrap">
                {otpDigits.map((d, i) => (
                  <Input
                    key={i}
                    value={d}
                    keyboardType="number-pad"
                    maxLength={6}
                    width={46}
                    height={54}
                    textAlign="center"
                    fontSize={18}
                    borderWidth={2}
                    borderColor="#1F4E79"
                    borderRadius={10}
                    backgroundColor="#FFFFFF"
                    color="#111827"
                    hoverStyle={{ backgroundColor: '#FFFFFF', borderColor: '#1F4E79' } as any}
                    focusStyle={{ backgroundColor: '#FFFFFF', borderColor: '#1F4E79' } as any}
                    pressStyle={{ backgroundColor: '#FFFFFF', borderColor: '#1F4E79' } as any}
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

              <YStack backgroundColor="#FEF3C7" borderRadius={14} padding={14} borderWidth={1} borderColor="#F59E0B" width="100%" justifyContent="space-between" flexDirection="row" alignItems="center">
                <YStack>
                  <Text color="#92400E" fontWeight="900">Advance Payment</Text>
                  <Text color="#B45309" fontSize={12}>Pay now to confirm booking</Text>
                </YStack>
                <Text color="#92400E" fontSize={18} fontWeight="900">{currency(form.advanceAmount)}</Text>
              </YStack>

              <XStack gap="$2" width="100%">
                <Button
                  flex={1}
                  backgroundColor="#FFFFFF"
                  borderWidth={1}
                  borderColor="#E5E7EB"
                  color="#111827"
                  borderRadius={12}
                  hoverStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E5E7EB' } as any}
                  focusStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E5E7EB' } as any}
                  pressStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E5E7EB' } as any}
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
    </YStack>
  );
}
