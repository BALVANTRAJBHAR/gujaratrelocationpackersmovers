import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { Button, Input, Text, XStack, YStack } from 'tamagui';
import Head from 'expo-router/head';

import { PropertyMediaGrid, uploadsToMediaItems, type PropertyMediaItem } from '@/components/property-media-grid';
import { formatPropertyListingTitle } from '@/lib/properties/property-listing-label';
import {
  collectLocalityTokens,
  escapePostgrestValue,
  normalizeAdTypeForSearch,
  parseBhkBedrooms,
  parseOptionalFilterNumber,
  resolveAdTypeQuery,
  routeParam,
} from '@/lib/properties/search-params';
import { searchPlaces } from '@/lib/mapbox';
import { getRazorpayKeyId } from '@/lib/public-config';
import { createRazorpayOrder, verifyRazorpaySubscription } from '@/lib/razorpay';
import { supabase } from '@/lib/supabase';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { themes } from '@/constants/theme';
import { useSession } from '@/providers/session-provider';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { t } from '@/constants/typography';
import { PROPERTIES_SEO, SITE_URL } from '@/constants/seo';

type PropertyRow = {
  id: string;
  listing_type: string;
  property_category?: string | null;
  ad_type?: string | null;
  property_type: string | null;
  title: string | null;
  price: number | null;
  deposit: number | null;
  maintenance: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  area_sqft: number | null;
  carpet_area_sqft?: number | null;
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

type SearchSnapshot = {
  listingType: 'rent' | 'buy' | 'commercial';
  stateValue: string;
  cityValue: string;
  localityValue: string;
  selectedLocalities: string[];
  propertyCategory: string;
  adType: string;
  bhkCsv: string;
  propertyStatus: string;
  newBuilderProject: string;
  pgTenantType: string;
  pgRoomType: string;
  flatmatesTenantType: string;
  flatmatesRoomType: string;
  propertyTypeCsv: string;
  commercialAvailability: string;
  minPrice: string;
  maxPrice: string;
  minCarpet: string;
  maxCarpet: string;
  amenityGym: boolean;
  amenitySwimmingPool: boolean;
  amenityPowerBackup: boolean;
  amenityVisitorParking: boolean;
  activeFilterTab: 'filters' | 'premium';
  minBuiltUp: string;
  maxBuiltUp: string;
  propertyAgeMaxYears: number | null;
  minBathrooms: number | null;
  floorBucket: string;
  withPhotoOnly: boolean;
  removeSeen: boolean;
};

const parseLocalityQuery = (value: string) =>
  Array.from(
    new Set(
      String(value ?? '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
    )
  ).slice(0, 3);

export default function PropertiesIndexScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = colorScheme === 'dark' ? themes.dark : themes.light;
  const router = useRouter();
  const { session } = useSession();
  const params = useLocalSearchParams<{
    listing_type?: string;
    property_category?: string;
    ad_type?: string;
    bhk?: string;
    property_status?: string;
    new_builder_project?: string;
    pg_tenant_type?: string;
    pg_room_type?: string;
    flatmates_tenant_type?: string;
    flatmates_room_type?: string;
    property_type?: string;
    commercial_availability?: string;
    state?: string;
    city?: string;
    q?: string;
  }>();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<PropertyRow[]>([]);
  const [mediaByPropertyId, setMediaByPropertyId] = useState<Record<string, PropertyMediaItem[]>>({});
  const [hasMore, setHasMore] = useState(false);
  const [cursorCreatedAt, setCursorCreatedAt] = useState<string | null>(null);
  const [cursorId, setCursorId] = useState<string | null>(null);

  const [listingType, setListingType] = useState<'rent' | 'buy' | 'commercial'>('rent');
  const [stateValue, setStateValue] = useState('Gujarat');
  const [cityValue, setCityValue] = useState('Ahmedabad');
  const [localityValue, setLocalityValue] = useState('');

  const [propertyCategory, setPropertyCategory] = useState<string>('');
  const [adType, setAdType] = useState<string>('');
  const [bhkCsv, setBhkCsv] = useState<string>('');
  const [propertyStatus, setPropertyStatus] = useState<string>('');
  const [newBuilderProject, setNewBuilderProject] = useState<string>('');
  const [pgTenantType, setPgTenantType] = useState<string>('');
  const [pgRoomType, setPgRoomType] = useState<string>('');
  const [flatmatesTenantType, setFlatmatesTenantType] = useState<string>('');
  const [flatmatesRoomType, setFlatmatesRoomType] = useState<string>('');
  const [propertyTypeCsv, setPropertyTypeCsv] = useState<string>('');
  const [commercialAvailability, setCommercialAvailability] = useState<string>('');

  const [minPrice, setMinPrice] = useState<string>('');
  const [maxPrice, setMaxPrice] = useState<string>('');
  const [minCarpet, setMinCarpet] = useState<string>('');
  const [maxCarpet, setMaxCarpet] = useState<string>('');

  const [amenityGym, setAmenityGym] = useState(false);
  const [amenitySwimmingPool, setAmenitySwimmingPool] = useState(false);
  const [amenityPowerBackup, setAmenityPowerBackup] = useState(false);
  const [amenityVisitorParking, setAmenityVisitorParking] = useState(false);

  const [advancedOpen, setAdvancedOpen] = useState(true);

  const [activeFilterTab, setActiveFilterTab] = useState<'filters' | 'premium'>('filters');
  const [premiumUnlocked, setPremiumUnlocked] = useState(false);
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockingPlanCode, setUnlockingPlanCode] = useState<string | null>(null);

  const [minBuiltUp, setMinBuiltUp] = useState<string>('');
  const [maxBuiltUp, setMaxBuiltUp] = useState<string>('');
  const [propertyAgeMaxYears, setPropertyAgeMaxYears] = useState<number | null>(null);
  const [minBathrooms, setMinBathrooms] = useState<number | null>(null);
  const [floorBucket, setFloorBucket] = useState<string>('');
  const [withPhotoOnly, setWithPhotoOnly] = useState(false);
  const [removeSeen, setRemoveSeen] = useState(false);

  const [localitySuggestions, setLocalitySuggestions] = useState<{ id: string; label: string; full: string }[]>([]);
  const [localityLoading, setLocalityLoading] = useState(false);
  const [localityRawDebug, setLocalityRawDebug] = useState<string>('');
  const [selectedLocalities, setSelectedLocalities] = useState<string[]>([]);

  const [filtersReady, setFiltersReady] = useState(false);
  const searchRequestIdRef = useRef(0);
  const skipNextAutoSearchRef = useRef(false);
  const skipCityLocalityResetRef = useRef(true);
  const pendingSearchSnapshotRef = useRef<SearchSnapshot | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchFnRef = useRef<(reset?: boolean, override?: Partial<SearchSnapshot>) => Promise<void>>(async () => {});

  const paramsSearchKey = useMemo(
    () =>
      JSON.stringify({
        listing_type: routeParam(params.listing_type),
        property_category: routeParam(params.property_category),
        ad_type: routeParam(params.ad_type),
        bhk: routeParam(params.bhk),
        state: routeParam(params.state),
        city: routeParam(params.city),
        q: routeParam(params.q),
        property_status: routeParam(params.property_status),
        new_builder_project: routeParam(params.new_builder_project),
        pg_tenant_type: routeParam(params.pg_tenant_type),
        pg_room_type: routeParam(params.pg_room_type),
        flatmates_tenant_type: routeParam(params.flatmates_tenant_type),
        flatmates_room_type: routeParam(params.flatmates_room_type),
        property_type: routeParam(params.property_type),
        commercial_availability: routeParam(params.commercial_availability),
      }),
    [
      params.ad_type,
      params.bhk,
      params.city,
      params.commercial_availability,
      params.flatmates_room_type,
      params.flatmates_tenant_type,
      params.listing_type,
      params.new_builder_project,
      params.pg_room_type,
      params.pg_tenant_type,
      params.property_category,
      params.property_status,
      params.property_type,
      params.q,
      params.state,
    ]
  );

  const buildSnapshotFromState = (): SearchSnapshot => ({
    listingType,
    stateValue,
    cityValue,
    localityValue,
    selectedLocalities,
    propertyCategory,
    adType,
    bhkCsv,
    propertyStatus,
    newBuilderProject,
    pgTenantType,
    pgRoomType,
    flatmatesTenantType,
    flatmatesRoomType,
    propertyTypeCsv,
    commercialAvailability,
    minPrice,
    maxPrice,
    minCarpet,
    maxCarpet,
    amenityGym,
    amenitySwimmingPool,
    amenityPowerBackup,
    amenityVisitorParking,
    activeFilterTab,
    minBuiltUp,
    maxBuiltUp,
    propertyAgeMaxYears,
    minBathrooms,
    floorBucket,
    withPhotoOnly,
    removeSeen,
  });

  useEffect(() => {
    const ltParam = routeParam(params.listing_type);
    const listingForAd: 'rent' | 'buy' | 'commercial' =
      ltParam === 'rent' || ltParam === 'buy' || ltParam === 'commercial' ? ltParam : 'rent';
    if (ltParam === 'rent' || ltParam === 'buy' || ltParam === 'commercial') setListingType(ltParam);

    const st = routeParam(params.state);
    const ct = routeParam(params.city);
    const q = routeParam(params.q);
    if (st) setStateValue(st);
    if (ct) setCityValue(ct);
    if (q) {
      const localities = parseLocalityQuery(q);
      setLocalityValue(localities.length ? '' : q);
      setSelectedLocalities(localities);
    }

    const incomingCategory = routeParam(params.property_category);
    const incomingAdType = routeParam(params.ad_type);
    const normalizedAd = normalizeAdTypeForSearch(incomingAdType, listingForAd) || incomingAdType;

    setPropertyCategory(incomingCategory);
    setAdType(normalizedAd);
    setBhkCsv(routeParam(params.bhk));
    setPropertyStatus(routeParam(params.property_status));
    setNewBuilderProject(routeParam(params.new_builder_project));
    setPgTenantType(routeParam(params.pg_tenant_type));
    setPgRoomType(routeParam(params.pg_room_type));
    setFlatmatesTenantType(routeParam(params.flatmates_tenant_type));
    setFlatmatesRoomType(routeParam(params.flatmates_room_type));
    setPropertyTypeCsv(routeParam(params.property_type));
    setCommercialAvailability(routeParam(params.commercial_availability));

    pendingSearchSnapshotRef.current = {
      listingType: listingForAd,
      stateValue: st,
      cityValue: ct,
      localityValue: parseLocalityQuery(q).length ? '' : q,
      selectedLocalities: parseLocalityQuery(q),
      propertyCategory: incomingCategory,
      adType: normalizedAd,
      bhkCsv: routeParam(params.bhk),
      propertyStatus: routeParam(params.property_status),
      newBuilderProject: routeParam(params.new_builder_project),
      pgTenantType: routeParam(params.pg_tenant_type),
      pgRoomType: routeParam(params.pg_room_type),
      flatmatesTenantType: routeParam(params.flatmates_tenant_type),
      flatmatesRoomType: routeParam(params.flatmates_room_type),
      propertyTypeCsv: routeParam(params.property_type),
      commercialAvailability: routeParam(params.commercial_availability),
      minPrice: '',
      maxPrice: '',
      minCarpet: '',
      maxCarpet: '',
      amenityGym: false,
      amenitySwimmingPool: false,
      amenityPowerBackup: false,
      amenityVisitorParking: false,
      activeFilterTab: 'filters',
      minBuiltUp: '',
      maxBuiltUp: '',
      propertyAgeMaxYears: null,
      minBathrooms: null,
      floorBucket: '',
      withPhotoOnly: false,
      removeSeen: false,
    };

    setFiltersReady(true);
    skipNextAutoSearchRef.current = true;
    skipCityLocalityResetRef.current = true;
  }, [
    params.ad_type,
    params.bhk,
    params.city,
    params.commercial_availability,
    params.flatmates_room_type,
    params.flatmates_tenant_type,
    params.listing_type,
    params.new_builder_project,
    params.pg_room_type,
    params.pg_tenant_type,
    params.property_category,
    params.property_status,
    params.property_type,
    params.q,
    params.state,
  ]);

  useEffect(() => {
    if (!filtersReady) return;
    if (skipNextAutoSearchRef.current) {
      skipNextAutoSearchRef.current = false;
      return;
    }
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      void searchFnRef.current(true);
    }, 400);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
     
  }, [
    filtersReady,
    listingType,
    stateValue,
    cityValue,
    propertyCategory,
    adType,
    bhkCsv,
    propertyStatus,
    newBuilderProject,
    pgTenantType,
    pgRoomType,
    flatmatesTenantType,
    flatmatesRoomType,
    propertyTypeCsv,
    commercialAvailability,
    minPrice,
    maxPrice,
    minCarpet,
    maxCarpet,
    amenityGym,
    amenitySwimmingPool,
    amenityPowerBackup,
    amenityVisitorParking,
    activeFilterTab,
    minBuiltUp,
    maxBuiltUp,
    propertyAgeMaxYears,
    minBathrooms,
    floorBucket,
    withPhotoOnly,
    removeSeen,
    selectedLocalities,
    localityValue,
  ]);

  useEffect(() => {
    let active = true;
    const userId = session?.user?.id ?? null;
    if (!userId) {
      setPremiumUnlocked(false);
      return;
    }

    void (async () => {
      try {
        const { data, error } = await supabase
          .from('user_subscriptions')
          .select('id,status,valid_until')
          .eq('user_id', userId)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1);
        if (!active) return;
        if (error) {
          setPremiumUnlocked(false);
          return;
        }
        const row = (data ?? [])[0] as any;
        if (!row) {
          setPremiumUnlocked(false);
          return;
        }
        const validUntil = row?.valid_until ? new Date(String(row.valid_until)).getTime() : null;
        const ok = validUntil === null || Number.isFinite(validUntil) ? (validUntil === null ? true : validUntil > Date.now()) : false;
        setPremiumUnlocked(ok);
      } catch {
        if (!active) return;
        setPremiumUnlocked(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [session?.user?.id]);

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
    if (skipCityLocalityResetRef.current) {
      skipCityLocalityResetRef.current = false;
      return;
    }
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

    const normalizeLocalityToken = (s: string) =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/v/g, 'w');

    const qLower = q.toLowerCase();
    const qNorm = normalizeLocalityToken(q);

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
                const ctx = ((x as any)?.context ?? []) as { text?: string }[];
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
              const ctx = ((x as any)?.context ?? []) as { text?: string }[];
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

              const qMatches = (s: string) => normalizeLocalityToken(s).includes(qNorm);
              const bestCandidate = candidates
                .filter((c) => qMatches(c))
                .sort((a, b) => {
                  const aNorm = normalizeLocalityToken(a);
                  const bNorm = normalizeLocalityToken(b);
                  const aStarts = aNorm.startsWith(qNorm) ? 1 : 0;
                  const bStarts = bNorm.startsWith(qNorm) ? 1 : 0;
                  if (aStarts !== bStarts) return bStarts - aStarts;
                  const aBad = isBadPrefix(a) ? 1 : 0;
                  const bBad = isBadPrefix(b) ? 1 : 0;
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
              const fullNorm = normalizeLocalityToken(full);
              const labelNorm = normalizeLocalityToken(label);
              const textNorm = normalizeLocalityToken(textLabel);
              let score = 0;
              const matchesQuery =
                labelNorm.includes(qNorm) ||
                fullNorm.includes(qNorm) ||
                textNorm.includes(qNorm) ||
                ctxText.some((t) => normalizeLocalityToken(t).includes(qNorm));
              if (!matchesQuery) score -= 1000;
              if (labelNorm.startsWith(qNorm)) score += 40;
              else if (fullNorm.startsWith(qNorm)) score += 20;
              if (isBadPrefix(labelLower) && ctxText.some((t) => normalizeLocalityToken(t).includes(qNorm))) score -= 15;
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

    const RazorpayCheckout = require('react-native-razorpay').default as {
      open: (options: unknown) => Promise<unknown>;
    };
    return await RazorpayCheckout.open(options);
  }

  const stableStringify = (obj: any) => {
    if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
    if (Array.isArray(obj)) return `[${obj.map((x) => stableStringify(x)).join(',')}]`;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
  };

  const getBaseSearchToken = () => {
    const base = {
      listingType,
      stateValue,
      cityValue,
      selectedLocalities: [...selectedLocalities].sort(),
      localityValue: String(localityValue ?? '').trim().toLowerCase(),
      propertyCategory,
      adType,
      bhkCsv,
      propertyStatus,
      newBuilderProject,
      pgTenantType,
      pgRoomType,
      flatmatesTenantType,
      flatmatesRoomType,
      propertyTypeCsv,
      commercialAvailability,
      minPrice,
      maxPrice,
      minCarpet,
      maxCarpet,
      amenityGym,
      amenitySwimmingPool,
      amenityPowerBackup,
      amenityVisitorParking,
    };
    return stableStringify(base);
  };

  const loadMediaForProperties = async (propertyIds: string[]) => {
    try {
      const ids = propertyIds.filter(Boolean);
      if (!ids.length) {
        setMediaByPropertyId({});
        return;
      }

      const { data, error: fetchError } = await supabase
        .from('property_uploads')
        .select('id,property_id,file_url,file_type')
        .in('property_id', ids)
        .order('created_at', { ascending: true });

      if (fetchError) {
        setMediaByPropertyId({});
        return;
      }

      const grouped: Record<string, PropertyMediaItem[]> = {};
      for (const u of (data as PropertyUploadRow[]) ?? []) {
        const pid = String(u.property_id ?? '').trim();
        if (!pid) continue;
        if (!grouped[pid]) grouped[pid] = [];
        grouped[pid].push(...uploadsToMediaItems([u]));
      }
      setMediaByPropertyId(grouped);
    } catch { /* ignore */ }
  };

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

  const requireSearchSession = useCallback(() => {
    if (session?.user?.id) return true;
    router.replace({ pathname: '/auth/login', params: { redirectTo: '/properties' } } as any);
    return false;
  }, [session, router]);

  const search = async (reset = true, override?: Partial<SearchSnapshot>) => {
    if (reset && !requireSearchSession()) return;
    const requestId = ++searchRequestIdRef.current;
    const snap: SearchSnapshot = { ...buildSnapshotFromState(), ...override };
    setError(null);
    setLoading(true);
    if (reset) {
      setCursorCreatedAt(null);
      setCursorId(null);
      setHasMore(false);
    }

    try {
      const parseCsv = (v: string) =>
        String(v ?? '')
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean);

      const userId = session?.user?.id ?? null;

      const premiumUsed =
        Boolean(String(snap.minBuiltUp ?? '').trim()) ||
        Boolean(String(snap.maxBuiltUp ?? '').trim()) ||
        snap.propertyAgeMaxYears !== null ||
        snap.minBathrooms !== null ||
        Boolean(String(snap.floorBucket ?? '').trim()) ||
        snap.withPhotoOnly ||
        snap.removeSeen;

      if (snap.activeFilterTab === 'premium' && premiumUnlocked && premiumUsed && userId) {
        const baseSearchToken = getBaseSearchToken();
        const { data: quotaData, error: quotaErr } = await supabase.rpc('consume_premium_search', {
          base_search_token: baseSearchToken,
        } as any);
        if (quotaErr) {
          const msg = String(quotaErr.message ?? '').toLowerCase().includes('quota')
            ? 'Premium search quota exceeded. Please upgrade/renew your plan.'
            : quotaErr.message;
          setError(msg);
          setLoading(false);
          return;
        }
        if (quotaData?.quota_total != null && quotaData?.quota_used != null && quotaData?.quota_used > quotaData?.quota_total) {
          setError('Premium search quota exceeded. Please upgrade/renew your plan.');
          setLoading(false);
          return;
        }
      }

      const pageSize = 40;

      let query = supabase
        .from('properties')
        .select(
          'id,listing_type,property_type,title,price,deposit,maintenance,bedrooms,bathrooms,area_sqft,carpet_area_sqft,furnishing,parking,state,city,locality,status,created_at,property_category,ad_type,property_status,new_builder_project,pg_tenant_type,pg_room_type,flatmates_tenant_type,flatmates_room_type,commercial_availability,gym,amenity_swimming_pool,amenity_power_backup,amenity_visitor_parking'
        )
        .eq('status', 'published')
        .eq('listing_type', snap.listingType)
        .order('created_at', { ascending: false })
        .limit(pageSize);

      if (!reset && cursorCreatedAt && cursorId) {
        query = query.or(`created_at.lt.${cursorCreatedAt},and(created_at.eq.${cursorCreatedAt},id.lt.${cursorId})`);
      }

      if (snap.propertyCategory) query = query.eq('property_category', snap.propertyCategory);

      const adTypeQuery = resolveAdTypeQuery(snap.propertyCategory, snap.listingType, snap.adType);
      if (adTypeQuery.type === 'eq') query = query.eq('ad_type', adTypeQuery.value);
      else if (adTypeQuery.type === 'in') query = query.in('ad_type', adTypeQuery.values as any);

      const bedroomFilters = parseBhkBedrooms(snap.bhkCsv);
      if (bedroomFilters.length) query = query.in('bedrooms', bedroomFilters as any);

      if (snap.propertyStatus) query = query.eq('property_status', snap.propertyStatus);
      if (snap.newBuilderProject === '1' || snap.newBuilderProject === '0') {
        query = query.eq('new_builder_project', snap.newBuilderProject === '1');
      }
      if (snap.pgTenantType) query = query.eq('pg_tenant_type', snap.pgTenantType);
      if (snap.pgRoomType) query = query.eq('pg_room_type', snap.pgRoomType);

      if (snap.flatmatesTenantType) {
        const arr = parseCsv(snap.flatmatesTenantType);
        if (arr.length === 1) query = query.eq('flatmates_tenant_type', arr[0]);
        else if (arr.length > 1) query = query.in('flatmates_tenant_type', arr as any);
      }

      if (snap.flatmatesRoomType) {
        const arr = parseCsv(snap.flatmatesRoomType);
        if (arr.length === 1) query = query.eq('flatmates_room_type', arr[0]);
        else if (arr.length > 1) query = query.in('flatmates_room_type', arr as any);
      }

      if (snap.propertyTypeCsv) {
        const types = snap.propertyTypeCsv
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean);
        if (types.length) query = query.in('property_type', types as any);
      }

      if (snap.commercialAvailability && snap.listingType === 'commercial' && snap.adType === 'sale') {
        query = query.eq('commercial_availability', snap.commercialAvailability);
      }

      {
        const min = parseOptionalFilterNumber(snap.minPrice);
        const max = parseOptionalFilterNumber(snap.maxPrice);
        if (min !== null) query = query.gte('price', min);
        if (max !== null) query = query.lte('price', max);
      }

      {
        const min = parseOptionalFilterNumber(snap.minCarpet);
        const max = parseOptionalFilterNumber(snap.maxCarpet);
        if (min !== null) query = query.gte('carpet_area_sqft', min);
        if (max !== null) query = query.lte('carpet_area_sqft', max);
      }

      if (snap.amenityGym) query = query.eq('gym', 1);
      if (snap.amenitySwimmingPool) query = query.eq('amenity_swimming_pool', 1);
      if (snap.amenityPowerBackup) query = query.eq('amenity_power_backup', 1);
      if (snap.amenityVisitorParking) query = query.eq('amenity_visitor_parking', 1);

      if (snap.activeFilterTab === 'premium' && premiumUnlocked) {
        {
          const min = parseOptionalFilterNumber(snap.minBuiltUp);
          const max = parseOptionalFilterNumber(snap.maxBuiltUp);
          if (min !== null) query = query.gte('area_sqft', min);
          if (max !== null) query = query.lte('area_sqft', max);
        }

        if (snap.propertyAgeMaxYears !== null) {
          query = query.lte('property_age_years', snap.propertyAgeMaxYears);
        }

        if (snap.minBathrooms !== null) {
          query = query.gte('bathrooms', snap.minBathrooms);
        }

        if (snap.floorBucket) {
          if (snap.floorBucket === 'ground') query = query.eq('floor_number', 0);
          else if (snap.floorBucket === '1_3') query = query.gte('floor_number', 1).lte('floor_number', 3);
          else if (snap.floorBucket === '4_6') query = query.gte('floor_number', 4).lte('floor_number', 6);
          else if (snap.floorBucket === '7_9') query = query.gte('floor_number', 7).lte('floor_number', 9);
          else if (snap.floorBucket === '10_plus') query = query.gte('floor_number', 10);
        }

        if (snap.removeSeen && userId) {
          const { data: seenData } = await supabase.from('user_seen_properties').select('property_id').eq('user_id', userId);
          const ids = (seenData ?? []).map((r: any) => String(r?.property_id)).filter(Boolean);
          if (ids.length) {
            query = query.not('id', 'in', `(${ids.map((x) => `"${x}"`).join(',')})`);
          }
        }
      }

      if (snap.stateValue.trim()) query = query.ilike('state', `%${snap.stateValue.trim()}%`);
      if (snap.cityValue.trim()) query = query.ilike('city', `%${snap.cityValue.trim()}%`);

      const localityTokens = collectLocalityTokens(snap.localityValue, snap.selectedLocalities);
      if (localityTokens.length === 1) {
        const loc = localityTokens[0];
        if (loc) query = query.ilike('locality', `%${loc}%`);
      } else if (localityTokens.length > 1) {
        const valid = localityTokens.filter(Boolean);
        if (valid.length) {
          const orExpr = valid.map((loc) => `locality.ilike.%${escapePostgrestValue(loc)}%`).join(',');
          query = query.or(orExpr);
        }
      }

      let finalQuery = query;
      if (snap.activeFilterTab === 'premium' && premiumUnlocked && snap.withPhotoOnly) {
        const { data: photoRows, error: photoErr } = await supabase
          .from('property_uploads')
          .select('property_id')
          .not('property_id', 'is', null)
          .limit(10000);
        if (photoErr) throw new Error(photoErr.message);

        const ids = Array.from(
          new Set((photoRows ?? []).map((r: any) => String(r?.property_id ?? '').trim()).filter(Boolean))
        );
        if (!ids.length) {
          if (reset) setResults([]);
          setHasMore(false);
          setLoading(false);
          return;
        }
        finalQuery = finalQuery.in('id', ids as any);
      }

      const { data, error: fetchError } = await finalQuery;
      if (fetchError) throw new Error(fetchError.message);
      if (requestId !== searchRequestIdRef.current) return;

      const rows = (((data as any) ?? []) as PropertyRow[]) ?? [];
      if (reset) {
        setResults(rows);
        void loadMediaForProperties(rows.map((r) => r.id));
      } else {
        setResults((prev) => [...prev, ...rows]);
        void loadMediaForProperties(rows.map((r) => r.id));
      }

      const last = rows.length ? rows[rows.length - 1] : null;
      if (last?.created_at && last?.id) {
        setCursorCreatedAt(String(last.created_at));
        setCursorId(String(last.id));
      }
      setHasMore(rows.length === pageSize);
    } catch (e) {
      if (requestId !== searchRequestIdRef.current) return;
      console.error('Property search error:', e);
      const msg = e instanceof Error ? e.message : 'Failed to search properties.';
      if (/failed to fetch/i.test(msg)) {
        setError('Network error. Check internet connection and refresh the page.');
      } else {
        setError(msg);
      }
    } finally {
      if (requestId === searchRequestIdRef.current) setLoading(false);
    }
  };

  searchFnRef.current = search;

  useEffect(() => {
    if (!filtersReady) return;
    const pending = pendingSearchSnapshotRef.current;
    if (!pending) return;
    pendingSearchSnapshotRef.current = null;
    void searchFnRef.current(true, pending);
  }, [filtersReady, paramsSearchKey]);

  const pageBg = theme.bg;
  const border = theme.border;
  const titleColor = theme.text;
  const muted = theme.textMuted;
  const panelBg = theme.bgSecondary;

  const resetFilters = () => {
    setError(null);
    setResults([]);
    setSelectedLocalities([]);
    setLocalitySuggestions([]);
    setLocalityValue('');
    setPropertyCategory('');
    setAdType('');
    setBhkCsv('');
    setPropertyStatus('');
    setNewBuilderProject('');
    setPgTenantType('');
    setPgRoomType('');
    setFlatmatesTenantType('');
    setFlatmatesRoomType('');
    setPropertyTypeCsv('');
    setCommercialAvailability('');

    setMinPrice('');
    setMaxPrice('');
    setMinCarpet('');
    setMaxCarpet('');

    setAmenityGym(false);
    setAmenitySwimmingPool(false);
    setAmenityPowerBackup(false);
    setAmenityVisitorParking(false);

    setMinBuiltUp('');
    setMaxBuiltUp('');
    setPropertyAgeMaxYears(null);
    setMinBathrooms(null);
    setFloorBucket('');
    setWithPhotoOnly(false);
    setRemoveSeen(false);
  };

  const planOptions = useMemo(
    () =>
      [
        { code: 'power_plan', title: 'Power Plan', price: 2399 },
        { code: 'expert_plan', title: 'Property Expert Plan', price: 4999 },
        { code: 'moneyback_plan', title: 'Property Expert MoneyBack Plan', price: 5999 },
      ] as const,
    []
  );

  const subscribeToPlan = async (planCode: string) => {
    setError(null);
    const userId = session?.user?.id ?? null;
    if (!userId) {
      setError('Please login first.');
      return;
    }
    const plan = planOptions.find((p) => p.code === planCode);
    if (!plan) {
      setError('Invalid plan.');
      return;
    }

    setUnlocking(true);
    setUnlockingPlanCode(planCode);
    try {
      const order = await createRazorpayOrder({
        amount: Math.round(plan.price * 100),
        currency: 'INR',
        receipt: `sub_${Date.now()}`,
        notes: { purpose: 'subscription', user_id: userId, plan_code: planCode },
      });

      const razorpayKeyId = await getRazorpayKeyId();
      if (!razorpayKeyId) {
        setError('Missing Razorpay public key. Configure RAZORPAY_KEY_ID in Supabase secrets.');
        return;
      }

      const options: any = {
        key: razorpayKeyId,
        amount: order.amount,
        currency: order.currency,
        name: 'Gujarat Relocation PackersMovers',
        description: plan.title,
        order_id: order.id,
        theme: { color: theme.info },
      };

      const paymentData: any = await openRazorpayCheckout(options);

      const valid = await verifyRazorpaySubscription({
        order_id: order.id,
        payment_id: paymentData.razorpay_payment_id,
        signature: paymentData.razorpay_signature,
        plan_code: planCode,
        amount: plan.price,
      });

      if (!valid) {
        setError('Payment verification failed.');
        return;
      }

      setUnlockModalOpen(false);
      setPremiumUnlocked(true);
      setActiveFilterTab('premium');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Payment cancelled/failed.';
      setError(String(msg).toLowerCase().includes('cancel') ? 'Payment cancelled.' : msg);
    } finally {
      setUnlocking(false);
      setUnlockingPlanCode(null);
    }
  };
  return (
    <>
      <Head>
        <title>{PROPERTIES_SEO.title}</title>
        <meta name="description" content={PROPERTIES_SEO.description} />
        <link rel="canonical" href={`${SITE_URL}/properties`} />
        <meta property="og:title" content={PROPERTIES_SEO.title} />
        <meta property="og:description" content={PROPERTIES_SEO.description} />
        <meta property="og:url" content={`${SITE_URL}/properties`} />
        <meta name="twitter:title" content={PROPERTIES_SEO.title} />
        <meta name="twitter:description" content={PROPERTIES_SEO.description} />
      </Head>
      <View style={{ flex: 1, backgroundColor: pageBg }}>
      <YStack backgroundColor={theme.bgSecondary} padding={16} paddingTop={18}>
        <XStack alignItems="center" justifyContent="center" position="relative">
          <Button
            size="$3"
            chromeless
            color={theme.text}
            position="absolute"
            left={0}
            fontSize={36}
            fontWeight="900"
            onPress={() => router.back()}>
            ‹
          </Button>
          <YStack alignItems="center">
            <Text color={theme.text} fontSize={t(16)} fontWeight="800">
              Properties
            </Text>
            <Text color={theme.textMuted} fontSize={t(12)} fontWeight="600">
              Search listings
            </Text>
          </YStack>
        </XStack>
      </YStack>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <XStack gap="$3" alignItems="flex-start" flexWrap="wrap">
          <YStack style={{ width: advancedOpen ? 320 : 120, maxWidth: '100%' } as any}>
            <Pressable onPress={() => setAdvancedOpen((v) => !v)}>
              <XStack alignItems="center" justifyContent="space-between" paddingVertical={6} paddingHorizontal={4}>
                <Text color={titleColor} fontWeight="900">
                  Advanced Filters
                </Text>
                <Text color={muted} fontWeight="900">
                  {advancedOpen ? '˄' : '˅'}
                </Text>
              </XStack>
            </Pressable>

            {advancedOpen ? (
              <YStack backgroundColor={panelBg} borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$3">
                <XStack gap="$2" alignItems="center" justifyContent="space-between">
                  <Pressable onPress={() => setActiveFilterTab('filters')} style={{ flex: 1 } as any}>
                    <YStack
                      paddingVertical={10}
                      borderRadius={12}
                  backgroundColor={activeFilterTab === 'filters' ? theme.info : theme.bgCard}
                  borderWidth={1}
                  borderColor={border}
                  alignItems="center">
                  <Text color={activeFilterTab === 'filters' ? '#FFFFFF' : titleColor} fontWeight="900">
                        Filters
                      </Text>
                    </YStack>
                  </Pressable>
                  <Pressable onPress={() => setActiveFilterTab('premium')} style={{ flex: 1 } as any}>
                    <YStack
                      paddingVertical={10}
                      borderRadius={12}
                      backgroundColor={activeFilterTab === 'premium' ? theme.bgCardSecondary : theme.bgCard}
                      borderWidth={1}
                      borderColor={border}
                      alignItems="center">
                      <Text color={activeFilterTab === 'premium' ? '#FFFFFF' : titleColor} fontWeight="900">
                        Premium Filters
                      </Text>
                    </YStack>
                  </Pressable>
                </XStack>

                <XStack alignItems="center" justifyContent="space-between">
                  <Text color={titleColor} fontWeight="900">
                    Filter your search
                  </Text>
                  <Pressable onPress={resetFilters}>
                    <Text color={theme.info} fontSize={t(12)} fontWeight="900">
                      Reset
                    </Text>
                  </Pressable>
                </XStack>

                {activeFilterTab === 'premium' && !premiumUnlocked ? (
                  <YStack gap="$3" backgroundColor={theme.bgCard} borderRadius={16} padding={12} borderWidth={1} borderColor={border}>
                    <Text color={titleColor} fontWeight="900">
                      Don’t scroll! Be Smart & Save Time!
                    </Text>
                    <Text color={muted} fontSize={t(12)}>
                      Fasten your search using Exclusive Filters!
                    </Text>
                    <Button backgroundColor={theme.info} color="#FFFFFF" fontWeight="900" onPress={() => setUnlockModalOpen(true)}>
                      Unlock Filters
                    </Button>
                  </YStack>
                ) : null}

                {activeFilterTab === 'filters' ? (
                <YStack gap="$2">
                  <Text color={muted} fontSize={t(12)} fontWeight="800">
                    Listing Type
                  </Text>
                  <XStack gap="$2" flexWrap="wrap">
                    {([
                      { label: 'Rent', value: 'rent' },
                      { label: 'Buy', value: 'buy' },
                      { label: 'Commercial', value: 'commercial' },
                    ] as const).map((item) => (
                      <Button
                        key={item.value}
                        size="$2"
                        backgroundColor={listingType === item.value ? theme.info : theme.border}
                        color={theme.text}
                        borderRadius={999}
                        onPress={() => setListingType(item.value)}>
                        {item.label}
                      </Button>
                    ))}
                  </XStack>
                </YStack>
                ) : null}

                {activeFilterTab === 'filters' ? (
                <YStack gap="$2">
                  <Text color={muted} fontSize={t(12)} fontWeight="800">
                    Location
                  </Text>
                  <Input
                    value={stateValue}
                    onChangeText={setStateValue}
                    placeholder="State"
                    backgroundColor={theme.inputBg}
                    borderColor={theme.inputBorder}
                    color={theme.inputText}
                  />
                  <Input
                    value={cityValue}
                    onChangeText={setCityValue}
                    placeholder="City"
                    backgroundColor={theme.inputBg}
                    borderColor={theme.inputBorder}
                    color={theme.inputText}
                  />
                  <XStack gap="$2" alignItems="center" flexWrap="wrap">
                    <Input
                      value={localityValue}
                      onChangeText={setLocalityValue}
                      placeholder="Search locality (max 3)"
                      backgroundColor={theme.inputBg}
                      borderColor={theme.inputBorder}
                      color={theme.inputText}
                      flexGrow={1}
                      minWidth={160}
                    />
                    {localityLoading ? (
                      <Text color={muted} fontSize={t(12)} animation="pulse">
                        Searching...
                      </Text>
                    ) : null}
                  </XStack>

                  {localitySuggestions.length > 0 && localityValue.trim().length >= 2 && (
                    <YStack borderWidth={1} borderColor={border} borderRadius={12} backgroundColor={theme.bgCard} maxHeight={200} overflow="hidden">
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
                          <Text color={muted} fontSize={t(11)} numberOfLines={1}>
                            {s.full}
                          </Text>
                        </Pressable>
                      ))}
                    </YStack>
                  )}

                  {selectedLocalities.length > 0 && (
                    <XStack gap="$2" flexWrap="wrap">
                      {selectedLocalities.map((loc) => (
                        <Pressable key={loc} onPress={() => setSelectedLocalities((prev) => prev.filter((l) => l !== loc))}>
                          <YStack backgroundColor={theme.info} borderRadius={999} paddingHorizontal={10} paddingVertical={4}>
                            <Text color="#FFFFFF" fontSize={t(11)} fontWeight="700">
                              {loc} ×
                            </Text>
                          </YStack>
                        </Pressable>
                      ))}
                      {selectedLocalities.length >= 3 && (
                        <Text color={muted} fontSize={t(11)} fontStyle="italic">
                          Max 3 selected
                        </Text>
                      )}
                    </XStack>
                  )}
                </YStack>
                ) : null}

                {activeFilterTab === 'filters' ? (
                <YStack gap="$2">
                  <Text color={muted} fontSize={t(12)} fontWeight="800">
                    Price Range
                  </Text>
                  <XStack gap="$2" flexWrap="wrap">
                    <Input
                      value={minPrice}
                      onChangeText={setMinPrice}
                      placeholder="Min"
                      keyboardType="numeric"
                      backgroundColor={theme.inputBg}
                      borderColor={theme.inputBorder}
                      color={theme.inputText}
                      flexGrow={1}
                      minWidth={120}
                    />
                    <Input
                      value={maxPrice}
                      onChangeText={setMaxPrice}
                      placeholder="Max"
                      keyboardType="numeric"
                      backgroundColor={theme.inputBg}
                      borderColor={theme.inputBorder}
                      color={theme.inputText}
                      flexGrow={1}
                      minWidth={120}
                    />
                  </XStack>
                </YStack>
                ) : null}

                {activeFilterTab === 'filters' ? (
                <YStack gap="$2">
                  <Text color={muted} fontSize={t(12)} fontWeight="800">
                    Carpet Area (sq.ft.)
                  </Text>
                  <XStack gap="$2" flexWrap="wrap">
                    <Input
                      value={minCarpet}
                      onChangeText={setMinCarpet}
                      placeholder="Min"
                      keyboardType="numeric"
                      backgroundColor={theme.inputBg}
                      borderColor={theme.inputBorder}
                      color={theme.inputText}
                      flexGrow={1}
                      minWidth={120}
                    />
                    <Input
                      value={maxCarpet}
                      onChangeText={setMaxCarpet}
                      placeholder="Max"
                      keyboardType="numeric"
                      backgroundColor={theme.inputBg}
                      borderColor={theme.inputBorder}
                      color={theme.inputText}
                      flexGrow={1}
                      minWidth={120}
                    />
                  </XStack>
                </YStack>
                ) : null}

                {activeFilterTab === 'filters' ? (
                <YStack gap="$2">
                  <Text color={muted} fontSize={t(12)} fontWeight="800">
                    Amenities
                  </Text>

                  {(
                    [
                      { label: 'Gym', value: amenityGym, setValue: setAmenityGym },
                      { label: 'Swimming Pool', value: amenitySwimmingPool, setValue: setAmenitySwimmingPool },
                      { label: 'Power Backup', value: amenityPowerBackup, setValue: setAmenityPowerBackup },
                      { label: 'Visitor Parking', value: amenityVisitorParking, setValue: setAmenityVisitorParking },
                    ] as const
                  ).map((a) => (
                    <Pressable key={a.label} onPress={() => a.setValue(!a.value)}>
                      <XStack alignItems="center" justifyContent="space-between" paddingVertical={10} paddingHorizontal={10} borderRadius={12} backgroundColor={theme.bgCard} borderWidth={1} borderColor={border}>
                        <Text color={titleColor} fontWeight="800">
                          {a.label}
                        </Text>
                        <Text color={a.value ? theme.info : muted} fontWeight="900">
                          {a.value ? '✓' : ''}
                        </Text>
                      </XStack>
                    </Pressable>
                  ))}
                </YStack>
                ) : null}

                {activeFilterTab === 'premium' && premiumUnlocked ? (
                  <YStack gap="$3">
                    <YStack gap="$2">
                      <Text color={muted} fontSize={t(12)} fontWeight="800">
                        Built Up Area (sq.ft.)
                      </Text>
                      <XStack gap="$2" flexWrap="wrap">
                        <Input
                          value={minBuiltUp}
                          onChangeText={setMinBuiltUp}
                          placeholder="Min"
                          keyboardType="numeric"
                    backgroundColor={theme.inputBg}
                    borderColor={theme.inputBorder}
                    color={theme.inputText}
                          flexGrow={1}
                          minWidth={120}
                        />
                        <Input
                          value={maxBuiltUp}
                          onChangeText={setMaxBuiltUp}
                          placeholder="Max"
                          keyboardType="numeric"
                    backgroundColor={theme.inputBg}
                    borderColor={theme.inputBorder}
                    color={theme.inputText}
                          flexGrow={1}
                          minWidth={120}
                        />
                      </XStack>
                    </YStack>

                    <YStack gap="$2">
                      <Text color={muted} fontSize={t(12)} fontWeight="800">
                        Property Age
                      </Text>
                      {([
                        { label: '< 1 year', value: 1 },
                        { label: '< 3 years', value: 3 },
                        { label: '< 5 years', value: 5 },
                        { label: '< 10 years', value: 10 },
                      ] as const).map((o) => (
                        <Pressable key={o.label} onPress={() => setPropertyAgeMaxYears(propertyAgeMaxYears === o.value ? null : o.value)}>
                          <XStack alignItems="center" justifyContent="space-between" paddingVertical={10} paddingHorizontal={10} borderRadius={12} backgroundColor={theme.bgCard} borderWidth={1} borderColor={border}>
                            <Text color={titleColor} fontWeight="800">
                              {o.label}
                            </Text>
                            <Text color={propertyAgeMaxYears === o.value ? theme.info : muted} fontWeight="900">
                              {propertyAgeMaxYears === o.value ? '✓' : ''}
                            </Text>
                          </XStack>
                        </Pressable>
                      ))}
                    </YStack>

                    <YStack gap="$2">
                      <Text color={muted} fontSize={t(12)} fontWeight="800">
                        Show Only
                      </Text>
                      <Pressable onPress={() => setWithPhotoOnly((v) => !v)}>
                        <XStack alignItems="center" justifyContent="space-between" paddingVertical={10} paddingHorizontal={10} borderRadius={12} backgroundColor={theme.bgCard} borderWidth={1} borderColor={border}>
                          <Text color={titleColor} fontWeight="800">
                            With Photo
                          </Text>
                          <Text color={withPhotoOnly ? theme.info : muted} fontWeight="900">
                            {withPhotoOnly ? '✓' : ''}
                          </Text>
                        </XStack>
                      </Pressable>
                    </YStack>

                    <YStack gap="$2">
                      <Text color={muted} fontSize={t(12)} fontWeight="800">
                        Bathroom
                      </Text>
                      <XStack gap="$2" flexWrap="wrap">
                        {([
                          { label: '1 or more', value: 1 },
                          { label: '2 or more', value: 2 },
                          { label: '3 or more', value: 3 },
                        ] as const).map((o) => (
                          <Button
                            key={o.label}
                            size="$2"
                            backgroundColor={minBathrooms === o.value ? theme.info : theme.border}
                            color={minBathrooms === o.value ? '#FFFFFF' : theme.text}
                            borderRadius={12}
                            onPress={() => setMinBathrooms(minBathrooms === o.value ? null : o.value)}>
                            {o.label}
                          </Button>
                        ))}
                      </XStack>
                    </YStack>

                    <YStack gap="$2">
                      <Text color={muted} fontSize={t(12)} fontWeight="800">
                        Floors
                      </Text>
                      <XStack gap="$2" flexWrap="wrap">
                        {([
                          { label: 'Ground', value: 'ground' },
                          { label: '1 to 3', value: '1_3' },
                          { label: '4 to 6', value: '4_6' },
                          { label: '7 to 9', value: '7_9' },
                          { label: '10 & above', value: '10_plus' },
                        ] as const).map((o) => (
                          <Button
                            key={o.value}
                            size="$2"
                            backgroundColor={floorBucket === o.value ? theme.info : theme.border}
                            color={floorBucket === o.value ? '#FFFFFF' : theme.text}
                            borderRadius={12}
                            onPress={() => setFloorBucket(floorBucket === o.value ? '' : o.value)}>
                            {o.label}
                          </Button>
                        ))}
                      </XStack>
                    </YStack>

                    <Pressable onPress={() => setRemoveSeen((v) => !v)}>
                      <XStack alignItems="center" justifyContent="space-between" paddingVertical={10} paddingHorizontal={10} borderRadius={12} backgroundColor={theme.bgCard} borderWidth={1} borderColor={border}>
                        <Text color={titleColor} fontWeight="800">
                          Remove Seen Properties
                        </Text>
                        <Text color={removeSeen ? theme.info : muted} fontWeight="900">
                          {removeSeen ? '✓' : ''}
                        </Text>
                      </XStack>
                    </Pressable>
                  </YStack>
                ) : null}

                <XStack gap="$2" flexWrap="wrap" justifyContent="space-between" alignItems="center">
                  <Button backgroundColor="#1F4E79" color="#FFFFFF" hoverStyle={{ backgroundColor: '#1F4E79' }} pressStyle={{ backgroundColor: '#1F4E79' }} onPress={() => router.push('/properties/post' as any)}>
                    Post Property
                  </Button>
                  <Button backgroundColor={theme.bgSecondary} color={theme.text} size="$2" onPress={() => router.push('/properties/my-properties' as any)}>
                    My Properties
                  </Button>
                </XStack>
              </YStack>
            ) : null}
          </YStack>

          <YStack flex={1} minWidth={320} gap="$3">
            <XStack alignItems="center" justifyContent="space-between" flexWrap="wrap" gap="$2">
              <YStack>
                <Text color={titleColor} fontSize={t(16)} fontWeight="900">
                  Results
                </Text>
                <Text color={muted} fontSize={t(12)}>
                  {loading ? 'Searching…' : `${results.length} listing(s)`}
                </Text>
              </YStack>
              <Button backgroundColor={theme.info} color="#FFFFFF" onPress={() => void search(true)} disabled={loading}>
                Search
              </Button>
            </XStack>

            {error ? <Text color={theme.danger}>{error}</Text> : null}

            {results.filter(Boolean).map((p) => {
              const cardMedia = mediaByPropertyId[p.id] ?? [];
              return (
                <Pressable
                  key={p.id}
                  onPress={() => {
                    const userId = session?.user?.id ?? null;
                    if (userId) {
                      supabase
                        .from('user_seen_properties')
                        .upsert({ user_id: userId, property_id: p.id }, { onConflict: 'user_id,property_id' } as any)
                        .then(() => {})
                        .catch(() => {});
                    }
                    router.push({ pathname: '/properties/[id]', params: { id: p.id } } as any);
                  }}>
                  <YStack backgroundColor={theme.bgCard} borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$2">
                    <XStack gap="$3" alignItems="flex-start">
                      {cardMedia.length ? <PropertyMediaGrid items={cardMedia.slice(0, 4)} size={72} /> : null}
                      <YStack flex={1} gap="$1">
                        <Text color={titleColor} fontWeight="900" fontSize={t(14)} numberOfLines={2}>
                          {formatPropertyListingTitle(p)}
                        </Text>
                        <Text color={muted} fontSize={t(12)} numberOfLines={2}>
                          {(p.locality ?? '') + (p.locality ? ', ' : '') + (p.city ?? '') + (p.city ? ', ' : '') + (p.state ?? '')}
                        </Text>
                        <Text color={theme.info} fontWeight="900">
                          {p.price ? `₹${Number(p.price).toLocaleString('en-IN')}` : 'Price on request'}
                        </Text>
                        <Text color={muted} fontSize={t(11)}>
                          {p.bedrooms ? `${p.bedrooms}BHK` : ''} {p.area_sqft ? `• ${p.area_sqft} sqft` : ''} •{' '}
                          {String(p.listing_type ?? '').toUpperCase()}
                        </Text>
                      </YStack>
                    </XStack>
                  </YStack>
                </Pressable>
              );
            })}

            {!loading && results.length > 0 && hasMore ? (
              <Button backgroundColor={theme.bgSecondary} color={theme.text} onPress={() => void search(false)}>
                Load More
              </Button>
            ) : null}

            {!loading && !results.length ? <Text color={muted}>No results found.</Text> : null}
          </YStack>
        </XStack>
      </ScrollView>

      <Modal visible={unlockModalOpen} transparent animationType="fade" onRequestClose={() => setUnlockModalOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', padding: 16, justifyContent: 'center' }} onPress={() => setUnlockModalOpen(false)}>
          <Pressable onPress={() => {}} style={{ backgroundColor: theme.bgCard, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: theme.border }}>
            <XStack alignItems="center" justifyContent="space-between" marginBottom={10}>
              <Text color={theme.text} fontSize={t(16)} fontWeight="900">
                Choose a plan
              </Text>
              <Pressable onPress={() => setUnlockModalOpen(false)}>
                <Text color={theme.textMuted} fontSize={t(22)} fontWeight="900">
                  ×
                </Text>
              </Pressable>
            </XStack>

            <YStack gap="$2">
              {planOptions.map((p) => (
                <YStack key={p.code} backgroundColor={theme.bgSecondary} borderRadius={14} padding={12} borderWidth={1} borderColor={theme.border} gap="$2">
                  <XStack alignItems="center" justifyContent="space-between">
                    <Text color={theme.text} fontWeight="900">
                      {p.title}
                    </Text>
                    <Text color={theme.text} fontWeight="900">
                      ₹{p.price}
                    </Text>
                  </XStack>
                  <Button
                    disabled={unlocking}
                    backgroundColor={theme.info}
                    color="#FFFFFF"
                    fontWeight="900"
                    onPress={() => subscribeToPlan(p.code)}>
                    {unlockingPlanCode === p.code ? 'Processing…' : 'Subscribe'}
                  </Button>
                </YStack>
              ))}
            </YStack>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
    </>
  );
}
