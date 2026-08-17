import React, { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { Text, YStack } from 'tamagui';

import { loadGoogleMaps } from '@/lib/load-google-maps';

type TrackingMapProps = {
  token: string;
  latitude: number;
  longitude: number;
  hasLiveLocation: boolean;
  pickupLat?: number;
  pickupLng?: number;
  dropLat?: number;
  dropLng?: number;
  pickupAddress?: string;
  dropAddress?: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default function TrackingMap({
  token,
  latitude,
  longitude,
  hasLiveLocation,
  pickupLat,
  pickupLng,
  dropLat,
  dropLng,
  pickupAddress,
  dropAddress,
}: TrackingMapProps) {
  const isWeb = Platform.OS === 'web';
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const googleMapsRef = useRef<any>(null);

  const setMapContainer = React.useCallback((node: any) => {
    mapContainerRef.current = (node as HTMLDivElement) ?? null;
  }, []);

  useEffect(() => {
    if (!isWeb) return;
    if (!token) return;
    if (!mapContainerRef.current) return;

    let cancelled = false;
    let map: any = null;
    const markers: any[] = [];

    loadGoogleMaps(token)
      .then((googleMaps) => {
        if (cancelled || !mapContainerRef.current) return;
        googleMapsRef.current = googleMaps;
        map = new googleMaps.Map(mapContainerRef.current, {
          center: { lat: latitude, lng: longitude },
          zoom: 12,
          fullscreenControl: false,
          streetViewControl: false,
          mapTypeControl: true,
          mapTypeControlOptions: {
            style: googleMaps.MapTypeControlStyle.HORIZONTAL_BAR,
            mapTypeIds: ['roadmap', 'satellite', 'hybrid'],
          },
          zoomControl: true,
        });
        mapRef.current = map;

        googleMaps.event.addListenerOnce(map, 'idle', () => {
          if (cancelled) return;
          const items = [
            pickupLat != null && pickupLng != null ? { color: '#22C55E', lat: pickupLat, lng: pickupLng, label: pickupAddress || 'Pickup' } : null,
            dropLat != null && dropLng != null ? { color: '#EF4444', lat: dropLat, lng: dropLng, label: dropAddress || 'Drop' } : null,
            hasLiveLocation ? { color: '#F97316', lat: latitude, lng: longitude, label: 'Driver' } : null,
          ].filter(Boolean) as { color: string; lat: number; lng: number; label: string }[];

          const bounds = new googleMaps.LatLngBounds();
          items.forEach((m) => {
            const marker = new googleMaps.Marker({
              map,
              position: { lat: m.lat, lng: m.lng },
              icon: {
                path: googleMaps.SymbolPath.CIRCLE,
                scale: 9,
                fillColor: m.color,
                fillOpacity: 1,
                strokeColor: '#FFFFFF',
                strokeWeight: 2.5,
              },
            });
            const info = new googleMaps.InfoWindow({
              content: `<div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; font-size: 12px; padding: 4px 2px;">${escapeHtml(m.label)}</div>`,
            });
            marker.addListener('click', () => info.open({ map, anchor: marker }));
            markers.push(marker);
            bounds.extend(marker.getPosition());
          });

          if (items.length > 0) {
            map.fitBounds(bounds, 60);
          }
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      try {
        markers.forEach((marker) => marker.setMap(null));
        markers.length = 0;
        if (map) {
          googleMapsRef.current?.event.clearInstanceListeners(map);
          map = null;
        }
        mapRef.current = null;
      } catch {
        // ignore
      }
    };
  }, [isWeb, token, latitude, longitude, hasLiveLocation, pickupLat, pickupLng, dropLat, dropLng, pickupAddress, dropAddress]);

  if (!token) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center">
        <Text color="#64748B" fontSize={12}>Add Google Maps key to enable map.</Text>
      </YStack>
    );
  }

  return (
    <YStack flex={1} borderRadius={18} overflow="hidden">
      <YStack ref={setMapContainer as any} width="100%" height="100%" />
    </YStack>
  );
}
