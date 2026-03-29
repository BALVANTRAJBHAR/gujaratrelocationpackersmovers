import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Button, Input, Text, XStack, YStack } from 'tamagui';

import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';

type PropertyRow = {
  id: string;
  listing_type: string;
  property_type: string | null;
  title: string | null;
  price: number | null;
  deposit: number | null;
  maintenance: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  area_sqft: number | null;
  furnishing: string | null;
  parking: string | null;
  state: string | null;
  city: string | null;
  locality: string | null;
  status: string;
  created_at: string;
};

type PropertyUploadRow = {
  id: string;
  property_id: string;
  file_url: string;
  file_type: string;
  file_name: string | null;
  created_at: string;
};

type StateRow = { id: string; name: string };
type CityRow = { id: string; state_id: string; name: string };

export default function PropertiesIndexScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<PropertyRow[]>([]);

  const [listingType, setListingType] = useState<'rent' | 'buy' | 'commercial'>('rent');
  const [stateValue, setStateValue] = useState('Gujarat');
  const [cityValue, setCityValue] = useState('Ahmedabad');
  const [localityValue, setLocalityValue] = useState('');

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

  useEffect(() => {
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

  useEffect(() => {
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

  const uploadsRef = useRef<Record<string, PropertyUploadRow[]>>({});

  const fetchUploads = async (propertyId: string) => {
    if (!propertyId) return [];
    if (uploadsRef.current[propertyId]) return uploadsRef.current[propertyId];

    const { data, error: fetchError } = await supabase
      .from('property_uploads')
      .select('id,property_id,file_url,file_type,file_name,created_at')
      .eq('property_id', propertyId)
      .order('created_at', { ascending: true })
      .limit(6);

    if (fetchError) return [];
    const list = ((data as any) ?? []) as PropertyUploadRow[];
    uploadsRef.current[propertyId] = list;
    return list;
  };

  const search = async () => {
    setError(null);
    setLoading(true);

    try {
      let query = supabase
        .from('properties')
        .select('id,listing_type,property_type,title,price,deposit,maintenance,bedrooms,bathrooms,area_sqft,furnishing,parking,state,city,locality,status,created_at')
        .eq('status', 'published')
        .eq('listing_type', listingType)
        .order('created_at', { ascending: false })
        .limit(40);

      if (stateValue) query = query.eq('state', stateValue);
      if (cityValue) query = query.eq('city', cityValue);
      if (localityValue.trim()) query = query.ilike('locality', `%${localityValue.trim()}%`);

      const { data, error: fetchError } = await query;
      if (fetchError) throw new Error(fetchError.message);

      setResults(((data as any) ?? []) as PropertyRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to search properties.');
    } finally {
      setLoading(false);
    }
  };

  const pageBg = '#FFFFFF';
  const border = '#E5E7EB';
  const titleColor = '#0F172A';
  const muted = '#64748B';
  const panelBg = '#F8FAFC';

  return (
    <View style={{ flex: 1, backgroundColor: pageBg }}>
      <YStack backgroundColor="#111827" padding={16} paddingTop={18}>
        <XStack alignItems="center" justifyContent="center" position="relative">
          <Button size="$3" chromeless color="#FFFFFF" position="absolute" left={0} onPress={() => router.back()}>
            ‹
          </Button>
          <YStack alignItems="center">
            <Text color="#FFFFFF" fontSize={16} fontWeight="800">
              Properties
            </Text>
            <Text color="#9CA3AF" fontSize={12} fontWeight="600">
              Search listings
            </Text>
          </YStack>
        </XStack>
      </YStack>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <YStack gap="$3">
          <YStack backgroundColor={panelBg} borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$2">
            <Text color={titleColor} fontWeight="900">
              Find your home
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

            <XStack gap="$2" flexWrap="wrap">
              <Input
                value={stateValue}
                onChangeText={setStateValue}
                placeholder="State"
                backgroundColor="#FFFFFF"
                borderColor={border}
                color={titleColor}
                flexGrow={1}
                minWidth={150}
              />
              <Input
                value={cityValue}
                onChangeText={setCityValue}
                placeholder="City"
                backgroundColor="#FFFFFF"
                borderColor={border}
                color={titleColor}
                flexGrow={1}
                minWidth={150}
              />
            </XStack>

            <Input
              value={localityValue}
              onChangeText={setLocalityValue}
              placeholder="Locality (optional)"
              backgroundColor="#FFFFFF"
              borderColor={border}
              color={titleColor}
            />

            <XStack gap="$2" flexWrap="wrap" justifyContent="space-between" alignItems="center">
              <Button backgroundColor="#10B981" color="#0B0B12" onPress={() => void search()} disabled={loading}>
                {loading ? 'Searching…' : 'Search'}
              </Button>
              <Button backgroundColor="#1F4E79" color="#FFFFFF" onPress={() => router.push('/properties/post' as any)}>
                Post Property
              </Button>
            </XStack>

            <XStack gap="$2" flexWrap="wrap" justifyContent="flex-end">
              <Button backgroundColor="#111827" color="#FFFFFF" size="$2" onPress={() => router.push('/properties/my-properties' as any)}>
                My Properties
              </Button>
            </XStack>

            <XStack gap="$2" flexWrap="wrap">
              <Text color={muted} fontSize={11}>
                Suggestions:
              </Text>
              {stateOptions.slice(0, 2).map((s) => (
                <Pressable
                  key={s}
                  onPress={() => {
                    setStateValue(s);
                    const nextCity = (fallbackCityByState[s] ?? [])[0] ?? '';
                    setCityValue(nextCity);
                  }}>
                  <Text color="#2563EB" fontSize={11} fontWeight="800">
                    {s}
                  </Text>
                </Pressable>
              ))}
              {(cityOptions ?? []).slice(0, 3).map((c) => (
                <Pressable key={c} onPress={() => setCityValue(c)}>
                  <Text color="#2563EB" fontSize={11} fontWeight="800">
                    {c}
                  </Text>
                </Pressable>
              ))}
            </XStack>
          </YStack>

          {error ? <Text color="#EF4444">{error}</Text> : null}

          {results.map((p) => (
            <Pressable
              key={p.id}
              onPress={async () => {
                await fetchUploads(p.id);
                router.push({ pathname: '/properties/[id]', params: { id: p.id } } as any);
              }}>
              <YStack backgroundColor="#FFFFFF" borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$2">
                <Text color={titleColor} fontWeight="900" fontSize={14} numberOfLines={1}>
                  {p.title ?? 'Property'}
                </Text>
                <Text color={muted} fontSize={12} numberOfLines={1}>
                  {(p.locality ?? '') + (p.locality ? ', ' : '') + (p.city ?? '') + (p.city ? ', ' : '') + (p.state ?? '')}
                </Text>
                <XStack justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$2">
                  <Text color="#10B981" fontWeight="900">
                    {p.price ? `₹${Number(p.price).toLocaleString('en-IN')}` : 'Price on request'}
                  </Text>
                  <Text color={muted} fontSize={11}>
                    {p.bedrooms ? `${p.bedrooms}BHK` : ''} {p.area_sqft ? `• ${p.area_sqft} sqft` : ''}
                  </Text>
                </XStack>
                <Text color={muted} fontSize={11}>
                  {String(p.listing_type ?? '').toUpperCase()} • {String(p.furnishing ?? '—').replaceAll('_', ' ')}
                </Text>
              </YStack>
            </Pressable>
          ))}

          {!loading && !results.length ? <Text color={muted}>No results yet. Try searching.</Text> : null}
        </YStack>
      </ScrollView>
    </View>
  );
}
