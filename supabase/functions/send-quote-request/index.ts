import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import nodemailer from 'npm:nodemailer@6.9.13';

import { corsHeaders } from '../_shared/cors.ts';

type QuoteRow = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  service: string | null;
  message: string | null;
  source: string | null;
  status: string | null;
  remark: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type QuotePayload = {
  name?: string;
  phone?: string;
  email?: string;
  service?: string;
  message?: string;
  source?: string;
};

type UserRow = {
  id: string;
  expo_push_token: string | null;
  name: string | null;
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

async function postRest<T>(url: string, serviceKey: string, body: unknown, preferReturn = true): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'Content-Type': 'application/json',
      ...(preferReturn ? { Prefer: 'return=representation' } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `REST error: ${res.status}`);
  }

  return (await res.json()) as T;
}

function escapeHtml(input: string) {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const quoteId = String(body.quote_id ?? '').trim();
    const payload = (body?.payload ?? body) as QuotePayload;

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

    let quote: QuoteRow | null = null;

    if (quoteId) {
      const [row] = await getRest<QuoteRow[]>(
        `${supabaseUrl}/rest/v1/quote_requests?id=eq.${quoteId}&select=id,name,phone,email,service,message,source,status,remark,created_at,updated_at`,
        serviceKey
      );

      if (!row) {
        return jsonResponse({ error: 'Quote request not found' }, 404);
      }
      quote = row;
    } else {
      const name = String(payload?.name ?? '').trim();
      const phone = String(payload?.phone ?? '').replace(/\D/g, '').trim();
      const email = String(payload?.email ?? '').trim();
      const service = String(payload?.service ?? '').trim();
      const message = String(payload?.message ?? '').trim();
      const source = String(payload?.source ?? '').trim();

      if (!name || !phone) {
        return jsonResponse({ error: 'name and phone required' }, 400);
      }

      if (phone.length !== 10) {
        return jsonResponse({ error: 'phone must be exactly 10 digits' }, 400);
      }

      const [inserted] = await postRest<QuoteRow[]>(
        `${supabaseUrl}/rest/v1/quote_requests?select=id,name,phone,email,service,message,source,status,remark,created_at,updated_at`,
        serviceKey,
        {
          name,
          phone,
          email: email || null,
          service: service || null,
          message: message || null,
          source: source || 'app',
          status: 'pending',
          remark: null,
        }
      );

      quote = inserted ?? null;
      if (!quote) {
        return jsonResponse({ error: 'Failed to create quote request' }, 500);
      }
    }

    const smtpHost = Deno.env.get('SMTP_HOST') ?? '';
    const smtpPort = Number(Deno.env.get('SMTP_PORT') ?? '587');
    const smtpUser = Deno.env.get('SMTP_USER') ?? '';
    const smtpPass = Deno.env.get('SMTP_PASS') ?? '';
    const smtpSecure = String(Deno.env.get('SMTP_SECURE') ?? 'false').toLowerCase() === 'true';

    const fromEmail = Deno.env.get('SMTP_FROM') ?? smtpUser;
    const fromName = Deno.env.get('SMTP_FROM_NAME') ?? 'Packers & Movers';
    const adminEmail = Deno.env.get('ADMIN_EMAIL') ?? '';

    if (!smtpHost || !smtpPort || !smtpUser || !smtpPass || !fromEmail || !adminEmail) {
      return jsonResponse(
        {
          error: 'SMTP env missing',
          required: ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'ADMIN_EMAIL'],
        },
        500
      );
    }

    const subject = `New Quote Request - ${quote.id}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; background: #f8fafc; padding: 24px;">
        <div style="background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 20px 50px rgba(15, 23, 42, 0.08);">
          <div style="background: #0f172a; color: #ffffff; padding: 28px 24px;">
            <h1 style="margin: 0; font-size: 24px; letter-spacing: 0.02em;">New Callback Request</h1>
            <p style="margin: 10px 0 0 0; color: #cbd5e1; font-size: 14px;">A new request has been received. Please review the details below.</p>
          </div>
          <div style="padding: 24px;">
            <div style="display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 24px;">
              <div style="flex: 1; min-width: 220px;">
                <p style="margin: 0; color: #334155; font-weight: 700;">Reference</p>
                <p style="margin: 6px 0 0 0; color: #475569;">${escapeHtml(String(quote.id ?? '-'))}</p>
              </div>
              <div style="flex: 1; min-width: 220px;">
                <p style="margin: 0; color: #334155; font-weight: 700;">Created</p>
                <p style="margin: 6px 0 0 0; color: #475569;">${escapeHtml(String(quote.created_at ?? '-'))}</p>
              </div>
              <div style="flex: 1; min-width: 220px;">
                <p style="margin: 0; color: #334155; font-weight: 700;">Status</p>
                <p style="margin: 6px 0 0 0; color: #475569;">${escapeHtml(String(quote.status ?? 'pending'))}</p>
              </div>
            </div>
            <div style="border: 1px solid #e2e8f0; border-radius: 14px; padding: 18px; background: #f8fafc;">
              <p style="margin: 0; color: #334155; font-weight: 700;">Customer</p>
              <p style="margin: 6px 0 0 0; color: #475569;"><b>Name:</b> ${escapeHtml(String(quote.name ?? '-'))}</p>
              <p style="margin: 6px 0 0 0; color: #475569;"><b>Phone:</b> ${escapeHtml(String(quote.phone ?? '-'))}</p>
              <p style="margin: 6px 0 0 0; color: #475569;"><b>Email:</b> ${escapeHtml(String(quote.email ?? '-'))}</p>
              <p style="margin: 14px 0 0 0; color: #334155; font-weight: 700;">Request details</p>
              <p style="margin: 6px 0 0 0; color: #475569;"><b>Service:</b> ${escapeHtml(String(quote.service ?? '-'))}</p>
              <p style="margin: 6px 0 0 0; color: #475569;"><b>Message:</b> ${escapeHtml(String(quote.message ?? '-'))}</p>
              <p style="margin: 12px 0 0 0; color: #64748b; font-size: 13px;"><b>Source:</b> ${escapeHtml(String(quote.source ?? '-'))}</p>
            </div>
          </div>
          <div style="padding: 20px 24px 28px 24px; background: #f8fafc;">
            <p style="margin: 0; color: #64748b; font-size: 13px;">This email was generated automatically by the app.</p>
          </div>
        </div>
      </div>
    `;

    const transport = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    await transport.sendMail({
      from: `${fromName} <${fromEmail}>`,
      to: adminEmail,
      subject,
      text: `New Quote Request\nName: ${quote.name ?? '-'}\nPhone: ${quote.phone ?? '-'}\nEmail: ${quote.email ?? '-'}\nService: ${quote.service ?? '-'}\nMessage: ${quote.message ?? '-'}`,
      html,
    });

    try {
      const adminUsers = await getRest<UserRow[]>(
        `${supabaseUrl}/rest/v1/users?role=in.(admin,staff)&select=id,expo_push_token,name,role`,
        serviceKey
      );

      const title = 'New Callback Request';
      const body = `New request from ${escapeHtml(String(quote.name ?? 'Customer'))} for ${escapeHtml(String(quote.service ?? 'service'))}.`;
      const notificationRows: Array<{ user_id: string; title: string; body: string; type: string; data: Record<string, unknown> }> = [];

      for (const admin of adminUsers ?? []) {
        const token = String(admin.expo_push_token ?? '').trim();
        if (!token) continue;

        try {
          await sendExpoPush(token, title, body, {
            quote_id: quote.id,
            type: 'quote_request',
          });
        } catch (pushError) {
          console.error('Failed to send admin push notification:', pushError);
        }

        if (admin.id) {
          notificationRows.push({
            user_id: admin.id,
            title,
            body,
            type: 'quote_request',
            data: { quote_id: quote.id, service: quote.service ?? null },
          });
        }
      }

      if (notificationRows.length) {
        await insertNotifications(supabaseUrl, serviceKey, notificationRows);
      }
    } catch (notifyError) {
      console.error('Admin push/notification error', notifyError);
    }

    return jsonResponse({ sent: true, quote_id: quote.id });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: error instanceof Error ? error.message : 'Failed to send quote email' }, 500);
  }
});
