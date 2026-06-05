-- Add provider tracking to home_service_requests
ALTER TABLE public.home_service_requests
ADD COLUMN IF NOT EXISTS provider_id uuid references public.users(id) on delete set null,
ADD COLUMN IF NOT EXISTS provider_accepted_at timestamptz,
ADD COLUMN IF NOT EXISTS provider_name text,
ADD COLUMN IF NOT EXISTS provider_phone text;

-- Track all acceptance attempts (audit trail)
CREATE TABLE IF NOT EXISTS public.home_service_acceptances (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.home_service_requests(id) on delete cascade,
  provider_id uuid not null references public.users(id) on delete cascade,
  accepted_at timestamptz not null default now(),
  status text not null default 'accepted', -- accepted, rejected, cancelled
  notes text,
  created_at timestamptz not null default now()
);

-- Index for quick lookup
CREATE INDEX IF NOT EXISTS idx_home_service_acceptances_request_id 
  ON public.home_service_acceptances(request_id, accepted_at);
CREATE INDEX IF NOT EXISTS idx_home_service_acceptances_provider_id 
  ON public.home_service_acceptances(provider_id);

-- Enable RLS
ALTER TABLE public.home_service_acceptances ENABLE ROW LEVEL SECURITY;

-- Policy: Providers can insert own acceptances
CREATE POLICY IF NOT EXISTS "Providers can accept requests"
  ON public.home_service_acceptances
  FOR INSERT
  WITH CHECK (provider_id = auth.uid());

-- Policy: Users can view acceptances for their requests
CREATE POLICY IF NOT EXISTS "Users can view acceptances for their requests"
  ON public.home_service_acceptances
  FOR SELECT
  USING (
    request_id IN (
      SELECT id FROM public.home_service_requests WHERE user_id = auth.uid()
    )
    OR provider_id = auth.uid()
  );
