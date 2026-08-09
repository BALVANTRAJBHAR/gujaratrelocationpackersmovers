import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import nodemailer from 'npm:nodemailer@6.9.13';

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
  email?: string | null;
  role?: string | null;
};

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
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
    ro: 'RO Service',
  };
  return labels[serviceKey] || serviceKey;
}

function getStatusMessages(status: string) {
  const s = String(status ?? '').trim();

  if (s === 'rescheduled') {
    return {
      title: 'Home service rescheduled',
      customer: 'Your home service request has been rescheduled.',
      admin: 'A home service request was rescheduled.',
    };
  }

  if (s === 'cancelled') {
    return {
      title: 'Home service cancelled',
      customer: 'Your home service request has been cancelled.',
      admin: 'A home service request was cancelled.',
    };
  }

  if (s === 'completed') {
    return {
      title: 'Home service completed',
      customer: 'Your home service request has been completed.',
      admin: 'A home service request was completed.',
    };
  }

  const human = s.replaceAll('_', ' ');
  return {
    title: 'Home service updated',
    customer: `Your home service request status updated: ${human}.`,
    admin: `Home service request status updated: ${human}.`,
  };
}

async function sendRescheduleEmail(opts: { to: string; customerName: string; serviceLabel: string; newDate: string; newTime: string }) {
  const to = String(opts.to ?? '').trim();
  if (!to) return;
  const smtpHost = Deno.env.get('SMTP_HOST') ?? '';
  const smtpPort = Number(Deno.env.get('SMTP_PORT') ?? '587');
  const smtpUser = Deno.env.get('SMTP_USER') ?? '';
  const smtpPass = Deno.env.get('SMTP_PASS') ?? '';
  const smtpSecure = String(Deno.env.get('SMTP_SECURE') ?? 'false').toLowerCase() === 'true';
  const fromEmail = Deno.env.get('SMTP_FROM') ?? smtpUser;
  const fromName = Deno.env.get('SMTP_FROM_NAME') ?? 'Packers & Movers';
  if (!smtpHost || !smtpPort || !smtpUser || !smtpPass || !fromEmail) return;

  const serviceText = String(opts.serviceLabel ?? 'service').trim();
  const dateText = String(opts.newDate ?? '').trim();
  const timeText = String(opts.newTime ?? '').trim();

  const subject = 'Your home service request has been rescheduled';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; background: #f8fafc; padding: 24px;">
      <div style="background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 20px 50px rgba(15, 23, 42, 0.08);">
        <div style="background: #0f172a; color: #ffffff; padding: 28px 24px;">
          <h1 style="margin: 0; font-size: 22px; letter-spacing: 0.02em;">Service Rescheduled</h1>
          <p style="margin: 10px 0 0 0; color: #cbd5e1; font-size: 14px;">Your home service request has been rescheduled. Please check the new schedule below.</p>
        </div>
        <div style="padding: 24px;">
          <div style="border: 1px solid #e2e8f0; border-radius: 14px; padding: 18px; background: #f8fafc;">
            <p style="margin: 0; color: #334155; font-weight: 700;">Service</p>
            <p style="margin: 6px 0 0 0; color: #475569;">${escapeHtml(serviceText)}</p>
            <p style="margin: 14px 0 0 0; color: #334155; font-weight: 700;">New schedule</p>
            <p style="margin: 6px 0 0 0; color: #475569;"><b>Date:</b> ${escapeHtml(dateText || '-')}</p>
            <p style="margin: 6px 0 0 0; color: #475569;"><b>Time:</b> ${escapeHtml(timeText || '-')}</p>
            <p style="margin: 14px 0 0 0; color: #64748b; font-size: 13px;">If you need to make any changes, please contact our team.</p>
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
    auth: { user: smtpUser, pass: smtpPass },
  });

  await transport.sendMail({
    from: `${fromName} <${fromEmail}>`,
    to,
    subject,
    text: `Your ${serviceText} request has been rescheduled.\nNew date: ${dateText || '-'}\nNew time: ${timeText || '-'}`,
    html,
  });
}

