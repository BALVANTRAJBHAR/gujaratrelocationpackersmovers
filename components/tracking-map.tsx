// Web version — uses Google Maps Static/Embed API (no mapbox-gl dependency)
import React from 'react';
import { Platform } from 'react-native';
import { Text, YStack } from 'tamagui';

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
}: TrackingMapProps) {
  if (!token) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center">
        <Text color="#94A3B8" fontSize={12}>Add Google Maps key to enable map.</Text>
      </YStack>
    );
  }

  if (Platform.OS !== 'web') {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center">
        <Text color="#94A3B8" fontSize={12}>Map not available on this platform.</Text>
      </YStack>
    );
  }

  // Build markers string for Static Maps
  const markers: string[] = [];
  if (pickupLat != null && pickupLng != null) {
    markers.push(`color:green|label:P|${pickupLat},${pickupLng}`);
  }
  if (dropLat != null && dropLng != null) {
    markers.push(`color:red|label:D|${dropLat},${dropLng}`);
  }
  if (hasLiveLocation) {
    markers.push(`color:orange|label:T|${latitude},${longitude}`);
  }

  // Use Google Maps Embed with a pin
  const center = `${latitude},${longitude}`;
  const embedUrl = `https://www.google.com/maps/embed/v1/place?key=${token}&q=${center}&zoom=13`;

  return (
    <YStack flex={1} borderRadius={18} overflow="hidden" width="100%" height="100%">
      {typeof window !== 'undefined' ? (
        <iframe
          src={embedUrl}
          style={{ width: '100%', height: '100%', border: 0 }}
          allowFullScreen
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          title="Tracking Map"
        />
      ) : (
        <YStack flex={1} alignItems="center" justifyContent="center">
          <Text color="#94A3B8" fontSize={12}>Loading map...</Text>
        </YStack>
      )}
    </YStack>
  );
}
