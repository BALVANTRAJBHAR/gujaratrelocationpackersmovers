import React from 'react';
import { Image, StyleSheet } from 'react-native';
import { Text, YStack } from 'tamagui';

type LocationPickerMapProps = {
  token: string;
  latitude: number;
  longitude: number;
  onSelect: (coords: [number, number]) => void;
};

export default function LocationPickerMap({ token, latitude, longitude }: LocationPickerMapProps) {
  if (!token) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" padding={16} backgroundColor="#0B1220">
        <Text color="#94A3B8" fontSize={12} textAlign="center">
          Add Mapbox token to enable map preview.
        </Text>
      </YStack>
    );
  }

  const url = `https://api.mapbox.com/styles/v1/mapbox/streets-v11/static/${longitude},${latitude},14,0/800x400?access_token=${token}`;

  return <Image source={{ uri: url }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />;
}
