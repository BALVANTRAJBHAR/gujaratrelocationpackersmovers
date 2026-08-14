import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { corsHeaders } from '../_shared/cors.ts';

type BookingRow = {
  id: string;
  user_id: string | null;
  driver_id: string | null;
  status: string | null;
  payment_status: string | null;
  remaining_amount: number | null;
  remaining_paid_at: string | null;
};

type HomeServiceRow = {
  id: string;
  user_id: string | null;
  provider_id: string | null;
  status: string | null;
  payment_status: string | null;
  cash_paid_at: string | null;
  after_service_payment_method: string | null;
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

async function postRest(url: string, serviceKey: string, payload: unknown) {
  const res = await fetch(url, {
    method: 'POST',
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
    const requestId = String(body.request_id ?? '').trim();
    if (!bookingId && !requestId) {
      return jsonResponse({ error: 'booking_id or request_id required' }, 400);
    }
    if (bookingId && requestId) {
      return jsonResponse({ error: 'Provide only one of booking_id or request_id' }, 400);
    }

    const [callerUser] = await getRest<UserRow[]>(
      `${supabaseUrl}/rest/v1/users?id=eq.${caller!.id}&select=id,role`,
      serviceKey
    );
    const isAdmin = ['admin', 'staff'].includes(String(callerUser?.role ?? ''));
    const nowIso = new Date().toISOString();

    if (bookingId) {
      const [booking] = await getRest<BookingRow[]>(
        `${supabaseUrl}/rest/v1/bookings?id=eq.${bookingId}&select=id,user_id,driver_id,status,payment_status,remaining_amount,remaining_paid_at`,
        serviceKey
      );
      if (!booking) return jsonResponse({ error: 'Booking not found' }, 404);

      const isDriver = String(booking.driver_id ?? '') === caller!.id;
      if (!isAdmin && !isDriver) {
        return jsonResponse({ error: 'Only the assigned driver or admin can collect cash' }, 403);
      }

      const remaining = Number(booking.remaining_amount ?? 0);
      if (remaining <= 0) {
        return jsonResponse({ error: 'No remaining amount on this booking' }, 400);
      }
      if (booking.remaining_paid_at) {
        return jsonResponse({ error: 'Remaining amount is already marked as paid' }, 400);
      }
      if (booking.status !== 'delivered') {
        return jsonResponse({ error: 'Remaining can only be collected after delivery' }, 400);
      }

      await postRest(`${supabaseUrl}/rest/v1/payments`, serviceKey, {
        booking_id: booking.id,
        user_id: booking.user_id,
        amount: remaining,
        status: 'paid',
        error: null,
        metadata: {
          purpose: 'remaining_payment',
          method: 'cash',
          marked_by: caller!.id,
          marked_by_role: isDriver ? 'driver' : 'admin',
        },
      });

      await patchRest(
        `${supabaseUrl}/rest/v1/bookings?id=eq.${bookingId}`,
        serviceKey,
        {
          remaining_paid_at: nowIso,
          remaining_paid_method: 'cash',
          remaining_paid_by: caller!.id,
          payment_status: 'paid',
          updated_at: nowIso,
        }
      );

      return jsonResponse({
        ok: true,
        type: 'booking',
        amount: remaining,
        marked_by_role: isDriver ? 'driver' : 'admin',
      });
    }

    // home service request
    const [requestRow] = await getRest<HomeServiceRow[]>(
      `${supabaseUrl}/rest/v1/home_service_requests?id=eq.${requestId}&select=id,user_id,provider_id,status,payment_status,cash_paid_at,after_service_payment_method`,
      serviceKey
    );
    if (!requestRow) return jsonResponse({ error: 'Request not found' }, 404);

    const isProvider = String(requestRow.provider_id ?? '') === caller!.id;
    if (!isAdmin && !isProvider) {
      return jsonResponse({ error: 'Only the assigned provider or admin can collect cash' }, 403);
    }

    if (requestRow.payment_status === 'paid') {
      return jsonResponse({ error: 'Payment is already completed' }, 400);
    }
    if (requestRow.cash_paid_at) {
      return jsonResponse({ error: 'Cash is already marked as received' }, 400);
    }
    if (requestRow.status !== 'completed') {
      return jsonResponse({ error: 'Cash can only be collected after the service is completed' }, 400);
    }

    await postRest(`${supabaseUrl}/rest/v1/payments`, serviceKey, {
      booking_id: null,
      user_id: requestRow.user_id,
      amount: 150,
      status: 'paid',
      error: null,
      metadata: {
        purpose: 'home_service_payment',
        method: 'cash',
        request_id: requestId,
        marked_by: caller!.id,
        marked_by_role: isProvider ? 'provider' : 'admin',
      },
    });

    await patchRest(
      `${supabaseUrl}/rest/v1/home_service_requests?id=eq.${requestId}`,
      serviceKey,
      {
        payment_status: 'paid',
        cash_paid_at: nowIso,
        cash_paid_by_provider_id: caller!.id,
        after_service_payment_method: 'cash',
      }
    );

    return jsonResponse({
      ok: true,
      type: 'home_service',
      amount: 150,
      marked_by_role: isProvider ? 'provider' : 'admin',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return jsonResponse({ error: msg }, 500);
  }
});
