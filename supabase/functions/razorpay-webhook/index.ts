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

function planMeta(planCode: string): { days: number; quota: number } | null {
  const p = String(planCode ?? '').trim();
  if (p === 'power_plan') return { days: 30, quota: 25 };
  if (p === 'expert_plan') return { days: 90, quota: 50 };
  if (p === 'moneyback_plan') return { days: 90, quota: 50 };
  return null;
}

async function activateSubscriptionFromWebhook(params: {
  supabaseUrl: string;
  serviceKey: string;
  userId: string;
  planCode: string;
  orderId: string;
  paymentId: string | null;
  amount: number | null;
  status: string;
}) {
  const meta = planMeta(params.planCode);
  if (!meta) return;
  if (params.status !== 'captured') return;

  const startsAt = new Date();
  const validUntil = new Date(startsAt.getTime() + meta.days * 24 * 60 * 60 * 1000).toISOString();

  await fetch(`${params.supabaseUrl}/rest/v1/user_subscriptions?on_conflict=razorpay_order_id`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.serviceKey}`,
      apikey: params.serviceKey,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      user_id: params.userId,
      plan_code: params.planCode,
      status: 'active',
      starts_at: startsAt.toISOString(),
      valid_until: validUntil,
      quota_total: meta.quota,
      quota_used: 0,
      razorpay_order_id: params.orderId,
      razorpay_payment_id: params.paymentId,
      activation_source: 'webhook_captured',
      activated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });
}

async function updatePayment(payload: any) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SERVICE_ROLE_KEY') ?? '';

  if (!supabaseUrl || !serviceKey) return;

  const paymentEntity = payload?.payload?.payment?.entity;
  const orderId = paymentEntity?.order_id;
  const paymentId = paymentEntity?.id;
  const status = paymentEntity?.status;
  const amount = paymentEntity?.amount;
  const bookingId = paymentEntity?.notes?.booking_id ?? null;
  const purpose = paymentEntity?.notes?.purpose ?? null;
  const planCode = paymentEntity?.notes?.plan_code ?? null;
  const userId = paymentEntity?.notes?.user_id ?? null;

  if (!orderId) return;

  const response = await fetch(`${supabaseUrl}/rest/v1/payments?on_conflict=razorpay_payment_id`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      booking_id: bookingId,
      user_id: userId ? String(userId) : null,
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      status,
      amount: amount ? amount / 100 : null,
      metadata: purpose
        ? {
            purpose,
            plan_code: planCode,
          }
        : null,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('Failed to upsert payment', errorBody);
  }

  if (purpose === 'subscription' && userId && planCode) {
    await activateSubscriptionFromWebhook({
      supabaseUrl,
      serviceKey,
      userId: String(userId),
      planCode: String(planCode),
      orderId: String(orderId),
      paymentId: paymentId ? String(paymentId) : null,
      amount: amount ? amount / 100 : null,
      status: String(status ?? ''),
    });
    return;
  }

  if (!bookingId) return;

  const paymentStatus = status === 'captured' ? 'paid' : status === 'failed' ? 'failed' : 'pending';

  const bookingResponse = await fetch(`${supabaseUrl}/rest/v1/bookings?id=eq.${bookingId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ payment_status: paymentStatus }),
  });

  if (!bookingResponse.ok) {
    const errorBody = await bookingResponse.text();
    console.error('Failed to update booking payment_status', errorBody);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const payload = await req.text();
  const signature = req.headers.get('x-razorpay-signature') ?? '';
  const secret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET') ?? '';

  if (!secret) {
    return new Response(JSON.stringify({ error: 'Webhook secret missing' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const valid = await verifySignature(payload, signature, secret);
  if (!valid) {
    return new Response(JSON.stringify({ error: 'Invalid signature' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const json = JSON.parse(payload);
  await updatePayment(json);

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
