import { getMapboxToken } from '@/lib/public-config';

/**
 * India is not supported by Mapbox Search Box (the API behind the native Search
 * SDK's suggest/retrieve flow).  Use Geocoding v6 here: it is Mapbox's current
 * worldwide geocoding endpoint and supports India, autocomplete, country,
 * proximity, bbox, and the structured context needed by address forms.
 *
 * Keep the v5-shaped exports below so existing screens do not need a breaking
 * migration.  `addressDetails` is additive and exposes the v6 context safely.
 */

export type MapboxSearchFeatureType =
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

type V6ContextPart = {
  mapbox_id?: string;
  name?: string;
  address_number?: string;
  street_name?: string;
  designator?: string;
  identifier?: string;
  [key: string]: unknown;
};

type V6Feature = {
  id?: string;
  bbox?: Bbox;
  geometry?: { coordinates?: number[] };
  properties?: {
    mapbox_id?: string;
    feature_type?: string;
    name?: string;
    full_address?: string;
    place_formatted?: string;
    address_number?: string;
    street_name?: string;
    coordinates?: {
      longitude?: number;
      latitude?: number;
      accuracy?: string;
    routable_points?: { name?: string; longitude?: number; latitude?: number }[];
    };
    context?: Record<string, V6ContextPart | undefined>;
    match_code?: Record<string, string | undefined>;
    bbox?: Bbox;
    [key: string]: unknown;
  };
};

export type MapboxContextItem = {
  id?: string;
  text?: string;
  short_code?: string;
  mapbox_id?: string;
  address_number?: string;
  street_name?: string;
  designator?: string;
  identifier?: string;
};

/** Structured address values returned by Mapbox Geocoding v6 when available. */
export type MapboxAddressDetails = {
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
  /** Road-access point suitable for vehicle pickup/drop navigation. */
  routablePoint: Coordinate | null;
  /** Physical entrance when Mapbox has entrance data. */
  entrancePoint: Coordinate | null;
  /** Preferred visible pin: entrance, then rooftop/address coordinate. */
  markerCoordinate: Coordinate | null;
  coordinateAccuracy: string;
  confidence: string;
};

export type MapboxGeocodeFeature = {
  id: string;
  place_name: string;
  center: Coordinate;
  place_type?: string[];
  text?: string;
  address?: string;
  context?: MapboxContextItem[];
  bbox?: Bbox;
  addressDetails?: MapboxAddressDetails;
};

export type MapboxReverseGeocodeFeature = {
  id?: string;
  type?: string;
  place_type?: string[];
  text?: string;
  place_name?: string;
  address?: string;
  center?: Coordinate;
  bbox?: Bbox;
  context?: MapboxContextItem[];
  addressDetails?: MapboxAddressDetails;
};

export type SearchPlacesOptions = {
  limit?: number;
  types?: MapboxSearchFeatureType[];
  /** Current device location, in [longitude, latitude] order. */
  proximity?: Coordinate;
  /** City/service-area bounds; use only after resolving the selected city. */
  bbox?: Bbox;
  language?: string;
  /** Addresses are ranked ahead of POIs unless a POI-only search is requested. */
  preferAddress?: boolean;
};

/** Approximate India bounds used only when a caller needs a safe country fallback. */
export const INDIA_BBOX: Bbox = [68.7, 6.7, 97.4, 35.7];
export const INDIA_CENTER: Coordinate = [77.2, 23.2];

const GEOCODING_V6 = 'https://api.mapbox.com/search/geocode/v6';
const cityCenterCache = new Map<string, MapboxGeocodeFeature | null>();

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function coordinate(value: unknown): Coordinate | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const lng = Number(value[0]);
  const lat = Number(value[1]);
  return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
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

function contextName(context: Record<string, V6ContextPart | undefined>, key: string): string {
  return clean(context[key]?.name);
}

function pincodeFrom(...values: unknown[]): string {
  for (const value of values) {
    const match = clean(value).match(/\b(\d{6})\b/);
    if (match) return match[1];
  }
  return '';
}

