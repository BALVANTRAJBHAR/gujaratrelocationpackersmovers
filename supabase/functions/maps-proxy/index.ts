import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { corsHeaders } from '../_shared/cors.ts';

/**
 * maps-proxy
 * ----------
 * Server-side proxy around the Google Maps APIs so the API key stays out of
 * the client bundle and browser CORS restrictions are bypassed.
 *
 * Endpoint: POST /functions/v1/maps-proxy
 * Body:
 *   { action: 'search',      query, lat?, lng?, limit? }
 *   { action: 'autocomplete', input, sessionToken, lat?, lng?, bbox? }
 *   { action: 'place-details', placeId, sessionToken? }
 *   { action: 'geocode',     address }
 *   { action: 'reverse',     lat,  lng }
 *   { action: 'directions',  originLat, originLng, destLat, destLng }
 *
 * Returns the raw Google JSON (or { error }) so the client lib can shape it.
 */

const PLACES_V1 = 'https://places.googleapis.com/v1';
const GEOCODING_V1 = 'https://maps.googleapis.com/maps/api/geocode/json';
const DIRECTIONS_V1 = 'https://maps.googleapis.com/maps/api/directions/json';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function fail(message: string, status = 400): Response {
  return json({ error: message }, status);
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function bbox(value: unknown): [number, number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const parsed = value.map(Number);
  if (parsed.some((item) => !Number.isFinite(item))) return null;
  const [west, south, east, north] = parsed;
  return west < east && south < north ? [west, south, east, north] : null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('Method not allowed', 405);

  const key = Deno.env.get('GOOGLE_MAPS_API_KEY') ?? '';
  if (!key) return fail('GOOGLE_MAPS_API_KEY is not configured', 500);

  const body = await readBody(req);
  const action = str(body.action);

  try {
    if (action === 'search') {
      const query = str(body.query);
      if (!query) return fail('query is required');
      const pageSize = num(body.limit);
      const lat = num(body.lat);
      const lng = num(body.lng);
      const bounds = bbox(body.bbox);

      const payload: Record<string, unknown> = {
        textQuery: query.slice(0, 256),
        languageCode: 'en',
        regionCode: 'IN',
      };
      if (pageSize) payload.pageSize = Math.max(1, Math.min(20, Math.floor(pageSize)));
      if (lat !== null && lng !== null) {
        payload.locationBias = {
          circle: { center: { latitude: lat, longitude: lng }, radius: 50000 },
        };
      }
      if (bounds) {
        const [west, south, east, north] = bounds;
        // A selected city is a hard boundary for locality/landmark discovery.
        delete payload.locationBias;
        payload.locationRestriction = {
          rectangle: {
            low: { latitude: south, longitude: west },
            high: { latitude: north, longitude: east },
          },
        };
      }

      const res = await fetch(`${PLACES_V1}/places:searchText`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask':
            'places.id,places.formattedAddress,places.displayName,places.location,places.types,places.addressComponents,places.placeType',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.error(`[maps-proxy] search failed ${res.status}: ${text}`);
        return fail(`Places API error (${res.status})`, 502);
      }
      const data = await res.json();
      return json({ places: data?.places ?? [] });
    }

    if (action === 'autocomplete') {
      const input = str(body.input);
      const sessionToken = str(body.sessionToken);
      const lat = num(body.lat);
      const lng = num(body.lng);
      const bounds = bbox(body.bbox);
      if (!input) return fail('input is required');
      if (!sessionToken) return fail('sessionToken is required');

      const payload: Record<string, unknown> = {
        input: input.slice(0, 256),
        sessionToken,
        includedRegionCodes: ['IN'],
        regionCode: 'IN',
        languageCode: str(body.language) || 'en',
      };
      if (bounds) {
        const [west, south, east, north] = bounds;
        payload.locationRestriction = {
          rectangle: {
            low: { latitude: south, longitude: west },
            high: { latitude: north, longitude: east },
          },
        };
      } else if (lat !== null && lng !== null) {
        payload.locationBias = {
          circle: { center: { latitude: lat, longitude: lng }, radius: 50000 },
        };
      }

      const res = await fetch(`${PLACES_V1}/places:autocomplete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat,suggestions.placePrediction.types',
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.error(`[maps-proxy] autocomplete failed ${res.status}: ${text}`);
        return fail(`Places Autocomplete API error (${res.status})`, 502);
      }
      const data = await res.json();
      return json({ suggestions: data?.suggestions ?? [] });
    }

    if (action === 'place-details') {
      const placeId = str(body.placeId);
      const sessionToken = str(body.sessionToken);
      if (!placeId) return fail('placeId is required');
      const params = new URLSearchParams();
      if (sessionToken) params.set('sessionToken', sessionToken);
      const res = await fetch(`${PLACES_V1}/places/${encodeURIComponent(placeId)}?${params.toString()}`, {
        headers: {
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,types,addressComponents,viewport',
        },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.error(`[maps-proxy] place details failed ${res.status}: ${text}`);
        return fail(`Place Details API error (${res.status})`, 502);
      }
      return json({ place: await res.json() });
    }

    if (action === 'geocode') {
      const address = str(body.address);
      if (!address) return fail('address is required');
      const url = `${GEOCODING_V1}?key=${encodeURIComponent(key)}&address=${encodeURIComponent(address)}&region=IN&language=en`;
      const data = await (await fetch(url)).json();
      return json(data);
    }

    if (action === 'reverse') {
      const lat = num(body.lat);
      const lng = num(body.lng);
      if (lat === null || lng === null) return fail('lat and lng are required');
      const url = `${GEOCODING_V1}?key=${encodeURIComponent(key)}&latlng=${lat},${lng}&region=IN&language=en`;
      const data = await (await fetch(url)).json();
      return json(data);
    }

    if (action === 'directions') {
      const oLat = num(body.originLat);
      const oLng = num(body.originLng);
      const dLat = num(body.destLat);
      const dLng = num(body.destLng);
      if (oLat === null || oLng === null || dLat === null || dLng === null) {
        return fail('originLat, originLng, destLat and destLng are required');
      }
      const url = `${DIRECTIONS_V1}?key=${encodeURIComponent(key)}&mode=driving&origin=${oLat},${oLng}&destination=${dLat},${dLng}`;
      const data = await (await fetch(url)).json();
      return json(data);
    }

    return fail(`Unsupported action: ${action}`);
  } catch (err) {
    console.error('[maps-proxy] unexpected error:', err);
    return fail('Internal proxy error', 500);
  }
});
