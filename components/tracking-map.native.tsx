/**
 * tracking-map.native.tsx
 *
 * MOBILE-ONLY (Android & iOS) — Independent Google Maps live-tracking component.
 * Used in the Tracking tab to show:
 *   - Green marker  → Pickup location
 *   - Red marker    → Drop location
 *   - Orange marker → Driver live position (updates in realtime via Supabase)
 *
 * Key design decisions:
 *  - 100% self-contained: Google Maps key fetched internally on mount
 *  - No Mapbox imports, no shared map hooks/utilities
 *  - token prop (Mapbox) is accepted for API compatibility but IGNORED on native
 *  - Web version (tracking-map.tsx) is NOT modified
 *  - fitToCoordinates called whenever markers change for optimal viewport
 *  - Animated driver marker via React Native Animated + marker key cycling
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Platform, StyleSheet, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Text, YStack } from 'tamagui';

import { getGoogleMapsKey } from '@/lib/public-config';

// ─── Types ────────────────────────────────────────────────────────────────────

type TrackingMapProps = {
  /** Mapbox token — accepted for API compatibility with web version, IGNORED on native */
  token: string;
  /** Driver's current latitude (used when hasLiveLocation is true) */
  latitude: number;
  /** Driver's current longitude (used when hasLiveLocation is true) */
  longitude: number;
  /** Whether a live driver location is available */
  hasLiveLocation: boolean;
  pickupLat?: number;
  pickupLng?: number;
  dropLat?: number;
  dropLng?: number;
  pickupAddress?: string;
  dropAddress?: string;
};

// ─── Custom marker callout text helper ────────────────────────────────────────

