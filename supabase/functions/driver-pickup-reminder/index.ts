import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { corsHeaders } from '../_shared/cors.ts';

type BookingRow = {
  id: string;
  booking_number: number | null;
  driver_id: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  status: string | null;
};

type DriverRow = {
  id: string;
  name: string | null;
  expo_push_token: string | null;
};

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

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

type ParsedTime = { hour: number; minute: number } | null;

function parseTimeLabel(timeLabel: string | null): ParsedTime {
  const t = String(timeLabel ?? '').trim().toUpperCase();
  const m = t.match(/^(\d{1,2}):?(\d{2})?\s*(AM|PM)?$/);
  if (!m || !m[1]) return null;

  let h = Number(m[1]);
  const min = Number(m[2] ?? '00');
  const period = m[3] ?? '';
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;

  return { hour: h, minute: min };
}

function slotToUtcMs(dateIso: string | null, timeLabel: string | null): number | null {
  const d = String(dateIso ?? '').trim();
  const tm = parseTimeLabel(timeLabel);
  if (!d || !tm) return null;

  const parts = d.split('-');
  if (parts.length !== 3) return null;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(day)) return null;

  return Date.UTC(y, m - 1, day, tm.hour, tm.minute) - IST_OFFSET_MS;
}

function formatSlotTime(slotMs: number): string {
  const local = new Date(slotMs + IST_OFFSET_MS);
  let h = local.getUTCHours();
  const mins = String(local.getUTCMinutes()).padStart(2, '0');
  const period = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${mins} ${period}`;
}

async function sendExpoPush(to: string, title: string, body: string, data: Record<string, unknown>) {
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, title, body, data, sound: 'default', priority: 'high' }),
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

    const now = Date.now();
    const bookings = await getRest<BookingRow[]>(
      `${supabaseUrl}/rest/v1/bookings?select=id,booking_number,driver_id,scheduled_date,scheduled_time,status&status=in.(assigned,accepted,not_started,confirmed)&driver_id=not.is.null`,
      serviceKey
    );

    const due: Array<{ booking: BookingRow; slotMs: number }> = [];
    for (const booking of bookings ?? []) {
      const slotMs = slotToUtcMs(booking.scheduled_date, booking.scheduled_time);
      if (slotMs == null) continue;
      const minutesLeft = (slotMs - now) / 60000;
      if (minutesLeft < 45 || minutesLeft > 90) continue;
      due.push({ booking, slotMs });
    }

    let sent = 0;
    let alreadySent = 0;

    for (const { booking, slotMs } of due) {
      const driverId = booking.driver_id;
      if (!driverId) continue;

      const bookingNumber =
        booking.booking_number != null
          ? `GRS${booking.booking_number}`
          : String(booking.id).slice(0, 8).toUpperCase();
      const slotTime = formatSlotTime(slotMs);

      try {
        const existing = await getRest<Array<{ id: string }>>(
          `${supabaseUrl}/rest/v1/notifications?booking_id=eq.${booking.id}&type=eq.driver_pickup_reminder&select=id&limit=1`,
          serviceKey
        );
        if ((existing ?? []).length > 0) {
          alreadySent += 1;
          continue;
        }

        const [driver] = await getRest<DriverRow[]>(
          `${supabaseUrl}/rest/v1/users?id=eq.${driverId}&select=id,name,expo_push_token`,
          serviceKey
        );

        if (!driver) continue;

        const title = 'Pickup in 1 hour';
        const body = `Your pickup for booking ${bookingNumber} is at ${slotTime}. Please leave early to reach on time.`;
        const openUrl = '/driver';

        const driverToken = driver.expo_push_token ?? '';
        if (driverToken) {
          try {
            await sendExpoPush(driverToken, title, body, {
              booking_id: booking.id,
              type: 'driver_pickup_reminder',
              slot_time: slotTime,
            });
            sent += 1;
          } catch (e) {
            console.error('Expo push failed for driver reminder:', e);
          }
        }

        await sendWebPushForUser(supabaseUrl, serviceKey, driver.id, title, body, openUrl);

        try {
          await postRest(
            `${supabaseUrl}/rest/v1/notifications`,
            serviceKey,
            [{
              user_id: driver.id,
              title,
              body,
              type: 'driver_pickup_reminder',
              booking_id: booking.id,
              status: null,
              data: { booking_id: booking.id, type: 'driver_pickup_reminder', slot_time: slotTime },
            }]
          );
        } catch (e) {
          console.error('Inbox insert failed for driver reminder:', e);
        }
      } catch (e) {
        console.error('Reminder processing failed:', e);
      }
    }

    return jsonResponse({ processed: due.length, sent, already_sent: alreadySent });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return jsonResponse({ error: msg }, 500);
  }
});