/**
 * tracking-map.native.tsx
 *
 * MOBILE-ONLY (Android & iOS) — Google Maps JS API inside react-native-webview.
 * Used in the Tracking screen to show:
 *   - Green marker  → Pickup location
 *   - Red marker    → Drop location
 *   - Orange marker → Driver live position
 *
 * Key design decisions:
 *  - Uses Google Maps JS API rendered in WebView using the key prop (passed from tracking.tsx)
 *  - Syncs coordinates (pickup, drop, live driver position) dynamically
 *  - Fits the map bounds automatically inside the WebView to show all active pins
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
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

function getHtml(apiKey: string, defLat: number, defLng: number) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover" />
  <script src="https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=weekly&callback=initMap"></script>
  <style>
    body { margin: 0; padding: 0; width: 100%; height: 100%; background-color: #F1F5F9; }
    #map { position: absolute; top: 0; bottom: 0; width: 100%; height: 100%; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map;
    var pickupMarker;
    var dropMarker;
    var driverMarker;

    function circleIcon(color) {
      return {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 9,
        fillColor: color,
        fillOpacity: 1,
        strokeColor: '#FFFFFF',
        strokeWeight: 2.5
      };
    }

    function initMap() {
      map = new google.maps.Map(document.getElementById('map'), {
        center: { lat: ${defLat}, lng: ${defLng} },
        zoom: 12,
        fullscreenControl: false,
        streetViewControl: false,
        mapTypeControl: false
      });

      function updateMarkers(data) {
        var bounds = new google.maps.LatLngBounds();
        var hasCoords = false;

        if (data.pickup && data.pickup.lat != null && data.pickup.lng != null) {
          var p = { lat: data.pickup.lat, lng: data.pickup.lng };
          if (!pickupMarker) {
            pickupMarker = new google.maps.Marker({ map: map, position: p, icon: circleIcon('#22C55E') });
          } else {
            pickupMarker.setPosition(p);
          }
          var puInfo = new google.maps.InfoWindow({
            content: '<div style="font-family: sans-serif; font-size: 12px; padding: 4px 2px;">' + (data.pickup.addr || 'Pickup') + '</div>'
          });
          pickupMarker.addListener('click', function() { puInfo.open(map, pickupMarker); });
          bounds.extend(p);
          hasCoords = true;
        } else if (pickupMarker) {
          pickupMarker.setMap(null);
          pickupMarker = null;
        }

        if (data.drop && data.drop.lat != null && data.drop.lng != null) {
          var dp = { lat: data.drop.lat, lng: data.drop.lng };
          if (!dropMarker) {
            dropMarker = new google.maps.Marker({ map: map, position: dp, icon: circleIcon('#EF4444') });
          } else {
            dropMarker.setPosition(dp);
          }
          var drInfo = new google.maps.InfoWindow({
            content: '<div style="font-family: sans-serif; font-size: 12px; padding: 4px 2px;">' + (data.drop.addr || 'Drop') + '</div>'
          });
          dropMarker.addListener('click', function() { drInfo.open(map, dropMarker); });
          bounds.extend(dp);
          hasCoords = true;
        } else if (dropMarker) {
          dropMarker.setMap(null);
          dropMarker = null;
        }

        if (data.driver && data.driver.lat != null && data.driver.lng != null) {
          var dPos = { lat: data.driver.lat, lng: data.driver.lng };
          if (!driverMarker) {
            driverMarker = new google.maps.Marker({ map: map, position: dPos, icon: circleIcon('#F97316') });
          } else {
            driverMarker.setPosition(dPos);
          }
          bounds.extend(dPos);
          hasCoords = true;
        } else if (driverMarker) {
          driverMarker.setMap(null);
          driverMarker = null;
        }

        if (hasCoords) {
          map.fitBounds(bounds, 60);
        }
      }

      window.addEventListener('message', function(event) {
        try {
          var msg = JSON.parse(event.data);
          if (msg.type === 'update') {
            updateMarkers(msg.data);
          }
        } catch (err) {
          // ignore
        }
      });

      google.maps.event.addListenerOnce(map, 'idle', function() {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
        }
      });
    }
  </script>
</body>
</html>
  `;
}

export default function TrackingMap({
  token,
  latitude,
  longitude,
  hasLiveLocation,
  pickupLat,
  pickupLng,
  dropLat,
  dropLng,
  pickupAddress,
  dropAddress,
}: TrackingMapProps) {
  const webViewRef = useRef<WebView>(null);
  const [webViewReady, setWebViewReady] = useState(false);
  const webViewReadyRef = useRef(false);

  const getMarkerData = useCallback(() => {
    return {
      pickup:
        pickupLat != null && pickupLng != null
          ? { lat: pickupLat, lng: pickupLng, addr: pickupAddress }
          : null,
      drop:
        dropLat != null && dropLng != null
          ? { lat: dropLat, lng: dropLng, addr: dropAddress }
          : null,
      driver:
        hasLiveLocation && latitude && longitude
          ? { lat: latitude, lng: longitude }
          : null,
    };
  }, [
    pickupLat,
    pickupLng,
    pickupAddress,
    dropLat,
    dropLng,
    dropAddress,
    hasLiveLocation,
    latitude,
    longitude,
  ]);

  const sendUpdate = useCallback(() => {
    if (!webViewReadyRef.current) return;
    const data = getMarkerData();
    const js = `window.postMessage(JSON.stringify({ type: "update", data: ${JSON.stringify(
      data,
    )} }), "*"); true;`;
    webViewRef.current?.injectJavaScript(js);
  }, [getMarkerData]);

  // Sync coords whenever inputs update
  useEffect(() => {
    sendUpdate();
  }, [
    latitude,
    longitude,
    hasLiveLocation,
    pickupLat,
    pickupLng,
    dropLat,
    dropLng,
    sendUpdate,
  ]);

  const handleMessage = (event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'ready') {
        webViewReadyRef.current = true;
        setWebViewReady(true);
        // Push initial markers immediately on load
        const data = getMarkerData();
        const js = `window.postMessage(JSON.stringify({ type: "update", data: ${JSON.stringify(
          data,
        )} }), "*"); true;`;
        webViewRef.current?.injectJavaScript(js);
      }
    } catch {
      // ignore
    }
  };

  if (!token) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" padding={12}>
        <ActivityIndicator size="small" color="#F97316" />
        <Text color="#94A3B8" fontSize={12} marginTop={8}>
          Loading configuration...
        </Text>
      </YStack>
    );
  }

  // Fallback center is pickup, drop, live, or default to Mumbai
  const defLat =
    pickupLat ?? dropLat ?? (hasLiveLocation ? latitude : null) ?? 19.076;
  const defLng =
    pickupLng ?? dropLng ?? (hasLiveLocation ? longitude : null) ?? 72.8777;

  const htmlSource = getHtml(token, defLat, defLng);

  return (
    <View style={StyleSheet.absoluteFill}>
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: htmlSource }}
        style={styles.webview}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        onMessage={handleMessage}
      />

      {/* Loading Overlay */}
      {!webViewReady && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#F97316" />
        </View>
      )}

      {/* Legend Overlay */}
      {webViewReady && (
        <View style={styles.legendContainer} pointerEvents="none">
          {pickupLat != null && (
            <View style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: '#22C55E' }]} />
              <Text style={styles.legendLabel}>Pickup</Text>
            </View>
          )}
          {dropLat != null && (
            <View style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
              <Text style={styles.legendLabel}>Drop</Text>
            </View>
          )}
          {hasLiveLocation && (
            <View style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: '#F97316' }]} />
              <Text style={styles.legendLabel}>Driver</Text>
            </View>
          )}
        </View>
      )}

      {/* Waiting Signal Overlay */}
      {webViewReady && !hasLiveLocation && (
        <View style={styles.signalBadge} pointerEvents="none">
          <Text style={styles.signalText}>Waiting for driver signal…</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  webview: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9,
  },
  legendContainer: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    gap: 4,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    zIndex: 99,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginVertical: 2,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    fontSize: 11,
    color: '#1E293B',
    fontWeight: '600',
  },
  signalBadge: {
    position: 'absolute',
    bottom: 14,
    alignSelf: 'center',
    backgroundColor: 'rgba(15,23,42,0.72)',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    zIndex: 99,
  },
  signalText: {
    color: '#F1F5F9',
    fontSize: 11,
    fontWeight: '600',
  },
});