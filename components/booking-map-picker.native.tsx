import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import MapView, { Marker, UrlTile } from 'react-native-maps';
import { Button, Dialog, Text, XStack, YStack } from 'tamagui';

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
  const googleMapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

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
                  Map is disabled on Android until Google Maps API key is configured.
                </Text>
              </YStack>
            ) : !props.token ? (
              <YStack backgroundColor="#F8FAFC" borderRadius={12} padding={12} borderWidth={1} borderColor="#E5E7EB">
                <Text color="#64748B" fontSize={12} textAlign="center">
                  Mapbox token missing.
                </Text>
              </YStack>
            ) : (
              <YStack height={320} borderRadius={12} overflow="hidden" borderWidth={1} borderColor="#E5E7EB">
                <MapView
                  style={StyleSheet.absoluteFillObject}
                  region={{
                    latitude: props.coord?.lat ?? 19.076,
                    longitude: props.coord?.lng ?? 72.8777,
                    latitudeDelta: 0.03,
                    longitudeDelta: 0.03,
                  }}
                  onPress={(e) => {
                    const c = e.nativeEvent.coordinate;
                    props.onCoordChange({ lat: c.latitude, lng: c.longitude });
                  }}>
                  <UrlTile
                    urlTemplate={`https://api.mapbox.com/styles/v1/mapbox/streets-v11/tiles/256/{z}/{x}/{y}@2x?access_token=${props.token}`}
                    maximumZ={19}
                  />
                  {props.coord ? <Marker coordinate={{ latitude: props.coord.lat, longitude: props.coord.lng }} /> : null}
                </MapView>
              </YStack>
            )}

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
                disabled={
                  props.busy ||
                  !props.coord ||
                  !props.token ||
                  (Platform.OS === 'android' && !googleMapsKey)
                }>
                {props.busy ? 'Saving…' : 'Confirm'}
              </Button>
            </XStack>
          </YStack>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}
