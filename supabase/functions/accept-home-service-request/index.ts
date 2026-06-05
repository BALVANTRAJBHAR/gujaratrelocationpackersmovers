import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { corsHeaders } from '../_shared/cors.ts';

type HomeServiceRequestRow = {
  id: string;
  status: string;
  provider_id: string | null;
  provider_accepted_at: string | null;
  service_key: string;
  customer_name: string;
  customer_phone: string;
  preferred_date: string;
  preferred_time: string;
};

type UserRow = {
  id: string;
  name: string | null;
  expo_push_token: string | null;
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

async function postRest<T>(url: string, serviceKey: string, payload: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `REST error: ${res.status}`);
  }

  return (await res.json()) as T;
}

async function patchRest<T>(url: string, serviceKey: string, payload: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `REST error: ${res.status}`);
  }

  return (await res.json()) as T;
}

async function sendExpoPush(to: string, title: string, body: string, data: Record<string, unknown>) {
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to,
      title,
      body,
      data,
      sound: 'default',
      badge: 1,
      priority: 'high',
    }),
  });

  const text = await res.text();
  let parsed: any = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  if (!res.ok) {
    throw new Error(parsed?.errors?.[0]?.message || parsed?.error || text || `Expo push error (${res.status})`);
  }

  const expoStatus = parsed?.data?.status;
  if (expoStatus && expoStatus !== 'ok') {
    throw new Error(parsed?.data?.message || 'Expo push failed');
  }

  return parsed;
}

async function sendWebPushForUser(
  supabaseUrl: string,
  serviceKey: string,
  userId: string,
  title: string,
  body: string,
  url: string
) {
  try {
    await fetch(`${supabaseUrl}/functions/v1/send-web-push`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ user_id: userId, title, body, url }),
    });
  } catch {
    // ignore web push failures
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const requestId = String(body.request_id ?? '').trim();
    const providerId = String(body.provider_id ?? '').trim();

    if (!requestId) return jsonResponse({ error: 'request_id required' }, 400);
    if (!providerId) return jsonResponse({ error: 'provider_id required' }, 400);

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

    // Fetch the request
    const [homeServiceRequest] = await getRest<HomeServiceRequestRow[]>(
      `${supabaseUrl}/rest/v1/home_service_requests?id=eq.${requestId}&select=id,status,provider_id,provider_accepted_at,service_key,customer_name,customer_phone,preferred_date,preferred_time`,
      serviceKey
    );

    if (!homeServiceRequest) return jsonResponse({ error: 'Request not found' }, 404);

    // Check if already accepted by another provider
    if (homeServiceRequest.provider_id && homeServiceRequest.provider_id !== providerId) {
      return jsonResponse(
        {
          error: 'Request already accepted by another provider',
          provider_accepted_at: homeServiceRequest.provider_accepted_at,
        },
        400
      );
    }

    // Check if this provider already accepted
    if (homeServiceRequest.provider_id === providerId) {
      return jsonResponse(
        {
          success: true,
          message: 'You have already accepted this request',
          request_id: requestId,
        },
        200
      );
    }

    // Record the acceptance
    await postRest(
      `${supabaseUrl}/rest/v1/home_service_acceptances`,
      serviceKey,
      {
        request_id: requestId,
        provider_id: providerId,
        status: 'accepted',
      }
    );

    // Get provider details
    const [provider] = await getRest<UserRow[]>(
      `${supabaseUrl}/rest/v1/users?id=eq.${providerId}&select=id,name`,
      serviceKey
    );

    const providerName = provider?.name ?? 'Service Provider';

    // Update request with provider info
    await patchRest(
      `${supabaseUrl}/rest/v1/home_service_requests?id=eq.${requestId}`,
      serviceKey,
      {
        provider_id: providerId,
        provider_name: providerName,
        provider_accepted_at: new Date().toISOString(),
        status: 'accepted',
      }
    );

    // Notify customer of acceptance
    const [customer] = await getRest<UserRow[]>(
      `${supabaseUrl}/rest/v1/users?id=eq.${homeServiceRequest.id}&select=id,expo_push_token`,
      serviceKey
    );

    if (customer?.expo_push_token) {
      try {
        await sendExpoPush(
          customer.expo_push_token,
          'Service Provider Accepted',
          `${providerName} has accepted your ${homeServiceRequest.service_key} request for ${homeServiceRequest.preferred_date}`,
          {
            request_id: requestId,
            type: 'provider_accepted',
          }
        );
      } catch (e) {
        console.error('Failed to send customer notification:', e);
      }
    }

    if (customer?.id) {
      await sendWebPushForUser(
        supabaseUrl,
        serviceKey,
        customer.id,
        'Service Provider Accepted',
        `${providerName} has accepted your ${homeServiceRequest.service_key} request for ${homeServiceRequest.preferred_date}`,
        `/home-services/${requestId}`
      );
    }

    return jsonResponse({
      success: true,
      message: 'Request accepted successfully',
      request_id: requestId,
      provider_id: providerId,
      provider_name: providerName,
    });
  } catch (error) {
    console.error('Error:', error);
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});
