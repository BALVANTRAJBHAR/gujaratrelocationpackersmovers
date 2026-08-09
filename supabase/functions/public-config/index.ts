import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const razorpayKeyId = Deno.env.get('RAZORPAY_KEY_ID') ?? '';
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
    const googleMapsKey = Deno.env.get('GOOGLE_MAPS_API_KEY') ?? '';

    return new Response(
      JSON.stringify({
        razorpay_key_id: razorpayKeyId,
        vapid_public_key: vapidPublicKey,
        google_maps_api_key: googleMapsKey,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600',
        },
      }
    );
  } catch (_error) {
    return new Response(JSON.stringify({ error: 'Failed to read config' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
