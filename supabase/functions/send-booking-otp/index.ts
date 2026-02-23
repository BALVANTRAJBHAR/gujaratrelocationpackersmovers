import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { corsHeaders } from '../_shared/cors.ts';

const OTP_LENGTH = 6;
const OTP_EXPIRY_SECONDS = 600;
const MIN_RESEND_SECONDS = 30;

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

function randomOtp() {
  const min = 10 ** (OTP_LENGTH - 1);
  const max = 10 ** OTP_LENGTH - 1;
  const n = Math.floor(Math.random() * (max - min + 1)) + min;
  return String(n);
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

async function upsertOtpRow(supabaseUrl: string, serviceKey: string, phone: string, otpHash: string, expiresAtIso: string) {
  const res = await fetch(`${supabaseUrl}/rest/v1/booking_otps`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      phone,
      otp_hash: otpHash,
      expires_at: expiresAtIso,
      attempts: 0,
      verified: false,
      last_sent_at: new Date().toISOString(),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Failed to upsert OTP: ${res.status}`);
  }
}

async function sendSmsTwilio(to: string, body: string) {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID') ?? '';
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
  const fromPhone = Deno.env.get('TWILIO_FROM_PHONE') ?? '';

  if (!accountSid || !authToken || !fromPhone) {
    const missing: string[] = [];
    if (!accountSid) missing.push('TWILIO_ACCOUNT_SID');
    if (!authToken) missing.push('TWILIO_AUTH_TOKEN');
    if (!fromPhone) missing.push('TWILIO_FROM_PHONE');
    throw new Error(`Twilio env missing: ${missing.join(', ')}`);
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const auth = btoa(`${accountSid}:${authToken}`);

  const form = new URLSearchParams();
  form.set('To', to);
  form.set('From', fromPhone);
  form.set('Body', body);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message ?? 'Twilio SMS failed');
  }

  return data;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const phone = normalizePhone(String(body.phone ?? ''));

    if (!phone) return jsonResponse({ error: 'Valid phone required' }, 400);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !serviceKey) {
      const missing: string[] = [];
      if (!supabaseUrl) missing.push('SUPABASE_URL');
      if (!serviceKey) missing.push('SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY');
      return jsonResponse({ error: `Supabase service env missing: ${missing.join(', ')}` }, 500);
    }

    const existing = await getRest<any[]>(
      `${supabaseUrl}/rest/v1/booking_otps?phone=eq.${encodeURIComponent(phone)}&select=phone,last_sent_at,verified`,
      serviceKey
    ).catch(() => []);

    const row = existing?.[0] ?? null;

    if (row?.last_sent_at) {
      const last = new Date(row.last_sent_at).getTime();
      const diffSec = (Date.now() - last) / 1000;
      if (diffSec < MIN_RESEND_SECONDS) {
        return jsonResponse({ error: 'Please wait before resending OTP' }, 429);
      }
    }

    const otp = randomOtp();
    const salt = Deno.env.get('OTP_SALT') ?? 'otp_salt';
    const otpHash = await sha256Hex(`${phone}|${otp}|${salt}`);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_SECONDS * 1000).toISOString();

    await upsertOtpRow(supabaseUrl, serviceKey, phone, otpHash, expiresAt);

    const template = Deno.env.get('OTP_SMS_TEMPLATE') ?? 'Your Gujarat Relocation Packers & Movers code is {{CODE}}';
    const smsBody = template.replace('{{CODE}}', otp);

    const smsDisabled = String(Deno.env.get('SMS_DISABLED') ?? '').toLowerCase() === 'true';
    if (smsDisabled) {
      return jsonResponse({ sent: true, phone, expires_in: OTP_EXPIRY_SECONDS, dev_code: otp });
    }

    const twilio = await sendSmsTwilio(phone, smsBody);

    return jsonResponse({ sent: true, phone, expires_in: OTP_EXPIRY_SECONDS, sid: twilio?.sid ?? null });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: error instanceof Error ? error.message : 'Failed to send OTP' }, 500);
  }
});
