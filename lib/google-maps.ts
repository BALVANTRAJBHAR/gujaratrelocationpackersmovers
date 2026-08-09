import { supabase } from '@/lib/supabase';

/**
 * lib/google-maps.ts
 * ------------------
 * Google Maps API wrapper (Places API new, Geocoding API, Directions API)
 * routed through the `maps-proxy` Supabase edge function so the API key
 * never ships to the client and browser CORS is not an issue.
 *
 * Exports keep the exact same names and shapes the screens already use:
 *   searchPlaces, searchIndianLocalities, getCityCenter, getDistance,
 *   reverseGeocode, reverseGeocodeAddress, reverseGeocodeFeatures,
 *   reverseGeocodeDetails  + the feature/detail/option types.
 */

export type GoogleSearchFeatureType =
  | 'address'
  | 'poi'
  | 'street'
  | 'place'
  | 'locality'
  | 'neighborhood'
  | 'district'
  | 'region'
  | 'postcode'
  | 'country';

type Coordinate = [number, number];
type Bbox = [number, number, number, number];

export type GoogleContextItem = {
  id?: string;
  text?: string;
  short_code?: string;
};

export type GoogleAddressDetails = {
  formattedAddress: string;
  houseNumber: string;
  building: string;
  apartment: string;
  street: string;
  locality: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  country: string;
  coordinate: Coordinate | null;
  routablePoint: Coordinate | null;
  entrancePoint: Coordinate | null;
  markerCoordinate: Coordinate | null;
  coordinateAccuracy: string;
  confidence: string;
};

export type GoogleGeocodeFeature = {
  id: string;
  place_name: string;
  center: Coordinate;
  place_type?: string[];
  text?: string;
  address?: string;
  context?: GoogleContextItem[];
  bbox?: Bbox;
  addressDetails?: GoogleAddressDetails;
};

/** Lightweight Places Autocomplete result; resolve it only after selection. */
export type GoogleAutocompleteSuggestion = {
  id: string;
  placeId: string;
  place_name: string;
  primaryText: string;
  secondaryText: string;
  sessionToken: string;
};

export type GoogleReverseGeocodeFeature = {
  id?: string;
  type?: string;
  place_type?: string[];
  text?: string;
  place_name?: string;
  address?: string;
  center?: Coordinate;
  bbox?: Bbox;
  context?: GoogleContextItem[];
  addressDetails?: GoogleAddressDetails;
};

export type SearchPlacesOptions = {
  limit?: number;
  types?: GoogleSearchFeatureType[];
  /** Current device location, in [longitude, latitude] order. */
  proximity?: Coordinate;
  bbox?: Bbox;
  language?: string;
  preferAddress?: boolean;
};

/** Approximate India bounds used only when a caller needs a safe country fallback. */
export const INDIA_BBOX: Bbox = [68.7, 6.7, 97.4, 35.7];
export const INDIA_CENTER: Coordinate = [77.2, 23.2];

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function coordinate(lng: unknown, lat: unknown): Coordinate | null {
  const l = Number(lng);
  const a = Number(lat);
  return Number.isFinite(l) && Number.isFinite(a) ? [l, a] : null;
}

function validCoordinate(value: Coordinate | undefined): value is Coordinate {
  return Boolean(value && Number.isFinite(value[0]) && Number.isFinite(value[1]) && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90);
}

function validBbox(value: Bbox | undefined): value is Bbox {
  return Boolean(
    value &&
      value.length === 4 &&
      value.every(Number.isFinite) &&
      value[0] < value[2] &&
      value[1] < value[3] &&
      Math.abs(value[0]) <= 180 &&
      Math.abs(value[2]) <= 180 &&
      Math.abs(value[1]) <= 90 &&
      Math.abs(value[3]) <= 90,
  );
}

function pincodeFrom(...values: unknown[]): string {
  for (const value of values) {
    const match = clean(value).match(/\b(\d{6})\b/);
    if (match) return match[1];
  }
  return '';
}

