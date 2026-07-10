import React, { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { Text, YStack } from 'tamagui';

import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

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
  const mapRef = useRef<mapboxgl.Map | null>(null);

  const setMapContainer = React.useCallback((node: any) => {
    mapContainerRef.current = (node as HTMLDivElement) ?? null;
  }, []);

  useEffect(() => {
    if (!isWeb) return;
    if (!token) return;
    if (!mapContainerRef.current) return;

    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/streets-v11',
      center: [longitude, latitude],
      zoom: 12,
    });

    try {
      map.scrollZoom.setWheelZoomRate(1 / 120);
      map.scrollZoom.setZoomRate(1 / 120);
    } catch {
    }

    mapRef.current = map;

    map.on('load', () => {
      map.resize();
      const markers = [
        pickupLat != null && pickupLng != null ? { color: '#22C55E', lat: pickupLat, lng: pickupLng, label: pickupAddress || 'Pickup' } : null,
        dropLat != null && dropLng != null ? { color: '#EF4444', lat: dropLat, lng: dropLng, label: dropAddress || 'Drop' } : null,
        hasLiveLocation ? { color: '#F97316', lat: latitude, lng: longitude, label: 'Driver' } : null,
      ].filter(Boolean) as { color: string; lat: number; lng: number; label: string }[];

      markers.forEach((m) => {
        new mapboxgl.Marker({ color: m.color })
          .setLngLat([m.lng, m.lat])
          .setPopup(new mapboxgl.Popup({ offset: 25 }).setText(m.label))
          .addTo(map);
      });

      if (markers.length > 0) {
        const b = new mapboxgl.LngLatBounds();
        markers.forEach((m) => b.extend([m.lng, m.lat]));
        map.fitBounds(b, { padding: 60 });
      }
    });

    return () => {
      try {
        map.remove();
        mapRef.current = null;
      } catch {
      }
    };
  }, [isWeb, token, latitude, longitude, hasLiveLocation, pickupLat, pickupLng, dropLat, dropLng, pickupAddress, dropAddress]);

  if (!token) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center">
        <Text color="#94A3B8" fontSize={12}>Add Mapbox token to enable map.</Text>
      </YStack>
    );
  }

  return (
    <YStack flex={1} borderRadius={18} overflow="hidden">
      <YStack ref={setMapContainer as any} width="100%" height="100%" />
    </YStack>
  );
}
