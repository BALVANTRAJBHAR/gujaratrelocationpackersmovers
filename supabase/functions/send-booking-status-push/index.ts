import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import nodemailer from 'npm:nodemailer@6.9.13';

import { corsHeaders } from '../_shared/cors.ts';

type BookingRow = {
  id: string;
  user_id: string | null;
  status: string | null;
  driver_id?: string | null;
  pickup_otp?: string | null;
  delivery_otp?: string | null;
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

async function sendRescheduleEmail(opts: { to: string; customerName: string; newDate: string; newTime: string }) {
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

  const dateText = String(opts.newDate ?? '').trim();
  const timeText = String(opts.newTime ?? '').trim();

  const subject = 'Your shifting booking has been rescheduled';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; background: #f8fafc; padding: 24px;">
      <div style="background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 20px 50px rgba(15, 23, 42, 0.08);">
        <div style="background: #0f172a; color: #ffffff; padding: 28px 24px;">
          <h1 style="margin: 0; font-size: 22px; letter-spacing: 0.02em;">Booking Rescheduled</h1>
          <p style="margin: 10px 0 0 0; color: #cbd5e1; font-size: 14px;">Your shifting booking has been rescheduled. Please check the new schedule below.</p>
        </div>
        <div style="padding: 24px;">
          <div style="border: 1px solid #e2e8f0; border-radius: 14px; padding: 18px; background: #f8fafc;">
            <p style="margin: 0; color: #334155; font-weight: 700;">New schedule</p>
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
    text: `Your booking has been rescheduled.\nNew date: ${dateText || '-'}\nNew time: ${timeText || '-'}`,
    html,
  });
}

async function sendCancelledEmail(opts: { to: string; customerName: string }) {
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

  const subject = 'Your shifting booking has been cancelled';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; background: #f8fafc; padding: 24px;">
      <div style="background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 20px 50px rgba(15, 23, 42, 0.08);">
        <div style="background: #0f172a; color: #ffffff; padding: 28px 24px;">
          <h1 style="margin: 0; font-size: 22px; letter-spacing: 0.02em;">Booking Cancelled</h1>
          <p style="margin: 10px 0 0 0; color: #cbd5e1; font-size: 14px;">Your shifting booking has been cancelled.</p>
        </div>
        <div style="padding: 24px;">
          <div style="border: 1px solid #e2e8f0; border-radius: 14px; padding: 18px; background: #f8fafc;">
            <p style="margin: 0; color: #334155; font-weight: 700;">Booking cancelled</p>
            <p style="margin: 6px 0 0 0; color: #475569;"><b>Customer:</b> ${escapeHtml(opts.customerName || 'Customer')}</p>
            <p style="margin: 6px 0 0 0; color: #475569;">Your shifting booking has been cancelled. If this was not done by you or you have any questions, please contact our team.</p>
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
    text: `Your shifting booking has been cancelled.`,
    html,
  });
}

async function sendDeliveredEmail(opts: { to: string; customerName: string }) {
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

  const subject = 'Your shifting booking has been delivered';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; background: #f8fafc; padding: 24px;">
      <div style="background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 20px 50px rgba(15, 23, 42, 0.08);">
        <div style="background: #0f172a; color: #ffffff; padding: 28px 24px;">
          <h1 style="margin: 0; font-size: 22px; letter-spacing: 0.02em;">Delivery Completed</h1>
          <p style="margin: 10px 0 0 0; color: #cbd5e1; font-size: 14px;">Your shifting booking has been delivered successfully.</p>
        </div>
        <div style="padding: 24px;">
          <div style="border: 1px solid #e2e8f0; border-radius: 14px; padding: 18px; background: #f8fafc;">
            <p style="margin: 0; color: #334155; font-weight: 700;">Booking delivered</p>
            <p style="margin: 6px 0 0 0; color: #475569;"><b>Customer:</b> ${escapeHtml(opts.customerName || 'Customer')}</p>
            <p style="margin: 6px 0 0 0; color: #475569;">Your shifting booking has been delivered successfully. Thank you for choosing us!</p>
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
    text: `Your shifting booking has been delivered successfully.`,
    html,
  });
}

