/**
 * Safely extract a human-readable string from any error value.
 * Handles: Error instances, plain objects (Razorpay error shape), nested objects, strings.
 */
const extractErrorMessage = (value: unknown): string => {
  if (!value) return '';
  // Standard JS Error
  if (value instanceof Error) return value.message;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>;
    // Razorpay error object: { code, description, reason, field, source, step, metadata }
    // description can itself be an object
    const desc = v.description;
    if (desc) {
      if (typeof desc === 'string') return desc;
      if (typeof desc === 'object') {
        const d = desc as Record<string, unknown>;
        return String(d.reason || d.message || d.error || JSON.stringify(desc));
      }
    }
    // Try common message fields
    const direct = v.message || v.error || v.reason || v.detail || v.msg;
    if (direct) {
      if (typeof direct === 'string') return direct;
      if (typeof direct === 'object') return JSON.stringify(direct);
      return String(direct);
    }
    return JSON.stringify(value);
  }
  return String(value);
};

const invokeEdgeFunction = async <T,>(name: string, body: unknown): Promise<T> => {
  const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
  if (!baseUrl || !anonKey) {
    throw new Error('Supabase env vars missing. Check EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.');
  }

  const { supabase } = await import('@/lib/supabase');
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token ?? '';

  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeout = setTimeout(() => ctrl?.abort(), 20000);

  try {
    const res = await fetch(`${baseUrl}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body ?? {}),
      signal: ctrl?.signal,
    } as any);

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
      // parsed?.error may itself be a nested object (Razorpay API error shape)
      const errPayload = parsed?.error ?? parsed?.message ?? parsed;
      const msg = extractErrorMessage(errPayload) || text || `Edge Function error (${res.status})`;
      throw new Error(`(${res.status}) ${msg}`);
    }

    return parsed as T;
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      throw new Error('Timeout calling payment service. Please try again.');
    }
    // Re-throw already formatted Error objects unchanged
    if (e instanceof Error) throw e;
    // Unexpected non-Error throw
    throw new Error(extractErrorMessage(e) || 'Payment service failed.');
  } finally {
    clearTimeout(timeout);
  }
};

type CreateOrderPayload = {
  amount: number;
  currency?: string;
  receipt?: string;
  booking_id?: string;
  notes?: Record<string, any>;
};

type RazorpayOrder = {
  id: string;
  amount: number;
  currency: string;
  receipt?: string;
  status?: string;
};

export async function createRazorpayOrder(payload: CreateOrderPayload): Promise<RazorpayOrder> {
  return await invokeEdgeFunction<RazorpayOrder>('razorpay-order', payload);
}

type VerifyPayload = {
  order_id: string;
  payment_id: string;
  signature: string;
};

export async function verifyRazorpaySignature(payload: VerifyPayload): Promise<boolean> {
  const data = await invokeEdgeFunction<{ valid?: boolean }>('razorpay-verify', payload);
  return Boolean(data?.valid);
}

type VerifySubscriptionPayload = {
  order_id: string;
  payment_id: string;
  signature: string;
  plan_code: string;
  amount: number;
};

export async function verifyRazorpaySubscription(payload: VerifySubscriptionPayload): Promise<boolean> {
  const data = await invokeEdgeFunction<{ valid?: boolean }>('razorpay-verify', {
    order_id: payload.order_id,
    payment_id: payload.payment_id,
    signature: payload.signature,
    purpose: 'subscription',
    plan_code: payload.plan_code,
    amount: payload.amount,
  });
  return Boolean(data?.valid);
}
