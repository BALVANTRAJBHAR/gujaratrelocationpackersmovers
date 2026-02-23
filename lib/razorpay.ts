const invokeEdgeFunction = async <T,>(name: string, body: unknown): Promise<T> => {
  const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
  if (!baseUrl || !anonKey) {
    throw new Error('Supabase env vars missing. Check EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.');
  }

  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeout = setTimeout(() => ctrl?.abort(), 20000);

  try {
    const res = await fetch(`${baseUrl}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
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
      const msg = parsed?.error || parsed?.message || text || `Edge Function error (${res.status})`;
      throw new Error(`(${res.status}) ${msg}`);
    }

    return parsed as T;
  } catch (e: any) {
    const msg = e?.name === 'AbortError' ? 'Timeout calling payment service. Please try again.' : e?.message;
    throw new Error(msg || 'Payment service failed.');
  } finally {
    clearTimeout(timeout);
  }
};

type CreateOrderPayload = {
  amount: number;
  currency?: string;
  receipt?: string;
  booking_id?: string;
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
