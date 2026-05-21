import type { SupabaseClient } from '@supabase/supabase-js';

function normalizePhoneDigits(phone: string) {
  return String(phone ?? '').replace(/\D/g, '').slice(-10);
}

function normalizeAadhaarDigits(value: string) {
  return String(value ?? '').replace(/\D/g, '').slice(0, 12);
}

/** Returns another user's id if this mobile is already registered. */
export async function findExistingUserByPhone(
  supabase: SupabaseClient,
  phone: string,
  excludeUserId: string
): Promise<string | null> {
  const digits = normalizePhoneDigits(phone);
  if (digits.length !== 10 || !excludeUserId) return null;

  const variants = [`+91${digits}`, digits, `91${digits}`];
  const { data, error } = await supabase
    .from('users')
    .select('id, phone')
    .neq('id', excludeUserId)
    .in('phone', variants)
    .limit(1);

  if (error) return null;
  const row = (data ?? [])[0] as { id?: string } | undefined;
  return row?.id ? String(row.id) : null;
}

/** Returns another user's id if this Aadhaar is already linked. */
export async function findExistingUserByAadhaar(
  supabase: SupabaseClient,
  aadhaar: string,
  excludeUserId: string
): Promise<string | null> {
  const digits = normalizeAadhaarDigits(aadhaar);
  if (digits.length !== 12 || !excludeUserId) return null;

  const { data, error } = await supabase
    .from('user_documents')
    .select('user_id, document_number, document_type')
    .eq('document_number', digits)
    .in('document_type', ['aadhar', 'aadhaar', 'Aadhaar', 'Aadhar'])
    .neq('user_id', excludeUserId)
    .limit(1);

  if (error) return null;
  const row = (data ?? [])[0] as { user_id?: string } | undefined;
  return row?.user_id ? String(row.user_id) : null;
}
