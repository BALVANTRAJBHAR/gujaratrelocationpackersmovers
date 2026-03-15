import React from 'react';
import { Platform } from 'react-native';
import { Button, Dialog, Text, XStack, YStack } from 'tamagui';

import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

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
  const isWeb = Platform.OS === 'web';

  const mapContainerRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<mapboxgl.Map | null>(null);
  const markerRef = React.useRef<mapboxgl.Marker | null>(null);

  const setMapContainer = React.useCallback((node: any) => {
    mapContainerRef.current = (node as HTMLDivElement) ?? null;
  }, []);

  React.useEffect(() => {
    if (!isWeb) return;
    if (!props.open) return;
    if (!props.token) return;
    if (!mapContainerRef.current) return;

    mapboxgl.accessToken = props.token;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/streets-v11',
      center: [props.coord?.lng ?? 72.8777, props.coord?.lat ?? 19.076],
      zoom: 11,
    });

    try {
      map.scrollZoom.setWheelZoomRate(1 / 120);
      map.scrollZoom.setZoomRate(1 / 120);
    } catch {
      // ignore
    }

    mapRef.current = map;

    const onClick = (e: mapboxgl.MapMouseEvent) => {
      props.onCoordChange({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    };

    map.on('click', onClick);

    map.on('load', () => {
      map.resize();
      if (props.coord) {
        markerRef.current?.remove();
        markerRef.current = new mapboxgl.Marker().setLngLat([props.coord.lng, props.coord.lat]).addTo(map);
      }
    });

    return () => {
      try {
        markerRef.current?.remove();
        markerRef.current = null;
        map.off('click', onClick);
        map.remove();
        mapRef.current = null;
      } catch {
      }
    };
  }, [isWeb, props.open, props.token]);

  React.useEffect(() => {
    if (!isWeb) return;
    const map = mapRef.current;
    if (!map) return;

    if (props.coord) {
      markerRef.current?.remove();
      markerRef.current = new mapboxgl.Marker().setLngLat([props.coord.lng, props.coord.lat]).addTo(map);
    } else {
      markerRef.current?.remove();
      markerRef.current = null;
    }
  }, [isWeb, props.coord?.lat, props.coord?.lng]);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay opacity={0.6} backgroundColor="#0F172A" />
        <Dialog.Content backgroundColor="#FFFFFF" borderRadius={16} padding={16} width={props.isWide ? 680 : '92%'}>
          <YStack gap="$3">
            <Text fontSize={16} fontWeight="900" color="#111827">
              {props.title}
            </Text>

            {!isWeb ? (
              <YStack backgroundColor="#F8FAFC" borderRadius={12} padding={12} borderWidth={1} borderColor="#E5E7EB">
                <Text color="#64748B" fontSize={12} textAlign="center">
                  Map picker is available on web only.
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
                <YStack
                  ref={setMapContainer as any}
                  width="100%"
                  height="100%"
                />
              </YStack>
            )}

            {isWeb && props.coord ? (
              <Text color="#64748B" fontSize={12}>
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
                disabled={props.busy || !props.coord || !props.token}>
                {props.busy ? 'Saving…' : 'Confirm'}
              </Button>
            </XStack>
          </YStack>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}
