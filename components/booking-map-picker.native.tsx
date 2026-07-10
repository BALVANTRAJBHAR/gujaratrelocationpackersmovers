import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Button, Dialog, Text, XStack, YStack } from 'tamagui';

import { reverseGeocode } from '@/lib/mapbox';
import { getGoogleMapsKey } from '@/lib/public-config';

type Coord = { lat: number; lng: number };

export default function BookingMapPicker(props: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  title: string;
  token: string;
  coord: Coord | null;
  onCoordChange: (next: Coord) => void;
  onConfirm: () => Promise<void> | void;
  busy: boolean;
  isWide: boolean;
}) {
  const mapRef = useRef<MapView>(null);
  const [googleMapsKey, setGoogleMapsKey] = useState(process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '');

  useEffect(() => {
    if (!googleMapsKey) {
      getGoogleMapsKey().then(setGoogleMapsKey).catch(() => {});
    }
  }, []);

  const handlePress = useCallback(
    async (e: any) => {
      const c = e.nativeEvent.coordinate;
      props.onCoordChange({ lat: c.latitude, lng: c.longitude });
      mapRef.current?.animateCamera({ center: { latitude: c.latitude, longitude: c.longitude }, zoom: 14 }, { duration: 400 });
    },
    [props.onCoordChange],
  );

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay opacity={0.6} backgroundColor="#0F172A" />
        <Dialog.Content backgroundColor="#FFFFFF" borderRadius={16} padding={16} width={props.isWide ? 680 : '92%'}>
          <YStack gap="$3">
            <Text fontSize={16} fontWeight="900" color="#111827">
              {props.title}
            </Text>

            {Platform.OS === 'android' && !googleMapsKey ? (
              <YStack backgroundColor="#F8FAFC" borderRadius={12} padding={12} borderWidth={1} borderColor="#E5E7EB">
                <Text color="#64748B" fontSize={12} textAlign="center">
                  Map is disabled until Google Maps API key is configured.
                </Text>
              </YStack>
            ) : (
              <YStack height={320} borderRadius={12} overflow="hidden" borderWidth={1} borderColor="#E5E7EB">
                <MapView
                  ref={mapRef}
                  style={StyleSheet.absoluteFillObject}
                  provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
                  region={{
                    latitude: props.coord?.lat ?? 19.076,
                    longitude: props.coord?.lng ?? 72.8777,
                    latitudeDelta: 0.03,
                    longitudeDelta: 0.03,
                  }}
                  onPress={handlePress}
                  showsUserLocation={false}
                  showsMyLocationButton={false}
                  rotateEnabled={false}
                  pitchEnabled={false}>
                  {props.coord ? <Marker coordinate={{ latitude: props.coord.lat, longitude: props.coord.lng }} /> : null}
                </MapView>
              </YStack>
            )}

            {props.coord ? (
              <Text color="#64748B" fontSize={12} textAlign="center">
                Lat: {props.coord.lat.toFixed(6)}  Lng: {props.coord.lng.toFixed(6)}
              </Text>
            ) : null}

            <XStack justifyContent="space-between" gap="$2" flexWrap="wrap">
              <Button
                size="$3"
                backgroundColor="#FFFFFF"
                borderColor="#E5E7EB"
                borderWidth={1}
                color="#0F172A"
                onPress={() => props.onOpenChange(false)}
                disabled={props.busy}>
                Cancel
              </Button>
              <Button
                size="$3"
                backgroundColor="#F97316"
                color="#0B0B12"
                onPress={() => void props.onConfirm()}
                disabled={props.busy || !props.coord || (Platform.OS === 'android' && !googleMapsKey)}>
                {props.busy ? 'Saving\u2026' : 'Confirm'}
              </Button>
            </XStack>
          </YStack>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}
