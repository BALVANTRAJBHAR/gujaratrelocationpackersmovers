import Constants from 'expo-constants';
import { Platform } from 'react-native';

type PublicConfigResponse = {
  mapbox_token?: string;
  razorpay_key_id?: string;
  error?: string;
  missing?: { mapbox?: boolean; razorpayKeyId?: boolean };
};

type PublicConfig = {
  mapboxToken: string;
  razorpayKeyId: string;
};

let cached: PublicConfig | null = null;
let inflight: Promise<PublicConfig> | null = null;

function getSupabaseEnv() {
  const extra = (Constants as any)?.expoConfig?.extra ?? (Constants as any)?.manifest?.extra ?? {};
  const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? extra?.supabaseUrl ?? '';
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? extra?.supabaseAnonKey ?? '';
  return { baseUrl, anonKey };
}

export async function getPublicConfig(forceRefresh = false): Promise<PublicConfig> {
  if (!forceRefresh && cached) return cached;
  if (!forceRefresh && inflight) return inflight;

  const run = async () => {
    const { baseUrl, anonKey } = getSupabaseEnv();
    if (!baseUrl || !anonKey) {
      throw new Error('Supabase env vars missing. Check EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.');
    }

    const u = String(baseUrl ?? '').trim();
    if (!/^https?:\/\//i.test(u)) {
      throw new Error(`Supabase URL is invalid: ${u || '(empty)'} (must start with https://<project>.supabase.co)`);
    }
    if ((Platform.OS === 'android' || Platform.OS === 'ios') && (u.includes('localhost') || u.includes('127.0.0.1'))) {
      throw new Error(`Supabase URL points to localhost (${u}). On a real device this will fail. Use https://<project>.supabase.co`);
    }

    const res = await fetch(`${u}/functions/v1/public-config`, {
      method: 'GET',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
    });

    const text = await res.text();
    let parsed: PublicConfigResponse | null = null;
    if (text) {
      try {
        parsed = JSON.parse(text) as PublicConfigResponse;
      } catch {
        parsed = null;
      }
    }

    if (!res.ok) {
      const msg = parsed?.error || text || `Edge Function returned status ${res.status}`;
      throw new Error(msg);
    }

    const mapboxToken = String(parsed?.mapbox_token ?? '').trim();
    const razorpayKeyId = String(parsed?.razorpay_key_id ?? '').trim();

    if (!mapboxToken || !razorpayKeyId) {
      throw new Error('Public config missing required keys.');
    }

    cached = { mapboxToken, razorpayKeyId };
    return cached;
  };

  inflight = run().finally(() => {
    inflight = null;
  });

  return inflight;
}

export async function getMapboxToken(): Promise<string> {
  const cfg = await getPublicConfig();
  return cfg.mapboxToken;
}

export async function getRazorpayKeyId(): Promise<string> {
  const cfg = await getPublicConfig();
  return cfg.razorpayKeyId;
}
