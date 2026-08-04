/**
 * booking-map-picker.native.tsx
 *
 * MOBILE-ONLY (Android & iOS) — Mapbox GL JS map inside react-native-webview.
 * Used in the Shifting Booking wizard for pickup / drop location selection.
 *
 * Key design decisions:
 *  - 100% self-contained webview: loads Mapbox GL JS from CDN
 *  - Uses props.token (which contains Mapbox token from book/index.tsx)
 *  - Search: Mapbox Geocoding API via searchPlaces helper in @/lib/mapbox
 *  - Reverse geocode: Mapbox Geocoding API via reverseGeocode helper in @/lib/mapbox
 *  - WebView messages handled via window.ReactNativeWebView.postMessage
 *  - Supports manual tapping on map and marker dragging to adjust coordinates
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
import { WebView } from 'react-native-webview';
import { Button, Dialog, Text, XStack, YStack } from 'tamagui';

import { searchPlaces, reverseGeocode } from '@/lib/mapbox';

type Coord = { lat: number; lng: number };

type PlaceCandidate = {
  id: string;
  place_name: string;
  center: [number, number]; // [lng, lat]
  addressDetails?: { coordinateAccuracy?: string; markerCoordinate?: [number, number] | null };
};

function getHtml(token: string, initialLat: number, initialLng: number) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover" />
  <script src="https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js"></script>
  <link href="https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css" rel="stylesheet" />
  <style>
    body { margin: 0; padding: 0; background-color: #F8FAFC; width: 100%; height: 100%; }
    #map { position: absolute; top: 0; bottom: 0; width: 100%; height: 100%; }
    .mapboxgl-ctrl-logo, .mapboxgl-ctrl-attrib { display: none !important; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map;
    var marker;
    var token = '${token}';
    var initialCoord = [${initialLng}, ${initialLat}];
    
    mapboxgl.accessToken = token;
    
    map = new mapboxgl.Map({
      container: 'map',
      style: 'mapbox://styles/mapbox/streets-v11',
      center: initialCoord,
      zoom: 14
    });

    // Create draggable marker
    marker = new mapboxgl.Marker({ draggable: true })
      .setLngLat(initialCoord)
      .addTo(map);

    function sendToRN(type, data) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, data: data }));
      }
    }

    // Report coordinate when marker drag ends
    marker.on('dragend', function() {
      var lngLat = marker.getLngLat();
      sendToRN('coord_change', { lat: lngLat.lat, lng: lngLat.lng });
    });

    // Map click moves marker and reports coordinate
    map.on('click', function(e) {
      marker.setLngLat(e.lngLat);
      sendToRN('coord_change', { lat: e.lngLat.lat, lng: e.lngLat.lng });
    });

    // Handle incoming messages
    window.addEventListener('message', function(event) {
      try {
        var msg = JSON.parse(event.data);
        if (msg.type === 'set_coord') {
          var lngLat = [msg.data.lng, msg.data.lat];
          marker.setLngLat(lngLat);
          map.flyTo({ center: lngLat, zoom: 15 });
        }
      } catch (err) {
        // ignore
      }
    });

    map.on('load', function() {
      sendToRN('loaded', {});
    });
  </script>
</body>
</html>
  `;
}

export default function BookingMapPicker(props: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  title: string;
  token: string;
  coord: Coord | null;
  onCoordChange: (next: Coord) => void;
  onConfirm: (resolvedAddress?: string) => Promise<void> | void;
  busy: boolean;
  isWide: boolean;
  resetKey?: string;
}) {
  const webViewRef = useRef<WebView>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlaceCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [reverseGeocoding, setReverseGeocoding] = useState(false);
  const [currentProximity, setCurrentProximity] = useState<[number, number] | undefined>();
  const selectedPlaceRef = useRef('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset state on open or target change
  useEffect(() => {
    if (!props.open) return;
    setSearchQuery('');
    setSearchResults([]);
    setSearching(false);
    selectedPlaceRef.current = '';

    // If there is an existing address, set search query input to it
    if (props.coord) {
      setReverseGeocoding(true);
      reverseGeocode(props.coord.lng, props.coord.lat)
        .then((addr) => {
          if (addr) {
            setSearchQuery(addr);
            selectedPlaceRef.current = addr;
          }
        })
        .catch(() => {})
        .finally(() => setReverseGeocoding(false));
    }
  }, [props.open, props.resetKey]);

  // Search should be biased to the user's actual location, not the last pin.
  // Do not prompt here: the explicit "my location" action owns permission UX.
  useEffect(() => {
    if (!props.open) return;
    let active = true;
    void Location.getForegroundPermissionsAsync()
      .then(async ({ status }) => {
        if (status !== 'granted') return null;
        try {
          return await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        } catch {
          return Location.getLastKnownPositionAsync();
        }
      })
      .then((position) => {
        if (active && position) setCurrentProximity([position.coords.longitude, position.coords.latitude]);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [props.open]);

  // Sync external coordinates changes to WebView Map
  useEffect(() => {
    if (!props.coord || !props.open) return;
    const js = `window.postMessage(JSON.stringify({ type: "set_coord", data: { lat: ${props.coord.lat}, lng: ${props.coord.lng} } }), "*"); true;`;
    webViewRef.current?.injectJavaScript(js);
  }, [props.coord?.lat, props.coord?.lng, props.open]);

  // Search debounce
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
      try {
        const results = await searchPlaces(searchQuery.trim(), {
          proximity: currentProximity ?? (props.coord ? [props.coord.lng, props.coord.lat] : undefined),
          types: ['address', 'street', 'neighborhood', 'locality', 'place', 'district', 'poi'],
        });
        setSearchResults(results as PlaceCandidate[]);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 450);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery, currentProximity, props.coord?.lng, props.coord?.lat]);

  const handleMessage = useCallback(
    async (event: any) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data);
        if (msg.type === 'coord_change') {
          const { lat, lng } = msg.data;
          props.onCoordChange({ lat, lng });

          // Update address query input dynamically
          setReverseGeocoding(true);
          try {
            const addr = await reverseGeocode(lng, lat);
            if (addr) {
              setSearchQuery(addr);
              selectedPlaceRef.current = addr;
            }
          } catch (e) {
            console.error('[BookingMapPicker] reverse geocode failed:', e);
          } finally {
            setReverseGeocoding(false);
          }
        }
      } catch (e) {
        // ignore
      }
    },
    [props.onCoordChange],
  );

  const handleSelectResult = useCallback(
    (place: PlaceCandidate) => {
      Keyboard.dismiss();
      setSearchResults([]);
      setSearching(false);
      selectedPlaceRef.current = place.place_name;
      setSearchQuery(place.place_name);

      const [lng, lat] = place.addressDetails?.markerCoordinate ?? place.center;
      props.onCoordChange({ lat, lng });

      const js = `window.postMessage(JSON.stringify({ type: "set_coord", data: { lat: ${lat}, lng: ${lng} } }), "*"); true;`;
      webViewRef.current?.injectJavaScript(js);
    },
    [props.onCoordChange],
  );

  const handleMyLocation = useCallback(async () => {
    Keyboard.dismiss();
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude: lat, longitude: lng } = loc.coords;
      props.onCoordChange({ lat, lng });

      const js = `window.postMessage(JSON.stringify({ type: "set_coord", data: { lat: ${lat}, lng: ${lng} } }), "*"); true;`;
      webViewRef.current?.injectJavaScript(js);

      setReverseGeocoding(true);
      const addr = await reverseGeocode(lng, lat);
      setReverseGeocoding(false);
      if (addr) {
        selectedPlaceRef.current = addr;
        setSearchQuery(addr);
      }
    } catch {
      setReverseGeocoding(false);
    }
  }, [props.onCoordChange]);

  const handleConfirm = useCallback(async () => {
    await props.onConfirm(searchQuery.trim() || undefined);
  }, [props.onConfirm, searchQuery]);

  const htmlSource = getHtml(
    props.token,
    props.coord?.lat ?? 19.076,
    props.coord?.lng ?? 72.8777,
  );

  const styles = StyleSheet.create({
    mapContainer: {
      width: '100%',
      height: 320,
      borderRadius: 14,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: '#E5E7EB',
      position: 'relative',
    },
    webview: {
      flex: 1,
      backgroundColor: '#F8FAFC',
    },
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
      zIndex: 99,
    },
    resultRow: {
      paddingVertical: 12,
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
            <Text fontSize={16} fontWeight="900" color="#111827">
              {props.title}
            </Text>

            {!props.token ? (
              <YStack
                backgroundColor="#FEF2F2"
                borderRadius={12}
                padding={14}
                borderWidth={1}
                borderColor="#FECACA"
                alignItems="center"
                justifyContent="center">
                <Text color="#DC2626" fontSize={13} fontWeight="700" marginBottom={4}>
                  Map Token Missing
                </Text>
                <Text color="#991B1B" fontSize={12} textAlign="center">
                  Mapbox token is not configured. Please contact support.
                </Text>
              </YStack>
            ) : (
              <YStack gap="$2">
                {/* Search Bar */}
                <View style={{ position: 'relative' }}>
                  <TextInput
                    style={styles.searchInput}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Search address or area..."
                    placeholderTextColor="#9CA3AF"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="search"
                  />
                  {(searching || reverseGeocoding) && (
                    <View style={{ position: 'absolute', right: 12, top: 12 }}>
                      <ActivityIndicator size="small" color="#F97316" />
                    </View>
                  )}
                </View>

                {/* Results dropdown */}
                {searchResults.length > 0 ? (
                  <View
                    style={{
                      maxHeight: 160,
                      borderWidth: 1,
                      borderColor: '#E5E7EB',
                      borderRadius: 10,
                      backgroundColor: '#FFFFFF',
                      zIndex: 999,
                    }}>
                    <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                      {searchResults.map((place) => (
                        <Pressable
                          key={place.id}
                          onPress={() => handleSelectResult(place)}
                          android_ripple={{ color: '#F1F5F9' }}>
                          <View style={styles.resultRow}>
                            <Text style={{ fontSize: 13, color: '#1E293B', fontWeight: '600' }}>
                              {place.place_name}
                            </Text>
                          </View>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                ) : null}

                {/* Map Area */}
                <View style={styles.mapContainer}>
                  <WebView
                    ref={webViewRef}
                    originWhitelist={['*']}
                    source={{ html: htmlSource }}
                    style={styles.webview}
                    javaScriptEnabled={true}
                    domStorageEnabled={true}
                    onMessage={handleMessage}
                    androidHardwareAccelerationDisabled={true}
                  />

                  {/* My Location button */}
                  <Pressable
                    style={styles.myLocationBtn}
                    onPress={() => void handleMyLocation()}
                    android_ripple={{ color: '#E5E7EB', radius: 22 }}>
                    <Text fontSize={20}>📍</Text>
                  </Pressable>
                </View>

                {/* Info Text */}
                {props.coord ? (
                  <Text color="#94A3B8" fontSize={11} textAlign="center">
                    {props.coord.lat.toFixed(6)}, {props.coord.lng.toFixed(6)}
                  </Text>
                ) : (
                  <Text color="#94A3B8" fontSize={11} textAlign="center">
                    Tap on the map or search an address to select location
                  </Text>
                )}
              </YStack>
            )}

            {/* Actions */}
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
                onPress={() => void handleConfirm()}
                disabled={props.busy || !props.coord || !props.token}>
                {props.busy ? 'Saving…' : 'Confirm Location'}
              </Button>
            </XStack>
          </YStack>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}
