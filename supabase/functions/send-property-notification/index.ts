import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { corsHeaders } from '../_shared/cors.ts';

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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const eventType = String(body.event_type ?? '').trim();

    if (!eventType) return jsonResponse({ error: 'event_type required' }, 400);
    if (!['property_posted', 'property_booked', 'booking_status_changed'].includes(eventType)) {
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

    if (eventType === 'property_posted') {
      const propertyTitle = String(body.property_title ?? 'Property').trim();
      const ownerName = String(body.owner_name ?? 'Owner').trim();
      const city = String(body.city ?? '').trim();

      const adminTitle = 'New Property Listing';
      const adminBody = `${ownerName} posted "${propertyTitle}"${city ? ` in ${city}` : ''}`;

      const admins = await getRest<UserRow[]>(
        `${supabaseUrl}/rest/v1/users?select=id,expo_push_token,name,role&role=in.(admin,staff)`,
        serviceKey
      );

      const notificationRows: Array<{
        user_id: string;
        title: string;
        body: string;
        type?: string;
        data?: Record<string, unknown>;
      }> = [];

      for (const admin of (admins ?? [])) {
        if (admin?.expo_push_token) {
          try {
            await sendExpoPush(admin.expo_push_token, adminTitle, adminBody, {
              type: 'property_posted',
              property_id: body.property_id ?? '',
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
            type: 'property_posted',
            data: { property_id: body.property_id ?? '' },
          });

          await sendWebPushForUser(supabaseUrl, serviceKey, admin.id, adminTitle, adminBody, '/admin');
        }
      }

      try {
        if (notificationRows.length > 0) {
          await insertNotifications(supabaseUrl, serviceKey, notificationRows);
        }
      } catch (e) {
        console.error('Failed to insert notifications:', e);
      }

      return jsonResponse({ sent: true, recipients: notificationRows.length });
    }

    if (eventType === 'property_booked') {
      const propertyTitle = String(body.property_title ?? 'Property').trim();
      const contactName = String(body.contact_name ?? 'Customer').trim();
      const contactPhone = String(body.contact_phone ?? '').trim();
      const ownerUserId = String(body.owner_user_id ?? '').trim();
      const customerUserId = String(body.user_id ?? '').trim();
      const bookingId = String(body.booking_id ?? '').trim();

      if (!ownerUserId) return jsonResponse({ error: 'owner_user_id required' }, 400);

      const ownerTitle = 'New Booking Inquiry';
      const ownerBody = `${contactName}${contactPhone ? ` (${contactPhone})` : ''} is interested in "${propertyTitle}"`;

      const [owner] = await getRest<UserRow[]>(
        `${supabaseUrl}/rest/v1/users?id=eq.${ownerUserId}&select=id,expo_push_token,name,role`,
        serviceKey
      );

      const notificationRows: Array<{
        user_id: string;
        title: string;
        body: string;
        type?: string;
        data?: Record<string, unknown>;
      }> = [];

      if (owner?.expo_push_token) {
        try {
          await sendExpoPush(owner.expo_push_token, ownerTitle, ownerBody, {
            type: 'property_booked',
            booking_id: bookingId,
            property_id: body.property_id ?? '',
          });
        } catch (e) {
          console.error('Failed to send owner push:', e);
        }
      }

      if (owner?.id) {
        notificationRows.push({
          user_id: owner.id,
          title: ownerTitle,
          body: ownerBody,
          type: 'property_booked',
          data: { booking_id: bookingId, property_id: body.property_id ?? '' },
        });

        await sendWebPushForUser(supabaseUrl, serviceKey, owner.id, ownerTitle, ownerBody, `/properties/${body.property_id ?? ''}`);
      }

      // Also notify admins
      if (customerUserId) {
        const adminTitle = 'New Property Booking';
        const adminBody = `${contactName} booked "${propertyTitle}"`;

        const admins = await getRest<UserRow[]>(
          `${supabaseUrl}/rest/v1/users?select=id,expo_push_token,name,role&role=in.(admin,staff)`,
          serviceKey
        );

        for (const admin of (admins ?? [])) {
          if (admin?.expo_push_token) {
            try {
              await sendExpoPush(admin.expo_push_token, adminTitle, adminBody, {
                type: 'property_booked',
                booking_id: bookingId,
                property_id: body.property_id ?? '',
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
              type: 'property_booked',
              data: { booking_id: bookingId, property_id: body.property_id ?? '' },
            });

            await sendWebPushForUser(supabaseUrl, serviceKey, admin.id, adminTitle, adminBody, '/admin');
          }
        }
      }

      try {
        if (notificationRows.length > 0) {
          await insertNotifications(supabaseUrl, serviceKey, notificationRows);
        }
      } catch (e) {
        console.error('Failed to insert notifications:', e);
      }

      return jsonResponse({ sent: true, recipients: notificationRows.length });
    }

    if (eventType === 'booking_status_changed') {
      const propertyTitle = String(body.property_title ?? 'Property').trim();
      const bookingId = String(body.booking_id ?? '').trim();
      const status = String(body.status ?? '').trim();
      const ownerUserId = String(body.owner_user_id ?? '').trim();
      const customerUserId = String(body.customer_user_id ?? '').trim();
      const changedBy = String(body.changed_by ?? '').trim();

      const notificationRows: Array<{
        user_id: string;
        title: string;
        body: string;
        type?: string;
        data?: Record<string, unknown>;
      }> = [];

      // Notify customer when owner/admin changes status
      if (customerUserId && ['confirmed', 'cancelled'].includes(status) && changedBy !== 'customer') {
        const customerTitle = status === 'confirmed' ? 'Booking Confirmed' : 'Booking Cancelled';
        const customerBody = status === 'confirmed'
          ? `Your booking for "${propertyTitle}" has been confirmed by the owner.`
          : `Your booking for "${propertyTitle}" has been cancelled.`;

        const [customer] = await getRest<UserRow[]>(
          `${supabaseUrl}/rest/v1/users?id=eq.${customerUserId}&select=id,expo_push_token,name,role`,
          serviceKey
        );

        if (customer?.expo_push_token) {
          try {
            await sendExpoPush(customer.expo_push_token, customerTitle, customerBody, {
              type: 'booking_status_changed',
              booking_id: bookingId,
              status,
            });
          } catch (e) {
            console.error('Failed to send customer push:', e);
          }
        }

        if (customer?.id) {
          notificationRows.push({
            user_id: customer.id,
            title: customerTitle,
            body: customerBody,
            type: 'booking_status_changed',
            data: { booking_id: bookingId, status },
          });

          await sendWebPushForUser(supabaseUrl, serviceKey, customer.id, customerTitle, customerBody, '/(tabs)/bookings');
        }
      }

      // Notify owner when customer/admin changes status
      if (ownerUserId && changedBy !== 'owner') {
        const ownerTitle = status === 'cancelled' ? 'Booking Cancelled' : 'Booking Updated';
        const ownerBody = status === 'cancelled'
          ? `A booking for "${propertyTitle}" has been cancelled.`
          : `A booking for "${propertyTitle}" has been updated to "${status}".`;

        const [owner] = await getRest<UserRow[]>(
          `${supabaseUrl}/rest/v1/users?id=eq.${ownerUserId}&select=id,expo_push_token,name,role`,
          serviceKey
        );

        if (owner?.expo_push_token) {
          try {
            await sendExpoPush(owner.expo_push_token, ownerTitle, ownerBody, {
              type: 'booking_status_changed',
              booking_id: bookingId,
              status,
            });
          } catch (e) {
            console.error('Failed to send owner push:', e);
          }
        }

        if (owner?.id) {
          notificationRows.push({
            user_id: owner.id,
            title: ownerTitle,
            body: ownerBody,
            type: 'booking_status_changed',
            data: { booking_id: bookingId, status },
          });

          await sendWebPushForUser(supabaseUrl, serviceKey, owner.id, ownerTitle, ownerBody, '/admin');
        }
      }

      try {
        if (notificationRows.length > 0) {
          await insertNotifications(supabaseUrl, serviceKey, notificationRows);
        }
      } catch (e) {
        console.error('Failed to insert notifications:', e);
      }

      return jsonResponse({ sent: true, recipients: notificationRows.length });
    }

    return jsonResponse({ error: 'Unhandled event_type' }, 400);
  } catch (error) {
    console.error('Error:', error);
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
