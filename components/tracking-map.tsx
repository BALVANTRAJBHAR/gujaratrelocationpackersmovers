import React, { useEffect, useRef } from 'react';
import { Image, Platform, StyleSheet } from 'react-native';
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
  const pickupMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const dropMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const driverMarkerRef = useRef<mapboxgl.Marker | null>(null);

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
      // ignore
    }

    mapRef.current = map;

    map.on('load', () => {
      map.resize();
    });

    return () => {
      try {
        pickupMarkerRef.current?.remove();
        dropMarkerRef.current?.remove();
        driverMarkerRef.current?.remove();
        pickupMarkerRef.current = null;
        dropMarkerRef.current = null;
        driverMarkerRef.current = null;
        map.remove();
        mapRef.current = null;
      } catch {
      }
    };
  }, [isWeb, token]);

  useEffect(() => {
    if (!isWeb) return;
    const map = mapRef.current;
    if (!map) return;

    pickupMarkerRef.current?.remove();
    dropMarkerRef.current?.remove();
    driverMarkerRef.current?.remove();
    pickupMarkerRef.current = null;
    dropMarkerRef.current = null;
    driverMarkerRef.current = null;

    const bounds = new mapboxgl.LngLatBounds();

    if (pickupLat != null && pickupLng != null) {
      pickupMarkerRef.current = new mapboxgl.Marker({ color: '#22C55E' })
        .setLngLat([pickupLng, pickupLat])
        .setPopup(new mapboxgl.Popup({ offset: 25 }).setText(pickupAddress || 'Pickup'))
        .addTo(map);
      bounds.extend([pickupLng, pickupLat]);
    }

    if (dropLat != null && dropLng != null) {
      dropMarkerRef.current = new mapboxgl.Marker({ color: '#EF4444' })
        .setLngLat([dropLng, dropLat])
        .setPopup(new mapboxgl.Popup({ offset: 25 }).setText(dropAddress || 'Drop'))
        .addTo(map);
      bounds.extend([dropLng, dropLat]);
    }

    if (hasLiveLocation) {
      driverMarkerRef.current = new mapboxgl.Marker({ color: '#F97316' })
        .setLngLat([longitude, latitude])
        .setPopup(new mapboxgl.Popup({ offset: 25 }).setText('Driver'))
        .addTo(map);
      bounds.extend([longitude, latitude]);
    }

    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 60 });
    }
  }, [isWeb, pickupLat, pickupLng, dropLat, dropLng, hasLiveLocation, latitude, longitude, pickupAddress, dropAddress]);

  if (!token) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center">
        <Text color="#94A3B8" fontSize={12}>Add Mapbox token to enable map.</Text>
      </YStack>
    );
  }

  if (isWeb) {
    return (
      <YStack flex={1} borderRadius={18} overflow="hidden">
        <YStack ref={setMapContainer as any} width="100%" height="100%" />
      </YStack>
    );
  }

  const markers: string[] = [];
  if (pickupLat != null && pickupLng != null) {
    markers.push(`pin-s+22c55e+${pickupLng},${pickupLat}`);
  }
  if (dropLat != null && dropLng != null) {
    markers.push(`pin-s+ef4444+${dropLng},${dropLat}`);
  }
  if (hasLiveLocation) {
    markers.push(`pin-s+f97316+${longitude},${latitude}`);
  }

  const markerPath = markers.length > 0 ? `${markers.join(',')}/` : '';
  const centerCoord =
    markers.length > 0 ? 'auto' : `${longitude},${latitude},14`;
  const url = `https://api.mapbox.com/styles/v1/mapbox/streets-v11/static/${markerPath}${centerCoord}/800x400?access_token=${token}`;

  return <Image source={{ uri: url }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />;
}
