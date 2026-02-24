import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

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
  role?: string | null;
};

function getStatusMessages(status: string) {
  const s = String(status ?? '').trim();

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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const bookingId = String(body.booking_id ?? '').trim();
    const nextStatus = String(body.status ?? '').trim();
    const eventType = String(body.type ?? '').trim();
    const otpKind = String(body.otp_kind ?? '').trim();
    const oldDriverIdOverride = body.old_driver_id ? String(body.old_driver_id).trim() : '';
    const newDriverIdOverride = body.new_driver_id ? String(body.new_driver_id).trim() : '';

    if (!bookingId) return jsonResponse({ error: 'booking_id required' }, 400);
    if (!nextStatus && eventType !== 'otp') return jsonResponse({ error: 'status required' }, 400);

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

    const [booking] = await getRest<BookingRow[]>(
      `${supabaseUrl}/rest/v1/bookings?id=eq.${bookingId}&select=id,user_id,status,driver_id,pickup_otp,delivery_otp`,
      serviceKey
    );

    if (!booking) return jsonResponse({ error: 'Booking not found' }, 404);

    const userId = booking.user_id;
    if (!userId) return jsonResponse({ error: 'Booking missing user_id' }, 500);

    const [customer] = await getRest<UserRow[]>(
      `${supabaseUrl}/rest/v1/users?id=eq.${userId}&select=id,expo_push_token,name,role`,
      serviceKey
    );

    const admins = await getRest<UserRow[]>(
      `${supabaseUrl}/rest/v1/users?select=id,expo_push_token,name,role&role=in.(admin,staff)`,
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

      (admins ?? []).forEach((u) => {
        const t = u?.expo_push_token ?? '';
        if (!t) return;
        notifications.push({ to: t, body: adminBody });
      });

      const driverToken = await fetchBookingDriverToken();
      if (driverToken) notifications.push({ to: driverToken, body: driverBody });

      for (const n of notifications) {
        await sendExpoPush(n.to, title, n.body, { booking_id: bookingId, type: 'otp', otp_kind: kind });
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

    const notifications: Array<{ to: string; body: string }> = [];

    const customerToken = customer?.expo_push_token ?? '';
    if (customerToken) notifications.push({ to: customerToken, body: customerMessage });

    (admins ?? []).forEach((u) => {
      const t = u?.expo_push_token ?? '';
      if (!t) return;
      notifications.push({ to: t, body: adminMessage });
    });

    driverTokens.forEach((n) => {
      if (!n.to) return;
      notifications.push(n);
    });

    if (!notifications.length) return jsonResponse({ skipped: true, reason: 'no_push_tokens' }, 200);

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
