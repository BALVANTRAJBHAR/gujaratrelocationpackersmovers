import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { Alert, Dimensions, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { Button, Input, Paragraph, Text, XStack, YStack } from 'tamagui';

import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';

const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_DURATION_SEC = 30;

const isAllowedJpeg = (value: string) => {
  const v = String(value ?? '').toLowerCase();
  return v.endsWith('.jpg') || v.endsWith('.jpeg') || v.includes('image/jpeg');
};

const isAllowedMp4 = (value: string) => {
  const v = String(value ?? '').toLowerCase();
  return v.endsWith('.mp4') || v.includes('video/mp4');
};

const normalizePhone = (value: string) => {
  const v = String(value ?? '').replace(/\s+/g, '');
  if (!v) return '';
  return v.replace(/[^0-9+]/g, '');
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

const { width: screenWidth } = Dimensions.get('window');

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

  const [serviceKey, setServiceKey] = useState<string>(initialServiceValid ? initialService : '');

  const [customerName, setCustomerName] = useState<string>(String(profile?.name ?? '').trim());
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [addressLine1, setAddressLine1] = useState<string>('');
  const [addressLine2, setAddressLine2] = useState<string>('');
  const [state, setState] = useState<string>('');
  const [city, setCity] = useState<string>('');
  const [locality, setLocality] = useState<string>('');
  const [preferredDate, setPreferredDate] = useState<string>('');
  const [preferredTime, setPreferredTime] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

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

  const selectedStateId = useMemo(() => {
    const s = states.find((x) => x.name.toLowerCase() === state.trim().toLowerCase());
    return s?.id ?? null;
  }, [state, states]);

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
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [selectedStateId]);

  const stateOptions = useMemo(() => {
    if (states.length) return states.map((s) => s.name);
    return Object.keys(fallbackCityByState);
  }, [fallbackCityByState, states]);

  const cityOptions = useMemo(() => {
    if (cities.length) return cities.map((c) => c.name);
    return fallbackCityByState[state] ?? [];
  }, [cities, fallbackCityByState, state]);

  const [photos, setPhotos] = useState<string[]>([]);
  const [videos, setVideos] = useState<string[]>([]);

  const createdRequestIdRef = useRef<string | null>(null);
  const processedUploadsRef = useRef<any[]>([]);

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
      const phone = normalizePhone(customerPhone);
      if (!phone) {
        setError('Phone number is required.');
        return;
      }
      const digits = phone.replace(/[^0-9]/g, '');
      if (digits.length < 10) {
        setError('Please enter a valid phone number.');
        return;
      }
      if (preferredDate && !isIsoDate(preferredDate)) {
        setError('Preferred date must be YYYY-MM-DD.');
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
      const info = size === null ? await FileSystem.getInfoAsync(uri, { size: true }) : null;
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
    const info = size === null ? await FileSystem.getInfoAsync(asset.uri, { size: true }) : null;
    const finalSize = size ?? (typeof (info as any)?.size === 'number' ? Number((info as any).size) : null);
    if (finalSize !== null && finalSize > MAX_VIDEO_BYTES) {
      setError('Video must be 5MB or less.');
      return;
    }

    setVideos((p) => [...p, asset.uri].slice(0, 2));
  };

  const createRequestIfNeeded = async () => {
    if (createdRequestIdRef.current) return createdRequestIdRef.current;

    if (!requireSession()) return null;

    const userId = session?.user?.id ?? '';
    if (!userId) return null;

    const phone = normalizePhone(customerPhone);

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
      const fileInfo = await FileSystem.getInfoAsync(it.uri, { size: true });
      const fileSize = typeof (fileInfo as any)?.size === 'number' ? Number((fileInfo as any).size) : null;

      if (it.kind === 'photo') {
        if (!isAllowedJpeg(it.uri)) throw new Error('Only JPG/JPEG images are allowed.');
        if (fileSize !== null && fileSize > MAX_IMAGE_UPLOAD_BYTES) throw new Error('Image too large. Please select an image up to 10MB.');
      }

      if (it.kind === 'video') {
        if (!isAllowedMp4(it.uri)) throw new Error('Only MP4 videos are allowed.');
        if (fileSize !== null && fileSize > MAX_VIDEO_BYTES) throw new Error('Video must be 5MB or less.');
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

              <YStack gap="$2">
                <Text fontSize={12} fontWeight="700" color="#456bbeff">
                  Name
                </Text>
                <Input value={customerName} onChangeText={setCustomerName} placeholder="Your name" />
              </YStack>

              <YStack gap="$2">
                <Text fontSize={12} fontWeight="700" color="#456bbeff">
                  Phone *
                </Text>
                <Input
                  value={customerPhone}
                  onChangeText={(v) => setCustomerPhone(v)}
                  placeholder={Platform.OS === 'web' ? '+91XXXXXXXXXX' : 'Phone number'}
                  keyboardType={Platform.OS === 'web' ? 'default' : 'phone-pad'}
                />
              </YStack>

              <YStack gap="$2">
                <Text fontSize={12} fontWeight="700" color="#456bbeff">
                  Address line 1
                </Text>
                <Input value={addressLine1} onChangeText={setAddressLine1} placeholder="House no / society" />
              </YStack>

              <YStack gap="$2">
                <Text fontSize={12} fontWeight="700" color="#456bbeff">
                  Address line 2
                </Text>
                <Input value={addressLine2} onChangeText={setAddressLine2} placeholder="Street / landmark" />
              </YStack>

              <XStack gap="$2" flexWrap="wrap" justifyContent="space-between">
                <YStack gap="$2" style={{ flexBasis: '49%' } as any}>
                  <Text fontSize={12} fontWeight="700" color="#456bbeff">
                    State
                  </Text>
                  <Input value={state} onChangeText={setState} placeholder="State" />
                </YStack>
                <YStack gap="$2" style={{ flexBasis: '49%' } as any}>
                  <Text fontSize={12} fontWeight="700" color="#456bbeff">
                    City
                  </Text>
                  <Input value={city} onChangeText={setCity} placeholder="City" />
                </YStack>
              </XStack>

              <XStack gap="$2" flexWrap="wrap" alignItems="center">
                <Text fontSize={11} fontWeight="700" color="#64748B">
                  Suggestions:
                </Text>
                {stateOptions.slice(0, 2).map((st) => (
                  <Pressable
                    key={st}
                    onPress={() => {
                      setState(st);
                      const nextCity = (fallbackCityByState[st] ?? [])[0] ?? '';
                      if (nextCity) setCity(nextCity);
                    }}>
                    <Text fontSize={11} fontWeight="900" color="#2563EB">
                      {st}
                    </Text>
                  </Pressable>
                ))}
                {(cityOptions ?? []).slice(0, 3).map((ct) => (
                  <Pressable key={ct} onPress={() => setCity(ct)}>
                    <Text fontSize={11} fontWeight="900" color="#2563EB">
                      {ct}
                    </Text>
                  </Pressable>
                ))}
              </XStack>

              <YStack gap="$2">
                <Text fontSize={12} fontWeight="700" color="#456bbeff">
                  Locality
                </Text>
                <Input value={locality} onChangeText={setLocality} placeholder="Area / locality" />
              </YStack>

              <XStack gap="$2" flexWrap="wrap" justifyContent="space-between">
                <YStack gap="$2" style={{ flexBasis: '49%' } as any}>
                  <Text fontSize={12} fontWeight="700" color="#456bbeff">
                    Preferred date
                  </Text>
                  <Input value={preferredDate} onChangeText={setPreferredDate} placeholder="YYYY-MM-DD" />
                </YStack>
                <YStack gap="$2" style={{ flexBasis: '49%' } as any}>
                  <Text fontSize={12} fontWeight="700" color="#456bbeff">
                    Preferred time
                  </Text>
                  <Input value={preferredTime} onChangeText={setPreferredTime} placeholder="e.g. 10:00 AM" />
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
                JPG/JPEG only. Videos: MP4 only (max 30s, 5MB). Images max 10MB upload; will be compressed server-side.
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
                      <Text flex={1} numberOfLines={1} color="#64748B">
                        Photo
                      </Text>
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
                      <Text flex={1} numberOfLines={1} color="#64748B">
                        Video
                      </Text>
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
                <Text color="#111827" fontWeight="900">
                  {customerPhone}
                </Text>
              </YStack>

              <YStack gap="$1">
                <Text color="#64748B" fontWeight="700">
                  Location
                </Text>
                <Text color="#111827" fontWeight="900">
                  {locality || city || state ? `${locality}${locality ? ', ' : ''}${city}${city ? ', ' : ''}${state}` : 'Not provided'}
                </Text>
              </YStack>

              <YStack gap="$1">
                <Text color="#64748B" fontWeight="700">
                  Uploads
                </Text>
                <Text color="#111827" fontWeight="900">
                  {photos.length} photos, {videos.length} videos
                </Text>
              </YStack>
            </YStack>
          ) : null}

          {error ? (
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
          <Button disabled={saving} backgroundColor="#E5E7EB" color="#111827" onPress={goBack}>
            Back
          </Button>

          {step !== 'review' ? (
            <Button disabled={saving} backgroundColor="#10B981" color="#111827" onPress={goNext}>
              Next
            </Button>
          ) : (
            <Button disabled={saving} backgroundColor="#10B981" color="#111827" onPress={() => void handleSubmit()}>
              {saving ? 'Submitting…' : 'Submit Request'}
            </Button>
          )}
        </XStack>
      </YStack>
    </View>
  );
}
