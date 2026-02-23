import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { Text, YStack } from 'tamagui';

type LocationPickerMapProps = {
  token: string;
  latitude: number;
  longitude: number;
  onSelect: (coords: [number, number]) => void;
};

export default function LocationPickerMap({ token, latitude, longitude, onSelect }: LocationPickerMapProps) {
  const googleMapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

  if (!token) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" padding={16} backgroundColor="#0B1220">
        <Text color="#94A3B8" fontSize={12} textAlign="center">
          Add Mapbox token to enable map selection.
        </Text>
      </YStack>
    );
  }

  if (Platform.OS === 'android' && !googleMapsKey) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" padding={16} backgroundColor="#0B1220">
        <Text color="#94A3B8" fontSize={12} textAlign="center">
          Map is disabled on Android until Google Maps API key is configured.
        </Text>
      </YStack>
    );
  }

  return (
    <MapView
      style={StyleSheet.absoluteFillObject}
      region={{ latitude, longitude, latitudeDelta: 0.04, longitudeDelta: 0.04 }}
      onPress={(event) => {
        const { latitude: lat, longitude: lng } = event.nativeEvent.coordinate;
        onSelect([lng, lat]);
      }}>
      <Marker coordinate={{ latitude, longitude }} />
    </MapView>
  );
}
