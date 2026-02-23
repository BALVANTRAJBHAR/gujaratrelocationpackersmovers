import { getMapboxToken } from '@/lib/public-config';

type GeocodeFeature = {
  id: string;
  place_name: string;
  center: [number, number];
};

export async function searchPlaces(query: string): Promise<GeocodeFeature[]> {
  if (!query.trim()) return [];
  const mapboxToken = await getMapboxToken();
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
    query
  )}.json?access_token=${mapboxToken}&autocomplete=true&country=IN&limit=5`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch locations');
  }
  const data = await response.json();
  return data.features ?? [];
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
