import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import nodemailer from 'npm:nodemailer@6.9.13';

import { corsHeaders } from '../_shared/cors.ts';

type UserRow = {
  id: string;
  email?: string | null;
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

function getSmtpConfig() {
  const smtpHost = Deno.env.get('SMTP_HOST') ?? '';
  const smtpPort = Number(Deno.env.get('SMTP_PORT') ?? '587');
  const smtpUser = Deno.env.get('SMTP_USER') ?? '';
  const smtpPass = Deno.env.get('SMTP_PASS') ?? '';
  const smtpSecure = String(Deno.env.get('SMTP_SECURE') ?? 'false').toLowerCase() === 'true';
  const fromEmail = Deno.env.get('SMTP_FROM') ?? smtpUser;
  const fromName = Deno.env.get('SMTP_FROM_NAME') ?? 'Packers & Movers';

  if (!smtpHost || !smtpPort || !smtpUser || !smtpPass || !fromEmail) return null;
  return { smtpHost, smtpPort, smtpUser, smtpPass, smtpSecure, fromEmail, fromName };
}

async function sendEmail(opts: { to: string; subject: string; html: string }) {
  const cfg = getSmtpConfig();
  if (!cfg) return;
  const transport = nodemailer.createTransport({
    host: cfg.smtpHost,
    port: cfg.smtpPort,
    secure: cfg.smtpSecure,
    auth: { user: cfg.smtpUser, pass: cfg.smtpPass },
  });
  await transport.sendMail({
    from: `"${cfg.fromName}" <${cfg.fromEmail}>`,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
}

function emailTemplate(title: string, line1: string, line2?: string) {
  return `
  <div style="font-family:Arial,sans-serif;background:#f4f4f7;padding:24px">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
      <div style="background:#111827;color:#ffffff;padding:16px 24px;font-size:16px;font-weight:700">${title}</div>
      <div style="padding:20px 24px;color:#374151;font-size:14px;line-height:1.6">
        <p style="margin:0 0 12px">${line1}</p>
        ${line2 ? `<p style="margin:0;color:#6b7280;font-size:13px">${line2}</p>` : ''}
      </div>
    </div>
  </div>
  `;
}

async function notifyUser(
  supabaseUrl: string,
  serviceKey: string,
  user: { id?: string; email?: string | null; expo_push_token?: string | null },
  opts: {
    title: string;
    body: string;
    emailLine2?: string;
    withEmail: boolean;
    type: string;
    data: Record<string, unknown>;
    url: string;
  }
) {
  if (!user?.id) return;

  if (user.expo_push_token) {
    try {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: user.expo_push_token,
          title: opts.title,
          body: opts.body,
          data: opts.data,
          sound: 'default',
          badge: 1,
          priority: 'high',
        }),
      });
    } catch (e) {
      console.error('Failed to send expo push:', e);
    }
  }

  try {
    await fetch(`${supabaseUrl}/functions/v1/send-web-push`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: user.id,
        title: opts.title,
        body: opts.body,
        url: opts.url,
      }),
    });
  } catch {
    // ignore web push failures
  }

  try {
    await postRest(`${supabaseUrl}/rest/v1/notifications`, serviceKey, {
      user_id: user.id,
      title: opts.title,
      body: opts.body,
      type: opts.type,
      data: opts.data ?? null,
    });
  } catch (e) {
    console.error('Failed to insert notification:', e);
  }

  if (opts.withEmail && user.email) {
    try {
      await sendEmail({
        to: user.email,
        subject: opts.title,
        html: emailTemplate(opts.title, opts.body, opts.emailLine2),
      });
    } catch (e) {
      console.error('Failed to send email:', e);
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const eventType = String(body.event_type ?? '').trim();

    const knownEvents = [
      'property_posted',
      'property_booked',
      'booking_status_changed',
      'property_followed',
      'property_updated',
      'meeting_scheduled',
      'meeting_status_changed',
    ];
    if (!eventType) return jsonResponse({ error: 'event_type required' }, 400);
    if (!knownEvents.includes(eventType)) {
      return jsonResponse({ error: `Unknown event_type: ${eventType}` }, 400);
    }

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

    const withEmail = body.send_email !== false;
    const propertyId = String(body.property_id ?? '').trim();
    const propertyTitle = String(body.property_title ?? 'Property').trim();
    const propertyUrl = propertyId ? `/properties/${propertyId}` : '/properties';

    const getAdminUsers = () =>
      getRest<UserRow[]>(
        `${supabaseUrl}/rest/v1/users?select=id,email,expo_push_token,name,role&role=in.(admin,staff)`,
        serviceKey
      );

    if (eventType === 'property_posted') {
      const ownerName = String(body.owner_name ?? 'Owner').trim();
      const city = String(body.city ?? '').trim();

      const adminTitle = 'New Property Listing';
      const adminBody = `${ownerName} posted "${propertyTitle}"${city ? ` in ${city}` : ''}`;

      const admins = await getAdminUsers();

      for (const admin of (admins ?? [])) {
        await notifyUser(supabaseUrl, serviceKey, admin, {
          title: adminTitle,
          body: adminBody,
          emailLine2: 'Review the new listing and manage it from the admin panel.',
          withEmail,
          type: 'property_posted',
          data: { property_id: propertyId },
          url: '/admin',
        });
      }

      return jsonResponse({ sent: true, recipients: (admins ?? []).length });
    }

    if (eventType === 'property_booked') {
      const contactName = String(body.contact_name ?? 'Customer').trim();
      const contactPhone = String(body.contact_phone ?? '').trim();
      const ownerUserId = String(body.owner_user_id ?? '').trim();
      const customerUserId = String(body.user_id ?? '').trim();
      const bookingId = String(body.booking_id ?? '').trim();

      if (!ownerUserId) return jsonResponse({ error: 'owner_user_id required' }, 400);

      const ownerTitle = 'New Booking Inquiry';
      const ownerBody = `${contactName}${contactPhone ? ` (${contactPhone})` : ''} is interested in "${propertyTitle}"`;

      const [owner] = await getRest<UserRow[]>(
        `${supabaseUrl}/rest/v1/users?id=eq.${ownerUserId}&select=id,email,expo_push_token,name`,
        serviceKey
      );

      await notifyUser(supabaseUrl, serviceKey, owner ?? {}, {
        title: ownerTitle,
        body: ownerBody,
        emailLine2: `Contact the customer at ${contactPhone || 'the number they provided'} through the app.`,
        withEmail,
        type: 'property_booked',
        data: { booking_id: bookingId, property_id: propertyId },
        url: propertyUrl,
      });

      if (customerUserId) {
        const admins = await getAdminUsers();
        const adminTitle = 'New Property Booking';
        const adminBody = `${contactName} booked "${propertyTitle}"`;

        for (const admin of (admins ?? [])) {
          await notifyUser(supabaseUrl, serviceKey, admin, {
            title: adminTitle,
            body: adminBody,
            withEmail: false,
            type: 'property_booked',
            data: { booking_id: bookingId, property_id: propertyId },
            url: '/admin',
          });
        }
      }

      return jsonResponse({ sent: true });
    }

    if (eventType === 'booking_status_changed') {
      const bookingId = String(body.booking_id ?? '').trim();
      const status = String(body.status ?? '').trim();
      const ownerUserId = String(body.owner_user_id ?? '').trim();
      const customerUserId = String(body.customer_user_id ?? '').trim();
      const changedBy = String(body.changed_by ?? '').trim();

      if (customerUserId && ['confirmed', 'cancelled'].includes(status) && changedBy !== 'customer') {
        const customerTitle = status === 'confirmed' ? 'Booking Confirmed' : 'Booking Cancelled';
        const customerBody = status === 'confirmed'
          ? `Your booking for "${propertyTitle}" has been confirmed by the owner.`
          : `Your booking for "${propertyTitle}" has been cancelled.`;

        const [customer] = await getRest<UserRow[]>(
          `${supabaseUrl}/rest/v1/users?id=eq.${customerUserId}&select=id,email,expo_push_token,name`,
          serviceKey
        );

        await notifyUser(supabaseUrl, serviceKey, customer!, {
          title: customerTitle,
          body: customerBody,
          emailLine2: `Property: ${propertyTitle}`,
          withEmail,
          type: 'booking_status_changed',
          data: { booking_id: bookingId, status },
          url: propertyUrl,
        });
      }

      if (ownerUserId && changedBy !== 'owner') {
        const ownerTitle = status === 'cancelled' ? 'Booking Cancelled' : 'Booking Updated';
        const ownerBody = status === 'cancelled'
          ? `A booking for "${propertyTitle}" has been cancelled.`
          : `A booking for "${propertyTitle}" has been updated to "${status}".`;

        const [owner] = await getRest<UserRow[]>(
          `${supabaseUrl}/rest/v1/users?id=eq.${ownerUserId}&select=id,email,expo_push_token,name`,
          serviceKey
        );

        await notifyUser(supabaseUrl, serviceKey, owner!, {
          title: ownerTitle,
          body: ownerBody,
          withEmail,
          type: 'booking_status_changed',
          data: { booking_id: bookingId, status },
          url: propertyUrl,
        });
      }

      return jsonResponse({ sent: true });
    }

    if (eventType === 'property_followed') {
      const ownerUserId = String(body.owner_user_id ?? '').trim();
      const followerName = String(body.follower_name ?? 'A customer').trim();
      const followAction = String(body.follow_action ?? 'followed');

      if (!ownerUserId) return jsonResponse({ error: 'owner_user_id required' }, 400);

      const ownerTitle = 'New Follower on Your Listing';
      const ownerBody = followAction === 'unfollowed'
        ? `${followerName} stopped following "${propertyTitle}".`
        : `${followerName} is now following "${propertyTitle}".`;

      const [owner] = await getRest<UserRow[]>(
        `${supabaseUrl}/rest/v1/users?id=eq.${ownerUserId}&select=id,email,expo_push_token,name`,
        serviceKey
      );

      await notifyUser(supabaseUrl, serviceKey, owner!, {
        title: ownerTitle,
        body: ownerBody,
        emailLine2: `Property: ${propertyTitle}`,
        withEmail,
        type: 'property_followed',
        data: { property_id: propertyId },
        url: propertyUrl,
      });

      return jsonResponse({ sent: true });
    }

    if (eventType === 'property_updated') {
      const message = String(body.message ?? '').trim() || `"${propertyTitle}" has been updated.`;
      const ownerUserId = String(body.owner_user_id ?? '').trim();

      const followers = await getRest<
        { user_id: string; users: { email: string | null; expo_push_token: string | null } | null }[]
      >(
        `${supabaseUrl}/rest/v1/property_followers?select=user_id,users!user_id(email,expo_push_token)&property_id=eq.${propertyId}`,
        serviceKey
      );

      const followerTitle = 'Property Update';
      let count = 0;

      for (const f of (followers ?? [])) {
        if (!f?.user_id || !f?.users) continue;
        if (f.user_id === ownerUserId) continue;
        count += 1;
        await notifyUser(supabaseUrl, serviceKey, { id: f.user_id, email: f.users.email, expo_push_token: f.users.expo_push_token }, {
          title: followerTitle,
          body: message,
          emailLine2: `Open the app to view "${propertyTitle}".`,
          withEmail,
          type: 'property_updated',
          data: { property_id: propertyId },
          url: propertyUrl,
        });
      }

      const admins = await getAdminUsers();
      const adminTitle = 'Property Updated';
      const adminBody = `"${propertyTitle}" was updated.`;

      for (const admin of (admins ?? [])) {
        await notifyUser(supabaseUrl, serviceKey, admin, {
          title: adminTitle,
          body: adminBody,
          withEmail: false,
          type: 'property_updated',
          data: { property_id: propertyId },
          url: '/admin',
        });
      }

      return jsonResponse({ sent: true, recipients: count });
    }

    if (eventType === 'meeting_scheduled') {
      const ownerUserId = String(body.owner_user_id ?? '').trim();
      const customerName = String(body.contact_name ?? 'A customer').trim();
      const customerUserId = String(body.user_id ?? '').trim();
      const meetingDate = String(body.meeting_date ?? '').trim();
      const meetingTime = String(body.meeting_time ?? '').trim();
      const meetingDisplay = meetingDate ? `${meetingDate}${meetingTime ? ` at ${meetingTime}` : ''}` : 'a slot they chose';

      if (!ownerUserId) return jsonResponse({ error: 'owner_user_id required' }, 400);

      const ownerTitle = 'New Visit Meeting Request';
      const ownerBody = `${customerName} wants to visit "${propertyTitle}" on ${meetingDisplay}.`;

      const [owner] = await getRest<UserRow[]>(
        `${supabaseUrl}/rest/v1/users?id=eq.${ownerUserId}&select=id,email,expo_push_token,name`,
        serviceKey
      );

      await notifyUser(supabaseUrl, serviceKey, owner!, {
        title: ownerTitle,
        body: ownerBody,
        emailLine2: 'Approve, reschedule or reject the meeting from your dashboard.',
        withEmail,
        type: 'meeting_scheduled',
        data: { property_id: propertyId },
        url: '/(tabs)/properties',
      });

      if (customerUserId) {
        const admins = await getAdminUsers();
        const adminTitle = 'New Visit Meeting';
        const adminBody = `${customerName} scheduled a visit for "${propertyTitle}" on ${meetingDisplay}.`;

        for (const admin of (admins ?? [])) {
          await notifyUser(supabaseUrl, serviceKey, admin, {
            title: adminTitle,
            body: adminBody,
            withEmail: false,
            type: 'meeting_scheduled',
            data: { property_id: propertyId },
            url: '/admin',
          });
        }
      }

      return jsonResponse({ sent: true });
    }

    if (eventType === 'meeting_status_changed') {
      const meetingId = String(body.meeting_id ?? '').trim();
      const status = String(body.status ?? '').trim();
      const ownerUserId = String(body.owner_user_id ?? '').trim();
      const customerUserId = String(body.user_id ?? '').trim();
      const customerName = String(body.contact_name ?? 'Customer').trim();
      const changedBy = String(body.changed_by ?? '').trim();
      const meetingDate = String(body.meeting_date ?? '').trim();
      const meetingTime = String(body.meeting_time ?? '').trim();
      const meetingDisplay = meetingDate ? `${meetingDate}${meetingTime ? ` at ${meetingTime}` : ''}` : '';

      const statusTitle =
        status === 'confirmed' ? 'Visit Meeting Confirmed' :
        status === 'rejected' ? 'Visit Meeting Rejected' :
        status === 'rescheduled' ? 'Visit Meeting Rescheduled' :
        status === 'cancelled' ? 'Visit Meeting Cancelled' :
        'Visit Meeting Updated';

      const actorName = changedBy === 'customer' ? customerName : 'the owner';

      const bodyFor = (isCustomer: boolean) => {
        const base = `"${propertyTitle}"${meetingDisplay ? ` on ${meetingDisplay}` : ''}`;
        if (status === 'confirmed') {
          return isCustomer
            ? `Your visit for ${base} has been confirmed.`
            : `${customerName}'s visit for ${base} was confirmed.`;
        }
        if (status === 'rescheduled') {
          return isCustomer
            ? `Your visit for ${base} was rescheduled.`
            : `${customerName}'s visit for ${base} was rescheduled.`;
        }
        if (status === 'rejected') {
          return isCustomer
            ? `The owner rejected your visit request for ${base}.`
            : `${customerName}'s visit request for ${base} was rejected.`;
        }
        if (status === 'cancelled') {
          return isCustomer
            ? `Your visit request for ${base} was cancelled.`
            : `${customerName} cancelled their visit request for ${base}.`;
        }
        return `Visit for ${base} has been updated (${status}).`;
      };

      if (customerUserId && changedBy !== 'customer') {
        const [customer] = await getRest<UserRow[]>(
          `${supabaseUrl}/rest/v1/users?id=eq.${customerUserId}&select=id,email,expo_push_token,name`,
          serviceKey
        );

        await notifyUser(supabaseUrl, serviceKey, customer!, {
          title: statusTitle,
          body: bodyFor(true),
          emailLine2: `Property: ${propertyTitle}`,
          withEmail,
          type: 'meeting_status_changed',
          data: { meeting_id: meetingId, status },
          url: propertyUrl,
        });
      }

      if (ownerUserId && changedBy === 'customer') {
        const [owner] = await getRest<UserRow[]>(
          `${supabaseUrl}/rest/v1/users?id=eq.${ownerUserId}&select=id,email,expo_push_token,name`,
          serviceKey
        );

        await notifyUser(supabaseUrl, serviceKey, owner!, {
          title: statusTitle,
          body: bodyFor(false),
          withEmail: false,
          type: 'meeting_status_changed',
          data: { meeting_id: meetingId, status },
          url: '/(tabs)/properties',
        });
      }

      return jsonResponse({ sent: true });
    }

    return jsonResponse({ error: 'Unhandled event_type' }, 400);
  } catch (error) {
    console.error('Error:', error);
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});