async function sendBookingCreatedEmail(opts: { to: string; customerName: string; serviceLabel: string; date: string; time: string }) {
  const to = String(opts.to ?? '').trim();
  if (!to) return;
  const smtpHost = Deno.env.get('SMTP_HOST') ?? '';
  const smtpPort = Number(Deno.env.get('SMTP_PORT') ?? '587');
  const smtpUser = Deno.env.get('SMTP_USER') ?? '';
  const smtpPass = Deno.env.get('SMTP_PASS') ?? '';
  const smtpSecure = String(Deno.env.get('SMTP_SECURE') ?? 'false').toLowerCase() === 'true';
  const fromEmail = Deno.env.get('SMTP_FROM') ?? smtpUser;
  const fromName = Deno.env.get('SMTP_FROM_NAME') ?? 'Packers & Movers';
  if (!smtpHost || !smtpPort || !smtpUser || !smtpPass || !fromEmail) return;

  const serviceText = String(opts.serviceLabel ?? 'service').trim();
  const dateText = String(opts.date ?? '').trim();
  const timeText = String(opts.time ?? '').trim();

  const subject = `Your ${serviceText} service request is confirmed`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; background: #f8fafc; padding: 24px;">
      <div style="background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 20px 50px rgba(15, 23, 42, 0.08);">
        <div style="background: #0f172a; color: #ffffff; padding: 28px 24px;">
          <h1 style="margin: 0; font-size: 22px; letter-spacing: 0.02em;">Booking Confirmed</h1>
          <p style="margin: 10px 0 0 0; color: #cbd5e1; font-size: 14px;">Your ${escapeHtml(serviceText)} service request has been confirmed.</p>
        </div>
        <div style="padding: 24px;">
          <div style="border: 1px solid #e2e8f0; border-radius: 14px; padding: 18px; background: #f8fafc;">
            <p style="margin: 0; color: #334155; font-weight: 700;">Service</p>
            <p style="margin: 6px 0 0 0; color: #475569;">${escapeHtml(serviceText)}</p>
            <p style="margin: 14px 0 0 0; color: #334155; font-weight: 700;">Schedule</p>
            <p style="margin: 6px 0 0 0; color: #475569;"><b>Date:</b> ${escapeHtml(dateText || '-')}</p>
            <p style="margin: 6px 0 0 0; color: #475569;"><b>Time:</b> ${escapeHtml(timeText || '-')}</p>
            <p style="margin: 14px 0 0 0; color: #64748b; font-size: 13px;">A service provider will reach out to you shortly. Thank you for choosing us!</p>
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
    auth: { user: smtpUser, pass: smtpPass },
  });

  await transport.sendMail({
    from: `${fromName} <${fromEmail}>`,
    to,
    subject,
    text: `Your ${serviceText} service request has been confirmed.\nDate: ${dateText || '-'}\nTime: ${timeText || '-'}`,
    html,
  });
}

