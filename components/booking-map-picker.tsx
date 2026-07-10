import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView } from 'react-native';
import { Button, Dialog, Input, Text, XStack, YStack } from 'tamagui';

import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { searchPlaces } from '@/lib/mapbox';

type Coord = { lat: number; lng: number };

type GeocodeFeature = {
  id: string;
  place_name: string;
  center: [number, number];
};

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
  /** Changes when pickup/drop opens — clears search state */
  resetKey?: string;
}) {
  const isWeb = Platform.OS === 'web';

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const skipNextSearchRef = useRef(false);
  const selectedPlaceRef = useRef('');

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GeocodeFeature[]>([]);
  const [searching, setSearching] = useState(false);

  const setMapContainer = useCallback((node: any) => {
    mapContainerRef.current = (node as HTMLDivElement) ?? null;
  }, []);

  useEffect(() => {
    if (!props.open) return;
    setSearchQuery('');
    setSearchResults([]);
    setSearching(false);
    skipNextSearchRef.current = false;
    selectedPlaceRef.current = '';
  }, [props.open, props.resetKey]);

  useEffect(() => {
    if (!isWeb) return;
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    if (skipNextSearchRef.current) {
      skipNextSearchRef.current = false;
      return;
    }
    if (selectedPlaceRef.current && searchQuery.trim() === selectedPlaceRef.current) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchPlaces(searchQuery);
        setSearchResults(results as GeocodeFeature[]);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [isWeb, searchQuery]);

  const handleSelectResult = useCallback(
    (result: GeocodeFeature) => {
      const [lng, lat] = result.center;
      props.onCoordChange({ lat, lng });
      selectedPlaceRef.current = result.place_name;
      skipNextSearchRef.current = true;
      setSearchQuery(result.place_name);
      setSearchResults([]);
      setSearching(false);
      const map = mapRef.current;
      if (map) {
        map.flyTo({ center: [lng, lat], zoom: 14 });
      }
    },
    [props.onCoordChange]
  );

  const showNoResults =
    Boolean(searchQuery.trim()) &&
    !searching &&
    searchResults.length === 0 &&
    searchQuery.trim() !== selectedPlaceRef.current;

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

            {!props.token ? (
              <YStack backgroundColor="#F8FAFC" borderRadius={12} padding={12} borderWidth={1} borderColor="#E5E7EB">
                <Text color="#64748B" fontSize={12} textAlign="center">
                  Mapbox token missing.
                </Text>
              </YStack>
            ) : (
              <YStack gap="$2">
                <Input
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search area..."
                  backgroundColor="#FFFFFF"
                  borderColor="#E5E7EB"
                  color="#111827"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {searching ? (
                  <Text color="#64748B" fontSize={12}>Searching...</Text>
                ) : searchResults.length > 0 ? (
                  <ScrollView
                    style={{ maxHeight: 160, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, backgroundColor: '#FFFFFF' }}
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled>
                    {searchResults.map((result) => (
                      <Pressable key={result.id} onPress={() => handleSelectResult(result)}>
                        <YStack padding={10} borderBottomWidth={1} borderBottomColor="#F1F5F9">
                          <Text color="#1E293B" fontSize={13}>{result.place_name}</Text>
                        </YStack>
                      </Pressable>
                    ))}
                  </ScrollView>
                ) : null}
                {showNoResults ? (
                  <Text color="#64748B" fontSize={12}>No results found.</Text>
                ) : null}
                <YStack height={280} borderRadius={12} overflow="hidden" borderWidth={1} borderColor="#E5E7EB" style={{ position: 'relative' } as any}>
                  <YStack ref={setMapContainer as any} width="100%" height="100%" />
                </YStack>
              </YStack>
            )}

            {props.coord ? (
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
                color="#FFFFFF"
                hoverStyle={{ backgroundColor: '#EA580C' } as any}
                pressStyle={{ backgroundColor: '#C2410C' } as any}
                onPress={() => void props.onConfirm()}
                disabled={props.busy || !props.coord || !props.token}>
                {props.busy ? 'Saving\u2026' : 'Confirm'}
              </Button>
            </XStack>
          </YStack>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}
