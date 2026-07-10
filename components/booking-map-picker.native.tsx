/**
 * booking-map-picker.native.tsx
 *
 * MOBILE-ONLY (Android & iOS) — Independent Google Maps picker.
 * Used in the Shifting Booking wizard for pickup / drop location selection.
 *
 * Key design decisions:
 *  - 100% self-contained: no shared map hooks, no Mapbox imports
 *  - Google Maps API key fetched internally via getGoogleMapsKey() → Supabase Edge Function
 *  - Search: Google Places Autocomplete REST API
 *  - Reverse geocode (address from tap): Google Geocoding REST API
 *  - "My Location" button: expo-location (permission requested on tap)
 *  - Web version (booking-map-picker.tsx) is NOT modified
 */

import * as Location from 'expo-location';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { Button, Dialog, Text, XStack, YStack } from 'tamagui';

import { getGoogleMapsKey } from '@/lib/public-config';

// ─── Types ────────────────────────────────────────────────────────────────────

type Coord = { lat: number; lng: number };

type PlaceCandidate = {
  place_id: string;
  description: string;
  structured_formatting?: { main_text: string; secondary_text?: string };
};

// ─── Google REST helpers (self-contained, no shared imports) ──────────────────

/** Reverse geocode via Google Geocoding API — returns address string */
async function googleReverseGeocode(apiKey: string, lat: number, lng: number): Promise<string> {
  if (!apiKey) return '';
  try {
    const url =
      `https://maps.googleapis.com/maps/api/geocode/json` +
      `?latlng=${lat},${lng}&key=${apiKey}&language=en&result_type=street_address|route|sublocality|locality`;
    const res = await fetch(url);
    if (!res.ok) return '';
    const data = (await res.json()) as { results?: { formatted_address?: string }[] };
    return String(data.results?.[0]?.formatted_address ?? '').trim();
  } catch {
    return '';
  }
}

/** Google Places Autocomplete — returns list of place candidates */
async function googleAutocompletePlaces(
  apiKey: string,
  input: string,
  sessionToken: string,
): Promise<PlaceCandidate[]> {
  if (!apiKey || !input.trim()) return [];
  try {
    const url =
      `https://maps.googleapis.com/maps/api/place/autocomplete/json` +
      `?input=${encodeURIComponent(input)}` +
      `&key=${apiKey}` +
      `&language=en` +
      `&components=country:in` +
      `&sessiontoken=${sessionToken}` +
      `&types=geocode|establishment`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as { predictions?: PlaceCandidate[] };
    return data.predictions ?? [];
  } catch {
    return [];
  }
}

