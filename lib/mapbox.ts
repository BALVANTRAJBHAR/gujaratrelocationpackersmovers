import { getMapboxToken } from '@/lib/public-config';

type GeocodeFeature = {
  id: string;
  place_name: string;
  center: [number, number];
  place_type?: string[];
  text?: string;
  context?: MapboxContextItem[];
  bbox?: [number, number, number, number];
};

type ReverseGeocodeFeature = {
  place_name: string;
};

export type MapboxContextItem = {
  id?: string;
  text?: string;
  short_code?: string;
};

export type MapboxReverseGeocodeFeature = {
  id?: string;
  type?: string;
  place_type?: string[];
  text?: string;
  place_name?: string;
  address?: string;
  context?: MapboxContextItem[];
};

export type SearchPlacesOptions = {
  limit?: number;
  types?: Array<'address' | 'poi' | 'place' | 'locality' | 'neighborhood' | 'district' | 'region' | 'country'>;
  proximity?: [number, number];
  bbox?: [number, number, number, number];
  language?: string;
};

/** Approximate India bounding box for fallback spatial filtering */
export const INDIA_BBOX: [number, number, number, number] = [68.7, 6.7, 97.4, 35.7];

/** Approximate India center (Bhopal) used as default proximity fallback */
export const INDIA_CENTER: [number, number] = [77.2, 23.2];

/** Small in-memory cache keyed by query+options signature to avoid duplicate network calls */
const cityCenterCache = new Map<string, GeocodeFeature | null>();

function searchCacheKey(query: string, opts: SearchPlacesOptions): string {
  return `${query}|${opts.limit ?? 5}|${String(opts.types ?? '')}|${String(opts.proximity ?? '')}`;
}

export async function searchPlaces(query: string, options: SearchPlacesOptions = {}): Promise<GeocodeFeature[]> {
  if (!query.trim()) return [];
  const mapboxToken = await getMapboxToken();
  const limit = Math.max(1, Math.min(20, Number(options.limit ?? 5) || 5));
  const types = Array.isArray(options.types) && options.types.length ? `&types=${options.types.join(',')}` : '';
  const language = options.language ? `&language=${options.language}` : '&language=en,hi';
  const proximity =
    Array.isArray(options.proximity) && options.proximity.length === 2
      ? `&proximity=${options.proximity[0]},${options.proximity[1]}`
      : '';
  const bbox =
    Array.isArray(options.bbox) && options.bbox.length === 4
      ? `&bbox=${options.bbox[0]},${options.bbox[1]},${options.bbox[2]},${options.bbox[3]}`
      : '';
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
    query
  )}.json?access_token=${mapboxToken}&autocomplete=true&country=IN&limit=${limit}${types}${language}${proximity}${bbox}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch locations');
  }
  const data = await response.json();
  return data.features ?? [];
}

/** Resolve a city+state to its center coordinates (cached in memory). */
export async function getCityCenter(city: string, state: string): Promise<{
  center: [number, number] | null;
  bbox: [number, number, number, number] | null;
}> {
  const key = `${city.trim().toLowerCase()}|${state.trim().toLowerCase()}`;
  const cached = cityCenterCache.get(key);
  if (cached !== undefined) {
    const c = cached?.center ?? null;
    const b = (cached?.bbox as any) ?? null;
    return { center: c as [number, number] | null, bbox: b as [number, number, number, number] | null };
  }
  try {
    const results = await searchPlaces(`${city}, ${state}`.trim(), { limit: 1, types: ['place'] });
    const feature = results?.[0] ?? null;
    cityCenterCache.set(key, feature as any);
    const center = (feature?.center ?? null) as [number, number] | null;
    const bbox = (feature?.bbox ?? null) as [number, number, number, number] | null;
    return { center, bbox };
  } catch {
    cityCenterCache.set(key, null);
    return { center: null, bbox: null };
  }
}

export async function getRouteDistance(
  pickup: [number, number],
  drop: [number, number]
): Promise<number> {
  const mapboxToken = await getMapboxToken();
  const coords = `${pickup[0]},${pickup[1]};${drop[0]},${drop[1]}`;
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?access_token=${mapboxToken}&overview=false&geometries=geojson`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch route');
  }
  const data = await response.json();
  const distanceMeters = data.routes?.[0]?.distance ?? 0;
  return distanceMeters / 1000;
}

export async function reverseGeocode(lng: number, lat: number, language = 'en,hi'): Promise<string> {
  const mapboxToken = await getMapboxToken();
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${mapboxToken}&limit=1&country=IN&language=${language}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to reverse geocode');
  }
  const data = (await response.json()) as { features?: ReverseGeocodeFeature[] };
  return String(data.features?.[0]?.place_name ?? '').trim();
}

export async function reverseGeocodeFeatures(lng: number, lat: number, limit = 6, language = 'en,hi'): Promise<MapboxReverseGeocodeFeature[]> {
  const mapboxToken = await getMapboxToken();
  const lim = Math.max(1, Math.min(10, Number(limit) || 6));
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${mapboxToken}&limit=${lim}&country=IN&language=${language}&types=address,poi,place,locality,neighborhood`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to reverse geocode');
  }
  const data = (await response.json()) as { features?: MapboxReverseGeocodeFeature[] };
  return (data.features ?? []) as any;
}

export async function reverseGeocodeDetails(lng: number, lat: number, language = 'en,hi'): Promise<MapboxReverseGeocodeFeature | null> {
  const mapboxToken = await getMapboxToken();
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${mapboxToken}&limit=1&country=IN&language=${language}&types=address,poi,place,locality,neighborhood`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to reverse geocode');
  }
  const data = (await response.json()) as { features?: MapboxReverseGeocodeFeature[] };
  return (data.features?.[0] ?? null) as any;
}