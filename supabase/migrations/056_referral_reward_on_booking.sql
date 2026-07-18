-- Remove signup-time referral credit (reward moves to first booking)
DROP TRIGGER IF EXISTS trg_users_process_referral ON public.users;
DROP FUNCTION IF EXISTS public.process_referral();