/** Google address component type → our house-level labels. */
const GOOGLE_TYPE_LABEL: Record<string, string> = {
  street_number: 'houseNumber',
  route: 'street',
  sublocality: 'locality',
  sublocality_level_1: 'locality',
  sublocality_level_2: 'locality',
  sublocality_level_3: 'locality',
  neighborhood: 'neighborhood',
  locality: 'city',
  administrative_area_level_2: 'district',
  administrative_area_level_1: 'state',
  postal_code: 'pincode',
  country: 'country',
};

/** Google place types → the feature_type vocabulary callers filter on. */
const GOOGLE_TO_FEATURE_TYPE: Record<string, string> = {
  street_address: 'address',
  premise: 'address',
  subpremise: 'address',
  address: 'address',
  route: 'street',
  intersection: 'street',
  neighborhood: 'neighborhood',
  sublocality: 'locality',
  sublocality_level_1: 'locality',
  sublocality_level_2: 'locality',
  sublocality_level_3: 'locality',
  locality: 'locality',
  administrative_area_level_2: 'district',
  administrative_area_level_1: 'region',
  postal_code: 'postcode',
  country: 'country',
  establishment: 'poi',
  point_of_interest: 'poi',
};

function mappedFeatureTypes(googleTypes: string[] | undefined): string[] {
  const out: string[] = [];
  for (const raw of googleTypes ?? []) {
    const mapped = GOOGLE_TO_FEATURE_TYPE[raw];
    if (mapped && !out.includes(mapped)) out.push(mapped);
  }
  if (!out.length) out.push('poi');
  return out;
}

function addressDetailsFromComponents(
  components: { long?: string; short?: string; types?: string[] }[],
  formattedAddress: string,
  center: Coordinate | null,
): GoogleAddressDetails {
  const values: Record<string, string> = {};
  let neighborhood = '';
  for (const c of components ?? []) {
    for (const type of c.types ?? []) {
      const label = GOOGLE_TYPE_LABEL[type];
      if (label === 'neighborhood') {
        if (!neighborhood) neighborhood = clean(c.long);
      } else if (label && !values[label]) {
        values[label] = clean(c.long || c.short);
      }
    }
  }
  const locality = values.locality ?? '';
  const city = values.city ?? '';
  const street = values.street ?? '';
  const houseNumber = values.houseNumber ?? '';
  const building = street && houseNumber ? '' : clean(components?.find((c) => (c.types ?? []).includes('premise'))?.long);

  return {
    formattedAddress,
    houseNumber,
    building,
    apartment: '',
    street,
    locality: neighborhood || locality,
    city: city || locality,
    district: values.district ?? '',
    state: values.state ?? '',
    pincode: values.pincode ?? pincodeFrom(formattedAddress),
    country: values.country ?? '',
    coordinate: center,
    routablePoint: center,
    entrancePoint: null,
    markerCoordinate: center,
    coordinateAccuracy: '',
    confidence: '',
  };
}

function contextFromComponents(components: { long?: string; short?: string; types?: string[] }[]): GoogleContextItem[] {
  const context: GoogleContextItem[] = [];
  for (const c of components ?? []) {
    const types = c.types ?? [];
    const long = clean(c.long);
    if (!long) continue;
    if (types.includes('street_number')) continue;
    if (types.includes('route')) continue;
    if (types.includes('neighborhood')) context.push({ id: `neighborhood.${long}`, text: long });
    if (types.includes('sublocality') || types.includes('sublocality_level_1')) context.push({ id: `locality.${long}`, text: long });
    if (types.includes('locality')) context.push({ id: `place.${long}`, text: long });
    if (types.includes('administrative_area_level_2')) context.push({ id: `district.${long}`, text: long });
    if (types.includes('administrative_area_level_1')) context.push({ id: `region.${long}`, text: long });
    if (types.includes('postal_code')) context.push({ id: `postcode.${long}`, text: long });
    if (types.includes('country')) context.push({ id: `country.${long}`, text: long });
  }
  return context;
}

