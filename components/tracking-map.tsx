import React from 'react';
import { Image, StyleSheet } from 'react-native';
import { Text, YStack } from 'tamagui';

type TrackingMapProps = {
  token: string;
  latitude: number;
  longitude: number;
  hasLiveLocation: boolean;
};

export default function TrackingMap({ token, latitude, longitude, hasLiveLocation }: TrackingMapProps) {
  if (!token) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center">
        <Text color="#94A3B8" fontSize={12}>Add Mapbox token to enable map.</Text>
      </YStack>
    );
  }

  const marker = hasLiveLocation ? `pin-s+f97316(${longitude},${latitude})/` : '';
  const url = `https://api.mapbox.com/styles/v1/mapbox/streets-v11/static/${marker}${longitude},${latitude},14,0/800x400?access_token=${token}`;

  return <Image source={{ uri: url }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />;
}
