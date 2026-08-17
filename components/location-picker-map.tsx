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
        <Text color="#64748B" fontSize={12} textAlign="center">
          Add Google Maps key to enable map preview.
        </Text>
      </YStack>
    );
  }

  const url = `https://maps.googleapis.com/maps/api/staticmap?center=${latitude},${longitude}&zoom=14&size=800x400&scale=2&markers=color:red%7C${latitude},${longitude}&key=${encodeURIComponent(token)}`;

  return <Image source={{ uri: url }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />;
}
