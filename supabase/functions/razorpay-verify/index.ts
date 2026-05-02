import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { corsHeaders } from '../_shared/cors.ts';

async function verifySignature(payload: string, signature: string, secret: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const digest = Array.from(new Uint8Array(signed))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return digest === signature;
}

async function getUserIdFromAuthHeader(authHeader: string | null): Promise<string | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  if (!supabaseUrl || !anonKey) return null;
  if (!authHeader) return null;

  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: 'GET',
    headers: {
      apikey: anonKey,
      Authorization: authHeader,
    },
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json?.id ? String(json.id) : null;
}

function planMeta(planCode: string): { days: number; quota: number } | null {
  const p = String(planCode ?? '').trim();
  if (p === 'power_plan') return { days: 30, quota: 25 };
  if (p === 'expert_plan') return { days: 90, quota: 50 };
  if (p === 'moneyback_plan') return { days: 90, quota: 50 };
  return null;
}

async function activateSubscription(params: {
  authHeader: string | null;
  orderId: string;
  paymentId: string;
  signature: string;
  planCode: string;
  amount: number | null;
  status: string;
  activationSource: string;
}) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Service config missing');
  }

  const userId = await getUserIdFromAuthHeader(params.authHeader);
  if (!userId) {
    throw new Error('Not authenticated');
  }

  const meta = planMeta(params.planCode);
  if (!meta) {
    throw new Error('Invalid plan');
  }

  const startsAt = new Date();
  const validUntil = new Date(startsAt.getTime() + meta.days * 24 * 60 * 60 * 1000).toISOString();

  await fetch(`${supabaseUrl}/rest/v1/payments?on_conflict=razorpay_payment_id`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      booking_id: null,
      user_id: userId,
      amount: params.amount,
      status: params.status,
      razorpay_order_id: params.orderId,
      razorpay_payment_id: params.paymentId,
      error: null,
      metadata: {
        purpose: 'subscription',
        plan_code: params.planCode,
        razorpay_signature: params.signature,
      },
    }),
  });

  const subRes = await fetch(`${supabaseUrl}/rest/v1/user_subscriptions?on_conflict=razorpay_order_id`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      user_id: userId,
      plan_code: params.planCode,
      status: 'active',
      starts_at: startsAt.toISOString(),
      valid_until: validUntil,
      quota_total: meta.quota,
      quota_used: 0,
      razorpay_order_id: params.orderId,
      razorpay_payment_id: params.paymentId,
      activation_source: params.activationSource,
      activated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });

  if (!subRes.ok) {
    const t = await subRes.text();
    throw new Error(t || 'Failed to activate subscription');
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const orderId = body.order_id;
    const paymentId = body.payment_id;
    const signature = body.signature;
    const purpose = String(body.purpose ?? '').trim();
    const planCode = String(body.plan_code ?? '').trim();
    const amount = body.amount != null ? Number(body.amount) : null;

    if (!orderId || !paymentId || !signature) {
      return new Response(JSON.stringify({ valid: false, error: 'Missing fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const secret = Deno.env.get('RAZORPAY_KEY_SECRET') ?? '';
    if (!secret) {
      return new Response(JSON.stringify({ valid: false, error: 'Secret missing' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = `${orderId}|${paymentId}`;
    const valid = await verifySignature(payload, signature, secret);

    if (valid && purpose === 'subscription') {
      if (!planCode) {
        return new Response(JSON.stringify({ valid: false, error: 'Missing plan_code' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const authHeader = req.headers.get('Authorization');
      await activateSubscription({
        authHeader,
        orderId,
        paymentId,
        signature,
        planCode,
        amount,
        status: 'paid',
        activationSource: 'client_verify',
      });
    }

    return new Response(JSON.stringify({ valid }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ valid: false, error: 'Verification failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