function toGeocodeFeature(place: any): GoogleGeocodeFeature | null {
  const id = clean(place?.id) || clean(place?.place_id);
  const formattedAddress = clean(place?.formattedAddress) || clean(place?.formatted_address);
  const shortName = clean(place?.displayName?.text) || clean(place?.name);
  const location = place?.location ?? place?.geometry?.location;
  const lat = Number(location?.latitude ?? location?.lat ?? NaN);
  const lng = Number(location?.longitude ?? location?.lng ?? NaN);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const center: Coordinate = [lng, lat];
  const components: { long?: string; short?: string; types?: string[] }[] =
    place?.addressComponents ?? place?.address_components ?? [];
  const types = mappedFeatureTypes(place?.types ?? place?.place_type?.split(',') ?? []);
  const placeName = formattedAddress || shortName;
  const details = addressDetailsFromComponents(components, placeName, center);

  const viewport = place?.viewport ?? place?.geometry?.viewport;
  let bbox: Bbox | undefined;
  if (viewport?.northeast && viewport?.southwest) {
    bbox = [
      Number(viewport.southwest.lng ?? viewport.southwest.longitude),
      Number(viewport.southwest.lat ?? viewport.southwest.latitude),
      Number(viewport.northeast.lng ?? viewport.northeast.longitude),
      Number(viewport.northeast.lat ?? viewport.northeast.latitude),
    ];
    if (!validBbox(bbox)) bbox = undefined;
  }

  return {
    id: id || `place.${center.join(',')}`,
    place_name: placeName,
    center,
    place_type: types,
    text: shortName,
    address: details.houseNumber,
    context: contextFromComponents(components),
    bbox,
    addressDetails: details,
  };
}

async function invokeProxy(action: string, payload: Record<string, unknown>): Promise<any> {
  console.log(`[maps-proxy] → action=${action}`, JSON.stringify(payload).slice(0, 200));
  const { data, error } = await supabase.functions.invoke('maps-proxy', { body: { action, ...payload } });
  if (error) {
    console.error(`[maps-proxy] ← error:`, error?.message, error);
    throw new Error(String(error?.message ?? 'maps-proxy request failed'));
  }
  if (data?.error) {
    console.error(`[maps-proxy] ← data.error:`, data.error);
    throw new Error(String(data.error));
  }
  console.log(`[maps-proxy] ← ok, keys:`, Object.keys(data ?? {}));
  return data;
}

