import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { corsHeaders } from '../_shared/cors.ts';

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();

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

    const userId = String(body.user_id ?? '').trim();
    const action = String(body.action ?? '').trim();
    const deviceType = String(body.device_type ?? 'unknown').trim();
    const platform = String(body.platform ?? '').trim() || null;
    const os = String(body.os ?? '').trim() || null;
    const browser = String(body.browser ?? '').trim() || null;
    const userAgent = String(body.user_agent ?? '').trim() || null;
    const appVersion = String(body.app_version ?? '').trim() || null;

    if (!userId) return jsonResponse({ error: 'user_id required' }, 400);
    if (!['login', 'logout'].includes(action)) {
      return jsonResponse({ error: 'action must be login or logout' }, 400);
    }
    if (!['mobile_app', 'mobile_web', 'desktop_web', 'unknown'].includes(deviceType)) {
      return jsonResponse({ error: `Invalid device_type: ${deviceType}` }, 400);
    }

    const ipAddress = String(req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || null;

    const res = await fetch(`${supabaseUrl}/rest/v1/auth_activity_logs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        user_id: userId,
        action,
        device_type: deviceType,
        platform,
        os,
        browser,
        user_agent: userAgent,
        app_version: appVersion,
        ip_address: ipAddress,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `REST error: ${res.status}`);
    }

    return jsonResponse({ ok: true });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});