function fullAddress(properties: V6Feature['properties']): string {
  const direct = clean(properties?.full_address);
  if (direct) return direct;
  return [clean(properties?.name), clean(properties?.place_formatted)].filter(Boolean).join(', ');
}

function toAddressDetails(feature: V6Feature, center: Coordinate | null): MapboxAddressDetails {
  const properties = feature.properties ?? {};
  const context = properties.context ?? {};
  const address = context.address ?? {};
  const secondaryAddress = context.secondary_address ?? {};
  const featureType = clean(properties.feature_type);
  const name = clean(properties.name);
  const houseNumber = clean(address.address_number) || clean(properties.address_number);
  const apartment = clean(secondaryAddress.name) || clean(secondaryAddress.identifier);
  // A POI is the best available building label when reverse lookup lands at a named building.
  const building = clean((properties as any).building) || contextName(context, 'building') || (featureType === 'poi' ? name : '');
  const street = clean(address.street_name) || clean(properties.street_name) || contextName(context, 'street');
  const locality = contextName(context, 'neighborhood') || contextName(context, 'locality');
  const city = contextName(context, 'place') || contextName(context, 'locality');
  const district = contextName(context, 'district');
  const state = contextName(context, 'region');
  const formattedAddress = fullAddress(properties);
  const pincode = contextName(context, 'postcode') || pincodeFrom(formattedAddress, name);
  const routablePoints = properties.coordinates?.routable_points ?? [];
  const pointFor = (name: string): Coordinate | null => {
    const point = routablePoints.find((candidate) => clean(candidate.name).toLowerCase() === name);
    return point && Number.isFinite(point.longitude) && Number.isFinite(point.latitude)
      ? [Number(point.longitude), Number(point.latitude)]
      : null;
  };
  const routablePoint = pointFor('default');
  const entrancePoint = pointFor('entrance');

  return {
    formattedAddress,
    houseNumber,
    building,
    apartment,
    street,
    locality,
    city,
    district,
    state,
    pincode,
    country: contextName(context, 'country'),
    coordinate: center,
    routablePoint,
    entrancePoint,
    markerCoordinate: entrancePoint ?? center,
    coordinateAccuracy: clean(properties.coordinates?.accuracy),
    confidence: clean(properties.match_code?.confidence),
  };
}

function toLegacyContext(context: Record<string, V6ContextPart | undefined>): MapboxContextItem[] {
  return Object.entries(context)
    .filter(([, item]) => Boolean(item))
    .map(([layer, item]) => ({
      id: `${layer}.${clean(item?.mapbox_id) || clean(item?.name)}`,
      text: clean(item?.name),
      mapbox_id: clean(item?.mapbox_id),
      address_number: clean(item?.address_number),
      street_name: clean(item?.street_name),
      designator: clean(item?.designator),
      identifier: clean(item?.identifier),
    }));
}

function toLegacyFeature(feature: V6Feature): MapboxGeocodeFeature | null {
  const properties = feature.properties ?? {};
  const center = coordinate(feature.geometry?.coordinates) ??
    (Number.isFinite(properties.coordinates?.longitude) && Number.isFinite(properties.coordinates?.latitude)
      ? [Number(properties.coordinates?.longitude), Number(properties.coordinates?.latitude)] as Coordinate
      : null);
  if (!center) return null;
  const featureType = clean(properties.feature_type) || 'place';
  const context = properties.context ?? {};
  const details = toAddressDetails(feature, center);
  return {
    id: clean(feature.id) || clean(properties.mapbox_id) || `${featureType}.${center.join(',')}`,
    place_name: details.formattedAddress || clean(properties.name),
    center,
    place_type: [featureType],
    text: clean(properties.name),
    address: details.houseNumber,
    context: toLegacyContext(context),
    bbox: (properties.bbox ?? feature.bbox) as Bbox | undefined,
    addressDetails: details,
  };
}

function rankFeature(feature: MapboxGeocodeFeature, preferAddress: boolean): number {
  const type = feature.place_type?.[0] ?? '';
  if (!preferAddress) return 0;
  if (type === 'address' || type === 'secondary_address') return 0;
  if (type === 'street') return 1;
  if (type === 'neighborhood' || type === 'locality') return 2;
  if (type === 'place' || type === 'district') return 3;
  if (type === 'poi') return 10;
  return 5;
}

