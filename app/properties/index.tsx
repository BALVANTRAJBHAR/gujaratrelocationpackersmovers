import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Button, Input, Text, XStack, YStack } from 'tamagui';

import { searchPlaces } from '@/lib/mapbox';
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
  const [localitySuggestions, setLocalitySuggestions] = useState<Array<{ id: string; label: string; full: string }>>([]);
  const [localityLoading, setLocalityLoading] = useState(false);
  const [localityRawDebug, setLocalityRawDebug] = useState<string>('');
  const [selectedLocalities, setSelectedLocalities] = useState<string[]>([]);

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
  const cityCentersRef = useRef<Record<string, [number, number]>>({});
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

  useEffect(() => {
    // Reset locality selections when state or city changes
    setSelectedLocalities([]);
    setLocalitySuggestions([]);
    setLocalityRawDebug('');
  }, [stateValue, cityValue]);

  useEffect(() => {
    let active = true;
    const q = localityValue.trim();
    if (!q || q.length < 2) {
      setLocalitySuggestions([]);
      setLocalityLoading(false);
      setLocalityRawDebug('');
      return;
    }

    const qLower = q.toLowerCase();

    const handle = setTimeout(() => {
      void (async () => {
        try {
          setLocalityLoading(true);
          const cityLower = String(cityValue ?? '').trim().toLowerCase();
          const stateLower = String(stateValue ?? '').trim().toLowerCase();

          let proximity: [number, number] | undefined;
          let bbox: [number, number, number, number] | undefined;
          if (cityLower && stateLower) {
            const key = `${cityLower}|${stateLower}`;
            const cached = cityCentersRef.current[key];
            if (cached) {
              proximity = cached;
            } else {
              try {
                const cityLookup = await searchPlaces(`${cityValue}, ${stateValue}`.trim(), {
                  limit: 1,
                  types: ['place'],
                });
                const center = (cityLookup?.[0]?.center ?? null) as any;
                const lookedBbox = (cityLookup?.[0] as any)?.bbox ?? null;
                if (Array.isArray(center) && center.length === 2) {
                  proximity = [Number(center[0]), Number(center[1])];
                  cityCentersRef.current[key] = proximity;
                }
                if (Array.isArray(lookedBbox) && lookedBbox.length === 4) {
                  bbox = [Number(lookedBbox[0]), Number(lookedBbox[1]), Number(lookedBbox[2]), Number(lookedBbox[3])];
                }
              } catch {
              }
            }
          }

          const results = await searchPlaces(`${q}, ${cityValue || ''} ${stateValue || ''}`.trim(), {
            limit: 20,
            types: ['poi', 'neighborhood', 'locality', 'place', 'district', 'address'],
            proximity,
            bbox,
          });
          if (!active) return;

          try {
            const slim = (results ?? []).slice(0, 8).map((r: any) => ({
              id: r?.id,
              text: r?.text,
              place_type: r?.place_type,
              place_name: r?.place_name,
              center: r?.center,
              context: Array.isArray(r?.context) ? r.context.map((c: any) => c?.text).filter(Boolean) : [],
            }));
            setLocalityRawDebug(JSON.stringify(slim, null, 2));
          } catch {
            setLocalityRawDebug('');
          }

          const allowedTypes = new Set(['poi', 'neighborhood', 'locality', 'place', 'district', 'address']);
          const picked = results
            .filter((x) => {
              const placeTypes = ((x as any)?.place_type ?? []) as string[];
              const hasAllowedType = placeTypes.some((t) => allowedTypes.has(String(t)));
              if (!hasAllowedType) return false;
              const name = String((x as any)?.place_name ?? '').toLowerCase();
              if (stateLower && !name.includes(stateLower)) return false;
              if (cityLower) {
                const ctx = ((x as any)?.context ?? []) as Array<{ text?: string }>;
                const ctxText = ctx.map((c) => String(c?.text ?? '').toLowerCase()).filter(Boolean);
                const ctxHasCity = ctxText.some((t) => t.includes(cityLower));
                if (!name.includes(cityLower) && !ctxHasCity) return false;
              }
              return true;
            })
            .map((x) => {
              const place = String((x as any)?.place_name ?? '').trim();
              const textLabel = String((x as any)?.text ?? '').trim();
              const placeNameLower = place.toLowerCase();
              const textLower = textLabel.toLowerCase();
              const ctx = ((x as any)?.context ?? []) as Array<{ text?: string }>;
              const ctxParts = ctx.map((c) => String(c?.text ?? '').trim()).filter(Boolean);
              const placeParts = place
                .split(/,|•/g)
                .map((p) => p.trim())
                .filter(Boolean);
              const candidates = Array.from(new Set([...ctxParts, ...placeParts, textLabel].filter(Boolean)));

              const isBadPrefix = (s: string) => {
                const v = s.trim().toLowerCase();
                return (
                  v.startsWith('near ') ||
                  v.startsWith('opp') ||
                  v.startsWith('opposite') ||
                  v.startsWith('beside') ||
                  v.startsWith('behind') ||
                  v.startsWith('in front of')
                );
              };

              const qMatches = (s: string) => s.toLowerCase().includes(qLower);
              const bestCandidate = candidates
                .filter((c) => qMatches(c))
                .sort((a, b) => {
                  const aLower = a.toLowerCase();
                  const bLower = b.toLowerCase();
                  const aStarts = aLower.startsWith(qLower) ? 1 : 0;
                  const bStarts = bLower.startsWith(qLower) ? 1 : 0;
                  if (aStarts !== bStarts) return bStarts - aStarts;
                  const aBad = isBadPrefix(aLower) ? 1 : 0;
                  const bBad = isBadPrefix(bLower) ? 1 : 0;
                  if (aBad !== bBad) return aBad - bBad;
                  return a.length - b.length;
                })[0];

              let label = bestCandidate || textLabel || place.split(',')[0]?.trim() || place;

              let full = place;
              const labelLowerForFull = label.toLowerCase();
              const matchIndex = placeParts.findIndex((p) => p.toLowerCase() === labelLowerForFull);
              if (matchIndex >= 0) {
                full = placeParts.slice(matchIndex).join(', ');
              } else {
                const containsIndex = placeParts.findIndex((p) => p.toLowerCase().includes(labelLowerForFull));
                if (containsIndex >= 0) full = placeParts.slice(containsIndex).join(', ');
              }

              const placeTypes = ((x as any)?.place_type ?? []) as string[];
              const ctxText = ctx.map((c) => String(c?.text ?? '').toLowerCase()).filter(Boolean);
              const fullLower = full.toLowerCase();
              const labelLower = label.toLowerCase();
              let score = 0;
              const matchesQuery =
                labelLower.includes(qLower) ||
                fullLower.includes(qLower) ||
                textLower.includes(qLower) ||
                ctxText.some((t) => t.includes(qLower));
              if (!matchesQuery) score -= 1000;
              if (labelLower.startsWith(qLower)) score += 40;
              else if (fullLower.startsWith(qLower)) score += 20;
              if (isBadPrefix(labelLower) && ctxText.some((t) => t.includes(qLower))) score -= 15;
              const isAddress = placeTypes.includes('address');
              if (isAddress && isBadPrefix(textLower) && labelLower === textLower) score -= 1000;
              if (cityLower) {
                const ctxHasCity = ctxText.some((t) => t.includes(cityLower));
                if (fullLower.includes(cityLower) || labelLower.includes(cityLower) || ctxHasCity) score += 20;
                else score -= 200;
              }
              if (placeTypes.includes('poi')) score += 12;
              if (placeTypes.includes('neighborhood')) score += 10;
              if (placeTypes.includes('locality')) score += 9;
              if (placeTypes.includes('address')) score += 2;
              if (placeTypes.includes('place')) score -= 6;
              if (labelLower.includes('police')) score += 25;
              if (labelLower.includes('railway')) score += 22;
              if (labelLower.includes('station')) score += 14;
              if (labelLower.includes('metro')) score += 12;
              return { id: String((x as any)?.id ?? place), label, full, score };
            })
            .filter((x) => x.score > -500)
            .filter((x) => {
              const labelLower = x.label.trim().toLowerCase();
              if (cityLower && labelLower === cityLower) return false;
              if (stateLower && labelLower === stateLower) return false;
              return true;
            })
            .sort((a, b) => b.score - a.score)
            .slice(0, 6)
            .map(({ id, label, full }) => ({ id, label, full }));

          setLocalitySuggestions(picked);
        } catch {
          if (!active) return;
          setLocalitySuggestions([]);
          setLocalityRawDebug('');
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
  }, [localityValue, stateValue, cityValue]);

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
      if (selectedLocalities.length > 0) {
        query = query.in('locality', selectedLocalities);
      } else if (localityValue.trim()) {
        query = query.ilike('locality', `%${localityValue.trim()}%`);
      }

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

            <YStack gap="$2">
              <XStack gap="$2" alignItems="center">
                <Input
                  value={localityValue}
                  onChangeText={setLocalityValue}
                  placeholder="Search locality (max 3)"
                  backgroundColor="#FFFFFF"
                  borderColor={border}
                  color={titleColor}
                  flexGrow={1}
                />
                {localityLoading && (
                  <Text color={muted} fontSize={12} animation="pulse">
                    Searching...
                  </Text>
                )}
              </XStack>

              {/* Dropdown suggestions while typing */}
              {localitySuggestions.length > 0 && localityValue.trim().length >= 2 && (
                <YStack borderWidth={1} borderColor={border} borderRadius={12} backgroundColor="#FFFFFF" maxHeight={200} overflow="hidden">
                  {localitySuggestions.map((s) => (
                    <Pressable
                      key={s.id}
                      onPress={() => {
                        if (selectedLocalities.length < 3 && !selectedLocalities.includes(s.label)) {
                          setSelectedLocalities((prev) => [...prev, s.label]);
                          setLocalityValue('');
                          setLocalitySuggestions([]);
                        }
                      }}
                      style={{ paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: border }}>
                      <Text color={titleColor} fontWeight="700" numberOfLines={1}>
                        {s.label}
                      </Text>
                      <Text color={muted} fontSize={11} numberOfLines={1}>
                        {s.full}
                      </Text>
                    </Pressable>
                  ))}
                </YStack>
              )}

 

              {/* Selected localities as pills */}
              {selectedLocalities.length > 0 && (
                <XStack gap="$2" flexWrap="wrap">
                  {selectedLocalities.map((loc) => (
                    <Pressable
                      key={loc}
                      onPress={() => {
                        setSelectedLocalities((prev) => prev.filter((l) => l !== loc));
                      }}>
                      <YStack backgroundColor="#10B981" borderRadius={999} paddingHorizontal={10} paddingVertical={4}>
                        <Text color="#FFFFFF" fontSize={11} fontWeight="700">
                          {loc} ×
                        </Text>
                      </YStack>
                    </Pressable>
                  ))}
                  {selectedLocalities.length >= 3 && (
                    <Text color={muted} fontSize={11} fontStyle="italic">
                      Max 3 selected
                    </Text>
                  )}
                </XStack>
              )}
            </YStack>

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
