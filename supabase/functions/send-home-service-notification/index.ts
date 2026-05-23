import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { corsHeaders } from '../_shared/cors.ts';

type HomeServiceRequestRow = {
  id: string;
  user_id: string | null;
  service_key: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  preferred_date: string | null;
  preferred_time: string | null;
  state: string | null;
  city: string | null;
  status: string | null;
};

type HomeServiceProviderRow = {
  id: string;
  user_id: string;
  service_key: string;
  state: string;
  city: string;
};

type UserRow = {
  id: string;
  expo_push_token: string | null;
  name: string | null;
  role?: string | null;
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

async function insertNotifications(
  supabaseUrl: string,
  serviceKey: string,
  rows: Array<{
    user_id: string;
    title: string;
    body: string;
    type?: string;
    data?: Record<string, unknown>;
  }>
) {
  if (!rows.length) return;
  await postRest(
    `${supabaseUrl}/rest/v1/notifications`,
    serviceKey,
    rows.map((r) => ({
      user_id: r.user_id,
      title: r.title,
      body: r.body,
      type: r.type ?? null,
      data: r.data ?? null,
    }))
  );
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

function getServiceLabel(serviceKey: string): string {
  const labels: Record<string, string> = {
    ac: 'AC',
    carpenter: 'Carpenter',
    electrician: 'Electrician',
    plumber: 'Plumber',
    pest: 'Pest Control',
    cleaning: 'Deep Cleaning',
    painting: 'Painting',
  };
  return labels[serviceKey] || serviceKey;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const requestId = String(body.request_id ?? '').trim();

    if (!requestId) return jsonResponse({ error: 'request_id required' }, 400);

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

    const [homeServiceRequest] = await getRest<HomeServiceRequestRow[]>(
      `${supabaseUrl}/rest/v1/home_service_requests?id=eq.${requestId}&select=id,user_id,service_key,customer_name,customer_phone,preferred_date,preferred_time,state,city,status`,
      serviceKey
    );

    if (!homeServiceRequest) return jsonResponse({ error: 'Home service request not found' }, 404);

    const requestServiceKey = String(homeServiceRequest.service_key ?? '').trim();
    const requestState = String(homeServiceRequest.state ?? '').trim();
    const requestCity = String(homeServiceRequest.city ?? '').trim();

    if (!requestServiceKey || !requestState || !requestCity) {
      return jsonResponse({ error: 'Request missing service_key, state, or city' }, 400);
    }

    // Fetch relevant service providers for this service + state + city combo
    const providers = await getRest<HomeServiceProviderRow[]>(
      `${supabaseUrl}/rest/v1/home_service_providers?service_key=eq.${requestServiceKey}&state=eq.${requestState}&city=eq.${requestCity}&is_active=eq.true&select=id,user_id,service_key,state,city`,
      serviceKey
    );

    if (!providers || providers.length === 0) {
      return jsonResponse({ sent: true, providers_count: 0, message: 'No active providers for this service in the city' });
    }

    // Fetch provider tokens
    const providerIds = providers.map((p) => p.user_id);
    const providerUsers = await getRest<UserRow[]>(
      `${supabaseUrl}/rest/v1/users?id=in.(${providerIds.join(',')})&select=id,expo_push_token,name,role`,
      serviceKey
    );

    const serviceLabel = getServiceLabel(requestServiceKey);
    const customerName = String(homeServiceRequest.customer_name ?? 'Customer').trim();
    const preferredDate = String(homeServiceRequest.preferred_date ?? '').trim();
    const preferredTime = String(homeServiceRequest.preferred_time ?? '').trim();

    // Send notifications to all available providers
    const notifications: Array<{ to: string; body: string }> = [];
    const notificationRows: Array<{
      user_id: string;
      title: string;
      body: string;
      type?: string;
      data?: Record<string, unknown>;
    }> = [];

    const title = `New ${serviceLabel} Request`;
    const body = `${customerName} requested ${serviceLabel.toLowerCase()} on ${preferredDate} at ${preferredTime}`;

    (providerUsers ?? []).forEach((provider: UserRow) => {
      const token = provider?.expo_push_token ?? '';
      if (!token) return;

      notifications.push({
        to: token,
        body,
      });

      if (provider?.id) {
        notificationRows.push({
          user_id: provider.id,
          title,
          body,
          type: 'home_service_request_available',
          data: {
            request_id: requestId,
            service_key: requestServiceKey,
            customer_name: customerName,
            preferred_date: preferredDate,
            preferred_time: preferredTime,
          },
        });
      }
    });

    // Send push notifications
    for (const n of notifications) {
      try {
        await sendExpoPush(n.to, title, n.body, {
          request_id: requestId,
          service_key: requestServiceKey,
          type: 'home_service_request',
        });
      } catch (e) {
        console.error('Failed to send push to provider:', e);
      }
    }

    // Log to notifications inbox
    try {
      if (notificationRows.length > 0) {
        await insertNotifications(supabaseUrl, serviceKey, notificationRows);
      }
    } catch (e) {
      console.error('Failed to insert notification records:', e);
    }

    return jsonResponse({
      sent: true,
      providers_notified: notifications.length,
      request_id: requestId,
      service: serviceLabel,
    });
  } catch (error) {
    console.error('Error:', error);
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
