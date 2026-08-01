import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { corsHeaders } from '../_shared/cors.ts';

declare const Deno: any;

type SupportConversationRow = {
  id: string;
  user_id: string | null;
  booking_id: string | null;
};

type SupportMessageRow = {
  id: string;
  conversation_id: string;
  user_id: string | null;
  sender: string;
  message: string;
  meta: Record<string, unknown> | null;
  created_at: string;
};

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function getAuthUserId(supabaseUrl: string, anonKey: string, authHeader: string) {
  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: authHeader,
    },
  });

  if (!res.ok) return null;
  const data = (await res.json()) as { id?: string };
  return data?.id ?? null;
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

async function callGroq(args: {
  apiKey: string;
  model: string;
  messages: Array<{ role: string; content: string }>;
}) {
  const startedAt = Date.now();
  console.log(`[support-ai] Calling Groq: model=${args.model}, messages=${args.messages.length}`);

  const res = await fetch(GROQ_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify({
      model: args.model,
      messages: args.messages,
      temperature: 0.2,
      max_tokens: 300,
    }),
  });

  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!res.ok) {
    const msg =
      parsed?.error?.message ||
      parsed?.error ||
      parsed?.message ||
      text ||
      `Groq API error: ${res.status}`;
    console.error(`[support-ai] Groq API error (${res.status}): ${msg}`);
    throw new Error(String(msg));
  }

  const generated = parsed?.choices?.[0]?.message?.content ?? '';
  const elapsedMs = Date.now() - startedAt;
  console.log(
    `[support-ai] Groq response OK in ${elapsedMs}ms, content length=${String(generated).length}`
  );
  return String(generated ?? '').trim();
}

const SYSTEM_PROMPT = `You are a helpful support assistant for "Gujarat Relocation Packers & Movers".

Goals:
- Answer customer questions about booking, tracking, reschedule, cancellation, payment, and general relocation queries.
- Keep replies short, polite, and action-oriented.
- If user needs human help, instruct them to use WhatsApp/Call option.

Constraints:
- Do not claim you can do actions you cannot. You can only guide.
- If booking_id is provided, mention it in the response when relevant.
- If the user asks for private data or anything unsafe, refuse and suggest human support.
`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('SUPABASE_PROJECT_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceKey =
      Deno.env.get('SERVICE_ROLE_KEY') ??
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
      Deno.env.get('SB_SERVICE_ROLE_KEY') ??
      '';

    const groqKey = Deno.env.get('GROQ_API_KEY') ?? '';
    const groqModel = Deno.env.get('GROQ_MODEL') ?? DEFAULT_GROQ_MODEL;

    if (!supabaseUrl || !anonKey || !serviceKey) {
      console.error(
        `[support-ai] Missing Supabase env (SUPABASE_URL=${supabaseUrl ? 'set' : 'missing'}, SUPABASE_ANON_KEY=${anonKey ? 'set' : 'missing'}, SERVICE_ROLE_KEY=${serviceKey ? 'set' : 'missing'})`
      );
      return jsonResponse(
        { error: 'Server configuration error: Supabase environment variables are missing (SUPABASE_URL, SUPABASE_ANON_KEY, SERVICE_ROLE_KEY).' },
        500
      );
    }
    if (!groqKey) {
      console.error('[support-ai] Missing GROQ_API_KEY environment variable');
      return jsonResponse(
        { error: 'Server configuration error: GROQ_API_KEY is not set. Add GROQ_API_KEY to the Edge Function secrets.' },
        500
      );
    }

    const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization') ?? '';
    if (!authHeader) {
      return jsonResponse({ error: 'Missing Authorization header' }, 401);
    }

    const userId = await getAuthUserId(supabaseUrl, anonKey, authHeader);
    if (!userId) {
      console.warn('[support-ai] Authentication failed for request');
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    console.log(`[support-ai] Authenticated user=${userId}`);

    const body = await req.json();
    const conversationId = String(body.conversation_id ?? '').trim();
    const message = String(body.message ?? '').trim();
    const bookingId = body.booking_id ? String(body.booking_id).trim() : '';

    if (!conversationId) return jsonResponse({ error: 'conversation_id required' }, 400);
    if (!message) return jsonResponse({ error: 'message required' }, 400);

    const [conv] = await getRest<SupportConversationRow[]>(
      `${supabaseUrl}/rest/v1/support_conversations?id=eq.${conversationId}&select=id,user_id,booking_id`,
      serviceKey
    );

    if (!conv || (conv.user_id ?? '') !== userId) {
      console.warn(`[support-ai] Conversation not found or not owned by user (conversation_id=${conversationId})`);
      return jsonResponse({ error: 'Conversation not found' }, 404);
    }

    await postRest<SupportMessageRow[]>(`${supabaseUrl}/rest/v1/support_messages`, serviceKey, [
      {
        conversation_id: conversationId,
        user_id: userId,
        sender: 'user',
        message,
        meta: bookingId ? { booking_id: bookingId } : null,
      },
    ]);

    const history = await getRest<SupportMessageRow[]>(
      `${supabaseUrl}/rest/v1/support_messages?conversation_id=eq.${conversationId}&select=id,sender,message,created_at&order=created_at.asc&limit=20`,
      serviceKey
    );
    console.log(`[support-ai] Loaded ${history.length} history messages for conversation ${conversationId}`);

    const chatMessages: Array<{ role: string; content: string }> = [
      { role: 'system', content: SYSTEM_PROMPT },
    ];

    const contextLine = bookingId ? `Booking ID: ${bookingId}` : conv.booking_id ? `Booking ID: ${conv.booking_id}` : '';
    if (contextLine) {
      chatMessages.push({ role: 'system', content: contextLine });
    }

    for (const m of history) {
      const sender = String(m.sender ?? '').trim();
      if (sender === 'user') chatMessages.push({ role: 'user', content: m.message });
      else chatMessages.push({ role: 'assistant', content: m.message });
    }

    const aiText = await callGroq({ apiKey: groqKey, model: groqModel, messages: chatMessages });
    const safeAiText = aiText || 'Please share a bit more detail. If urgent, use WhatsApp/Call support.';

    const [insertedAi] = await postRest<SupportMessageRow[]>(`${supabaseUrl}/rest/v1/support_messages`, serviceKey, [
      {
        conversation_id: conversationId,
        user_id: userId,
        sender: 'ai',
        message: safeAiText,
        meta: bookingId ? { booking_id: bookingId, model: groqModel, provider: 'groq' } : { model: groqModel, provider: 'groq' },
      },
    ]);

    return jsonResponse({
      ok: true,
      ai_message: insertedAi,
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e ?? 'Unknown error');
    console.error(`[support-ai] Request failed: ${msg}`);
    const isClientError =
      String(e?.message ?? '').includes('conversation_id required') ||
      String(e?.message ?? '').includes('message required');
    if (isClientError) {
      return jsonResponse({ error: msg }, 400);
    }
    return jsonResponse({ error: `Support AI request failed: ${msg}` }, 500);
  }
});
