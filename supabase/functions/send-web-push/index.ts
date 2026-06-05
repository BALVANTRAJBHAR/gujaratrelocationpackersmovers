import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { corsHeaders } from '../_shared/cors.ts';

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function getRest<T>(url: string, serviceKey: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `REST error: ${res.status}`);
  }
  return (await res.json()) as T;
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function generateVapidJwt(subject: string, privateKey: CryptoKey): Promise<string> {
  const header = { alg: 'ES256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: 'https://fcm.googleapis.com',
    exp: now + 86400,
    sub: subject,
  };
  const headerB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(`${headerB64}.${payloadB64}`)
  );
  return `${headerB64}.${payloadB64}.${base64UrlEncode(signature)}`;
}

async function importVapidKeys(): Promise<{ publicB64: string; privateKey: CryptoKey }> {
  const publicKeyB64 = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
  const privateKeyB64 = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
  if (!publicKeyB64 || !privateKeyB64) {
    throw new Error('VAPID keys not configured. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.');
  }

  const rawPrivateKey = Uint8Array.from(atob(privateKeyB64), (c) => c.charCodeAt(0));
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    rawPrivateKey,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  return { publicB64: publicKeyB64, privateKey };
}

async function sendWebPush(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
  vapid: { publicB64: string; privateKey: CryptoKey }
): Promise<void> {
  const encoder = new TextEncoder();
  const payloadBytes = encoder.encode(payload);

  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: vapid.publicB64,
    y: '', // Derive y from x if needed; for VAPID we only need x
  };

  const jwt = await generateVapidJwt('mailto:admin@grpackersmovers.com', vapid.privateKey);

  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
      TTL: '86400',
      'Content-Encoding': 'aes128gcm',
      Authorization: `vapid t=${jwt}, k=${vapid.publicB64}`,
    },
    body: payloadBytes,
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 410) {
      throw new Error('Subscription expired');
    }
    throw new Error(`Web push failed (${res.status}): ${text}`);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const userId = String(body.user_id ?? '').trim();
    const title = String(body.title ?? '').trim();
    const bodyText = String(body.body ?? '').trim();
    const url = String(body.url ?? '').trim();

    if (!userId) return jsonResponse({ error: 'user_id required' }, 400);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !serviceKey) {
      return jsonResponse({ error: 'Supabase env missing' }, 500);
    }

    const users = await getRest<{ id: string; web_push_subscription: any }[]>(
      `${supabaseUrl}/rest/v1/users?id=eq.${encodeURIComponent(userId)}&select=id,web_push_subscription`,
      serviceKey
    );

    const user = users?.[0];
    if (!user?.web_push_subscription) {
      return jsonResponse({ sent: false, reason: 'No web push subscription' });
    }

    const subscription = user.web_push_subscription as {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    };
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return jsonResponse({ sent: false, reason: 'Invalid subscription' });
    }

    const vapid = await importVapidKeys();
    const payload = JSON.stringify({ title, body: bodyText, data: { url } });

    try {
      await sendWebPush(subscription, payload, vapid);
      return jsonResponse({ sent: true });
    } catch (e: any) {
      if (e.message === 'Subscription expired') {
        await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${encodeURIComponent(userId)}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            apikey: serviceKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ web_push_subscription: null }),
        });
        return jsonResponse({ sent: false, reason: 'Subscription expired and removed' });
      }
      throw e;
    }
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: error instanceof Error ? error.message : 'Failed to send web push' }, 500);
  }
});
