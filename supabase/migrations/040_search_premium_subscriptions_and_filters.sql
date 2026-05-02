-- Search Premium + extra filter fields

-- Add missing property filter fields
alter table public.properties
  add column if not exists floor_number int,
  add column if not exists total_floors int,
  add column if not exists property_age_years int;

create index if not exists idx_properties_floor_number on public.properties(floor_number);
create index if not exists idx_properties_total_floors on public.properties(total_floors);
create index if not exists idx_properties_property_age_years on public.properties(property_age_years);

-- Track seen properties per user
create table if not exists public.user_seen_properties (
  user_id uuid not null references public.users(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (user_id, property_id)
);

create index if not exists idx_user_seen_properties_user_id on public.user_seen_properties(user_id);
create index if not exists idx_user_seen_properties_property_id on public.user_seen_properties(property_id);
 
alter table public.user_seen_properties enable row level security;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_seen_properties' AND policyname = 'Users can manage own seen properties'
  ) THEN
    CREATE POLICY "Users can manage own seen properties"
    ON public.user_seen_properties FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- Subscription model
create table if not exists public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  plan_code text not null,
  status text not null default 'active',
  starts_at timestamptz not null default now(),
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_subscriptions_user_id on public.user_subscriptions(user_id);
create index if not exists idx_user_subscriptions_status on public.user_subscriptions(status);
create index if not exists idx_user_subscriptions_valid_until on public.user_subscriptions(valid_until);

alter table public.user_subscriptions enable row level security;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_subscriptions' AND policyname = 'Users can read own subscriptions'
  ) THEN
    CREATE POLICY "Users can read own subscriptions"
    ON public.user_subscriptions FOR SELECT
    USING (user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_subscriptions' AND policyname = 'Admin can manage subscriptions'
  ) THEN
    CREATE POLICY "Admin can manage subscriptions"
    ON public.user_subscriptions FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role IN ('admin', 'staff')
      )
    );
  END IF;
END $$;
