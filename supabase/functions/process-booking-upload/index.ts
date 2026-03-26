import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import jpeg from 'npm:jpeg-js@0.4.4';

import { corsHeaders } from '../_shared/cors.ts';

type AuthUser = {
  id: string;
  email?: string;
};

type BookingRow = {
  id: string;
  user_id: string | null;
};

const MAX_IMAGE_BYTES = 500 * 1024;
const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_DURATION_SEC = 30; // validated client-side; server checks size + magic bytes

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function getBearer(req: Request) {
  const auth = req.headers.get('authorization') ?? req.headers.get('Authorization') ?? '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : '';
}

async function getAuthedUser(supabaseUrl: string, anonKey: string, jwt: string): Promise<AuthUser> {
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

async function postRest(url: string, serviceKey: string, body: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `REST error: ${res.status}`);
  }

  return (await res.json()) as any;
}

function randomHex(len = 16) {
  const bytes = crypto.getRandomValues(new Uint8Array(Math.ceil(len / 2)));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, len);
}

function sniffKind(bytes: Uint8Array) {
  // JPEG: FF D8 FF
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  // MP4: ... 'ftyp'
  if (bytes.length >= 12) {
    const box = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
    if (box === 'ftyp') return 'mp4';
  }
  return 'unknown';
}

async function storageDownload(supabaseUrl: string, serviceKey: string, bucket: string, path: string) {
  const res = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${encodeURI(path).replaceAll('%2F', '/')}`,
    {
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Storage download error: ${res.status}`);
  }

  const ab = await res.arrayBuffer();
  return new Uint8Array(ab);
}

async function storageUpload(
  supabaseUrl: string,
  serviceKey: string,
  bucket: string,
  path: string,
  bytes: Uint8Array,
  contentType: string
) {
  const body = bytes as unknown as BodyInit;
  const res = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${encodeURI(path).replaceAll('%2F', '/')}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        'Content-Type': contentType,
        'x-upsert': 'true',
      },
      body,
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Storage upload error: ${res.status}`);
  }
}

async function storageRemove(supabaseUrl: string, serviceKey: string, bucket: string, path: string) {
  const res = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${encodeURI(path).replaceAll('%2F', '/')}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Storage delete error: ${res.status}`);
  }
}

function publicUrl(supabaseUrl: string, bucket: string, path: string) {
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
}

