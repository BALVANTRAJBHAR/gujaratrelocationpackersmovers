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

type BookingStatusRow = {
  status: string | null;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const bookingId = String((body as any)?.booking_id ?? '').trim();

    if (!bookingId) return jsonResponse({ error: 'booking_id required' }, 400);

    const supabaseUrl =
      Deno.env.get('SUPABASE_URL') ??
      Deno.env.get('SUPABASE_PROJECT_URL') ??
      '';

    const serviceKey =
      Deno.env.get('SERVICE_ROLE_KEY') ??
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
      Deno.env.get('SB_SERVICE_ROLE_KEY') ??
      '';

    if (!supabaseUrl || !serviceKey) {
      return jsonResponse({ error: 'Supabase service env missing' }, 500);
    }

    const rows = await getRest<BookingStatusRow[]>(
      `${supabaseUrl}/rest/v1/bookings?id=eq.${encodeURIComponent(bookingId)}&select=status&limit=1`,
      serviceKey
    );

    const status = String(rows?.[0]?.status ?? '').trim();
    return jsonResponse({ status: status || null });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Failed' }, 500);
  }
});
