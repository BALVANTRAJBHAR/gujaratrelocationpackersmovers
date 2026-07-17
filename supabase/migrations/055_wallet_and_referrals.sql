-- Wallet & Referral System

-- Add wallet balance to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS wallet_balance numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS referral_code text UNIQUE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

-- Wallet transactions ledger
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  type text NOT NULL CHECK (type IN ('credit', 'debit')),
  reference_type text NOT NULL CHECK (reference_type IN ('add_money', 'booking_refund', 'booking_payment', 'home_service_payment', 'referral_credit', 'referral_signup_bonus')),
  reference_id text,
  description text,
  balance_before numeric(12,2) NOT NULL,
  balance_after numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_id ON public.wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created_at ON public.wallet_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON public.users(referral_code);

-- RLS: users can see only their own wallet transactions
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY wallet_transactions_select_own ON public.wallet_transactions
  FOR SELECT USING (auth.uid() = user_id);

-- Function to auto-generate referral code on user creation
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text := '';
  i int;
  base_name text;
BEGIN
  -- Use first 4 chars of name or 'USER'
  base_name := upper(coalesce(nullif(trim(NEW.name), ''), 'USER'));
  base_name := left(regexp_replace(base_name, '[^A-Z]', '', 'g'), 4);
  IF length(base_name) < 3 THEN base_name := 'USER'; END IF;

  -- Generate random 4-char suffix
  FOR i IN 1..4 LOOP
    code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;

  NEW.referral_code := base_name || code;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_users_generate_referral_code
  BEFORE INSERT ON public.users
  FOR EACH ROW
  WHEN (NEW.referral_code IS NULL)
  EXECUTE FUNCTION public.generate_referral_code();

-- Function to process referral on signup
CREATE OR REPLACE FUNCTION public.process_referral()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  referrer_id uuid;
BEGIN
  -- Only process if user was referred
  IF NEW.referred_by IS NULL THEN
    RETURN NEW;
  END IF;

  -- Credit referrer ₹500
  UPDATE public.users SET wallet_balance = wallet_balance + 500 WHERE id = NEW.referred_by;
  INSERT INTO public.wallet_transactions (user_id, amount, type, reference_type, reference_id, description, balance_before, balance_after)
  SELECT NEW.referred_by, 500, 'credit', 'referral_credit', NEW.id::text, 'Referral reward for referring ' || COALESCE(NEW.name, 'a new user'), wallet_balance - 500, wallet_balance
  FROM public.users WHERE id = NEW.referred_by;

  -- Credit new user ₹500
  UPDATE public.users SET wallet_balance = wallet_balance + 500 WHERE id = NEW.id;
  INSERT INTO public.wallet_transactions (user_id, amount, type, reference_type, reference_id, description, balance_before, balance_after)
  SELECT NEW.id, 500, 'credit', 'referral_signup_bonus', NULL::text, 'Welcome bonus! You earned ₹500 for signing up', wallet_balance - 500, wallet_balance
  FROM public.users WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_users_process_referral
  AFTER INSERT ON public.users
  FOR EACH ROW
  WHEN (NEW.referred_by IS NOT NULL)
  EXECUTE FUNCTION public.process_referral();
