import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Text, YStack } from 'tamagui';

import { getGoogleMapsKey } from '@/lib/public-config';

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
  const mapRef = useRef<MapView>(null);
  const [googleMapsKey, setGoogleMapsKey] = useState(process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '');

  useEffect(() => {
    if (!googleMapsKey) {
      getGoogleMapsKey().then(setGoogleMapsKey).catch(() => {});
    }
  }, []);

  const fitToMarkers = () => {
    const markers: { latitude: number; longitude: number }[] = [];
    if (pickupLat != null && pickupLng != null) markers.push({ latitude: pickupLat, longitude: pickupLng });
    if (dropLat != null && dropLng != null) markers.push({ latitude: dropLat, longitude: dropLng });
    if (hasLiveLocation) markers.push({ latitude, longitude });
    if (markers.length > 0) {
      mapRef.current?.fitToCoordinates(markers, { edgePadding: { top: 80, right: 80, bottom: 80, left: 80 }, animated: true });
    }
  };

  useEffect(() => {
    setTimeout(fitToMarkers, 300);
  }, [pickupLat, pickupLng, dropLat, dropLng, hasLiveLocation, latitude, longitude]);

  if (Platform.OS === 'android' && !googleMapsKey) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" padding={12}>
        <Text color="#94A3B8" fontSize={12} textAlign="center">
          Map is disabled on Android until Google Maps API key is configured.
        </Text>
      </YStack>
    );
  }

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFillObject}
      provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
      initialRegion={{
        latitude: pickupLat ?? dropLat ?? latitude,
        longitude: pickupLng ?? dropLng ?? longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }}
      rotateEnabled={false}
      pitchEnabled={false}
      showsUserLocation={false}
      showsMyLocationButton={false}
      onMapReady={fitToMarkers}
      onLayout={fitToMarkers}>
      {pickupLat != null && pickupLng != null ? (
        <Marker
          coordinate={{ latitude: pickupLat, longitude: pickupLng }}
          title="Pickup"
          description={pickupAddress ?? 'Pickup location'}
          pinColor="#22C55E"
        />
      ) : null}
      {dropLat != null && dropLng != null ? (
        <Marker
          coordinate={{ latitude: dropLat, longitude: dropLng }}
          title="Drop"
          description={dropAddress ?? 'Drop location'}
          pinColor="#EF4444"
        />
      ) : null}
      {hasLiveLocation ? (
        <Marker
          coordinate={{ latitude, longitude }}
          title="Driver"
          description="Live position"
          pinColor="#F97316"
        />
      ) : null}
    </MapView>
  );
}
