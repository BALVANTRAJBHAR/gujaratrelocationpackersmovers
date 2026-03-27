import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import jpeg from 'npm:jpeg-js@0.4.4';

import { corsHeaders } from '../_shared/cors.ts';

type AuthUser = {
  id: string;
  email?: string;
};

type AppUserRow = {
  id: string;
  role: string | null;
};

const MAX_IMAGE_BYTES = 500 * 1024;
const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;

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

function randomHex(len = 16) {
  const bytes = crypto.getRandomValues(new Uint8Array(Math.ceil(len / 2)));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, len);
}

function sniffJpeg(bytes: Uint8Array) {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
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
    const effectiveUserId = String(body.effective_user_id ?? '').trim();
    const rawPath = String(body.raw_path ?? '').trim();

    if (!effectiveUserId || !rawPath) {
      return jsonResponse({ error: 'effective_user_id and raw_path required' }, 400);
    }

    const user = await getAuthedUser(supabaseUrl, anonKey, jwt);

    const [appUser] = await getRest<AppUserRow[]>(
      `${supabaseUrl}/rest/v1/users?id=eq.${user.id}&select=id,role`,
      serviceKey
    );

    if (!appUser) return jsonResponse({ error: 'User profile not found' }, 404);
    if (!['admin', 'staff'].includes(String(appUser.role ?? '').toLowerCase())) {
      return jsonResponse({ error: 'Forbidden' }, 403);
    }

    const RAW_BUCKET = 'user-documents-raw';
    const FINAL_BUCKET = 'driver-docs';

    const bytes = await storageDownload(supabaseUrl, serviceKey, RAW_BUCKET, rawPath);
    if (!bytes?.length) return jsonResponse({ error: 'Empty upload' }, 400);
    if (bytes.length > MAX_IMAGE_UPLOAD_BYTES) return jsonResponse({ error: 'Image too large. Max 10MB.' }, 400);

    if (!sniffJpeg(bytes.slice(0, 16))) return jsonResponse({ error: 'Only JPG/JPEG images allowed' }, 400);

    let out = bytes;
    if (out.length > MAX_IMAGE_BYTES) {
      const decoded = jpeg.decode(out, { useTArray: true });
      if (!decoded?.data || !decoded?.width || !decoded?.height) return jsonResponse({ error: 'Invalid JPEG' }, 400);

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

    const finalPath = `${user.id}/${effectiveUserId}/user-doc-${Date.now()}_${randomHex(10)}.jpg`;
    await storageUpload(supabaseUrl, serviceKey, FINAL_BUCKET, finalPath, out, 'image/jpeg');
    await storageRemove(supabaseUrl, serviceKey, RAW_BUCKET, rawPath);

    return jsonResponse({ ok: true, storage_path: finalPath, file_size: out.length });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: error instanceof Error ? error.message : 'Failed to process upload' }, 500);
  }
});