function getStatusMessages(status: string) {
  const s = String(status ?? '').trim();

  if (s === 'pending' || s === 'confirmed') {
    return {
      title: 'New booking created',
      customer: 'Your booking has been created successfully.',
      admin: 'New booking created. Open Admin → Bookings to assign a driver.',
      driver: 'A new booking was created.',
    };
  }

  if (s === 'not_started') {
    return {
      title: 'Vehicle on the way',
      customer: 'Driver is on the way for pickup.',
      admin: 'Driver started and is on the way for pickup.',
      driver: 'Trip started. Proceed to pickup location.',
    };
  }

  if (s === 'pickup_reached') {
    return {
      title: 'Pickup completed',
      customer: 'Pickup is completed. Your goods are now on the move.',
      admin: 'Pickup is completed for the booking.',
      driver: 'Pickup verified. Continue to transit.',
    };
  }

  if (s === 'in_transit') {
    return {
      title: 'In transit',
      customer: 'Your vehicle is in transit towards the destination.',
      admin: 'Booking is now in transit.',
      driver: 'You are in transit. Keep updating as required.',
    };
  }

  if (s === 'delivered') {
    return {
      title: 'Delivered',
      customer: 'Your delivery has been completed successfully.',
      admin: 'Delivery has been completed for the booking.',
      driver: 'Delivery completed. Good job.',
    };
  }

  if (s === 'assigned') {
    return {
      title: 'Driver assigned',
      customer: 'A driver has been assigned to your booking.',
      admin: 'Driver assigned to the booking.',
      driver: 'A new booking has been assigned to you.',
    };
  }

  if (s === 'accepted') {
    return {
      title: 'Driver accepted',
      customer: 'Your driver has accepted the booking.',
      admin: 'Driver accepted the booking.',
      driver: 'Booking accepted. Proceed to pickup location.',
    };
  }

  if (s === 'unassigned') {
    return {
      title: 'Driver unassigned',
      customer: 'Driver assignment was removed for your booking. We will assign a new driver soon.',
      admin: 'Driver unassigned from the booking.',
      driver: 'A booking assigned to you was unassigned.',
    };
  }

  if (s === 'cancelled') {
    return {
      title: 'Booking cancelled',
      customer: 'Your booking has been cancelled.',
      admin: 'A booking was cancelled.',
      driver: 'A booking was cancelled.',
    };
  }

  if (s === 'rescheduled') {
    return {
      title: 'Booking rescheduled',
      customer: 'Your booking has been rescheduled.',
      admin: 'A booking was rescheduled.',
      driver: 'A booking was rescheduled.',
    };
  }

  const human = s.replaceAll('_', ' ');
  return {
    title: 'Booking update',
    customer: `Your booking status updated: ${human}.`,
    admin: `Booking status updated: ${human}.`,
    driver: `Booking status updated: ${human}.`,
  };
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
    booking_id?: string;
    status?: string;
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
      booking_id: r.booking_id ?? null,
      status: r.status ?? null,
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
    const bookingId = String(body.booking_id ?? '').trim();
    const nextStatus = String(body.status ?? '').trim();
    const eventType = String(body.type ?? '').trim();
    const otpKind = String(body.otp_kind ?? '').trim();
    const sendEmail = String(body.send_email ?? '').trim() === 'true';
    const newDate = String(body.new_date ?? '').trim();
    const newTime = String(body.new_time ?? '').trim();
    const oldDriverIdOverride = body.old_driver_id ? String(body.old_driver_id).trim() : '';
    const newDriverIdOverride = body.new_driver_id ? String(body.new_driver_id).trim() : '';

    if (!bookingId) return jsonResponse({ error: 'booking_id required' }, 400);
    if (!nextStatus && eventType !== 'otp') return jsonResponse({ error: 'status required' }, 400);

    const serviceKey =
      Deno.env.get('SERVICE_ROLE_KEY') ??
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
      Deno.env.get('SB_SERVICE_ROLE_KEY') ??
      '';

    if (!supabaseUrl || !serviceKey) {
      return jsonResponse({ error: 'Supabase service env missing' }, 500);
    }

    const [booking] = await getRest<BookingRow[]>(
      `${supabaseUrl}/rest/v1/bookings?id=eq.${bookingId}&select=id,user_id,status,driver_id,pickup_otp,delivery_otp`,
      serviceKey
    );

    if (!booking) return jsonResponse({ error: 'Booking not found' }, 404);

    const userId = booking.user_id;
    if (!userId) return jsonResponse({ error: 'Booking missing user_id' }, 500);

    const [customer] = await getRest<UserRow[]>(
      `${supabaseUrl}/rest/v1/users?id=eq.${userId}&select=id,expo_push_token,name,role,email`,
      serviceKey
    );

    const admins = await getRest<UserRow[]>(
      `${supabaseUrl}/rest/v1/users?select=id,expo_push_token,name,role,email&role=in.(admin,staff)`,
      serviceKey
    );

    const fetchDriverToken = async (driverId: string) => {
      if (!driverId) return '';
      try {
        const [d] = await getRest<UserRow[]>(
          `${supabaseUrl}/rest/v1/users?id=eq.${driverId}&select=id,expo_push_token,name,role`,
          serviceKey
        );
        return d?.expo_push_token ?? '';
      } catch {
        return '';
      }
    };

    const fetchBookingDriverToken = async () => {
      const bookingDriverId = String((booking as any)?.driver_id ?? '').trim();
      if (!bookingDriverId) return '';
      return await fetchDriverToken(bookingDriverId);
    };

    if (eventType === 'otp') {
      const kind = otpKind === 'delivery' ? 'delivery' : 'pickup';
      const otp = kind === 'delivery' ? String(booking.delivery_otp ?? '').trim() : String(booking.pickup_otp ?? '').trim();
      if (!otp) return jsonResponse({ error: `${kind}_otp_not_found` }, 404);

      const title = 'Booking OTP';
      const customerBody = kind === 'delivery' ? `Delivery OTP: ${otp}` : `Pickup OTP: ${otp}`;
      const adminBody = kind === 'delivery' ? 'Delivery OTP sent to customer.' : 'Pickup OTP sent to customer.';
      const driverBody = kind === 'delivery' ? 'Delivery OTP sent to customer. Verify to complete.' : 'Pickup OTP sent to customer. Verify to proceed.';

      const notifications: Array<{ to: string; body: string }> = [];
      const customerToken = customer?.expo_push_token ?? '';
      if (customerToken) notifications.push({ to: customerToken, body: customerBody });

      (admins ?? []).forEach((u: UserRow) => {
        const t = u?.expo_push_token ?? '';
        if (!t) return;
        notifications.push({ to: t, body: adminBody });
      });

      const driverToken = await fetchBookingDriverToken();
      if (driverToken) notifications.push({ to: driverToken, body: driverBody });

      for (const n of notifications) {
        await sendExpoPush(n.to, title, n.body, { booking_id: bookingId, type: 'otp', otp_kind: kind });
      }

      try {
        const rows: Array<{
          user_id: string;
          title: string;
          body: string;
          type?: string;
          booking_id?: string;
          status?: string;
          data?: Record<string, unknown>;
        }> = [];

        if (customer?.id) {
          rows.push({
            user_id: customer.id,
            title,
            body: customerBody,
            type: 'booking_otp',
            booking_id: bookingId,
            data: { booking_id: bookingId, type: 'otp', otp_kind: kind },
          });
        }

        (admins ?? []).forEach((u: UserRow) => {
          if (!u?.id) return;
          rows.push({
            user_id: u.id,
            title,
            body: adminBody,
            type: 'booking_otp',
            booking_id: bookingId,
            data: { booking_id: bookingId, type: 'otp', otp_kind: kind },
          });
        });

        const driverId = String((booking as any)?.driver_id ?? '').trim();
        if (driverId) {
          rows.push({
            user_id: driverId,
            title,
            body: driverBody,
            type: 'booking_otp',
            booking_id: bookingId,
            data: { booking_id: bookingId, type: 'otp', otp_kind: kind },
          });
        }

        await insertNotifications(supabaseUrl, serviceKey, rows);
      } catch {
        // ignore notification inbox failures
      }

      if (customer?.id) {
        await sendWebPushForUser(supabaseUrl, serviceKey, customer.id, title, customerBody, `/bookings/${bookingId}`);
      }
      for (const u of (admins ?? [])) {
        if (u?.id) {
          await sendWebPushForUser(supabaseUrl, serviceKey, u.id, title, adminBody, `/bookings/${bookingId}`);
        }
      }
      const wpDriverId = String((booking as any)?.driver_id ?? '').trim();
      if (wpDriverId) {
        await sendWebPushForUser(supabaseUrl, serviceKey, wpDriverId, title, driverBody, `/bookings/${bookingId}`);
      }

      return jsonResponse({ sent: true, otp_kind: kind, otp });
    }

    const driverTokens: Array<{ to: string; body: string }> = [];
    const bookingDriverId = String((booking as any)?.driver_id ?? '').trim();
    const oldDriverId = oldDriverIdOverride || (nextStatus === 'unassigned' ? bookingDriverId : '');
    const newDriverId = newDriverIdOverride || (nextStatus === 'assigned' ? bookingDriverId : '');

    const statusMessages = getStatusMessages(nextStatus);

    const currentDriverToken = await fetchDriverToken(bookingDriverId);
    if (currentDriverToken) {
      driverTokens.push({ to: currentDriverToken, body: statusMessages.driver });
    }

    if (nextStatus === 'assigned') {
      const newToken = await fetchDriverToken(newDriverId);
      if (newToken) driverTokens.push({ to: newToken, body: statusMessages.driver });

      if (oldDriverId && oldDriverId !== newDriverId) {
        const oldToken = await fetchDriverToken(oldDriverId);
        if (oldToken) driverTokens.push({ to: oldToken, body: 'A booking assigned to you was reassigned.' });
      }
    }

    if (nextStatus === 'unassigned') {
      const oldToken = await fetchDriverToken(oldDriverId);
      if (oldToken) driverTokens.push({ to: oldToken, body: statusMessages.driver });
    }

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
            newDate,
            newTime,
          });
        } catch (e) {
          console.error('Reschedule email failed:', e);
        }
      } else if (nextStatus === 'cancelled') {
        try {
          await sendCancelledEmail({ to: emailRecipients, customerName: customer?.name ?? 'Customer' });
        } catch (e) {
          console.error('Cancel email failed:', e);
        }
      } else if (nextStatus === 'delivered') {
        try {
          await sendDeliveredEmail({ to: emailRecipients, customerName: customer?.name ?? 'Customer' });
        } catch (e) {
          console.error('Delivered email failed:', e);
        }
      }
    }

    const notifications: Array<{ to: string; body: string }> = [];

    const customerToken = customer?.expo_push_token ?? '';
    if (customerToken) notifications.push({ to: customerToken, body: customerMessage });

    (admins ?? []).forEach((u: UserRow) => {
      const t = u?.expo_push_token ?? '';
      if (!t) return;
      notifications.push({ to: t, body: adminMessage });
    });

    driverTokens.forEach((n) => {
      if (!n.to) return;
      notifications.push(n);
    });

    if (!notifications.length) return jsonResponse({ skipped: true, reason: 'no_push_tokens' }, 200);

    try {
      const rows: Array<{ user_id: string; title: string; body: string; type?: string; booking_id?: string; status?: string; data?: Record<string, unknown> }> = [];

      if (customer?.id) {
        rows.push({
          user_id: customer.id,
          title,
          body: customerMessage,
          type: 'booking_status',
          booking_id: bookingId,
          status: nextStatus,
          data: { booking_id: bookingId, status: nextStatus },
        });
      }

      (admins ?? []).forEach((u: UserRow) => {
        if (!u?.id) return;
        rows.push({
          user_id: u.id,
          title,
          body: adminMessage,
          type: 'booking_status',
          booking_id: bookingId,
          status: nextStatus,
          data: { booking_id: bookingId, status: nextStatus },
        });
      });

      const driverIds: string[] = [];
      const bookingDriverId = String((booking as any)?.driver_id ?? '').trim();
      if (bookingDriverId) driverIds.push(bookingDriverId);
      if (nextStatus === 'assigned' && newDriverId && !driverIds.includes(newDriverId)) driverIds.push(newDriverId);
      if (nextStatus === 'unassigned' && oldDriverId && !driverIds.includes(oldDriverId)) driverIds.push(oldDriverId);

      driverIds.forEach((driverId) => {
        if (!driverId) return;
        rows.push({
          user_id: driverId,
          title,
          body: statusMessages.driver,
          type: 'booking_status',
          booking_id: bookingId,
          status: nextStatus,
          data: { booking_id: bookingId, status: nextStatus },
        });
      });

      await insertNotifications(supabaseUrl, serviceKey, rows);
    } catch {
      // ignore notification inbox failures
    }

    if (customer?.id) {
      await sendWebPushForUser(supabaseUrl, serviceKey, customer.id, title, customerMessage, `/bookings/${bookingId}`);
    }
    for (const u of (admins ?? [])) {
      if (u?.id) {
        await sendWebPushForUser(supabaseUrl, serviceKey, u.id, title, adminMessage, `/bookings/${bookingId}`);
      }
    }
    for (const did of driverIds) {
      if (did) {
        await sendWebPushForUser(supabaseUrl, serviceKey, did, title, statusMessages.driver, `/bookings/${bookingId}`);
      }
    }

    const seen = new Set<string>();
    for (const n of notifications) {
      if (!n.to) continue;
      if (seen.has(n.to)) continue;
      seen.add(n.to);
      await sendExpoPush(n.to, title, n.body, { booking_id: bookingId, status: nextStatus });
    }

    return jsonResponse({ sent: true, sent_count: notifications.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return jsonResponse({ error: msg }, 500);
  }
});