async function getV6Features(path: 'forward' | 'reverse', params: Record<string, string>): Promise<V6Feature[]> {
  const token = await getMapboxToken();
  if (!token) throw new Error('Mapbox access token is not configured');
  const query = new URLSearchParams({ ...params, access_token: token });
  const response = await fetch(`${GEOCODING_V6}/${path}?${query.toString()}`);
  if (!response.ok) throw new Error(`Mapbox geocoding failed (${response.status})`);
  const data = (await response.json()) as { features?: V6Feature[] };
  return Array.isArray(data.features) ? data.features : [];
}

function normalizeTypes(types: MapboxSearchFeatureType[] | undefined): string {
  // Geocoding v6 deliberately has no POI type. Retain `poi` in the public
  // union for existing callers, but omit it from the request rather than
  // turning an otherwise valid Indian address search into a 422 response.
  const v6Types = new Set<MapboxSearchFeatureType>(['country', 'region', 'postcode', 'district', 'place', 'locality', 'neighborhood', 'street', 'address']);
  return Array.isArray(types) && types.length ? Array.from(new Set(types.filter((type) => v6Types.has(type)))).join(',') : '';
}

/**
 * Autocomplete search for India. This is deliberately kept v5-compatible:
 * callers still receive id/place_name/center/context, now mapped from v6.
 */
export async function searchPlaces(query: string, options: SearchPlacesOptions = {}): Promise<MapboxGeocodeFeature[]> {
  const text = query.trim();
  if (!text) return [];

  const limit = Math.max(1, Math.min(10, Number(options.limit ?? 5) || 5));
  const types = normalizeTypes(options.types);
  const params: Record<string, string> = {
    q: text.slice(0, 256),
    country: 'IN',
    autocomplete: 'true',
    worldview: 'in',
    entrances: 'true',
    limit: String(limit),
    language: clean(options.language) || 'en,hi',
  };
  if (types) params.types = types;
  if (validCoordinate(options.proximity)) params.proximity = options.proximity.join(',');
  if (validBbox(options.bbox)) params.bbox = options.bbox.join(',');

  let features = (await getV6Features('forward', params)).map(toLegacyFeature).filter((item): item is MapboxGeocodeFeature => Boolean(item));
  // Indian localities are often indexed as a neighborhood, address context, or
  // place rather than a top-level locality. Broaden once instead of returning
  // an empty locality picker just because a strict layer filter missed it.
  const needsLocalityFallback = Boolean(
    options.types?.some((type) => type === 'locality' || type === 'neighborhood') &&
      !features.some((item) => ['locality', 'neighborhood'].includes(item.place_type?.[0] ?? '')),
  );
  if (needsLocalityFallback) {
    const fallbackParams = { ...params };
    delete fallbackParams.types;
    const broader = (await getV6Features('forward', fallbackParams)).map(toLegacyFeature).filter((item): item is MapboxGeocodeFeature => Boolean(item));
    const seen = new Set(features.map((item) => item.id));
    features = [...features, ...broader.filter((item) => !seen.has(item.id))];
  }
  const poiOnly = Array.isArray(options.types) && options.types.length > 0 && options.types.every((type) => type === 'poi');
  const preferAddress = options.preferAddress ?? !poiOnly;
  return features.sort((a, b) => rankFeature(a, preferAddress) - rankFeature(b, preferAddress));
}

/**
 * Locality lookup for Indian addresses. A strict locality-only query misses
 * many Indian neighborhoods, so it first searches locality layers and then
 * broadens to address/place context while retaining locality candidates.
 */
export async function searchIndianLocalities(
  query: string,
  options: Omit<SearchPlacesOptions, 'types' | 'preferAddress'> = {},
): Promise<MapboxGeocodeFeature[]> {
  const localTypes: MapboxSearchFeatureType[] = ['locality', 'neighborhood', 'place', 'district', 'address'];
  // searchPlaces widens this query once if Mapbox has no top-level locality
  // result, so address/place context remains a useful locality fallback.
  return searchPlaces(query, { ...options, limit: Math.min(options.limit ?? 10, 10), types: localTypes, preferAddress: false });
}