function normalizeKind(input: unknown): 'photo' | 'video' {
  const v = String(input ?? '').trim().toLowerCase();
  return v === 'video' ? 'video' : 'photo';
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('SUPABASE_PROJECT_URL') ?? '';
    const serviceKey =
      Deno.env.get('SERVICE_ROLE_KEY') ??
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
      Deno.env.get('SB_SERVICE_ROLE_KEY') ??
      '';
    const anonKey =
      Deno.env.get('SUPABASE_ANON_KEY') ??
      Deno.env.get('ANON_KEY') ??
      Deno.env.get('SUPABASE_ANON_PUBLIC_KEY') ??
      '';

    if (!supabaseUrl || !serviceKey || !anonKey) {
      return jsonResponse({ error: 'Supabase env missing' }, 500);
    }

    const jwt = getBearer(req);
    if (!jwt) return jsonResponse({ error: 'Missing Authorization bearer token' }, 401);

    const body = await req.json();
    const bookingId = String(body.booking_id ?? '').trim();
    const rawPath = String(body.raw_path ?? '').trim();
    const kind = normalizeKind(body.kind);

    if (!bookingId || !rawPath) return jsonResponse({ error: 'booking_id and raw_path required' }, 400);

    const user = await getAuthedUser(supabaseUrl, anonKey, jwt);

    const [booking] = await getRest<BookingRow[]>(
      `${supabaseUrl}/rest/v1/bookings?id=eq.${bookingId}&select=id,user_id`,
      serviceKey
    );

    if (!booking) return jsonResponse({ error: 'Booking not found' }, 404);
    if (!booking.user_id || String(booking.user_id) !== user.id) return jsonResponse({ error: 'Forbidden' }, 403);

    const RAW_BUCKET = 'booking-uploads-raw';
    const FINAL_BUCKET = 'booking-uploads';

    const bytes = await storageDownload(supabaseUrl, serviceKey, RAW_BUCKET, rawPath);
    if (!bytes?.length) return jsonResponse({ error: 'Empty upload' }, 400);

    if (kind === 'photo' && bytes.length > MAX_IMAGE_UPLOAD_BYTES) {
      return jsonResponse({ error: 'Image too large. Max 10MB.' }, 400);
    }

    if (kind === 'video' && bytes.length > MAX_VIDEO_BYTES) {
      return jsonResponse({ error: 'Video too large. Max 5MB.' }, 400);
    }

    const detected = sniffKind(bytes.slice(0, 64));

    if (kind === 'photo') {
      if (detected !== 'jpeg') return jsonResponse({ error: 'Only JPG/JPEG images allowed' }, 400);

      let out = bytes;
      if (out.length > MAX_IMAGE_BYTES) {
        // Try recompress with decreasing quality until it fits.
        const decoded = jpeg.decode(out, { useTArray: true });
        if (!decoded?.data || !decoded?.width || !decoded?.height) {
          return jsonResponse({ error: 'Invalid JPEG' }, 400);
        }

        let quality = 70;
        while (quality >= 30) {
          const encoded = jpeg.encode({ data: decoded.data, width: decoded.width, height: decoded.height }, quality);
          out = encoded.data;
          if (out.length <= MAX_IMAGE_BYTES) break;
          quality -= 10;
        }

        if (out.length > MAX_IMAGE_BYTES) {
          return jsonResponse({ error: 'Image too large even after compression' }, 400);
        }
      }

      const finalPath = `bookings/${bookingId}/photos/${Date.now()}_${randomHex(10)}.jpg`;
      await storageUpload(supabaseUrl, serviceKey, FINAL_BUCKET, finalPath, out, 'image/jpeg');

      const url = publicUrl(supabaseUrl, FINAL_BUCKET, finalPath);
      await postRest(`${supabaseUrl}/rest/v1/booking_uploads`, serviceKey, {
        booking_id: bookingId,
        file_url: url,
        file_type: 'photo',
        file_name: finalPath.split('/').pop() ?? null,
        file_size: out.length,
      });

      await storageRemove(supabaseUrl, serviceKey, RAW_BUCKET, rawPath);

      return jsonResponse({ ok: true, file_url: url, file_path: finalPath, file_size: out.length });
    }

    // kind === 'video'
    if (detected !== 'mp4') return jsonResponse({ error: 'Only MP4 videos allowed' }, 400);

    // NOTE: Real MP4 duration validation + compression requires ffmpeg.
    // We already validate duration client-side and enforce size here.

    const finalPath = `bookings/${bookingId}/videos/${Date.now()}_${randomHex(10)}.mp4`;
    await storageUpload(supabaseUrl, serviceKey, FINAL_BUCKET, finalPath, bytes, 'video/mp4');

    const url = publicUrl(supabaseUrl, FINAL_BUCKET, finalPath);
    await postRest(`${supabaseUrl}/rest/v1/booking_uploads`, serviceKey, {
      booking_id: bookingId,
      file_url: url,
      file_type: 'video',
      file_name: finalPath.split('/').pop() ?? null,
      file_size: bytes.length,
    });

    await storageRemove(supabaseUrl, serviceKey, RAW_BUCKET, rawPath);

    return jsonResponse({ ok: true, file_url: url, file_path: finalPath, file_size: bytes.length, max_duration_sec: MAX_VIDEO_DURATION_SEC });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: error instanceof Error ? error.message : 'Failed to process upload' }, 500);
  }
});
