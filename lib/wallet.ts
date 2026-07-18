import { supabase } from './supabase';

export type WalletTransaction = {
  id: string;
  user_id: string;
  amount: number;
  type: 'credit' | 'debit';
  reference_type: 'add_money' | 'booking_refund' | 'booking_payment' | 'home_service_payment' | 'referral_credit' | 'referral_signup_bonus';
  reference_id: string | null;
  description: string | null;
  balance_before: number;
  balance_after: number;
  created_at: string;
};

export async function getWalletBalance(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('users')
    .select('wallet_balance')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data?.wallet_balance ?? 0;
}

export async function getWalletTransactions(userId: string, limit = 50): Promise<WalletTransaction[]> {
  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getProfileWithWallet(userId: string): Promise<{ wallet_balance: number; referral_code: string | null } | null> {
  const { data, error } = await supabase
    .from('users')
    .select('wallet_balance, referral_code')
    .eq('id', userId)
    .single();
  if (error) return null;
  return data;
}

export type CreditInput = {
  userId: string;
  amount: number;
  referenceType: WalletTransaction['reference_type'];
  referenceId: string | null;
  description: string;
};

export async function creditWallet(input: CreditInput): Promise<void> {
  const { data: user } = await supabase
    .from('users')
    .select('wallet_balance')
    .eq('id', input.userId)
    .single();
  const balanceBefore = user?.wallet_balance ?? 0;
  const balanceAfter = balanceBefore + input.amount;

  const { error: txError } = await supabase.from('wallet_transactions').insert({
    user_id: input.userId,
    amount: input.amount,
    type: 'credit',
    reference_type: input.referenceType,
    reference_id: input.referenceId,
    description: input.description,
    balance_before: balanceBefore,
    balance_after: balanceAfter,
  });
  if (txError) throw txError;

  const { error: updateError } = await supabase
    .from('users')
    .update({ wallet_balance: balanceAfter })
    .eq('id', input.userId);
  if (updateError) throw updateError;
}

export type DebitInput = {
  userId: string;
  amount: number;
  referenceType: WalletTransaction['reference_type'];
  referenceId: string | null;
  description: string;
};

export async function debitWallet(input: DebitInput): Promise<void> {
  const { data: user } = await supabase
    .from('users')
    .select('wallet_balance')
    .eq('id', input.userId)
    .single();
  const balanceBefore = user?.wallet_balance ?? 0;
  const balanceAfter = Math.max(balanceBefore - input.amount, 0);

  const { error: txError } = await supabase.from('wallet_transactions').insert({
    user_id: input.userId,
    amount: input.amount,
    type: 'debit',
    reference_type: input.referenceType,
    reference_id: input.referenceId,
    description: input.description,
    balance_before: balanceBefore,
    balance_after: balanceAfter,
  });
  if (txError) throw txError;

  const { error: updateError } = await supabase
    .from('users')
    .update({ wallet_balance: balanceAfter })
    .eq('id', input.userId);
  if (updateError) throw updateError;
}

export async function generateReferralLink(referralCode: string): Promise<string> {
  return `https://grpackersmovers.com/ref/${referralCode}`;
}

export async function lookupReferralCode(code: string): Promise<string | null> {
  const v = String(code ?? '').trim().toUpperCase();
  if (!v) return null;
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('referral_code', v)
    .maybeSingle();
  if (error || !data) return null;
  return data.id;
}

export async function rewardReferralOnBooking(userId: string, bookingRef: string): Promise<void> {
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('referred_by')
    .eq('id', userId)
    .single();
  if (userError || !user?.referred_by) return;

  const referrerId = user.referred_by;

  const { data: existing } = await supabase
    .from('wallet_transactions')
    .select('id')
    .eq('user_id', referrerId)
    .eq('reference_type', 'referral_credit')
    .eq('reference_id', userId)
    .maybeSingle();
  if (existing) return;

  await creditWallet({
    userId: referrerId,
    amount: 500,
    referenceType: 'referral_credit',
    referenceId: userId,
    description: `Referral reward for referring a new user (${bookingRef})`,
  });

  await creditWallet({
    userId,
    amount: 500,
    referenceType: 'referral_credit',
    referenceId: referrerId,
    description: `Congratulations! You earned ₹500 for your first booking (${bookingRef})`,
  });
}
