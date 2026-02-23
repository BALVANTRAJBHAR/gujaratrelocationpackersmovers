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
  created_at: string | null;
};

type QuotePayload = {
  name?: string;
  phone?: string;
  email?: string;
  service?: string;
  message?: string;
  source?: string;
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
        `${supabaseUrl}/rest/v1/quote_requests?id=eq.${quoteId}&select=id,name,phone,email,service,message,source,created_at`,
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
        `${supabaseUrl}/rest/v1/quote_requests?select=id,name,phone,email,service,message,source,created_at`,
        serviceKey,
        {
          name,
          phone,
          email: email || null,
          service: service || null,
          message: message || null,
          source: source || 'app',
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
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
        <h2 style="margin: 0 0 10px 0; color: #0f172a;">New Quote Request</h2>
        <div style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px;">
          <p style="margin: 0; color: #334155;"><b>Name:</b> ${escapeHtml(String(quote.name ?? '-'))}</p>
          <p style="margin: 6px 0 0 0; color: #334155;"><b>Phone:</b> ${escapeHtml(String(quote.phone ?? '-'))}</p>
          <p style="margin: 6px 0 0 0; color: #334155;"><b>Email:</b> ${escapeHtml(String(quote.email ?? '-'))}</p>
          <p style="margin: 6px 0 0 0; color: #334155;"><b>Service:</b> ${escapeHtml(String(quote.service ?? '-'))}</p>
          <p style="margin: 6px 0 0 0; color: #334155;"><b>Message:</b><br/>${escapeHtml(String(quote.message ?? '-'))}</p>
          <p style="margin: 10px 0 0 0; color: #64748b; font-size: 12px;"><b>Source:</b> ${escapeHtml(String(quote.source ?? '-'))} • <b>Created:</b> ${escapeHtml(String(quote.created_at ?? '-'))}</p>
        </div>
        <p style="margin: 14px 0 0 0; color: #94a3b8; font-size: 12px;">Automated email from the app.</p>
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

    return jsonResponse({ sent: true, quote_id: quote.id });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: error instanceof Error ? error.message : 'Failed to send quote email' }, 500);
  }
});
