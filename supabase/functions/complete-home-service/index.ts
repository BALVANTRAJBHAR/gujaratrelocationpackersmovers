import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { corsHeaders } from '../_shared/cors.ts';

type HomeServiceRequestRow = {
  id: string;
  user_id: string | null;
  provider_id: string | null;
  status: string | null;
  complete_otp: string | null;
  complete_otp_verified_at: string | null;
  after_service_payment_method: string | null;
  cash_paid_at: string | null;
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

    const requestId = String(body.request_id ?? '').trim();
    const action = String(body.action ?? '').trim();
    const otp = String(body.otp ?? '').trim();

    if (!requestId) return jsonResponse({ error: 'request_id required' }, 400);
    if (action !== 'work_done' && action !== 'verify_complete') {
      return jsonResponse({ error: 'action must be work_done or verify_complete' }, 400);
    }

    const [requestRow] = await getRest<HomeServiceRequestRow[]>(
      `${supabaseUrl}/rest/v1/home_service_requests?id=eq.${requestId}&select=id,user_id,provider_id,status,complete_otp,complete_otp_verified_at,after_service_payment_method,cash_paid_at`,
      serviceKey
    );

    if (!requestRow) return jsonResponse({ error: 'Request not found' }, 404);

    const [callerUser] = await getRest<UserRow[]>(
      `${supabaseUrl}/rest/v1/users?id=eq.${caller!.id}&select=id,role`,
      serviceKey
    );
    const isAdmin = ['admin', 'staff'].includes(String(callerUser?.role ?? ''));
    const isProvider = String(requestRow.provider_id ?? '') === caller!.id;

    if (!isAdmin && !isProvider) {
      return jsonResponse({ error: 'Only the assigned provider can complete this request' }, 403);
    }

    if (requestRow.status === 'completed') {
      return jsonResponse({ error: 'Request is already completed' }, 400);
    }

    if (action === 'work_done') {
      if (requestRow.complete_otp) {
        return jsonResponse({ error: 'OTP already sent' }, 400);
      }

      const generatedOtp = String(Math.floor(1000 + Math.random() * 9000));

      await patchRest(
        `${supabaseUrl}/rest/v1/home_service_requests?id=eq.${requestId}`,
        serviceKey,
        { complete_otp: generatedOtp }
      );

      return jsonResponse({ ok: true, otp: generatedOtp });
    }

    // verify_complete
    const expectedOtp = String(requestRow.complete_otp ?? '').trim();
    if (!expectedOtp) {
      return jsonResponse({ error: 'Mark work done first to generate the OTP' }, 400);
    }
    if (otp.length !== 4 || otp !== expectedOtp) {
      return jsonResponse({ error: 'Incorrect OTP' }, 400);
    }

    const updates: Record<string, unknown> = {
      status: 'completed',
      complete_otp_verified_at: new Date().toISOString(),
    };
    if (requestRow.after_service_payment_method === 'cash' && !requestRow.cash_paid_at) {
      updates.cash_paid_at = new Date().toISOString();
      updates.cash_paid_by_provider_id = caller!.id;
      updates.payment_status = 'paid';
    }

    await patchRest(
      `${supabaseUrl}/rest/v1/home_service_requests?id=eq.${requestId}`,
      serviceKey,
      updates
    );

    return jsonResponse({ ok: true, completed: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return jsonResponse({ error: msg }, 500);
  }
});