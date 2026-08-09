/**
 * booking-map-picker.native.tsx
 *
 * MOBILE-ONLY (Android & iOS) — Google Maps JS API inside react-native-webview.
 * Used in the Shifting Booking wizard for pickup / drop location selection.
 *
 * Key design decisions:
 *  - 100% self-contained webview: loads Google Maps JS API from CDN
 *  - Uses props.token (which contains the Google Maps key from book/index.tsx)
 *  - Search: Google Places API via autocompletePlaces helper in @/lib/google-maps
 *  - Reverse geocode: Google Geocoding API via reverseGeocode helper in @/lib/google-maps
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

import { getGoogleMapsKey } from '@/lib/public-config';
import {
  autocompletePlaces,
  createGooglePlacesSessionToken,
  resolveAutocompleteSuggestion,
  reverseGeocode,
  type GoogleAutocompleteSuggestion,
} from '@/lib/google-maps';

type Coord = { lat: number; lng: number };

type PlaceCandidate = GoogleAutocompleteSuggestion;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a complete standalone HTML page that renders Google Maps inside a WebView.
 * We use an array-join approach to avoid template-literal escaping issues.
 */
function getHtml(apiKey: string, initialLat: number, initialLng: number): string {
  const lat = Number.isFinite(initialLat) ? initialLat : 20.5937;
  const lng = Number.isFinite(initialLng) ? initialLng : 78.9629;

  const lines = [
    '<!DOCTYPE html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8"/>',
    '<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no"/>',
    '<style>',
    'html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:#e0e0e0;}',
    '#map{position:absolute;top:0;left:0;right:0;bottom:0;width:100%;height:100%;}',
    '.view-bar{position:absolute;top:10px;left:10px;z-index:9999;display:flex;gap:4px;background:rgba(255,255,255,0.95);border-radius:20px;padding:3px;box-shadow:0 2px 6px rgba(0,0,0,0.25);font-family:-apple-system,sans-serif;}',
    '.v-btn{border:none;background:transparent;padding:6px 11px;border-radius:16px;font-size:11px;font-weight:700;color:#334155;cursor:pointer;outline:none;}',
    '.v-btn.active{background:#0F172A;color:#FFFFFF;}',
    '.v-btn.t-active{background:#2563EB;color:#FFFFFF;}',
    '</style>',
    '<script>',
    'var map,marker,transitLayer;',
    'var isTransit=false;',
    'var INIT_LAT=' + lat + ';',
    'var INIT_LNG=' + lng + ';',

    'function setMapMode(type){',
    '  if(map) map.setMapTypeId(type);',
    '  var bM=document.getElementById("btnMap");',
    '  var bS=document.getElementById("btnSat");',
    '  if(bM) bM.className="v-btn"+(type==="roadmap"?" active":"");',
    '  if(bS) bS.className="v-btn"+(type!=="roadmap"?" active":"");',
    '}',

    'function toggleTransit(){',
    '  if(!map) return;',
    '  if(!transitLayer){transitLayer=new google.maps.TransitLayer();}',
    '  isTransit=!isTransit;',
    '  transitLayer.setMap(isTransit?map:null);',
    '  var bT=document.getElementById("btnTransit");',
    '  if(bT) bT.className="v-btn"+(isTransit?" t-active":"");',
    '}',

    // Post a message back to React Native
    'function postRN(type,data){',
    '  try{',
    '    if(window.ReactNativeWebView){',
    '      window.ReactNativeWebView.postMessage(JSON.stringify({type:type,data:data}));',
    '    }',
    '  }catch(e){}',
    '}',

    // Called by Google Maps SDK after loading
    'function initMap(){',
    '  try{',
    '    var el=document.getElementById("map");',
    '    if(!el){postRN("error",{message:"no #map element"});return;}',
    '    map=new google.maps.Map(el,{',
    '      center:{lat:INIT_LAT,lng:INIT_LNG},',
    '      zoom:15,',
    '      fullscreenControl:false,',
    '      streetViewControl:false,',
    '      mapTypeControl:true,',
    '      mapTypeControlOptions:{',
    '        style:google.maps.MapTypeControlStyle.HORIZONTAL_BAR,',
    '        position:google.maps.ControlPosition.TOP_RIGHT',
    '      },',
    '      zoomControl:true',
    '    });',
    '    marker=new google.maps.Marker({',
    '      map:map,',
    '      position:{lat:INIT_LAT,lng:INIT_LNG},',
    '      draggable:true',
    '    });',
    '    marker.addListener("dragend",function(){',
    '      var p=marker.getPosition();',
    '      postRN("coord_change",{lat:p.lat(),lng:p.lng()});',
    '    });',
    '    map.addListener("click",function(e){',
    '      marker.setPosition(e.latLng);',
    '      postRN("coord_change",{lat:e.latLng.lat(),lng:e.latLng.lng()});',
    '    });',
    '    google.maps.event.addListenerOnce(map,"idle",function(){',
    '      postRN("loaded",{});',
    '    });',
    '  }catch(err){',
    '    postRN("error",{message:String(err&&err.message?err.message:err)});',
    '  }',
    '}',

    // Receive set_coord messages from React Native
    'function handleRNMsg(dataStr){',
    '  try{',
    '    var msg=typeof dataStr==="string"?JSON.parse(dataStr):dataStr;',
    '    if(msg&&msg.type==="set_coord"&&map&&marker){',
    '      var ll={lat:Number(msg.data.lat),lng:Number(msg.data.lng)};',
    '      marker.setPosition(ll);',
    '      map.panTo(ll);',
    '      map.setZoom(16);',
    '    }',
    '  }catch(e){}',
    '}',
    'window.addEventListener("message",function(ev){handleRNMsg(ev.data);});',
    'document.addEventListener("message",function(ev){handleRNMsg(ev.data);});',

    'window.onerror=function(m,s,l,c,err){',
    '  postRN("error",{message:String(m)+" "+(err?err.message:"")});',
    '};',

    '</script>',
    // Google Maps SDK loaded async; callback=initMap
    '<script src="https://maps.googleapis.com/maps/api/js?key=' + apiKey + '&v=weekly&callback=initMap" async defer></script>',
    '</head>',
    '<body>',
    '<div class="view-bar">',
    '  <button id="btnMap" class="v-btn active" onclick="setMapMode(\'roadmap\')">🗺 Map</button>',
    '  <button id="btnSat" class="v-btn" onclick="setMapMode(\'hybrid\')">🛰 Satellite</button>',
    '  <button id="btnTransit" class="v-btn" onclick="toggleTransit()">🚌 Public Transport</button>',
    '</div>',
    '<div id="map"></div>',
    '</body>',
    '</html>',
  ];

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

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
  const placesSessionRef = useRef(createGooglePlacesSessionToken());
  const searchRequestRef = useRef(0);

  // Reset state on open or target change
  useEffect(() => {
    if (!props.open) return;
    setSearchQuery('');
    setSearchResults([]);
    setSearching(false);
    selectedPlaceRef.current = '';
    placesSessionRef.current = createGooglePlacesSessionToken();
    searchRequestRef.current += 1;

    // If there is an existing coord, reverse geocode to get address
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

  // Obtain user location to bias search (without prompting)
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
        if (active && position)
          setCurrentProximity([position.coords.longitude, position.coords.latitude]);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [props.open]);

  // Sync external coordinate changes to the WebView map
  useEffect(() => {
    if (!props.coord || !props.open) return;
    const js = `window.postMessage(JSON.stringify({ type: "set_coord", data: { lat: ${props.coord.lat}, lng: ${props.coord.lng} } }), "*"); true;`;
    webViewRef.current?.injectJavaScript(js);
  }, [props.coord?.lat, props.coord?.lng, props.open]);

  // Debounced address search
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (!searchQuery.trim()) {
      searchRequestRef.current += 1;
      setSearchResults([]);
      setSearching(false);
      return;
    }

    if (selectedPlaceRef.current && searchQuery.trim() === selectedPlaceRef.current) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    const requestId = ++searchRequestRef.current;
    setSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const results = await autocompletePlaces(searchQuery.trim(), {
          proximity:
            currentProximity ?? (props.coord ? [props.coord.lng, props.coord.lat] : undefined),
          sessionToken: placesSessionRef.current,
        });
        if (requestId === searchRequestRef.current) setSearchResults(results);
      } catch {
        if (requestId === searchRequestRef.current) setSearchResults([]);
      } finally {
        if (requestId === searchRequestRef.current) setSearching(false);
      }
    }, 450);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery, currentProximity, props.coord?.lng, props.coord?.lat]);

  // Handle messages from the WebView (coord changes, errors, loaded)
  const handleMessage = useCallback(
    async (event: any) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data);
        if (msg.type === 'coord_change') {
          const { lat, lng } = msg.data;
          props.onCoordChange({ lat, lng });
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
        } else if (msg.type === 'error') {
          console.error('[BookingMapPicker] WebView JS error:', msg.data?.message);
        }
      } catch (e) {
        // ignore parse errors
      }
    },
    [props.onCoordChange],
  );

  // Handle selecting a place from search results
  const handleSelectResult = useCallback(
    async (place: PlaceCandidate) => {
      Keyboard.dismiss();
      setReverseGeocoding(true);
      try {
        const resolved = await resolveAutocompleteSuggestion({
          ...place,
          sessionToken: placesSessionRef.current,
        });
        if (!resolved) return;
        const [lng, lat] = resolved.addressDetails?.markerCoordinate ?? resolved.center;
        setSearchResults([]);
        setSearching(false);
        selectedPlaceRef.current = resolved.place_name;
        setSearchQuery(resolved.place_name);
        props.onCoordChange({ lat, lng });
        const payload = JSON.stringify({ type: 'set_coord', data: { lat, lng } });
        const js = `(function(){ var p = ${payload}; if(window.handleRNMsg) window.handleRNMsg(p); window.postMessage(JSON.stringify(p), '*'); })(); true;`;
        webViewRef.current?.injectJavaScript(js);
      } finally {
        setReverseGeocoding(false);
      }
    },
    [props.onCoordChange],
  );

  // Handle "My Location" button
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

  // Fallback: fetch maps key if not provided via props
  const [internalToken, setInternalToken] = useState('');
  useEffect(() => {
    if (props.token || !props.open) return;
    let active = true;
    getGoogleMapsKey()
      .then((key) => {
        if (active && key) setInternalToken(key);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [props.token, props.open]);

  const activeToken = props.token || internalToken;

  const htmlSource = getHtml(
    activeToken,
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
      backgroundColor: '#E8E8E8',
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
      fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
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

            {!activeToken ? (
              <YStack
                backgroundColor="#FEF2F2"
                borderRadius={12}
                padding={14}
                borderWidth={1}
                borderColor="#FECACA"
                alignItems="center"
                justifyContent="center">
                <Text color="#DC2626" fontSize={13} fontWeight="700" marginBottom={4}>
                  Map Key Missing
                </Text>
                <Text color="#991B1B" fontSize={12} textAlign="center">
                  Google Maps key is loading or missing. Please try again.
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
                          onPress={() => void handleSelectResult(place)}
                          android_ripple={{ color: '#F1F5F9' }}>
                          <View style={styles.resultRow}>
                            <Text style={{ fontSize: 13, color: '#1E293B', fontWeight: '600' }}>
                              {place.primaryText}
                            </Text>
                            {place.secondaryText ? (
                              <Text style={{ fontSize: 11, color: '#64748B' }}>
                                {place.secondaryText}
                              </Text>
                            ) : null}
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
                    source={{ html: htmlSource, baseUrl: 'https://maps.googleapis.com' }}
                    style={styles.webview}
                    javaScriptEnabled={true}
                    domStorageEnabled={true}
                    mixedContentMode="always"
                    allowFileAccess={true}
                    onMessage={handleMessage}
                  />

                  {/* My Location button */}
                  <Pressable
                    style={styles.myLocationBtn}
                    onPress={() => void handleMyLocation()}
                    android_ripple={{ color: '#E5E7EB', radius: 22 }}>
                    <Text fontSize={20}>📍</Text>
                  </Pressable>
                </View>

                {/* Coordinates */}
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
                disabled={props.busy || !props.coord || !activeToken}>
                {props.busy ? 'Saving…' : 'Confirm Location'}
              </Button>
            </XStack>
          </YStack>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}
