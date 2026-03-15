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

function buildInstructPrompt(messages: Array<{ role: string; content: string }>) {
  const lines: string[] = [];
  for (const m of messages) {
    const role = String(m.role ?? '').trim();
    const content = String(m.content ?? '').trim();
    if (!content) continue;
    if (role === 'system') {
      lines.push(`[SYSTEM]\n${content}`);
      continue;
    }
    if (role === 'user') {
      lines.push(`[USER]\n${content}`);
      continue;
    }
    lines.push(`[ASSISTANT]\n${content}`);
  }
  lines.push('[ASSISTANT]\n');
  return lines.join('\n\n');
}

async function callHuggingFace(args: {
  apiKey: string;
  model: string;
  messages: Array<{ role: string; content: string }>;
}) {
  const prompt = buildInstructPrompt(args.messages);

  const res = await fetch(`https://api-inference.huggingface.co/models/${encodeURIComponent(args.model)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify({
      inputs: prompt,
      parameters: {
        max_new_tokens: 280,
        temperature: 0.2,
        return_full_text: false,
      },
      options: {
        wait_for_model: true,
      },
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
      parsed?.error ||
      parsed?.message ||
      (Array.isArray(parsed) ? parsed?.[0]?.error : null) ||
      text ||
      `Hugging Face error: ${res.status}`;
    throw new Error(String(msg));
  }

  // Common HF responses:
  // - [{ generated_text: "..." }]
  // - { generated_text: "..." }
  // - { error: "..." }
  const generated =
    (Array.isArray(parsed) ? parsed?.[0]?.generated_text : parsed?.generated_text) ??
    (Array.isArray(parsed) ? parsed?.[0]?.text : parsed?.text) ??
    '';

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

    const hfKey =
      Deno.env.get('HUGGINGFACE_API_KEY') ??
      Deno.env.get('HF_API_KEY') ??
      Deno.env.get('HF_TOKEN') ??
      '';
    const hfModel = Deno.env.get('HUGGINGFACE_MODEL') ?? 'mistralai/Mistral-7B-Instruct-v0.2';

    if (!supabaseUrl || !anonKey || !serviceKey) {
      return jsonResponse({ error: 'Supabase env missing' }, 500);
    }
    if (!hfKey) {
      return jsonResponse({ error: 'Hugging Face token missing (set HF_TOKEN or HUGGINGFACE_API_KEY)' }, 500);
    }

    const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization') ?? '';
    if (!authHeader) {
      return jsonResponse({ error: 'Missing Authorization header' }, 401);
    }

    const userId = await getAuthUserId(supabaseUrl, anonKey, authHeader);
    if (!userId) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

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

    const aiText = await callHuggingFace({ apiKey: hfKey, model: hfModel, messages: chatMessages });
    const safeAiText = aiText || 'Please share a bit more detail. If urgent, use WhatsApp/Call support.';

    const [insertedAi] = await postRest<SupportMessageRow[]>(`${supabaseUrl}/rest/v1/support_messages`, serviceKey, [
      {
        conversation_id: conversationId,
        user_id: userId,
        sender: 'ai',
        message: safeAiText,
        meta: bookingId ? { booking_id: bookingId, model: hfModel, provider: 'huggingface' } : { model: hfModel, provider: 'huggingface' },
      },
    ]);

    return jsonResponse({
      ok: true,
      ai_message: insertedAi,
    });
  } catch (e: any) {
    return jsonResponse({ error: String(e?.message ?? e ?? 'Unknown error') }, 500);
  }
});
