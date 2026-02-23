import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import nodemailer from 'npm:nodemailer@6.9.13';

import { corsHeaders } from '../_shared/cors.ts';

type BookingRow = {
  id: string;
  user_id: string | null;
  pickup_address: string | null;
  drop_address: string | null;
  distance_km: number | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  labor_count: number | null;
  estimated_price: number | null;
  advance_amount: number | null;
  remaining_amount: number | null;
  fare_breakdown: Record<string, unknown> | null;
  vehicle_type_id: string | null;
};

type VehicleRow = {
  id: string;
  name: string | null;
};

type UserRow = {
  id: string;
  email: string | null;
  name: string | null;
};

const roundMoney = (value: number) => Math.round(Number.isFinite(value) ? value : 0);
const currency = (value: number) => `₹${roundMoney(value).toLocaleString('en-IN')}`;

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
    const bookingId = String(body.booking_id ?? '').trim();

    if (!bookingId) {
      return jsonResponse({ error: 'booking_id required' }, 400);
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

    const [booking] = await getRest<BookingRow[]>(
      `${supabaseUrl}/rest/v1/bookings?id=eq.${bookingId}&select=id,user_id,pickup_address,drop_address,distance_km,scheduled_date,scheduled_time,labor_count,estimated_price,advance_amount,remaining_amount,fare_breakdown,vehicle_type_id`,
      serviceKey
    );

    if (!booking) {
      return jsonResponse({ error: 'Booking not found' }, 404);
    }

    const userId = booking.user_id;
    if (!userId) {
      return jsonResponse({ error: 'Booking missing user_id' }, 500);
    }

    const [user] = await getRest<UserRow[]>(
      `${supabaseUrl}/rest/v1/users?id=eq.${userId}&select=id,email,name`,
      serviceKey
    );

    if (!user?.email) {
      return jsonResponse({ error: 'User email not found' }, 404);
    }

    let vehicleName = '';
    if (booking.vehicle_type_id) {
      const [vehicle] = await getRest<VehicleRow[]>(
        `${supabaseUrl}/rest/v1/vehicle_types?id=eq.${booking.vehicle_type_id}&select=id,name`,
        serviceKey
      );
      vehicleName = vehicle?.name ?? '';
    }

    const smtpHost = Deno.env.get('SMTP_HOST') ?? '';
    const smtpPort = Number(Deno.env.get('SMTP_PORT') ?? '587');
    const smtpUser = Deno.env.get('SMTP_USER') ?? '';
    const smtpPass = Deno.env.get('SMTP_PASS') ?? '';
    const smtpSecure = String(Deno.env.get('SMTP_SECURE') ?? 'false').toLowerCase() === 'true';

    const fromEmail = Deno.env.get('SMTP_FROM') ?? smtpUser;
    const fromName = Deno.env.get('SMTP_FROM_NAME') ?? 'Packers & Movers';

    if (!smtpHost || !smtpPort || !smtpUser || !smtpPass || !fromEmail) {
      return jsonResponse({
        error: 'SMTP env missing',
        required: ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'],
      }, 500);
    }

    const total = roundMoney(Number(booking.estimated_price ?? 0));
    const advance = roundMoney(Number(booking.advance_amount ?? 0));
    const remaining = roundMoney(Math.max(total - advance, 0));

    const subject = `Booking Confirmed - ${booking.id}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
        <h2 style="margin: 0 0 8px 0; color: #0f172a;">Booking Summary</h2>
        <p style="margin: 0 0 16px 0; color: #334155;">Hi ${escapeHtml(user.name ?? 'Customer')}, your booking has been created.</p>

        <div style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; margin-bottom: 14px;">
          <p style="margin: 0; color: #64748b;"><b>Booking ID:</b> ${escapeHtml(booking.id)}</p>
          <p style="margin: 6px 0 0 0; color: #64748b;"><b>Pickup:</b> ${escapeHtml(booking.pickup_address ?? '-')}</p>
          <p style="margin: 6px 0 0 0; color: #64748b;"><b>Drop:</b> ${escapeHtml(booking.drop_address ?? '-')}</p>
          <p style="margin: 6px 0 0 0; color: #64748b;"><b>Date/Time (IST):</b> ${escapeHtml(booking.scheduled_date ?? '-')}${booking.scheduled_time ? ' at ' + escapeHtml(booking.scheduled_time) : ''}</p>
          <p style="margin: 6px 0 0 0; color: #64748b;"><b>Vehicle:</b> ${escapeHtml(vehicleName || '-')}</p>
          <p style="margin: 6px 0 0 0; color: #64748b;"><b>Labor:</b> ${escapeHtml(String(booking.labor_count ?? '-'))}</p>
        </div>

        <div style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px;">
          <h3 style="margin: 0 0 10px 0; color: #0f172a;">Bill</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 6px 0; color: #64748b;">Total</td><td style="padding: 6px 0; text-align:right; color: #0f172a; font-weight: 700;">${currency(total)}</td></tr>
            <tr><td style="padding: 6px 0; color: #64748b;">Advance Paid</td><td style="padding: 6px 0; text-align:right; color: #16a34a; font-weight: 700;">- ${currency(advance)}</td></tr>
            <tr><td style="padding: 10px 0 0 0; color: #0f172a; font-weight: 900;">Remaining</td><td style="padding: 10px 0 0 0; text-align:right; color: #0f172a; font-weight: 900;">${currency(remaining)}</td></tr>
          </table>
        </div>

        <p style="margin: 16px 0 0 0; color: #94a3b8; font-size: 12px;">This is an automated email. Please do not reply.</p>
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
      to: user.email,
      subject,
      text: `Booking confirmed. Total: ${currency(total)}. Advance: ${currency(advance)}. Remaining: ${currency(remaining)}.`,
      html,
    });

    return jsonResponse({ sent: true });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: error instanceof Error ? error.message : 'Failed to send email' }, 500);
  }
});