function truncateAddress(addr?: string, maxLen = 60): string {
  if (!addr) return '';
  return addr.length > maxLen ? addr.slice(0, maxLen) + '…' : addr;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TrackingMap({
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
  const mapRef = useRef<MapView>(null);

  // ── Google Maps API Key (fetched internally) ──
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

  // ── Driver pulse animation ──
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (!hasLiveLocation) {
      pulseLoop.current?.stop();
      pulseAnim.setValue(1);
      return;
    }
    pulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.35, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    pulseLoop.current.start();
    return () => pulseLoop.current?.stop();
  }, [hasLiveLocation]);

  // ── Fit map to show all markers ──
  const fitToMarkers = useCallback(() => {
    const coords: { latitude: number; longitude: number }[] = [];
    if (pickupLat != null && pickupLng != null)
      coords.push({ latitude: pickupLat, longitude: pickupLng });
    if (dropLat != null && dropLng != null)
      coords.push({ latitude: dropLat, longitude: dropLng });
    if (hasLiveLocation && latitude && longitude)
      coords.push({ latitude, longitude });

    if (coords.length === 0) return;
    if (coords.length === 1) {
      mapRef.current?.animateCamera(
        { center: { latitude: coords[0].latitude, longitude: coords[0].longitude }, zoom: 14 },
        { duration: 500 },
      );
      return;
    }
    mapRef.current?.fitToCoordinates(coords, {
      edgePadding: { top: 80, right: 80, bottom: 80, left: 80 },
      animated: true,
    });
  }, [pickupLat, pickupLng, dropLat, dropLng, hasLiveLocation, latitude, longitude]);

  useEffect(() => {
    // Delay slightly to allow map to settle after data arrives
    const t = setTimeout(fitToMarkers, 350);
    return () => clearTimeout(t);
  }, [fitToMarkers]);

  // ── Render guards ──
  const isAndroid = Platform.OS === 'android';
  const noKey = !keyLoading && !googleMapsKey;

  if (keyLoading) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center">
        <ActivityIndicator size="large" color="#1F4E79" />
        <Text color="#94A3B8" fontSize={12} marginTop={8}>
          Loading map…
        </Text>
      </YStack>
    );
  }

  if (isAndroid && noKey) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" padding={16}>
        <Text color="#EF4444" fontSize={13} fontWeight="700" textAlign="center">
          Google Maps Unavailable
        </Text>
        <Text color="#94A3B8" fontSize={12} textAlign="center" marginTop={4}>
          Google Maps API key is not configured. Please contact support.
        </Text>
      </YStack>
    );
  }

  // Default centre — Mumbai if no data yet
  const centerLat =
    pickupLat ?? dropLat ?? (hasLiveLocation ? latitude : null) ?? 19.076;
  const centerLng =
    pickupLng ?? dropLng ?? (hasLiveLocation ? longitude : null) ?? 72.8777;

  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={isAndroid ? PROVIDER_GOOGLE : undefined}
        initialRegion={{
          latitude: centerLat,
          longitude: centerLng,
          latitudeDelta: 0.06,
          longitudeDelta: 0.06,
        }}
        rotateEnabled={false}
        pitchEnabled={false}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass
        toolbarEnabled={false}
        onMapReady={fitToMarkers}
        onLayout={fitToMarkers}>

        {/* ── Pickup marker (green) ── */}
        {pickupLat != null && pickupLng != null ? (
          <Marker
            coordinate={{ latitude: pickupLat, longitude: pickupLng }}
            title="📦 Pickup"
            description={truncateAddress(pickupAddress, 80)}
            pinColor="#22C55E"
            identifier="pickup"
          />
        ) : null}

        {/* ── Drop marker (red) ── */}
        {dropLat != null && dropLng != null ? (
          <Marker
            coordinate={{ latitude: dropLat, longitude: dropLng }}
            title="🏁 Drop"
            description={truncateAddress(dropAddress, 80)}
            pinColor="#EF4444"
            identifier="drop"
          />
        ) : null}

        {/* ── Driver live marker (orange, animated pulse ring) ── */}
        {hasLiveLocation && latitude && longitude ? (
          <Marker
            coordinate={{ latitude, longitude }}
            title="🚛 Driver"
            description="Live position"
            identifier="driver"
            anchor={{ x: 0.5, y: 0.5 }}>
            {/* Custom animated driver marker */}
            <View style={driverStyles.wrapper}>
              <Animated.View
                style={[driverStyles.pulse, { transform: [{ scale: pulseAnim }] }]}
              />
              <View style={driverStyles.dot} />
            </View>
          </Marker>
        ) : null}
      </MapView>

      {/* Legend overlay */}
      <View style={legendStyles.container} pointerEvents="none">
        {pickupLat != null && (
          <View style={legendStyles.row}>
            <View style={[legendStyles.dot, { backgroundColor: '#22C55E' }]} />
            <Text style={legendStyles.label}>Pickup</Text>
          </View>
        )}
        {dropLat != null && (
          <View style={legendStyles.row}>
            <View style={[legendStyles.dot, { backgroundColor: '#EF4444' }]} />
            <Text style={legendStyles.label}>Drop</Text>
          </View>
        )}
        {hasLiveLocation && (
          <View style={legendStyles.row}>
            <View style={[legendStyles.dot, { backgroundColor: '#F97316' }]} />
            <Text style={legendStyles.label}>Driver</Text>
          </View>
        )}
      </View>

      {/* "No live signal" overlay when bookingId provided but no live coord */}
      {!hasLiveLocation && (
        <View style={noSignalStyles.badge} pointerEvents="none">
          <Text style={noSignalStyles.text}>Waiting for driver signal…</Text>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const driverStyles = StyleSheet.create({
  wrapper: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulse: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(249, 115, 22, 0.30)',
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#F97316',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    elevation: 4,
    shadowColor: '#F97316',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.5,
    shadowRadius: 3,
  },
});

const legendStyles = StyleSheet.create({
  container: {
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
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginVertical: 2,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  label: {
    fontSize: 11,
    color: '#1E293B',
    fontWeight: '600',
  },
});

const noSignalStyles = StyleSheet.create({
  badge: {
    position: 'absolute',
    bottom: 14,
    alignSelf: 'center',
    backgroundColor: 'rgba(15,23,42,0.72)',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  text: {
    color: '#F1F5F9',
    fontSize: 11,
    fontWeight: '600',
  },
});
