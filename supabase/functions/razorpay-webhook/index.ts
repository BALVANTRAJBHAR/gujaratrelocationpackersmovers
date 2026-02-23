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

  if (!orderId) return;

  const response = await fetch(`${supabaseUrl}/rest/v1/payments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      booking_id: bookingId,
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      status,
      amount: amount ? amount / 100 : null,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('Failed to upsert payment', errorBody);
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
