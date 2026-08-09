import { Platform } from 'react-native';
import { supabase } from './supabase';
import { getVapidPublicKey } from './public-config';

let registered = false;

export async function registerServiceWorker(): Promise<boolean> {
  if (Platform.OS !== 'web') return false;
  if (registered) return true;
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return false;

  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    registered = true;
    return true;
  } catch {
    return false;
  }
}

export async function subscribeWebPush(userId: string): Promise<void> {
  if (Platform.OS !== 'web') return;
  if (!userId) return;

  try {
    const swReady = await registerServiceWorker();
    if (!swReady) return;

    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();

    if (existing) {
      const subJson = JSON.parse(JSON.stringify(existing));
      await supabase.from('users').upsert({ id: userId, web_push_subscription: subJson }, { onConflict: 'id' });
      return;
    }

    const vapidPublicKey = await getVapidPublicKey();
    if (!vapidPublicKey) return;

    const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });

    const subJson = JSON.parse(JSON.stringify(subscription));
    await supabase.from('users').upsert({ id: userId, web_push_subscription: subJson }, { onConflict: 'id' });
  } catch {
    // ignore - user denied or unsupported
  }
}

export async function unsubscribeWebPush(userId: string): Promise<void> {
  if (Platform.OS !== 'web') return;
  if (!userId) return;

  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();

    await supabase.from('users').upsert({ id: userId, web_push_subscription: null }, { onConflict: 'id' });
  } catch {
    // ignore
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