async function sendCancelledEmail(opts: { to: string; serviceLabel: string }) {
  const to = String(opts.to ?? '').trim();
  if (!to) return;
  const smtpHost = Deno.env.get('SMTP_HOST') ?? '';
  const smtpPort = Number(Deno.env.get('SMTP_PORT') ?? '587');
  const smtpUser = Deno.env.get('SMTP_USER') ?? '';
  const smtpPass = Deno.env.get('SMTP_PASS') ?? '';
  const smtpSecure = String(Deno.env.get('SMTP_SECURE') ?? 'false').toLowerCase() === 'true';
  const fromEmail = Deno.env.get('SMTP_FROM') ?? smtpUser;
  const fromName = Deno.env.get('SMTP_FROM_NAME') ?? 'Packers & Movers';
  if (!smtpHost || !smtpPort || !smtpUser || !smtpPass || !fromEmail) return;

  const serviceText = String(opts.serviceLabel ?? 'service').trim();

  const subject = 'Your home service request has been cancelled';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; background: #f8fafc; padding: 24px;">
      <div style="background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 20px 50px rgba(15, 23, 42, 0.08);">
        <div style="background: #0f172a; color: #ffffff; padding: 28px 24px;">
          <h1 style="margin: 0; font-size: 22px; letter-spacing: 0.02em;">Service Cancelled</h1>
          <p style="margin: 10px 0 0 0; color: #cbd5e1; font-size: 14px;">Your home service request has been cancelled.</p>
        </div>
        <div style="padding: 24px;">
          <div style="border: 1px solid #e2e8f0; border-radius: 14px; padding: 18px; background: #f8fafc;">
            <p style="margin: 0; color: #334155; font-weight: 700;">Service</p>
            <p style="margin: 6px 0 0 0; color: #475569;">${escapeHtml(serviceText)}</p>
            <p style="margin: 14px 0 0 0; color: #475569;">Your ${escapeHtml(serviceText)} request has been cancelled. If this was not done by you or you have any questions, please contact our team.</p>
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
    auth: { user: smtpUser, pass: smtpPass },
  });

  await transport.sendMail({
    from: `${fromName} <${fromEmail}>`,
    to,
    subject,
    text: `Your ${serviceText} request has been cancelled.`,
    html,
  });
}