/** Resolve a city/state to a center and usable service-area bounding box. */
export async function getCityCenter(city: string, state: string): Promise<{ center: Coordinate | null; bbox: Bbox | null }> {
  const key = `${city.trim().toLowerCase()}|${state.trim().toLowerCase()}`;
  const cached = cityCenterCache.get(key);
  if (cached !== undefined) return { center: cached?.center ?? null, bbox: cached?.bbox ?? null };
  try {
    const results = await searchPlaces(`${city}, ${state}`.trim(), { limit: 3, types: ['place', 'locality', 'district'], preferAddress: false });
    const cityKey = city.trim().toLowerCase();
    const feature = results.find((result) => result.text?.toLowerCase() === cityKey || result.place_name.toLowerCase().includes(cityKey)) ?? results[0] ?? null;
    cityCenterCache.set(key, feature);
    return { center: feature?.center ?? null, bbox: feature?.bbox ?? null };
  } catch {
    cityCenterCache.set(key, null);
    return { center: null, bbox: null };
  }
}

export async function getRouteDistance(pickup: Coordinate, drop: Coordinate): Promise<number> {
  const mapboxToken = await getMapboxToken();
  const coords = `${pickup[0]},${pickup[1]};${drop[0]},${drop[1]}`;
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?access_token=${encodeURIComponent(mapboxToken)}&overview=false&geometries=geojson`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to fetch route');
  const data = await response.json();
  return Number(data.routes?.[0]?.distance ?? 0) / 1000;
}

/** Accurate coordinate-to-address conversion with India-only structured context. */
async function reverseAddressFeatures(lng: number, lat: number, limit: number, language: string): Promise<MapboxGeocodeFeature[]> {
  const baseParams = {
    longitude: String(lng),
    latitude: String(lat),
    country: 'IN',
    worldview: 'in',
    language: clean(language) || 'en,hi',
  };
  // v6 permits a limit above one only with exactly one feature type. Address
  // context already contains the city/district/state/pincode hierarchy.
  const addresses = (await getV6Features('reverse', {
    ...baseParams,
    limit: String(Math.max(1, Math.min(5, Number(limit) || 1))),
    types: 'address',
  })).map(toLegacyFeature).filter((item): item is MapboxGeocodeFeature => Boolean(item));
  if (addresses.length) return addresses.sort((a, b) => rankFeature(a, true) - rankFeature(b, true));

  // Rural or newly mapped coordinates may not have an address feature. Keep a
  // complete administrative answer rather than returning an empty address.
  return (await getV6Features('reverse', baseParams)).map(toLegacyFeature).filter((item): item is MapboxGeocodeFeature => Boolean(item));
}

export async function reverseGeocodeAddress(lng: number, lat: number, language = 'en,hi'): Promise<MapboxAddressDetails | null> {
  if (!validCoordinate([lng, lat])) throw new Error('Invalid longitude or latitude');
  const results = await reverseAddressFeatures(lng, lat, 5, language);
  return results[0]?.addressDetails ?? null;
}

export async function reverseGeocode(lng: number, lat: number, language = 'en,hi'): Promise<string> {
  return (await reverseGeocodeAddress(lng, lat, language))?.formattedAddress ?? '';
}

export async function reverseGeocodeFeatures(lng: number, lat: number, limit = 6, language = 'en,hi'): Promise<MapboxReverseGeocodeFeature[]> {
  if (!validCoordinate([lng, lat])) throw new Error('Invalid longitude or latitude');
  const results = await reverseAddressFeatures(lng, lat, limit, language);
  return results
    .sort((a, b) => rankFeature(a, true) - rankFeature(b, true))
    .map((item) => item as MapboxReverseGeocodeFeature);
}

export async function reverseGeocodeDetails(lng: number, lat: number, language = 'en,hi'): Promise<MapboxReverseGeocodeFeature | null> {
  const features = await reverseGeocodeFeatures(lng, lat, 10, language);
  return features[0] ?? null;
}
