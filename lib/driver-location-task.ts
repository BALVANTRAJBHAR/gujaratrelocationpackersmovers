import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import * as TaskManager from 'expo-task-manager';

import { supabase } from '@/lib/supabase';

export const DRIVER_LOCATION_TASK = 'driver-location-task';

const ACTIVE_BOOKING_ID_KEY = 'driver_location_active_booking_id';

async function getActiveBookingId() {
  try {
    return (await SecureStore.getItemAsync(ACTIVE_BOOKING_ID_KEY)) ?? '';
  } catch {
    return '';
  }
}

export async function setActiveDriverBookingId(bookingId: string | null) {
  try {
    if (!bookingId) {
      await SecureStore.deleteItemAsync(ACTIVE_BOOKING_ID_KEY);
      return;
    }
    await SecureStore.setItemAsync(ACTIVE_BOOKING_ID_KEY, bookingId);
  } catch {
    // ignore
  }
}

export async function hasLiveLocationTrackingStarted() {
  try {
    return await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK);
  } catch {
    return false;
  }
}

export async function stopDriverLiveLocation() {
  try {
    await setActiveDriverBookingId(null);
  } catch {
    // ignore
  }

  try {
    const started = await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK);
    if (started) {
      await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK);
    }
  } catch {
    // ignore
  }
}

export async function startDriverLiveLocation(args: {
  bookingId: string;
  timeIntervalMs?: number;
  distanceIntervalM?: number;
}) {
  const bookingId = String(args.bookingId ?? '').trim();
  if (!bookingId) throw new Error('bookingId is required');

  await setActiveDriverBookingId(bookingId);

  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') {
    throw new Error('Location permission denied');
  }

  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== 'granted') {
    throw new Error('Background location permission denied');
  }

  await Location.startLocationUpdatesAsync(DRIVER_LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: args.timeIntervalMs ?? 8000,
    distanceInterval: args.distanceIntervalM ?? 10,
    deferredUpdatesInterval: 0,
    deferredUpdatesDistance: 0,
    showsBackgroundLocationIndicator: true,
    pausesUpdatesAutomatically: false,
    foregroundService: {
      notificationTitle: 'Live tracking enabled',
      notificationBody: 'Sharing your live location for active bookings.',
    },
  });
}

TaskManager.defineTask(DRIVER_LOCATION_TASK, async ({ data, error }: { data?: unknown; error?: unknown }) => {
  if (error) {
    return;
  }

  const bookingId = await getActiveBookingId();
  if (!bookingId) return;

  const locations = (data as any)?.locations as Location.LocationObject[] | undefined;
  const loc = locations?.[locations.length - 1];
  if (!loc?.coords) return;

  const lat = loc.coords.latitude;
  const lng = loc.coords.longitude;
  const speed = typeof loc.coords.speed === 'number' ? loc.coords.speed : null;
  const updated_at = new Date(loc.timestamp ?? Date.now()).toISOString();

  try {
    const channel = supabase.channel(`driver-location-${bookingId}`);
    await channel.subscribe();

    await channel.send({
      type: 'broadcast',
      event: 'location',
      payload: {
        booking_id: bookingId,
        lat,
        lng,
        speed,
        updated_at,
      },
    });

    supabase.removeChannel(channel);
  } catch {
    // ignore
  }

  try {
    const { data: authData } = await supabase.auth.getSession();
    const driverId = authData.session?.user?.id;
    if (driverId) {
      await supabase.from('driver_locations').insert({
        driver_id: driverId,
        booking_id: bookingId,
        lat,
        lng,
        speed,
        updated_at,
      });
    }
  } catch {
    // ignore
  }
});