async function sendCompletedEmail(opts: { to: string; customerName: string; serviceLabel: string; date: string; time: string }) {
  const to = String(opts.to ?? '').trim();
  if (!to) return;
  const smtpHost = Deno.env.get('SMTP_HOST') ?? '';
  const smtpPort = Number(Deno.env.get('SMTP_PORT') ?? '587');
  const smtpUser = Deno.env.get('SMTP_USER') ?? '';
  const smtpPass = Deno.env.get('SMTP_PASS') ?? '';
  const smtpSecure = String(Deno.env.get('SMTP_SECURE') ?? 'false').toLowerCase() === 'true';
  const fromEmail = Deno.env.get('SMTP_FROM') ?? smtpUser;
  const fromName = Deno.env.get('SMTP_FROM_NAME') ?? 'Packers & Movers';
  if (!smtpHost || !smtpPort || !smtpUser || !smtpPass || !fromEmail) return;

  const serviceText = String(opts.serviceLabel ?? 'service').trim();
  const dateText = String(opts.date ?? '').trim();
  const timeText = String(opts.time ?? '').trim();

  const subject = `Your ${serviceText} service request is completed`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; background: #f8fafc; padding: 24px;">
      <div style="background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 20px 50px rgba(15, 23, 42, 0.08);">
        <div style="background: #0f172a; color: #ffffff; padding: 28px 24px;">
          <h1 style="margin: 0; font-size: 22px; letter-spacing: 0.02em;">Service Completed</h1>
          <p style="margin: 10px 0 0 0; color: #cbd5e1; font-size: 14px;">Your ${escapeHtml(serviceText)} service request has been completed.</p>
        </div>
        <div style="padding: 24px;">
          <div style="border: 1px solid #e2e8f0; border-radius: 14px; padding: 18px; background: #f8fafc;">
            <p style="margin: 0; color: #334155; font-weight: 700;">Service</p>
            <p style="margin: 6px 0 0 0; color: #475569;">${escapeHtml(serviceText)}</p>
            <p style="margin: 14px 0 0 0; color: #334155; font-weight: 700;">Schedule</p>
            <p style="margin: 6px 0 0 0; color: #475569;"><b>Date:</b> ${escapeHtml(dateText || '-')}</p>
            <p style="margin: 6px 0 0 0; color: #475569;"><b>Time:</b> ${escapeHtml(timeText || '-')}</p>
            <p style="margin: 14px 0 0 0; color: #64748b; font-size: 13px;">Thank you for choosing us! If you have any feedback, please share it with our team.</p>
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
    auth: { user: smtpUser, pass: smtpPass },
  });

  await transport.sendMail({
    from: `${fromName} <${fromEmail}>`,
    to,
    subject,
    text: `Your ${serviceText} service request has been completed.\nDate: ${dateText || '-'}\nTime: ${timeText || '-'}`,
    html,
  });
}

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
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
      return new Response(JSON.stringify({ error: 'Invalid or expired session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const requestId = String(body.request_id ?? '').trim();

    if (!requestId) return jsonResponse({ error: 'request_id required' }, 400);

    const nextStatus = String(body.status ?? '').trim();
    const sendEmail = String(body.send_email ?? '').trim() === 'true';
    const newDate = String(body.new_date ?? '').trim();
    const newTime = String(body.new_time ?? '').trim();

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

    const requestType = String(body.type ?? '').trim();

    if (requestType === 'otp') {
      const otp = String(body.otp ?? '').trim();
      if (!otp) return jsonResponse({ error: 'otp required' }, 400);

      const serviceLabel = getServiceLabel(String(homeServiceRequest.service_key ?? '').trim());
      const title = 'Work completed — OTP required';
      const customerBody = `Your ${serviceLabel} service is done. Share this OTP with your service provider to complete: ${otp}`;

      const rows: Array<{ user_id: string; title: string; body: string; type?: string; data?: Record<string, unknown> }> = [];

      if (homeServiceRequest.user_id) {
        try {
          const [customer] = await getRest<UserRow[]>(
            `${supabaseUrl}/rest/v1/users?id=eq.${homeServiceRequest.user_id}&select=id,expo_push_token,name,email`,
            serviceKey
          );

          if (customer?.id) {
            rows.push({
              user_id: customer.id,
              title,
              body: customerBody,
              type: 'home_service_otp',
              data: { request_id: requestId, type: 'otp', otp },
            });
          }
          if (customer?.expo_push_token) {
            try {
              await sendExpoPush(customer.expo_push_token, title, customerBody, {
                request_id: requestId,
                type: 'home_service_otp',
              });
            } catch (e) {
              console.error('Home service OTP push failed:', e);
            }
          }
          if (customer?.id) {
            await sendWebPushForUser(supabaseUrl, serviceKey, customer.id, title, customerBody, `/home-services/${requestId}`);
          }
        } catch (e) {
          console.error('Home service OTP notification failed:', e);
        }
      }

      try {
        await insertNotifications(supabaseUrl, serviceKey, rows);
      } catch (e) {
        console.error('Home service OTP inbox insert failed:', e);
      }

      return jsonResponse({ sent: true, otp_sent: true });
    }

    if (nextStatus) {
      try {
        const [customer] = await getRest<UserRow[]>(
          `${supabaseUrl}/rest/v1/users?id=eq.${homeServiceRequest.user_id}&select=id,expo_push_token,name,role,email`,
          serviceKey
        );
        const admins = await getRest<UserRow[]>(
          `${supabaseUrl}/rest/v1/users?select=id,expo_push_token,name,role,email&role=in.(admin,staff)`,
          serviceKey
        );

        const statusMessages = getStatusMessages(nextStatus);
        const serviceLabel = getServiceLabel(String(homeServiceRequest.service_key ?? '').trim());
        const title = statusMessages.title;
        const customerMessage = statusMessages.customer;
        const adminMessage = statusMessages.admin;

        // Emails go to the customer only. Admins are notified via push + in-app
        // inbox (they deliberately do not receive email).
        const emailTo: string[] = [];
        if (customer?.email) emailTo.push(customer.email.trim());
        const emailRecipients = [...new Set(emailTo.filter(Boolean))].join(',');

        if (sendEmail && emailRecipients) {
          if (nextStatus === 'rescheduled') {
            try {
              await sendRescheduleEmail({
                to: emailRecipients,
                customerName: customer?.name ?? 'Customer',
                serviceLabel,
                newDate,
                newTime,
              });
            } catch (e) {
              console.error('Home service reschedule email failed:', e);
            }
          } else if (nextStatus === 'cancelled') {
            try {
              await sendCancelledEmail({ to: emailRecipients, serviceLabel });
            } catch (e) {
              console.error('Home service cancel email failed:', e);
            }
          } else if (nextStatus === 'completed') {
            try {
              await sendCompletedEmail({
                to: emailRecipients,
                customerName: customer?.name ?? 'Customer',
                serviceLabel,
                date: String(homeServiceRequest.preferred_date ?? '').trim(),
                time: String(homeServiceRequest.preferred_time ?? '').trim(),
              });
            } catch (e) {
              console.error('Home service completed email failed:', e);
            }
          }
        }

        const rows: Array<{ user_id: string; title: string; body: string; type?: string; data?: Record<string, unknown> }> = [];
        if (customer?.id) {
          rows.push({
            user_id: customer.id,
            title,
            body: customerMessage,
            type: 'home_service_status',
            data: { request_id: requestId, status: nextStatus },
          });
          if (customer.expo_push_token) {
            await sendExpoPush(customer.expo_push_token, title, customerMessage, {
              request_id: requestId,
              status: nextStatus,
            });
          }
          await sendWebPushForUser(supabaseUrl, serviceKey, customer.id, title, customerMessage, `/home-services/${requestId}`);
        }

        for (const admin of admins ?? []) {
          if (admin?.id) {
            rows.push({
              user_id: admin.id,
              title,
              body: adminMessage,
              type: 'home_service_status',
              data: { request_id: requestId, status: nextStatus },
            });
          }
          if (admin?.expo_push_token) {
            try {
              await sendExpoPush(admin.expo_push_token, title, adminMessage, {
                request_id: requestId,
                status: nextStatus,
              });
            } catch {
              // ignore
            }
          }
          if (admin?.id) {
            await sendWebPushForUser(supabaseUrl, serviceKey, admin.id, title, adminMessage, `/home-services/${requestId}`);
          }
        }

        try {
          await insertNotifications(supabaseUrl, serviceKey, rows);
        } catch {
          // ignore notification inbox failures
        }

        return jsonResponse({ sent: true, status: nextStatus });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        return jsonResponse({ error: msg }, 500);
      }
    }

    const requestServiceKey = String(homeServiceRequest.service_key ?? '').trim();
    const requestState = String(homeServiceRequest.state ?? '').trim();
    const requestCity = String(homeServiceRequest.city ?? '').trim();

    if (!requestServiceKey || !requestState || !requestCity) {
      return jsonResponse({ error: 'Request missing service_key, state, or city' }, 400);
    }

    const serviceLabel = getServiceLabel(requestServiceKey);
    const customerName = String(homeServiceRequest.customer_name ?? 'Customer').trim();
    const preferredDate = String(homeServiceRequest.preferred_date ?? '').trim();
    const preferredTime = String(homeServiceRequest.preferred_time ?? '').trim();

    // Confirm to the customer: email + expo push + web push + in-app inbox
    if (homeServiceRequest.user_id) {
      try {
        const [customerUser] = await getRest<UserRow[]>(
          `${supabaseUrl}/rest/v1/users?id=eq.${homeServiceRequest.user_id}&select=id,email,name,expo_push_token`,
          serviceKey
        );
        const customerTitle = 'Request Confirmed';
        const customerBody = `Your ${serviceLabel} request for ${preferredDate} at ${preferredTime} is confirmed.`;

        if (customerUser?.id) {
          try {
            await insertNotifications(supabaseUrl, serviceKey, [
              {
                user_id: customerUser.id,
                title: customerTitle,
                body: customerBody,
                type: 'home_service_status',
                data: { request_id: requestId, status: 'confirmed' },
              },
            ]);
          } catch {
            // ignore inbox failures
          }
          await sendWebPushForUser(supabaseUrl, serviceKey, customerUser.id, customerTitle, customerBody, `/home-services/${requestId}`);
        }

        if (customerUser?.expo_push_token) {
          try {
            await sendExpoPush(customerUser.expo_push_token, customerTitle, customerBody, {
              request_id: requestId,
              status: 'confirmed',
            });
          } catch (e) {
            console.error('Home service customer push failed:', e);
          }
        }

        if (customerUser?.email) {
          try {
            await sendBookingCreatedEmail({
              to: customerUser.email,
              customerName: customerUser.name ?? customerName,
              serviceLabel,
              date: preferredDate,
              time: preferredTime,
            });
          } catch (e) {
            console.error('Home service booking-created email failed:', e);
          }
        }
      } catch {
        // ignore customer fetch failures
      }
    }

    // Fetch relevant service providers for this service + state + city combo
    const encodedServiceKey = encodeURIComponent(requestServiceKey);
    const encodedState = encodeURIComponent(requestState);
    const encodedCity = encodeURIComponent(requestCity);
    
    const providers = await getRest<HomeServiceProviderRow[]>(
      `${supabaseUrl}/rest/v1/home_service_providers?service_key=eq.${encodedServiceKey}&state=eq.${encodedState}&city=eq.${encodedCity}&is_active=eq.true&select=id,user_id,service_key,state,city`,
      serviceKey
    );

    if (!providers || providers.length === 0) {
      return jsonResponse({ sent: true, providers_count: 0, message: 'No active providers for this service in the city' });
    }

    // Fetch provider tokens
    const providerIds = providers.map((p) => p.user_id);
    const quotedIds = providerIds.map((id) => `"${id}"`).join(',');
    const providerUsers = await getRest<UserRow[]>(
      `${supabaseUrl}/rest/v1/users?id=in.(${quotedIds})&select=id,expo_push_token,name,role`,
      serviceKey
    );

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
    const providerBody = `${customerName} requested ${serviceLabel.toLowerCase()} on ${preferredDate} at ${preferredTime}`;

    (providerUsers ?? []).forEach((provider: UserRow) => {
      const token = provider?.expo_push_token ?? '';
      if (!token) return;

      notifications.push({
        to: token,
        body: providerBody,
      });

      if (provider?.id) {
        notificationRows.push({
          user_id: provider.id,
          title,
          body: providerBody,
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

    // Send web push notifications to each provider
    for (const provider of (providerUsers ?? [])) {
      if (provider?.id) {
        await sendWebPushForUser(
          supabaseUrl,
          serviceKey,
          provider.id,
          title,
          providerBody,
          `/home-services/${requestId}`
        );
      }
    }

    // Notify admin/staff about new request
    try {
      const admins = await getRest<UserRow[]>(
        `${supabaseUrl}/rest/v1/users?select=id,expo_push_token,name,role&role=in.(admin,staff)`,
        serviceKey
      );

      const adminTitle = `New ${serviceLabel} Request`;
      const adminBody = `${customerName} requested ${serviceLabel.toLowerCase()} for ${preferredDate} in ${requestCity}, ${requestState}`;

      for (const admin of (admins ?? [])) {
        if (admin?.expo_push_token) {
          try {
            await sendExpoPush(admin.expo_push_token, adminTitle, adminBody, {
              request_id: requestId,
              type: 'home_service_request',
            });
          } catch (e) {
            console.error('Failed to send admin push:', e);
          }
        }

        if (admin?.id) {
          notificationRows.push({
            user_id: admin.id,
            title: adminTitle,
            body: adminBody,
            type: 'home_service_request_available',
            data: {
              request_id: requestId,
              service_key: requestServiceKey,
              customer_name: customerName,
              preferred_date: preferredDate,
              preferred_time: preferredTime,
            },
          });

          await sendWebPushForUser(supabaseUrl, serviceKey, admin.id, adminTitle, adminBody, `/home-services/${requestId}`);
        }
      }
    } catch (e) {
      console.error('Failed to notify admins:', e);
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
