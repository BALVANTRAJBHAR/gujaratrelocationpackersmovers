import DateTimePicker from '@react-native-community/datetimepicker';
import { ResizeMode, Video } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { Alert, Dimensions, Image, Modal, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { Button, Input, Paragraph, Text, XStack, YStack } from 'tamagui';

import { reverseGeocode, searchPlaces } from '@/lib/mapbox';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';

const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_DURATION_SEC = 30;

const isAllowedJpeg = (value: string) => {
  const v = String(value ?? '').toLowerCase();
  return v.endsWith('.jpg') || v.endsWith('.jpeg') || v.includes('image/jpeg');
};

const isAllowedMp4 = (value: string) => {
  const v = String(value ?? '').toLowerCase();
  return v.endsWith('.mp4') || v.includes('video/mp4');
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

type WizardStep = 'service' | 'details' | 'uploads' | 'review';

type UploadItem = {
  uri: string;
  kind: 'photo' | 'video';
};

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
  const [detailsAttempted, setDetailsAttempted] = useState(false);

  const [serviceKey, setServiceKey] = useState<string>(initialServiceValid ? initialService : '');

  const [customerName, setCustomerName] = useState<string>(String(profile?.name ?? '').trim());
  const [countryCode, setCountryCode] = useState<string>('+91');
  const [countryCodePickerOpen, setCountryCodePickerOpen] = useState(false);
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [addressLine1, setAddressLine1] = useState<string>('');
  const [addressLine2, setAddressLine2] = useState<string>('');
  const [state, setState] = useState<string>('');
  const [city, setCity] = useState<string>('');
  const [locality, setLocality] = useState<string>('');
  const [preferredDate, setPreferredDate] = useState<string>('');
  const [preferredTime, setPreferredTime] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const [statePickerOpen, setStatePickerOpen] = useState(false);
  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [uploadsPreviewOpen, setUploadsPreviewOpen] = useState(false);
  const [mediaViewerOpen, setMediaViewerOpen] = useState(false);
  const [mediaViewerKind, setMediaViewerKind] = useState<'photo' | 'video'>('photo');
  const [mediaViewerIndex, setMediaViewerIndex] = useState(0);
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

  const requireSession = () => {
    if (session?.user?.id) return true;
    router.push({ pathname: '/auth/login', params: { redirectTo: '/home-services/request' } } as any);
    return false;
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
    if (step === 'review') {
      setStep('uploads');
      return;
    }
  };

  const pickPhotos = async () => {
    setError(null);
    const remaining = Math.max(10 - photos.length, 0);
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

    const accepted: string[] = [];
    for (const asset of result.assets) {
      const uri = asset?.uri;
      if (!uri) continue;

      if (!isAllowedJpeg(asset?.fileName ?? '') && !isAllowedJpeg(asset?.mimeType ?? '') && !isAllowedJpeg(uri)) {
        setError('Only JPG/JPEG images are allowed.');
        continue;
      }

      const size = typeof asset?.fileSize === 'number' ? asset.fileSize : null;
      const info = size === null ? await FileSystem.getInfoAsync(uri, ({ size: true } as any)) : null;
      const finalSize = size ?? (typeof (info as any)?.size === 'number' ? Number((info as any).size) : null);
      if (finalSize !== null && finalSize > MAX_IMAGE_UPLOAD_BYTES) {
        setError('Image too large. Please select an image up to 10MB.');
        continue;
      }

      accepted.push(uri);
    }

    if (!accepted.length) return;
    setPhotos((p) => [...p, ...accepted].slice(0, 10));
  };

  const pickVideo = async () => {
    setError(null);
    if (videos.length >= 2) {
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
      setError('Video must be 30 seconds or less.');
      return;
    }

    if (!asset?.uri) return;

    if (!isAllowedMp4(asset?.fileName ?? '') && !isAllowedMp4(asset?.mimeType ?? '') && !isAllowedMp4(asset.uri)) {
      setError('Only MP4 videos are allowed.');
      return;
    }

    const size = typeof asset?.fileSize === 'number' ? asset.fileSize : null;
    const info = size === null ? await FileSystem.getInfoAsync(asset.uri, ({ size: true } as any)) : null;
    const finalSize = size ?? (typeof (info as any)?.size === 'number' ? Number((info as any).size) : null);
    if (finalSize !== null && finalSize > MAX_VIDEO_BYTES) {
      setError('Video must be 10MB or less.');
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
        preferred_date: preferredDate.trim() || null,
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
      const fileInfo = await FileSystem.getInfoAsync(it.uri, ({ size: true } as any));
      const fileSize = typeof (fileInfo as any)?.size === 'number' ? Number((fileInfo as any).size) : null;

      if (it.kind === 'photo') {
        if (!isAllowedJpeg(it.uri)) throw new Error('Only JPG/JPEG images are allowed.');
        if (fileSize !== null && fileSize > MAX_IMAGE_UPLOAD_BYTES) throw new Error('Image too large. Please select an image up to 10MB.');
      }

      if (it.kind === 'video') {
        if (!isAllowedMp4(it.uri)) throw new Error('Only MP4 videos are allowed.');
        if (fileSize !== null && fileSize > MAX_VIDEO_BYTES) throw new Error('Video must be 10MB or less.');
      }

      const res = await fetch(it.uri);
      const blob = await res.blob();

      const ext = it.kind === 'video' ? 'mp4' : 'jpg';
      const rawPath = `requests/${requestId}/${it.kind}s/${Date.now()}_${Math.random().toString(16).slice(2)}.${ext}`;
      const contentType = it.kind === 'video' ? 'video/mp4' : 'image/jpeg';

      const { error: uploadError } = await supabase.storage.from(rawBucket).upload(rawPath, blob, { contentType, upsert: true });
      if (uploadError) throw new Error(uploadError.message);

      const { data: processed, error: processError } = await supabase.functions.invoke('process-home-service-upload', {
        body: { request_id: requestId, raw_path: rawPath, kind: it.kind },
      });

      if (processError) throw new Error(processError.message);
      if ((processed as any)?.upload) {
        processedUploadsRef.current = [...processedUploadsRef.current, (processed as any).upload];
      }
    }
  };

  const handleSubmit = async () => {
    setError(null);

    if (!requireSession()) return;

    try {
      setSaving(true);

      if (!serviceKey) throw new Error('Please select a service.');

      const requestId = await createRequestIfNeeded();
      if (!requestId) return;

      await uploadMedia(requestId);

      await supabase
        .from('home_service_requests')
        .update({ status: 'pending' })
        .eq('id', requestId);

      Alert.alert('Request submitted', 'We have received your request. A provider will contact you shortly.');
      router.replace('/home-services/my-requests');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit request.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F3F4F6' }}>
      <YStack backgroundColor="#1F4E79" padding={16} paddingTop={18}>
        <XStack alignItems="center" justifyContent="center" position="relative">
          <Button size="$3" chromeless color="#FFFFFF" position="absolute" left={0} onPress={goBack}>
            ‹
          </Button>
          <YStack alignItems="center">
            <Text color="#FFFFFF" fontSize={16} fontWeight="800">
              Home Service Request
            </Text>
            <Text color="#CFE3F4" fontSize={12} fontWeight="600">
              {step === 'service' ? 'Step 1 of 4' : step === 'details' ? 'Step 2 of 4' : step === 'uploads' ? 'Step 3 of 4' : 'Step 4 of 4'}
            </Text>
          </YStack>
        </XStack>
      </YStack>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120, alignItems: 'center' }}>
        <YStack width={containerWidth} gap="$4">
          {step === 'service' ? (
            <YStack backgroundColor="#FFFFFF" borderRadius={14} padding={16} borderWidth={1} borderColor="#E5E7EB" gap="$3">
              <Text fontSize={16} fontWeight="800" color="#1F4E79">
                Select Service
              </Text>
              <XStack flexWrap="wrap" gap="$3" justifyContent="space-between">
                {serviceOptions.map((s) => {
                  const selected = serviceKey === s.key;
                  return (
                    <Pressable key={s.key} onPress={() => setServiceKey(s.key)} style={{ width: screenWidth > 820 ? '32%' : '48%' } as any}>
                      <YStack
                        backgroundColor={selected ? '#EFF6FF' : '#FFFFFF'}
                        borderRadius={14}
                        padding={14}
                        borderWidth={2}
                        borderColor={selected ? '#1F4E79' : '#E5E7EB'}
                        gap="$1">
                        <Text fontWeight="800" color="#111827">
                          {s.label}
                        </Text>
                        <Text fontSize={11} color="#64748B" fontWeight="700">
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
            <YStack backgroundColor="#FFFFFF" borderRadius={14} padding={16} borderWidth={1} borderColor="#E5E7EB" gap="$3">
              <Text fontSize={16} fontWeight="800" color="#1F4E79">
                Your Details
              </Text>

              {detailsAttempted && error ? (
                <YStack backgroundColor="#FEF2F2" borderRadius={12} padding={12} borderWidth={1} borderColor="#FECACA">
                  <Text color="#991B1B" fontWeight="800">
                    {error}
                  </Text>
                </YStack>
              ) : null}

              <YStack gap="$2">
                <Text fontSize={12} fontWeight="700" color="#456bbeff">
                  Name
                </Text>
                <Input
                  value={customerName}
                  onChangeText={setCustomerName}
                  placeholder="Your name"
                  backgroundColor="#FFFFFF"
                  borderColor="#E5E7EB"
                  color="#111827"
                />
              </YStack>

              <YStack gap="$2">
                <Text fontSize={12} fontWeight="700" color="#456bbeff">
                  Phone *
                </Text>
                <XStack gap="$2" flexWrap="wrap" alignItems="center">
                  <Pressable onPress={() => setCountryCodePickerOpen(true)} style={{ flexBasis: '32%' } as any}>
                    <YStack
                      backgroundColor="#FFFFFF"
                      borderRadius={12}
                      padding={12}
                      borderWidth={1}
                      borderColor="#E5E7EB">
                      <Text fontSize={11} fontWeight="800" color="#64748B">
                        Code
                      </Text>
                      <Text fontSize={13} fontWeight="900" color="#111827">
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
                      backgroundColor="#FFFFFF"
                      borderColor="#E5E7EB"
                      color="#111827"
                    />
                  </YStack>
                </XStack>
              </YStack>

              <YStack gap="$2">
                <Text fontSize={12} fontWeight="700" color="#456bbeff">
                  Address line 1
                </Text>
                <Input
                  value={addressLine1}
                  onChangeText={setAddressLine1}
                  placeholder="House no / society"
                  backgroundColor="#FFFFFF"
                  borderColor="#E5E7EB"
                  color="#111827"
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
                      maximumAge: 5_000,
                      timeout: 12_000,
                      mayShowUserSettingsDialog: true,
                    } as any);
                    const place = await reverseGeocode(current.coords.longitude, current.coords.latitude);
                    const partsRaw = String(place)
                      .split(',')
                      .map((x) => x.trim())
                      .filter(Boolean);

                    const parts = cleanParts(partsRaw);

                    if (!parts.length) return;

                    const country = parts.length ? parts[parts.length - 1] : '';
                    const partsNoCountry = normalizeMatchKey(country) === 'india' ? parts.slice(0, -1) : parts;

                    let nextState = matchFromOptions(partsNoCountry.slice().reverse().find((p) => matchFromOptions(p, stateOptions)) ?? '', stateOptions);
                    let nextStateId = states.find((s) => normalizeMatchKey(s.name) === normalizeMatchKey(nextState))?.id ?? null;

                    const likelyCityToken = stripIndianPin(partsNoCountry[partsNoCountry.length - 1] ?? '');

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

                    const nextCity = matchFromOptions(
                      partsNoCountry.slice().reverse().find((p) => matchFromOptions(p, nextCityOptions)) ?? likelyCityToken,
                      nextCityOptions
                    );
                    const nextLocalityMatched = matchFromOptions(
                      partsNoCountry.slice().reverse().find((p) => matchFromOptions(p, localityOptions)) ?? '',
                      localityOptions
                    );

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

                    setAddressLine1(addressLine1Next || '');
                    setAddressLine2(addressLine2Next || '');

                    if (nextState) {
                      setState(nextState);
                      setCity('');
                      setLocality('');
                    }
                    if (nextCity) setCity(nextCity);

                    // IMPORTANT: programmatic fill should NOT trigger Mapbox suggestions
                    setLocalityTyped(false);
                    setLocalitySuggestions([]);
                    if (nextLocality) setLocality(nextLocality);
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
                      borderColor: '#0EA5E9',
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative',
                    }}>
                    <View style={{ width: 6, height: 6, borderRadius: 6, backgroundColor: '#0EA5E9' }} />
                    <View style={{ position: 'absolute', width: 16, height: 2, backgroundColor: '#0EA5E9' }} />
                    <View style={{ position: 'absolute', width: 2, height: 16, backgroundColor: '#0EA5E9' }} />
                  </View>
                  <Text fontSize={12} fontWeight="900" color="#0EA5E9">
                    Use Current Location
                  </Text>
                </XStack>
              </Pressable>

              <YStack gap="$2">
                <Text fontSize={12} fontWeight="700" color="#456bbeff">
                  Address line 2
                </Text>
                <Input
                  value={addressLine2}
                  onChangeText={setAddressLine2}
                  placeholder="Street / landmark"
                  backgroundColor="#FFFFFF"
                  borderColor="#E5E7EB"
                  color="#111827"
                />
              </YStack>

              <YStack gap="$2">
                <Text fontSize={12} fontWeight="700" color="#456bbeff">
                  Locality
                </Text>
                <Input
                  value={locality}
                  onChangeText={(v) => {
                    setLocality(v);
                    setLocalityTyped(true);
                  }}
                  placeholder="Search locality"
                  backgroundColor="#FFFFFF"
                  borderColor="#E5E7EB"
                  color="#111827"
                />
              </YStack>

              {localityTyped && localityOptions.length && locality.trim() ? (
                <XStack gap="$2" flexWrap="wrap" alignItems="center">
                  <Text fontSize={11} fontWeight="700" color="#64748B">
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
                        <Text fontSize={11} fontWeight="900" color="#2563EB">
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
                      <YStack borderWidth={1} borderColor="#E5E7EB" borderRadius={12} padding={10} backgroundColor="#F8FAFC">
                        <Text color="#111827" fontWeight="900" numberOfLines={1}>
                          {s.label}
                        </Text>
                        <Text color="#64748B" fontSize={11} numberOfLines={1}>
                          {s.full}
                        </Text>
                      </YStack>
                    </Pressable>
                  ))}
                </YStack>
              ) : localityTyped && localityLoading ? (
                <Text color="#64748B" fontSize={11}>
                  Searching...
                </Text>
              ) : null}

              <XStack gap="$2" flexWrap="wrap" justifyContent="space-between">
                <YStack gap="$2" style={{ flexBasis: '49%' } as any}>
                  <Text fontSize={12} fontWeight="700" color="#456bbeff">
                    State
                  </Text>
                  <Pressable onPress={() => setStatePickerOpen(true)}>
                    <YStack backgroundColor="#FFFFFF" borderRadius={12} padding={12} borderWidth={1} borderColor="#E5E7EB">
                      <Text fontSize={11} fontWeight="800" color="#64748B">
                        Select
                      </Text>
                      <Text fontSize={13} fontWeight="900" color="#111827" numberOfLines={1}>
                        {state || 'State'}
                      </Text>
                    </YStack>
                  </Pressable>
                </YStack>
                <YStack gap="$2" style={{ flexBasis: '49%' } as any}>
                  <Text fontSize={12} fontWeight="700" color="#456bbeff">
                    City
                  </Text>
                  <Pressable onPress={() => setCityPickerOpen(true)}>
                    <YStack backgroundColor="#FFFFFF" borderRadius={12} padding={12} borderWidth={1} borderColor="#E5E7EB">
                      <Text fontSize={11} fontWeight="800" color="#64748B">
                        Select
                      </Text>
                      <Text fontSize={13} fontWeight="900" color="#111827" numberOfLines={1}>
                        {city || 'City'}
                      </Text>
                    </YStack>
                  </Pressable>
                </YStack>
              </XStack>

              <XStack gap="$2" flexWrap="wrap" justifyContent="space-between">
                <YStack gap="$2" style={{ flexBasis: '49%' } as any}>
                  <Text fontSize={12} fontWeight="700" color="#456bbeff">
                    Preferred date
                  </Text>
                  {Platform.OS === 'web'
                    ? React.createElement('input', {
                        type: 'date',
                        value: toISODateFromDDMMYYYY(preferredDate) || '',
                        style: {
                          width: '100%',
                          height: 46,
                          fontSize: 14,
                          padding: '10px 12px',
                          borderRadius: 12,
                          border: '1px solid #E5E7EB',
                          outline: 'none',
                          background: '#FFFFFF',
                          color: '#111827',
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
                            backgroundColor="#FFFFFF"
                            borderColor="#E5E7EB"
                            color="#111827"
                          />
                        </Pressable>
                      )}
                </YStack>
                <YStack gap="$2" style={{ flexBasis: '49%' } as any}>
                  <Text fontSize={12} fontWeight="700" color="#456bbeff">
                    Preferred time
                  </Text>
                  {Platform.OS === 'web'
                    ? React.createElement('input', {
                        type: 'time',
                        value: preferredTime || '',
                        style: {
                          width: '100%',
                          height: 46,
                          fontSize: 14,
                          padding: '10px 12px',
                          borderRadius: 12,
                          border: '1px solid #E5E7EB',
                          outline: 'none',
                          background: '#FFFFFF',
                          color: '#111827',
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
                            backgroundColor="#FFFFFF"
                            borderColor="#E5E7EB"
                            color="#111827"
                          />
                        </Pressable>
                      )}
                </YStack>
              </XStack>

              <YStack gap="$2">
                <Text fontSize={12} fontWeight="700" color="#456bbeff">
                  Notes
                </Text>
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Describe the issue"
                  placeholderTextColor="#9CA3AF"
                  multiline
                  style={{
                    borderWidth: 1,
                    borderColor: '#E5E7EB',
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    minHeight: 90,
                    backgroundColor: '#FFFFFF',
                    color: '#111827',
                    textAlignVertical: 'top',
                  }}
                />
              </YStack>
            </YStack>
          ) : null}

          {step === 'uploads' ? (
            <YStack backgroundColor="#FFFFFF" borderRadius={14} padding={16} borderWidth={1} borderColor="#E5E7EB" gap="$3">
              <Text fontSize={16} fontWeight="800" color="#1F4E79">
                Upload Photos / Videos
              </Text>
              <Paragraph color="#64748B">
                JPG/JPEG only. Videos: MP4 only (max 30s, 10MB). Images max 10MB upload; will be compressed server-side.
              </Paragraph>

              <XStack gap="$2" flexWrap="wrap">
                <Button backgroundColor="#1F4E79" color="#FFFFFF" onPress={() => void pickPhotos()}>
                  Add Photos ({photos.length}/10)
                </Button>
                <Button backgroundColor="#111827" color="#FFFFFF" onPress={() => void pickVideo()}>
                  Add Video ({videos.length}/2)
                </Button>
              </XStack>

              {photos.length || videos.length ? (
                <YStack gap="$2">
                  <Text fontWeight="800" color="#111827">
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
                          <View style={{ width: 44, height: 34, borderRadius: 8, overflow: 'hidden', backgroundColor: '#F1F5F9' }}>
                            <Image source={{ uri: u }} style={{ width: 44, height: 34 }} resizeMode="cover" />
                          </View>
                          <Text numberOfLines={1} color="#64748B">
                            Photo
                          </Text>
                        </XStack>
                      </Pressable>
                      <Button
                        size="$2"
                        backgroundColor="#EF4444"
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
                          <View style={{ width: 44, height: 34, borderRadius: 8, overflow: 'hidden', backgroundColor: '#0B1220' }}>
                            <Video
                              source={{ uri: u }}
                              style={{ width: 44, height: 34 }}
                              resizeMode={ResizeMode.COVER}
                              isMuted
                              shouldPlay={false}
                            />
                          </View>
                          <Text numberOfLines={1} color="#64748B">
                            Video
                          </Text>
                        </XStack>
                      </Pressable>
                      <Button
                        size="$2"
                        backgroundColor="#EF4444"
                        color="#FFFFFF"
                        onPress={() => setVideos((p) => p.filter((x) => x !== u))}>
                        Remove
                      </Button>
                    </XStack>
                  ))}
                </YStack>
              ) : null}
            </YStack>
          ) : null}

          {step === 'review' ? (
            <YStack backgroundColor="#FFFFFF" borderRadius={14} padding={16} borderWidth={1} borderColor="#E5E7EB" gap="$3">
              <Text fontSize={16} fontWeight="800" color="#1F4E79">
                Review
              </Text>

              <YStack gap="$1">
                <Text color="#64748B" fontWeight="700">
                  Service
                </Text>
                <Text color="#111827" fontWeight="900">
                  {serviceOptions.find((x) => x.key === serviceKey)?.label ?? serviceKey}
                </Text>
              </YStack>

              <YStack gap="$1">
                <Text color="#64748B" fontWeight="700">
                  Phone
                </Text>
                <Text color="#111827" fontWeight="900" style={{ fontFamily: Platform.OS === 'web' ? 'Times New Roman' : 'serif' } as any}>
                  {countryCode}{normalizePhoneDigits(customerPhone)}
                </Text>
              </YStack>

              <YStack gap="$1">
                <Text color="#64748B" fontWeight="700">
                  Location
                </Text>
                <Text color="#111827" fontWeight="900" style={{ fontFamily: Platform.OS === 'web' ? 'Times New Roman' : 'serif' } as any}>
                  {addressLine1 || addressLine2 || locality || city || state
                    ? `${addressLine1}${addressLine1 ? ', ' : ''}${addressLine2}${addressLine2 ? ', ' : ''}${locality}${locality ? ', ' : ''}${city}${city ? ', ' : ''}${state}`
                    : 'Not provided'}
                </Text>
              </YStack>

              <YStack gap="$1">
                <Text color="#64748B" fontWeight="700">
                  Preferred date & time
                </Text>
                <Text color="#111827" fontWeight="900" style={{ fontFamily: Platform.OS === 'web' ? 'Times New Roman' : 'serif' } as any}>
                  {preferredDate && preferredTime ? `${preferredDate}, ${preferredTime}` : 'Not provided'}
                </Text>
              </YStack>

              <YStack gap="$1">
                <Text color="#64748B" fontWeight="700">
                  Uploads
                </Text>
                <Pressable onPress={() => setUploadsPreviewOpen(true)}>
                  <Text color="#111827" fontWeight="900" style={{ textDecorationLine: 'underline', fontFamily: Platform.OS === 'web' ? 'Times New Roman' : 'serif' } as any}>
                    {photos.length} photos, {videos.length} videos (Preview)
                  </Text>
                </Pressable>
              </YStack>
            </YStack>
          ) : null}

          {error && step !== 'details' ? (
            <YStack backgroundColor="#FEF2F2" borderRadius={12} padding={12} borderWidth={1} borderColor="#FECACA">
              <Text color="#991B1B" fontWeight="800">
                {error}
              </Text>
            </YStack>
          ) : null}
        </YStack>
      </ScrollView>

      <YStack position="absolute" bottom={0} left={0} right={0} backgroundColor="#FFFFFF" padding={14} borderTopWidth={1} borderTopColor="#E5E7EB">
        <XStack gap="$2" justifyContent="space-between" alignItems="center" flexWrap="wrap">
          <Button
            disabled={saving}
            backgroundColor="#6B7280"
            color="#FFFFFF"
            hoverStyle={{ backgroundColor: '#4B5563', color: '#FFFFFF' } as any}
            pressStyle={{ backgroundColor: '#374151', color: '#FFFFFF' } as any}
            focusStyle={{ backgroundColor: '#4B5563', color: '#FFFFFF' } as any}
            onPress={goBack}>
            Back
          </Button>

          {step === 'details' && detailsAttempted && detailsBlocker ? (
            <Text color="#EF4444" fontSize={11} fontWeight="800" style={{ flex: 1, textAlign: 'center' } as any} numberOfLines={2}>
              {detailsBlocker}
            </Text>
          ) : (
            <View style={{ flex: 1 }} />
          )}

          {step !== 'review' ? (
            <Button
              disabled={saving}
              backgroundColor="#10B981"
              color="#FFFFFF"
              hoverStyle={{ backgroundColor: '#22C55E', color: '#FFFFFF' } as any}
              pressStyle={{ backgroundColor: '#16A34A', color: '#FFFFFF' } as any}
              focusStyle={{ backgroundColor: '#22C55E', color: '#FFFFFF' } as any}
              onPress={goNext}>
              Next
            </Button>
          ) : (
            <Button
              disabled={saving}
              backgroundColor="#10B981"
              color="#FFFFFF"
              hoverStyle={{ backgroundColor: '#22C55E', color: '#FFFFFF' } as any}
              pressStyle={{ backgroundColor: '#16A34A', color: '#FFFFFF' } as any}
              focusStyle={{ backgroundColor: '#22C55E', color: '#FFFFFF' } as any}
              onPress={() => void handleSubmit()}>
              {saving ? 'Submitting…' : 'Submit Request'}
            </Button>
          )}
        </XStack>
      </YStack>

      <Modal visible={countryCodePickerOpen} transparent animationType="fade" onRequestClose={() => setCountryCodePickerOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'center', padding: 16 }} onPress={() => setCountryCodePickerOpen(false)}>
          <Pressable onPress={() => {}} style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, maxHeight: 420 }}>
            <XStack alignItems="center" justifyContent="space-between" marginBottom={10}>
              <Text color="#111827" fontSize={16} fontWeight="900">
                Select Country Code
              </Text>
              <Pressable onPress={() => setCountryCodePickerOpen(false)}>
                <Text color="#64748B" fontSize={24} fontWeight="900">
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
                    backgroundColor={c.value === countryCode ? '#F1F5F9' : 'transparent'}>
                    <Text color="#111827" fontWeight="800">
                      {c.label}
                    </Text>
                    <Text color="#64748B" fontWeight="900">
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
          <Pressable onPress={() => {}} style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, maxHeight: 420 }}>
            <XStack alignItems="center" justifyContent="space-between" marginBottom={10}>
              <Text color="#111827" fontSize={16} fontWeight="900">
                Select State
              </Text>
              <Pressable onPress={() => setStatePickerOpen(false)}>
                <Text color="#64748B" fontSize={24} fontWeight="900">
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
                    backgroundColor={st === state ? '#F1F5F9' : 'transparent'}>
                    <Text color="#111827" fontWeight="800">
                      {st}
                    </Text>
                    <Text color="#64748B" fontWeight="900">
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
          <Pressable onPress={() => {}} style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, maxHeight: 420 }}>
            <XStack alignItems="center" justifyContent="space-between" marginBottom={10}>
              <Text color="#111827" fontSize={16} fontWeight="900">
                Select City
              </Text>
              <Pressable onPress={() => setCityPickerOpen(false)}>
                <Text color="#64748B" fontSize={24} fontWeight="900">
                  ×
                </Text>
              </Pressable>
            </XStack>
            <ScrollView showsVerticalScrollIndicator={false}>
              {!state ? (
                <Text color="#64748B" paddingHorizontal={12} paddingVertical={8}>
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
                    backgroundColor={ct === city ? '#F1F5F9' : 'transparent'}>
                    <Text color="#111827" fontWeight="800">
                      {ct}
                    </Text>
                    <Text color="#64748B" fontWeight="900">
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
            <Text color="#FFFFFF" fontSize={16} fontWeight="900">
              {mediaViewerKind === 'photo' ? 'Photo' : 'Video'} {mediaViewerIndex + 1}/
              {mediaViewerKind === 'photo' ? photos.length : videos.length}
            </Text>
            <Pressable onPress={() => setMediaViewerOpen(false)}>
              <Text color="#E5E7EB" fontSize={26} fontWeight="900">
                ×
              </Text>
            </Pressable>
          </XStack>

          <View style={{ backgroundColor: '#0B1220', borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(148, 163, 184, 0.35)' }}>
            {mediaViewerKind === 'photo' ? (
              <Image
                source={{ uri: photos[mediaViewerIndex] }}
                style={{ width: '100%', height: Math.min(520, Math.max(260, screenWidth * 0.5)) }}
                resizeMode="contain"
              />
            ) : (
              <Video
                source={{ uri: videos[mediaViewerIndex] }}
                style={{ width: '100%', height: Math.min(520, Math.max(260, screenWidth * 0.5)) }}
                resizeMode={ResizeMode.CONTAIN}
                useNativeControls
                shouldPlay={false}
              />
            )}
          </View>

          <XStack marginTop={12} gap="$2" justifyContent="space-between" alignItems="center" flexWrap="wrap">
            <Button
              backgroundColor="#334155"
              color="#FFFFFF"
              disabled={mediaViewerIndex <= 0}
              onPress={() => setMediaViewerIndex((i) => Math.max(0, i - 1))}>
              Prev
            </Button>
            <Button
              backgroundColor="#334155"
              color="#FFFFFF"
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

      <Modal visible={uploadsPreviewOpen} transparent animationType="fade" onRequestClose={() => setUploadsPreviewOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'center', padding: 16 }} onPress={() => setUploadsPreviewOpen(false)}>
          <Pressable onPress={() => {}} style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, maxHeight: 520 }}>
            <XStack alignItems="center" justifyContent="space-between" marginBottom={10}>
              <Text color="#111827" fontSize={16} fontWeight="900">
                Uploads Preview
              </Text>
              <Pressable onPress={() => setUploadsPreviewOpen(false)}>
                <Text color="#64748B" fontSize={24} fontWeight="900">
                  ×
                </Text>
              </Pressable>
            </XStack>

            <ScrollView showsVerticalScrollIndicator={false}>
              {photos.map((u) => (
                <Pressable
                  key={u}
                  onPress={() => {
                    setMediaViewerKind('photo');
                    setMediaViewerIndex(Math.max(0, photos.findIndex((x) => x === u)));
                    setMediaViewerOpen(true);
                  }}>
                  <View style={{ marginBottom: 12, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#E5E7EB' }}>
                    <Image source={{ uri: u }} style={{ width: '100%', height: 220 }} resizeMode="cover" />
                  </View>
                </Pressable>
              ))}
              {videos.map((u) => (
                <Pressable
                  key={u}
                  onPress={() => {
                    setMediaViewerKind('video');
                    setMediaViewerIndex(Math.max(0, videos.findIndex((x) => x === u)));
                    setMediaViewerOpen(true);
                  }}>
                  <View style={{ marginBottom: 12, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#E5E7EB' }}>
                    <Video source={{ uri: u }} style={{ width: '100%', height: 220 }} resizeMode={ResizeMode.CONTAIN} useNativeControls />
                  </View>
                </Pressable>
              ))}
              {!photos.length && !videos.length ? <Text color="#64748B">No uploads.</Text> : null}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
