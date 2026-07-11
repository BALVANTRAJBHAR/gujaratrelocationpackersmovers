/**
 * tracking-map.native.tsx
 *
 * MOBILE-ONLY (Android & iOS) — Mapbox GL JS map inside react-native-webview.
 * Used in the Tracking screen to show:
 *   - Green marker  → Pickup location
 *   - Red marker    → Drop location
 *   - Pulsing orange circle → Driver live position
 *
 * Key design decisions:
 *  - 100% self-contained: Google Maps API key is NOT required anymore
 *  - Uses Mapbox GL JS rendered in WebView using the token prop (passed from tracking.tsx)
 *  - Syncs coordinates (pickup, drop, live driver position) dynamically
 *  - Fits the map bounds automatically inside WebView Mapbox GL to show all active pins
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

function getHtml(token: string, defLat: number, defLng: number) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover" />
  <script src="https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js"></script>
  <link href="https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css" rel="stylesheet" />
  <style>
    body { margin: 0; padding: 0; width: 100%; height: 100%; background-color: #F1F5F9; }
    #map { position: absolute; top: 0; bottom: 0; width: 100%; height: 100%; }
    .mapboxgl-ctrl-logo, .mapboxgl-ctrl-attrib { display: none !important; }
    .driver-marker {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background-color: #F97316;
      border: 2.5px solid #FFFFFF;
      box-shadow: 0 0 10px rgba(249, 115, 22, 0.6);
      animation: pulse 1.4s infinite;
    }
    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.7); }
      70% { box-shadow: 0 0 0 10px rgba(249, 115, 22, 0); }
      100% { box-shadow: 0 0 0 0 rgba(249, 115, 22, 0); }
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map;
    var pickupMarker;
    var dropMarker;
    var driverMarker;
    var token = '${token}';
    
    mapboxgl.accessToken = token;
    
    map = new mapboxgl.Map({
      container: 'map',
      style: 'mapbox://styles/mapbox/streets-v11',
      center: [${defLng}, ${defLat}],
      zoom: 12
    });

    function updateMarkers(data) {
      var bounds = new mapboxgl.LngLatBounds();
      var hasCoords = false;

      if (data.pickup && data.pickup.lat != null && data.pickup.lng != null) {
        if (!pickupMarker) {
          pickupMarker = new mapboxgl.Marker({ color: '#22C55E' });
        }
        pickupMarker.setLngLat([data.pickup.lng, data.pickup.lat])
          .setPopup(new mapboxgl.Popup({ offset: 25 }).setText(data.pickup.addr || 'Pickup'))
          .addTo(map);
        bounds.extend([data.pickup.lng, data.pickup.lat]);
        hasCoords = true;
      } else if (pickupMarker) {
        pickupMarker.remove();
        pickupMarker = null;
      }

      if (data.drop && data.drop.lat != null && data.drop.lng != null) {
        if (!dropMarker) {
          dropMarker = new mapboxgl.Marker({ color: '#EF4444' });
        }
        dropMarker.setLngLat([data.drop.lng, data.drop.lat])
          .setPopup(new mapboxgl.Popup({ offset: 25 }).setText(data.drop.addr || 'Drop'))
          .addTo(map);
        bounds.extend([data.drop.lng, data.drop.lat]);
        hasCoords = true;
      } else if (dropMarker) {
        dropMarker.remove();
        dropMarker = null;
      }

      if (data.driver && data.driver.lat != null && data.driver.lng != null) {
        if (!driverMarker) {
          var el = document.createElement('div');
          el.className = 'driver-marker';
          driverMarker = new mapboxgl.Marker(el);
        }
        driverMarker.setLngLat([data.driver.lng, data.driver.lat]).addTo(map);
        bounds.extend([data.driver.lng, data.driver.lat]);
        hasCoords = true;
      } else if (driverMarker) {
        driverMarker.remove();
        driverMarker = null;
      }

      if (hasCoords) {
        map.fitBounds(bounds, { padding: 60, maxZoom: 15 });
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

    map.on('load', function() {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
      }
    });
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
        androidHardwareAccelerationDisabled={true}
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
