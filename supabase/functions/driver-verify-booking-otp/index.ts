import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { corsHeaders } from '../_shared/cors.ts';

type BookingRow = {
  id: string;
  driver_id: string | null;
  status: string | null;
  pickup_otp: string | null;
  delivery_otp: string | null;
  pickup_verified_at: string | null;
  delivered_verified_at: string | null;
};

type UserRow = {
  id: string;
  role: string | null;
};

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

async function patchRest(url: string, serviceKey: string, payload: unknown) {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `REST error: ${res.status}`);
  }
}

function getBearer(req: Request) {
  const auth = req.headers.get('authorization') ?? req.headers.get('Authorization') ?? '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : '';
}

async function getAuthedUser(supabaseUrl: string, anonKey: string, jwt: string) {
  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Auth error: ${res.status}`);
  }
  const data = (await res.json()) as any;
  if (!data?.id) throw new Error('Auth user missing id');
  return { id: String(data.id), email: data.email ? String(data.email) : undefined };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const jwt = getBearer(req);
    if (!jwt) {
      return jsonResponse({ error: 'Authentication required' }, 401);
    }

    const supabaseUrl =
      Deno.env.get('SUPABASE_URL') ??
      Deno.env.get('SUPABASE_PROJECT_URL') ??
      '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    let caller: { id: string; email?: string } | null = null;
    try {
      caller = await getAuthedUser(supabaseUrl, anonKey, jwt);
    } catch {
      return jsonResponse({ error: 'Invalid or expired session' }, 401);
    }

    const serviceKey =
      Deno.env.get('SERVICE_ROLE_KEY') ??
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
      Deno.env.get('SB_SERVICE_ROLE_KEY') ??
      '';

    if (!supabaseUrl || !serviceKey) {
      return jsonResponse({ error: 'Supabase service env missing' }, 500);
    }

    const bookingId = String(body.booking_id ?? '').trim();
    const otpKind = String(body.otp_kind ?? '').trim();
    const otp = String(body.otp ?? '').trim();

    if (!bookingId) return jsonResponse({ error: 'booking_id required' }, 400);
    if (otpKind !== 'pickup' && otpKind !== 'delivery') {
      return jsonResponse({ error: 'otp_kind must be pickup or delivery' }, 400);
    }
    if (otp.length !== 4) return jsonResponse({ error: 'Enter the 4-digit OTP' }, 400);

    const [booking] = await getRest<BookingRow[]>(
      `${supabaseUrl}/rest/v1/bookings?id=eq.${bookingId}&select=id,driver_id,status,pickup_otp,delivery_otp,pickup_verified_at,delivered_verified_at`,
      serviceKey
    );

    if (!booking) return jsonResponse({ error: 'Booking not found' }, 404);

    const [callerUser] = await getRest<UserRow[]>(
      `${supabaseUrl}/rest/v1/users?id=eq.${caller!.id}&select=id,role`,
      serviceKey
    );
    const isAdmin = ['admin', 'staff'].includes(String(callerUser?.role ?? ''));
    const isDriver = String(booking.driver_id ?? '') === caller!.id;

    if (!isAdmin && !isDriver) {
      return jsonResponse({ error: 'Only the assigned driver can verify the OTP' }, 403);
    }

    if (booking.status === 'delivered') {
      return jsonResponse({ error: 'Booking is already delivered' }, 400);
    }

    if (otpKind === 'pickup') {
      if (!booking.pickup_otp) return jsonResponse({ error: 'Pickup OTP not generated' }, 400);
      if (otp !== String(booking.pickup_otp).trim()) {
        return jsonResponse({ error: 'Incorrect pickup OTP. Please ask the customer.' }, 400);
      }

      await patchRest(
        `${supabaseUrl}/rest/v1/bookings?id=eq.${bookingId}`,
        serviceKey,
        {
          status: 'pickup_reached',
          pickup_verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
      );

      return jsonResponse({ ok: true, status: 'pickup_reached', verified: 'pickup' });
    }

    // delivery
    if (!booking.pickup_verified_at && booking.status !== 'pickup_reached' && booking.status !== 'in_transit' && booking.status !== 'not_started') {
      return jsonResponse({ error: 'Complete pickup verification first' }, 400);
    }
    if (!booking.delivery_otp) return jsonResponse({ error: 'Delivery OTP not generated' }, 400);
    if (otp !== String(booking.delivery_otp).trim()) {
      return jsonResponse({ error: 'Incorrect delivery OTP. Please ask the customer.' }, 400);
    }

    await patchRest(
      `${supabaseUrl}/rest/v1/bookings?id=eq.${bookingId}`,
      serviceKey,
      {
        status: 'delivered',
        delivered_verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    );

    return jsonResponse({ ok: true, status: 'delivered', verified: 'delivery' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return jsonResponse({ error: msg }, 500);
  }
});