/** Google Place Details — returns lat/lng for a place_id */
async function googlePlaceDetails(
  apiKey: string,
  placeId: string,
  sessionToken: string,
): Promise<Coord | null> {
  if (!apiKey || !placeId) return null;
  try {
    const url =
      `https://maps.googleapis.com/maps/api/place/details/json` +
      `?place_id=${encodeURIComponent(placeId)}` +
      `&fields=geometry` +
      `&key=${apiKey}` +
      `&sessiontoken=${sessionToken}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      result?: { geometry?: { location?: { lat?: number; lng?: number } } };
    };
    const loc = data.result?.geometry?.location;
    if (loc?.lat == null || loc?.lng == null) return null;
    return { lat: Number(loc.lat), lng: Number(loc.lng) };
  } catch {
    return null;
  }
}

/** Generate a short session token for Places API billing grouping */
function newSessionToken(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BookingMapPicker(props: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  title: string;
  /** token prop is present for API compatibility with web version — ignored on native */
  token: string;
  coord: Coord | null;
  onCoordChange: (next: Coord) => void;
  /** Called after user confirms; receives resolved address string */
  onConfirm: (resolvedAddress?: string) => Promise<void> | void;
  busy: boolean;
  isWide: boolean;
  resetKey?: string;
}) {
  const mapRef = useRef<MapView>(null);

  // ── API Key (fetched once internally) ──
  const [googleMapsKey, setGoogleMapsKey] = useState('');
  const [keyLoading, setKeyLoading] = useState(true);
  const keyFetchedRef = useRef(false);

  useEffect(() => {
    if (keyFetchedRef.current) return;
    keyFetchedRef.current = true;
    getGoogleMapsKey()
      .then((k) => setGoogleMapsKey(k ?? ''))
      .catch(() => setGoogleMapsKey(''))
      .finally(() => setKeyLoading(false));
  }, []);

  // ── Search state ──
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlaceCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [reverseGeocoding, setReverseGeocoding] = useState(false);
  const sessionTokenRef = useRef(newSessionToken());
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedPlaceRef = useRef('');

  // ── Local coord (map region) ──
  const [mapRegion, setMapRegion] = useState<Region>({
    latitude: props.coord?.lat ?? 19.076,
    longitude: props.coord?.lng ?? 72.8777,
    latitudeDelta: 0.04,
    longitudeDelta: 0.04,
  });

  // Reset state when dialog opens or target changes
  useEffect(() => {
    if (!props.open) return;
    setSearchQuery('');
    setSearchResults([]);
    setSearching(false);
    selectedPlaceRef.current = '';
    sessionTokenRef.current = newSessionToken();

    const initLat = props.coord?.lat ?? 19.076;
    const initLng = props.coord?.lng ?? 72.8777;
    setMapRegion({
      latitude: initLat,
      longitude: initLng,
      latitudeDelta: 0.04,
      longitudeDelta: 0.04,
    });
  }, [props.open, props.resetKey]);

  // Animate map to coord when it changes externally
  useEffect(() => {
    if (!props.coord) return;
    mapRef.current?.animateCamera(
      { center: { latitude: props.coord.lat, longitude: props.coord.lng }, zoom: 15 },
      { duration: 400 },
    );
  }, [props.coord?.lat, props.coord?.lng]);

  // ── Search debounce ──
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    if (selectedPlaceRef.current && searchQuery.trim() === selectedPlaceRef.current) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      const results = await googleAutocompletePlaces(
        googleMapsKey,
        searchQuery.trim(),
        sessionTokenRef.current,
      );
      setSearchResults(results);
      setSearching(false);
    }, 450);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery, googleMapsKey]);

  // ── Handlers ──
  const handleMapTap = useCallback(
    async (e: any) => {
      Keyboard.dismiss();
      const { latitude, longitude } = e.nativeEvent.coordinate;
      props.onCoordChange({ lat: latitude, lng: longitude });
      mapRef.current?.animateCamera(
        { center: { latitude, longitude }, zoom: 15 },
        { duration: 300 },
      );

      // Reverse geocode the tapped point
      if (googleMapsKey) {
        setReverseGeocoding(true);
        const address = await googleReverseGeocode(googleMapsKey, latitude, longitude);
        setReverseGeocoding(false);
        if (address) {
          selectedPlaceRef.current = address;
          setSearchQuery(address);
          setSearchResults([]);
        }
      }
    },
    [props.onCoordChange, googleMapsKey],
  );

  const handleSelectResult = useCallback(
    async (place: PlaceCandidate) => {
      Keyboard.dismiss();
      setSearchResults([]);
      setSearching(false);
      selectedPlaceRef.current = place.description;
      setSearchQuery(place.description);

      const coords = await googlePlaceDetails(
        googleMapsKey,
        place.place_id,
        sessionTokenRef.current,
      );
      // Refresh session token after details call (per billing rules)
      sessionTokenRef.current = newSessionToken();

      if (coords) {
        props.onCoordChange(coords);
        mapRef.current?.animateCamera(
          { center: { latitude: coords.lat, longitude: coords.lng }, zoom: 15 },
          { duration: 500 },
        );
      }
    },
    [googleMapsKey, props.onCoordChange],
  );

  const handleMyLocation = useCallback(async () => {
    Keyboard.dismiss();
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = loc.coords;
      props.onCoordChange({ lat: latitude, lng: longitude });
      mapRef.current?.animateCamera(
        { center: { latitude, longitude }, zoom: 16 },
        { duration: 500 },
      );
      if (googleMapsKey) {
        setReverseGeocoding(true);
        const address = await googleReverseGeocode(googleMapsKey, latitude, longitude);
        setReverseGeocoding(false);
        if (address) {
          selectedPlaceRef.current = address;
          setSearchQuery(address);
          setSearchResults([]);
        }
      }
    } catch {
      // Permission denied or location unavailable — silently ignore
    }
  }, [props.onCoordChange, googleMapsKey]);

  const handleConfirm = useCallback(async () => {
    // Pass resolved address back (from search query) so book/index.tsx doesn't need Mapbox
    await props.onConfirm(searchQuery.trim() || undefined);
  }, [props.onConfirm, searchQuery]);

  // ── Render guards ──
  const noKey = !keyLoading && !googleMapsKey;
  const isAndroid = Platform.OS === 'android';

  // ── Styles ──
  const styles = StyleSheet.create({
    mapContainer: { width: '100%', height: 300, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#E5E7EB' },
    map: { ...StyleSheet.absoluteFillObject },
    searchInput: {
      height: 44,
      borderWidth: 1,
      borderColor: '#E5E7EB',
      borderRadius: 10,
      paddingHorizontal: 14,
      fontSize: 14,
      backgroundColor: '#FFFFFF',
      color: '#111827',
      fontFamily: Platform.OS === 'ios' ? 'Times New Roman' : 'serif',
    },
    myLocationBtn: {
      position: 'absolute',
      bottom: 12,
      right: 12,
      backgroundColor: '#FFFFFF',
      borderRadius: 24,
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 4,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.18,
      shadowRadius: 4,
    },
    resultRow: {
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderBottomWidth: 1,
      borderBottomColor: '#F1F5F9',
    },
  });

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay opacity={0.6} backgroundColor="#0F172A" />
        <Dialog.Content
          backgroundColor="#FFFFFF"
          borderRadius={18}
          padding={16}
          width={props.isWide ? 680 : '93%'}
          maxHeight="92%">
          <YStack gap="$3">
            {/* Header */}
            <Text fontSize={16} fontWeight="900" color="#111827">
              {props.title}
            </Text>

            {/* API Key loading */}
            {keyLoading ? (
              <YStack alignItems="center" justifyContent="center" height={100}>
                <ActivityIndicator size="large" color="#1F4E79" />
                <Text color="#64748B" fontSize={12} marginTop={8}>
                  Loading map…
                </Text>
              </YStack>
            ) : noKey ? (
              /* No API Key */
              <YStack
                backgroundColor="#FEF2F2"
                borderRadius={12}
                padding={14}
                borderWidth={1}
                borderColor="#FECACA">
                <Text color="#DC2626" fontSize={13} fontWeight="700" marginBottom={4}>
                  Google Maps Unavailable
                </Text>
                <Text color="#991B1B" fontSize={12}>
                  Google Maps API key is not configured. Please contact support.
                </Text>
              </YStack>
            ) : (
              /* Main map UI */
              <YStack gap="$2">
                {/* Search bar */}
                <View>
                  <TextInput
                    style={styles.searchInput}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Search address or place…"
                    placeholderTextColor="#9CA3AF"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="search"
                  />
                  {(searching || reverseGeocoding) && (
                    <View style={{ position: 'absolute', right: 12, top: 12 }}>
                      <ActivityIndicator size="small" color="#1F4E79" />
                    </View>
                  )}
                </View>

                {/* Autocomplete results */}
                {searchResults.length > 0 ? (
                  <View
                    style={{
                      maxHeight: 180,
                      borderWidth: 1,
                      borderColor: '#E5E7EB',
                      borderRadius: 10,
                      backgroundColor: '#FFFFFF',
                      overflow: 'hidden',
                    }}>
                    <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                      {searchResults.map((place) => (
                        <Pressable
                          key={place.place_id}
                          onPress={() => void handleSelectResult(place)}
                          android_ripple={{ color: '#F1F5F9' }}>
                          <View style={styles.resultRow}>
                            <Text style={{ fontSize: 13, color: '#1E293B', fontWeight: '600' }}>
                              {place.structured_formatting?.main_text ?? place.description}
                            </Text>
                            {place.structured_formatting?.secondary_text ? (
                              <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                                {place.structured_formatting.secondary_text}
                              </Text>
                            ) : null}
                          </View>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                ) : null}

                {/* Map */}
                <View style={styles.mapContainer}>
                  <MapView
                    ref={mapRef}
                    style={styles.map}
                    provider={isAndroid ? PROVIDER_GOOGLE : undefined}
                    region={mapRegion}
                    onRegionChangeComplete={setMapRegion}
                    onPress={(e) => void handleMapTap(e)}
                    showsUserLocation={false}
                    showsMyLocationButton={false}
                    showsCompass
                    showsScale={false}
                    rotateEnabled={false}
                    pitchEnabled={false}
                    moveOnMarkerPress={false}>
                    {props.coord ? (
                      <Marker
                        coordinate={{ latitude: props.coord.lat, longitude: props.coord.lng }}
                        title={
                          props.title.toLowerCase().includes('pickup') ? 'Pickup' : 'Drop'
                        }
                        pinColor={
                          props.title.toLowerCase().includes('pickup') ? '#22C55E' : '#EF4444'
                        }
                      />
                    ) : null}
                  </MapView>

                  {/* My Location button */}
                  <Pressable
                    style={styles.myLocationBtn}
                    onPress={() => void handleMyLocation()}
                    android_ripple={{ color: '#E5E7EB', radius: 22 }}>
                    <Text fontSize={20}>📍</Text>
                  </Pressable>
                </View>

                {/* Coord hint */}
                {props.coord ? (
                  <Text color="#94A3B8" fontSize={11} textAlign="center">
                    {props.coord.lat.toFixed(6)}, {props.coord.lng.toFixed(6)}
                    {reverseGeocoding ? '  ·  Fetching address…' : ''}
                  </Text>
                ) : (
                  <Text color="#94A3B8" fontSize={11} textAlign="center">
                    Tap on the map or search an address to select location
                  </Text>
                )}
              </YStack>
            )}

            {/* Action buttons */}
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
                backgroundColor="#1F4E79"
                color="#FFFFFF"
                onPress={() => void handleConfirm()}
                disabled={props.busy || !props.coord || noKey || keyLoading}>
                {props.busy ? 'Saving…' : 'Confirm Location'}
              </Button>
            </XStack>
          </YStack>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}