export function createGooglePlacesSessionToken(): string {
  // Must be a valid UUID for Google Places API (New) session billing
  const nativeCrypto = globalThis.crypto;
  if (typeof nativeCrypto?.randomUUID === 'function') return nativeCrypto.randomUUID();
  // RFC 4122 v4 UUID fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Google Places Autocomplete (New), restricted to India, with fallback to text search. */
export async function autocompletePlaces(
  query: string,
  options: Pick<SearchPlacesOptions, 'proximity' | 'bbox' | 'language'> & { sessionToken?: string } = {},
): Promise<GoogleAutocompleteSuggestion[]> {
  const input = query.trim();
  if (!input) return [];

  // Try Places Autocomplete API first
  try {
    const sessionToken = options.sessionToken || createGooglePlacesSessionToken();
    const data = await invokeProxy('autocomplete', {
      input: input.slice(0, 256),
      sessionToken,
      lat: validCoordinate(options.proximity) ? options.proximity[1] : undefined,
      lng: validCoordinate(options.proximity) ? options.proximity[0] : undefined,
      bbox: validBbox(options.bbox) ? options.bbox : undefined,
      language: clean(options.language) || 'en',
    });
    console.log('[google-maps] autocomplete raw suggestions count:', data?.suggestions?.length ?? 0);
    // If edge fn returned an _error (non-ok HTTP from Google), log it and fall through to searchPlaces
    if (data?._error) {
      console.warn('[google-maps] autocomplete API returned error code', data._error, data._detail);
    }
    const suggestions = (Array.isArray(data?.suggestions) ? data.suggestions : [])
      .map((item: any) => {
        const prediction = item?.placePrediction;
        const placeId = clean(prediction?.placeId);
        const text = clean(prediction?.text?.text);
        if (!placeId || !text) {
          console.warn('[google-maps] skipping suggestion - missing placeId or text:', item);
          return null;
        }
        return {
          id: placeId,
          placeId,
          place_name: text,
          primaryText: clean(prediction?.structuredFormat?.mainText?.text) || text,
          secondaryText: clean(prediction?.structuredFormat?.secondaryText?.text) || '',
          sessionToken,
        } as GoogleAutocompleteSuggestion;
      })
      .filter((item: GoogleAutocompleteSuggestion | null): item is GoogleAutocompleteSuggestion => Boolean(item));

    console.log('[google-maps] autocomplete parsed suggestions:', suggestions.length);
    if (suggestions.length > 0) return suggestions;
    console.warn('[google-maps] autocomplete returned 0 suggestions, trying searchPlaces fallback');
  } catch (err) {
    console.warn('[google-maps] autocomplete API failed, using searchPlaces fallback:', err);
  }

  // Fallback: Text search / Geocoding via searchPlaces
  try {
    const features = await searchPlaces(input, {
      proximity: options.proximity,
      bbox: options.bbox,
      limit: 8,
    });
    return features.map((f) => {
      const parts = f.place_name.split(',');
      const primaryText = parts[0]?.trim() || f.place_name;
      const secondaryText = parts.slice(1).join(', ').trim();
      return {
        id: f.id,
        placeId: f.id,
        place_name: f.place_name,
        primaryText,
        secondaryText,
        sessionToken: options.sessionToken || '',
      };
    });
  } catch {
    return [];
  }
}

/** Resolves the selected prediction to its exact address, components and pin. */
export async function resolveAutocompleteSuggestion(
  suggestion: GoogleAutocompleteSuggestion,
): Promise<GoogleGeocodeFeature | null> {
  if (!suggestion.placeId) return null;
  // If placeId was generated by fallback searchPlaces
  if (suggestion.placeId.startsWith('place.')) {
    const features = await searchPlaces(suggestion.place_name, { limit: 1 });
    return features[0] ?? null;
  }
  try {
    const data = await invokeProxy('place-details', {
      placeId: suggestion.placeId,
      sessionToken: suggestion.sessionToken,
    });
    return toGeocodeFeature(data?.place ?? data);
  } catch {
    const features = await searchPlaces(suggestion.place_name, { limit: 1 });
    return features[0] ?? null;
  }
}

/**
 * Autocomplete search for India backed by Google Places API (new).
 * Kept compatible with the legacy shape: id/place_name/center/context.
 */
export async function searchPlaces(query: string, options: SearchPlacesOptions = {}): Promise<GoogleGeocodeFeature[]> {
  const text = query.trim();
  if (!text) return [];

  const limit = Math.max(1, Math.min(10, Number(options.limit ?? 5) || 5));
  const proximity = validCoordinate(options.proximity) ? options.proximity : undefined;
  const data = await invokeProxy('search', {
    query: text.slice(0, 256),
    limit,
    lat: proximity ? proximity[1] : undefined,
    lng: proximity ? proximity[0] : undefined,
    bbox: validBbox(options.bbox) ? options.bbox : undefined,
  });

  const features = (Array.isArray(data?.places) ? data.places : [])
    .map(toGeocodeFeature)
    .filter((item: GoogleGeocodeFeature | null): item is GoogleGeocodeFeature => Boolean(item))
    .slice(0, limit);

  const preferAddress = options.preferAddress ?? true;
  if (preferAddress) {
    features.sort((a: GoogleGeocodeFeature, b: GoogleGeocodeFeature) => {
      const rank = (f: GoogleGeocodeFeature) => {
        const type = f.place_type?.[0] ?? '';
        if (type === 'address') return 0;
        if (type === 'street') return 1;
        if (type === 'neighborhood' || type === 'locality') return 2;
        if (type === 'place' || type === 'district') return 3;
        if (type === 'poi') return 10;
        return 5;
      };
      return rank(a) - rank(b);
    });
  }
  return features;
}

/**
 * Locality lookup for Indian addresses — same engine, locality-biased.
 */
export async function searchIndianLocalities(
  query: string,
  options: Omit<SearchPlacesOptions, 'types' | 'preferAddress'> = {},
): Promise<GoogleGeocodeFeature[]> {
  return searchPlaces(query, { ...options, limit: Math.min(options.limit ?? 10, 10) });
}

/** Resolve a city/state to a center (bbox best-effort from Google viewport). */
export async function getCityCenter(
  city: string,
  state: string,
): Promise<{ center: Coordinate | null; bbox: Bbox | null }> {
  const address = `${city.trim()}, ${state.trim()}`.trim();
  if (!address) return { center: null, bbox: null };
  try {
    const data = await invokeProxy('geocode', { address });
    const results = Array.isArray(data?.results) ? data.results : [];
    const first = results[0] as any;
    if (!first) return { center: null, bbox: null };
    const feature = toGeocodeFeature(first);
    return { center: feature?.center ?? null, bbox: feature?.bbox ?? null };
  } catch {
    return { center: null, bbox: null };
  }
}

/** Driving distance in kilometres via Google Directions API. */
export async function getRouteDistance(pickup: Coordinate, drop: Coordinate): Promise<number> {
  if (!validCoordinate(pickup) || !validCoordinate(drop)) throw new Error('Invalid pickup or drop coordinate');
  const data = await invokeProxy('directions', {
    originLat: pickup[1],
    originLng: pickup[0],
    destLat: drop[1],
    destLng: drop[0],
  });
  const meters = Number(data?.routes?.[0]?.legs?.[0]?.distance?.value ?? 0);
  return Number.isFinite(meters) ? meters / 1000 : 0;
}

async function reverseFeatures(lng: number, lat: number, limit: number): Promise<GoogleReverseGeocodeFeature[]> {
  if (!validCoordinate([lng, lat])) throw new Error('Invalid longitude or latitude');
  const data = await invokeProxy('reverse', { lat, lng });
  const results = Array.isArray(data?.results) ? data.results : [];
  return results
    .slice(0, Math.max(1, Math.min(8, Number(limit) || 1)))
    .map((item: any) => {
      const feature = toGeocodeFeature(item);
      if (!feature) return null;
      return feature as GoogleReverseGeocodeFeature;
    })
    .filter((item: GoogleReverseGeocodeFeature | null): item is GoogleReverseGeocodeFeature => Boolean(item))
    .sort((a: GoogleReverseGeocodeFeature, b: GoogleReverseGeocodeFeature) => {
      const rank = (item: GoogleReverseGeocodeFeature) => {
        const type = item.place_type?.[0] ?? '';
        if (type === 'address') return 0;
        if (type === 'street') return 1;
        if (type === 'locality' || type === 'neighborhood') return 2;
        if (type === 'district' || type === 'region') return 3;
        return 10; // Plus codes and POIs are a last-resort fallback.
      };
      return rank(a) - rank(b);
    });
}

/** Accurate coordinate-to-address conversion with structured context. */
export async function reverseGeocodeAddress(lng: number, lat: number, _language = 'en'): Promise<GoogleAddressDetails | null> {
  const features = await reverseFeatures(lng, lat, 5);
  return features[0]?.addressDetails ?? null;
}

export async function reverseGeocode(lng: number, lat: number, _language = 'en'): Promise<string> {
  return (await reverseGeocodeAddress(lng, lat))?.formattedAddress ?? '';
}

export async function reverseGeocodeFeatures(lng: number, lat: number, limit = 6, _language = 'en'): Promise<GoogleReverseGeocodeFeature[]> {
  return reverseFeatures(lng, lat, limit);
}

export async function reverseGeocodeDetails(lng: number, lat: number, _language = 'en'): Promise<GoogleReverseGeocodeFeature | null> {
  const features = await reverseFeatures(lng, lat, 10);
  return features[0] ?? null;
}
