import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { Button, Dialog, Input, Text, XStack, YStack } from 'tamagui';

import {
  autocompletePlaces,
  createGooglePlacesSessionToken,
  resolveAutocompleteSuggestion,
  type GoogleAutocompleteSuggestion,
} from '@/lib/google-maps';
import { loadGoogleMaps } from '@/lib/load-google-maps';

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
  /** Changes when pickup/drop opens — clears search state */
  resetKey?: string;
}) {
  const isWeb = Platform.OS === 'web';

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const googleMapsRef = useRef<any>(null);
  const skipNextSearchRef = useRef(false);
  const selectedPlaceRef = useRef('');
  const placesSessionRef = useRef(createGooglePlacesSessionToken());
  const searchRequestRef = useRef(0);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GoogleAutocompleteSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [resolvingPlace, setResolvingPlace] = useState(false);
  const [currentProximity, setCurrentProximity] = useState<[number, number] | undefined>();

  const setMapContainer = useCallback((node: any) => {
    mapContainerRef.current = (node as HTMLDivElement) ?? null;
  }, []);

  useEffect(() => {
    if (!props.open) return;
    setSearchQuery('');
    setSearchResults([]);
    setSearching(false);
    setResolvingPlace(false);
    skipNextSearchRef.current = false;
    selectedPlaceRef.current = '';
    placesSessionRef.current = createGooglePlacesSessionToken();
    searchRequestRef.current += 1;
  }, [props.open, props.resetKey]);

  // Bias autocomplete toward the current device location whenever the browser
  // already has permission. Map center remains a sensible fallback.
  useEffect(() => {
    if (!isWeb || !props.open || typeof navigator === 'undefined' || !navigator.geolocation) return;
    let active = true;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (active) setCurrentProximity([position.coords.longitude, position.coords.latitude]);
      },
      () => {},
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: 5_000 },
    );
    return () => {
      active = false;
    };
  }, [isWeb, props.open]);

  useEffect(() => {
    if (!isWeb) return;
    if (!searchQuery.trim()) {
      searchRequestRef.current += 1;
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
    const requestId = ++searchRequestRef.current;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const map = mapRef.current;
        const center = map?.getCenter?.();
        const hasCoord = props.coord?.lat != null && props.coord?.lng != null;
        const results = await autocompletePlaces(searchQuery, {
          proximity: currentProximity ?? (center ? [center.lng(), center.lat()] : hasCoord ? [props.coord!.lng, props.coord!.lat] : undefined),
          sessionToken: placesSessionRef.current,
        });
        if (requestId === searchRequestRef.current) setSearchResults(results);
      } catch {
        if (requestId === searchRequestRef.current) setSearchResults([]);
      } finally {
        if (requestId === searchRequestRef.current) setSearching(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [isWeb, searchQuery, currentProximity, props.coord?.lng, props.coord?.lat]);

  const handleSelectResult = useCallback(
    async (result: GoogleAutocompleteSuggestion) => {
      setResolvingPlace(true);
      try {
        const place = await resolveAutocompleteSuggestion({ ...result, sessionToken: placesSessionRef.current });
        if (!place) return;
        const [lng, lat] = place.addressDetails?.markerCoordinate ?? place.center;
        props.onCoordChange({ lat, lng });
        selectedPlaceRef.current = place.place_name;
        skipNextSearchRef.current = true;
        setSearchQuery(place.place_name);
        setSearchResults([]);
        setSearching(false);
        const map = mapRef.current;
        if (map) {
          map.panTo({ lat, lng });
          map.setZoom(17);
        }
      } finally {
        setResolvingPlace(false);
      }
    },
    [props.onCoordChange]
  );

  const handleMyLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        props.onCoordChange({ lat, lng });
        mapRef.current?.panTo({ lat, lng });
        mapRef.current?.setZoom(17);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 0, timeout: 12_000 },
    );
  }, [props.onCoordChange]);

  const showNoResults =
    Boolean(searchQuery.trim()) &&
    !searching &&
    searchResults.length === 0 &&
    searchQuery.trim() !== selectedPlaceRef.current;

  // Create the Google Map once the dialog opens and the key is available.
  React.useEffect(() => {
    if (!isWeb) return;
    if (!props.open) return;
    if (!props.token) return;
    if (!mapContainerRef.current) return;

    let cancelled = false;
    let map: any = null;
    const onClick = (e: any) => {
      props.onCoordChange({ lat: e.latLng.lat(), lng: e.latLng.lng() });
    };

    loadGoogleMaps(props.token)
      .then((googleMaps) => {
        if (cancelled || !mapContainerRef.current) return;
        googleMapsRef.current = googleMaps;
        map = new googleMaps.Map(mapContainerRef.current, {
          center: { lat: props.coord?.lat ?? 19.076, lng: props.coord?.lng ?? 72.8777 },
          zoom: 11,
          fullscreenControl: false,
          streetViewControl: false,
          mapTypeControl: true,
          mapTypeControlOptions: {
            style: googleMaps.MapTypeControlStyle.HORIZONTAL_BAR,
            mapTypeIds: ['roadmap', 'satellite', 'hybrid'],
          },
          zoomControl: true,
        });
        mapRef.current = map;
        map.addListener('click', onClick);
        googleMaps.event.addListenerOnce(map, 'idle', () => {
          if (cancelled) return;
          if (props.coord) {
            markerRef.current?.setMap(null);
            markerRef.current = new googleMaps.Marker({
              map,
              position: { lat: props.coord.lat, lng: props.coord.lng },
              draggable: false,
            });
          }
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      try {
        markerRef.current?.setMap(null);
        markerRef.current = null;
        if (map) {
          googleMapsRef.current?.event.clearInstanceListeners(map);
          map = null;
        }
        mapRef.current = null;
      } catch {
        // ignore
      }
    };
  }, [isWeb, props.open, props.token]);

  // Keep the marker in sync with external coordinate changes.
  React.useEffect(() => {
    if (!isWeb) return;
    const map = mapRef.current;
    const googleMaps = googleMapsRef.current;
    if (!map || !googleMaps) return;
    markerRef.current?.setMap(null);
    markerRef.current = null;
    if (props.coord) {
      markerRef.current = new googleMaps.Marker({
        map,
        position: { lat: props.coord.lat, lng: props.coord.lng },
        draggable: false,
      });
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
                  Google Maps key missing.
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
                {searching || resolvingPlace ? (
                  <Text color="#64748B" fontSize={12}>Searching...</Text>
                ) : searchResults.length > 0 ? (
                  <ScrollView
                    style={{ maxHeight: 160, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, backgroundColor: '#FFFFFF' }}
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled>
                    {searchResults.map((result) => (
                      <Pressable key={result.id} onPress={() => void handleSelectResult(result)}>
                        <YStack padding={10} borderBottomWidth={1} borderBottomColor="#F1F5F9">
                          <Text color="#1E293B" fontSize={13}>{result.primaryText}</Text>
                          {result.secondaryText ? <Text color="#64748B" fontSize={11}>{result.secondaryText}</Text> : null}
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
                  <Pressable
                    onPress={handleMyLocation}
                    style={{ position: 'absolute', right: 12, bottom: 12, width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 } as any}>
                    <Text color="#1F4E79" fontSize={22}>◎</Text>
                  </Pressable>
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
