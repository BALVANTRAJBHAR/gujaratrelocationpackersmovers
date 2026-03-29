import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import React, { useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { Button, Input, Paragraph, Text, XStack, YStack } from 'tamagui';

import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';
import { useRouter } from 'expo-router';

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

type UploadItem = {
  uri: string;
  kind: 'photo' | 'video';
};

type StateRow = { id: string; name: string };
type CityRow = { id: string; state_id: string; name: string };

type WizardStep = 'basic' | 'location' | 'pricing' | 'uploads' | 'review';

export default function PostPropertyScreen() {
  const router = useRouter();
  const { session, profile } = useSession();

  const [step, setStep] = useState<WizardStep>('basic');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [listingType, setListingType] = useState<'rent' | 'buy' | 'commercial'>('rent');
  const [propertyType, setPropertyType] = useState('apartment');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const [stateValue, setStateValue] = useState('Gujarat');
  const [cityValue, setCityValue] = useState('Ahmedabad');
  const [localityValue, setLocalityValue] = useState('');
  const [address1, setAddress1] = useState('');
  const [address2, setAddress2] = useState('');
  const [pincode, setPincode] = useState('');

  const [price, setPrice] = useState('');
  const [deposit, setDeposit] = useState('');
  const [maintenance, setMaintenance] = useState('');

  const [bedrooms, setBedrooms] = useState('');
  const [bathrooms, setBathrooms] = useState('');
  const [areaSqft, setAreaSqft] = useState('');
  const [furnishing, setFurnishing] = useState('semi_furnished');
  const [parking, setParking] = useState('none');

  const [contactName, setContactName] = useState(String(profile?.name ?? '').trim());
  const [contactPhone, setContactPhone] = useState('');

  const [photos, setPhotos] = useState<string[]>([]);
  const [videos, setVideos] = useState<string[]>([]);

  const createdPropertyIdRef = useRef<string | null>(null);

  const requireSession = () => {
    if (session?.user?.id) return true;
    router.push({ pathname: '/auth/login', params: { redirectTo: '/properties/post' } } as any);
    return false;
  };

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
    const s = states.find((x) => x.name.toLowerCase() === stateValue.trim().toLowerCase());
    return s?.id ?? null;
  }, [stateValue, states]);

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
    return fallbackCityByState[stateValue] ?? [];
  }, [cities, fallbackCityByState, stateValue]);

  const next = () => {
    if (step === 'basic') {
      if (!title.trim()) {
        setError('Title is required.');
        return;
      }
      setError(null);
      setStep('location');
      return;
    }
    if (step === 'location') {
      setError(null);
      setStep('pricing');
      return;
    }
    if (step === 'pricing') {
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

  const back = () => {
    if (saving) return;
    if (step === 'basic') {
      router.back();
      return;
    }
    if (step === 'location') {
      setStep('basic');
      return;
    }
    if (step === 'pricing') {
      setStep('location');
      return;
    }
    if (step === 'uploads') {
      setStep('pricing');
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

  const createPropertyIfNeeded = async () => {
    if (createdPropertyIdRef.current) return createdPropertyIdRef.current;
    if (!requireSession()) return null;

    const ownerId = session?.user?.id ?? '';
    if (!ownerId) return null;

    const { data, error: insertError } = await supabase
      .from('properties')
      .insert({
        owner_user_id: ownerId,
        listing_type: listingType,
        property_type: propertyType,
        title: title.trim() || null,
        description: description.trim() || null,
        price: price.trim() ? Number(price) : null,
        deposit: deposit.trim() ? Number(deposit) : null,
        maintenance: maintenance.trim() ? Number(maintenance) : null,
        bedrooms: bedrooms.trim() ? Number(bedrooms) : null,
        bathrooms: bathrooms.trim() ? Number(bathrooms) : null,
        area_sqft: areaSqft.trim() ? Number(areaSqft) : null,
        furnishing,
        parking,
        address_line1: address1.trim() || null,
        address_line2: address2.trim() || null,
        state: stateValue.trim() || null,
        city: cityValue.trim() || null,
        locality: localityValue.trim() || null,
        pincode: pincode.trim() || null,
        contact_name: contactName.trim() || null,
        contact_phone: contactPhone.trim() || null,
        status: 'draft',
      })
      .select('id')
      .maybeSingle();

    if (insertError) throw new Error(insertError.message);
    const id = String((data as any)?.id ?? '').trim();
    if (!id) throw new Error('Failed to create property.');

    createdPropertyIdRef.current = id;
    return id;
  };

  const uploadMedia = async (propertyId: string) => {
    if (!requireSession()) return;

    const rawBucket = 'property-uploads-raw';
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
      const rawPath = `properties/${propertyId}/${it.kind}s/${Date.now()}_${Math.random().toString(16).slice(2)}.${ext}`;
      const contentType = it.kind === 'video' ? 'video/mp4' : 'image/jpeg';

      const { error: uploadError } = await supabase.storage.from(rawBucket).upload(rawPath, blob, { contentType, upsert: true });
      if (uploadError) throw new Error(uploadError.message);

      const { data: processed, error: processError } = await supabase.functions.invoke('process-property-upload', {
        body: { property_id: propertyId, raw_path: rawPath, kind: it.kind },
      });

      if (processError) throw new Error(processError.message);
      if (!(processed as any)?.upload) {
        throw new Error('Upload processing failed.');
      }
    }
  };

  const submit = async () => {
    setError(null);
    if (!requireSession()) return;

    try {
      setSaving(true);

      const propertyId = await createPropertyIfNeeded();
      if (!propertyId) return;

      await uploadMedia(propertyId);

      const { error: updateError } = await supabase.from('properties').update({ status: 'published' }).eq('id', propertyId);
      if (updateError) throw new Error(updateError.message);

      Alert.alert('Property posted', 'Your property is now live.');
      router.replace({ pathname: '/properties/[id]', params: { id: propertyId } } as any);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to post property.');
    } finally {
      setSaving(false);
    }
  };

  const pageBg = '#FFFFFF';
  const border = '#E5E7EB';
  const titleColor = '#0F172A';
  const muted = '#64748B';

  return (
    <View style={{ flex: 1, backgroundColor: pageBg }}>
      <YStack backgroundColor="#111827" padding={16} paddingTop={18}>
        <XStack alignItems="center" justifyContent="center" position="relative">
          <Button size="$3" chromeless color="#FFFFFF" position="absolute" left={0} onPress={back}>
            ‹
          </Button>
          <YStack alignItems="center">
            <Text color="#FFFFFF" fontSize={16} fontWeight="800">
              Post Property
            </Text>
            <Text color="#9CA3AF" fontSize={12} fontWeight="600">
              {step === 'basic' ? 'Step 1 of 5' : step === 'location' ? 'Step 2 of 5' : step === 'pricing' ? 'Step 3 of 5' : step === 'uploads' ? 'Step 4 of 5' : 'Step 5 of 5'}
            </Text>
          </YStack>
        </XStack>
      </YStack>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <YStack gap="$3">
          {step === 'basic' ? (
            <YStack backgroundColor="#FFFFFF" borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$2">
              <Text color={titleColor} fontWeight="900">
                Basic
              </Text>

              <XStack gap="$2" flexWrap="wrap">
                {([
                  { label: 'Rent', value: 'rent' },
                  { label: 'Buy', value: 'buy' },
                  { label: 'Commercial', value: 'commercial' },
                ] as const).map((t) => (
                  <Button
                    key={t.value}
                    size="$2"
                    backgroundColor={listingType === t.value ? '#F59E0B' : '#E5E7EB'}
                    color="#111827"
                    borderRadius={999}
                    onPress={() => setListingType(t.value)}>
                    {t.label}
                  </Button>
                ))}
              </XStack>

              <Input value={propertyType} onChangeText={setPropertyType} placeholder="Property type (apartment/villa/...)" backgroundColor="#FFFFFF" borderColor={border} color={titleColor} />
              <Input value={title} onChangeText={setTitle} placeholder="Title *" backgroundColor="#FFFFFF" borderColor={border} color={titleColor} />

              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Description"
                placeholderTextColor="#9CA3AF"
                multiline
                style={{
                  borderWidth: 1,
                  borderColor: border,
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  minHeight: 90,
                  backgroundColor: '#FFFFFF',
                  color: titleColor,
                  textAlignVertical: 'top',
                }}
              />

              <Input value={contactName} onChangeText={setContactName} placeholder="Contact name" backgroundColor="#FFFFFF" borderColor={border} color={titleColor} />
              <Input
                value={contactPhone}
                onChangeText={setContactPhone}
                placeholder="Contact phone"
                keyboardType={Platform.OS === 'web' ? 'default' : 'phone-pad'}
                backgroundColor="#FFFFFF"
                borderColor={border}
                color={titleColor}
              />
            </YStack>
          ) : null}

          {step === 'location' ? (
            <YStack backgroundColor="#FFFFFF" borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$2">
              <Text color={titleColor} fontWeight="900">
                Location
              </Text>
              <Input value={stateValue} onChangeText={setStateValue} placeholder="State" backgroundColor="#FFFFFF" borderColor={border} color={titleColor} />
              <Input value={cityValue} onChangeText={setCityValue} placeholder="City" backgroundColor="#FFFFFF" borderColor={border} color={titleColor} />
              <Input value={localityValue} onChangeText={setLocalityValue} placeholder="Locality" backgroundColor="#FFFFFF" borderColor={border} color={titleColor} />
              <Input value={address1} onChangeText={setAddress1} placeholder="Address line 1" backgroundColor="#FFFFFF" borderColor={border} color={titleColor} />
              <Input value={address2} onChangeText={setAddress2} placeholder="Address line 2" backgroundColor="#FFFFFF" borderColor={border} color={titleColor} />
              <Input value={pincode} onChangeText={setPincode} placeholder="Pincode" keyboardType="number-pad" backgroundColor="#FFFFFF" borderColor={border} color={titleColor} />

              <XStack gap="$2" flexWrap="wrap">
                <Text color={muted} fontSize={11}>
                  Suggestions:
                </Text>
                {stateOptions.slice(0, 2).map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => {
                      setStateValue(s);
                      setCityValue((fallbackCityByState[s] ?? [])[0] ?? '');
                    }}>
                    <Text color="#2563EB" fontSize={11} fontWeight="900">
                      {s}
                    </Text>
                  </Pressable>
                ))}
                {(cityOptions ?? []).slice(0, 3).map((c) => (
                  <Pressable key={c} onPress={() => setCityValue(c)}>
                    <Text color="#2563EB" fontSize={11} fontWeight="900">
                      {c}
                    </Text>
                  </Pressable>
                ))}
              </XStack>
            </YStack>
          ) : null}

          {step === 'pricing' ? (
            <YStack backgroundColor="#FFFFFF" borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$2">
              <Text color={titleColor} fontWeight="900">
                Pricing & Specs
              </Text>

              <XStack gap="$2" flexWrap="wrap">
                <Input value={price} onChangeText={setPrice} placeholder="Price" keyboardType="numeric" backgroundColor="#FFFFFF" borderColor={border} color={titleColor} flexGrow={1} minWidth={160} />
                <Input value={deposit} onChangeText={setDeposit} placeholder="Deposit" keyboardType="numeric" backgroundColor="#FFFFFF" borderColor={border} color={titleColor} flexGrow={1} minWidth={160} />
              </XStack>
              <Input value={maintenance} onChangeText={setMaintenance} placeholder="Maintenance" keyboardType="numeric" backgroundColor="#FFFFFF" borderColor={border} color={titleColor} />

              <XStack gap="$2" flexWrap="wrap">
                <Input value={bedrooms} onChangeText={setBedrooms} placeholder="Bedrooms" keyboardType="numeric" backgroundColor="#FFFFFF" borderColor={border} color={titleColor} flexGrow={1} minWidth={160} />
                <Input value={bathrooms} onChangeText={setBathrooms} placeholder="Bathrooms" keyboardType="numeric" backgroundColor="#FFFFFF" borderColor={border} color={titleColor} flexGrow={1} minWidth={160} />
              </XStack>
              <Input value={areaSqft} onChangeText={setAreaSqft} placeholder="Area sqft" keyboardType="numeric" backgroundColor="#FFFFFF" borderColor={border} color={titleColor} />

              <Input value={furnishing} onChangeText={setFurnishing} placeholder="Furnishing (furnished/semi_furnished/unfurnished)" backgroundColor="#FFFFFF" borderColor={border} color={titleColor} />
              <Input value={parking} onChangeText={setParking} placeholder="Parking (none/car/bike)" backgroundColor="#FFFFFF" borderColor={border} color={titleColor} />
            </YStack>
          ) : null}

          {step === 'uploads' ? (
            <YStack backgroundColor="#FFFFFF" borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$2">
              <Text color={titleColor} fontWeight="900">
                Uploads
              </Text>
              <Paragraph color={muted}>
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
                  {photos.map((u) => (
                    <XStack key={u} alignItems="center" justifyContent="space-between" gap="$2">
                      <Text flex={1} numberOfLines={1} color={muted}>
                        Photo
                      </Text>
                      <Button size="$2" backgroundColor="#EF4444" color="#FFFFFF" onPress={() => setPhotos((p) => p.filter((x) => x !== u))}>
                        Remove
                      </Button>
                    </XStack>
                  ))}
                  {videos.map((u) => (
                    <XStack key={u} alignItems="center" justifyContent="space-between" gap="$2">
                      <Text flex={1} numberOfLines={1} color={muted}>
                        Video
                      </Text>
                      <Button size="$2" backgroundColor="#EF4444" color="#FFFFFF" onPress={() => setVideos((p) => p.filter((x) => x !== u))}>
                        Remove
                      </Button>
                    </XStack>
                  ))}
                </YStack>
              ) : null}
            </YStack>
          ) : null}

          {step === 'review' ? (
            <YStack backgroundColor="#FFFFFF" borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$2">
              <Text color={titleColor} fontWeight="900">
                Review
              </Text>
              <Text color={muted}>Title: {title || '—'}</Text>
              <Text color={muted}>Location: {localityValue ? `${localityValue}, ` : ''}{cityValue}, {stateValue}</Text>
              <Text color={muted}>Uploads: {photos.length} photos, {videos.length} videos</Text>
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
          <Button disabled={saving} backgroundColor="#E5E7EB" color="#111827" onPress={back}>
            Back
          </Button>

          {step !== 'review' ? (
            <Button disabled={saving} backgroundColor="#10B981" color="#0B0B12" onPress={next}>
              Next
            </Button>
          ) : (
            <Button disabled={saving} backgroundColor="#10B981" color="#0B0B12" onPress={() => void submit()}>
              {saving ? 'Posting…' : 'Post Property'}
            </Button>
          )}
        </XStack>
      </YStack>
    </View>
  );
}
