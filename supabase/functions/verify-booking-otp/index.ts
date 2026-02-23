import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { corsHeaders } from '../_shared/cors.ts';

const MAX_ATTEMPTS = 5;

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function normalizePhone(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('+')) {
    return `+${trimmed.slice(1).replace(/\D/g, '')}`;
  }

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length >= 11) return `+${digits}`;
  return '';
}

async function sha256Hex(input: string) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
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

async function patchRest(url: string, serviceKey: string, body: unknown) {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `REST error: ${res.status}`);
  }
}

type OtpRow = {
  phone: string;
  otp_hash: string;
  expires_at: string;
  attempts: number;
  verified: boolean;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const phone = normalizePhone(String(body.phone ?? ''));
    const code = String(body.code ?? '').replace(/\D/g, '').slice(0, 6);

    if (!phone) return jsonResponse({ valid: false, error: 'Valid phone required' }, 400);
    if (code.length !== 6) return jsonResponse({ valid: false, error: '6-digit code required' }, 400);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !serviceKey) {
      const missing: string[] = [];
      if (!supabaseUrl) missing.push('SUPABASE_URL');
      if (!serviceKey) missing.push('SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY');
      return jsonResponse({ valid: false, error: `Supabase service env missing: ${missing.join(', ')}` }, 500);
    }

    const rows = await getRest<OtpRow[]>(
      `${supabaseUrl}/rest/v1/booking_otps?phone=eq.${encodeURIComponent(phone)}&select=phone,otp_hash,expires_at,attempts,verified`,
      serviceKey
    );

    const row = rows?.[0] ?? null;
    if (!row) return jsonResponse({ valid: false, error: 'OTP not found' }, 404);

    if (row.verified) return jsonResponse({ valid: true, already_verified: true });

    const expiresAt = new Date(row.expires_at).getTime();
    if (Date.now() > expiresAt) return jsonResponse({ valid: false, error: 'OTP expired' }, 400);

    if ((row.attempts ?? 0) >= MAX_ATTEMPTS) return jsonResponse({ valid: false, error: 'Too many attempts' }, 429);

    const salt = Deno.env.get('OTP_SALT') ?? 'otp_salt';
    const otpHash = await sha256Hex(`${phone}|${code}|${salt}`);

    const ok = otpHash === row.otp_hash;

    if (ok) {
      await patchRest(
        `${supabaseUrl}/rest/v1/booking_otps?phone=eq.${encodeURIComponent(phone)}`,
        serviceKey,
        { verified: true }
      );
      return jsonResponse({ valid: true });
    }

    await patchRest(
      `${supabaseUrl}/rest/v1/booking_otps?phone=eq.${encodeURIComponent(phone)}`,
      serviceKey,
      { attempts: Number(row.attempts ?? 0) + 1 }
    );

    return jsonResponse({ valid: false, error: 'Invalid OTP' }, 400);
  } catch (error) {
    console.error(error);
    return jsonResponse({ valid: false, error: error instanceof Error ? error.message : 'Failed to verify OTP' }, 500);
  }
});
