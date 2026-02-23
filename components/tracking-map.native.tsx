import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import MapView, { Marker, UrlTile } from 'react-native-maps';
import { Text, YStack } from 'tamagui';

type TrackingMapProps = {
  token: string;
  latitude: number;
  longitude: number;
  hasLiveLocation: boolean;
};

export default function TrackingMap({ token, latitude, longitude, hasLiveLocation }: TrackingMapProps) {
  const googleMapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

  if (!token) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center">
        <Text color="#94A3B8" fontSize={12}>Add Mapbox token to enable map.</Text>
      </YStack>
    );
  }

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
      style={StyleSheet.absoluteFillObject}
      region={{
        latitude,
        longitude,
        latitudeDelta: hasLiveLocation ? 0.02 : 0.05,
        longitudeDelta: hasLiveLocation ? 0.02 : 0.05,
      }}>
      <UrlTile
        urlTemplate={`https://api.mapbox.com/styles/v1/mapbox/streets-v11/tiles/256/{z}/{x}/{y}@2x?access_token=${token}`}
        maximumZ={19}
      />
      {hasLiveLocation ? (
        <Marker coordinate={{ latitude, longitude }} title="Driver" description="Live position" />
      ) : null}
    </MapView>
  );
}
