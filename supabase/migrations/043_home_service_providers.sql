-- Home Services: Provider tracking and availability

-- Providers table: tracks which service providers offer which services in which state/cities
create table if not exists public.home_service_providers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  service_key text not null, -- 'ac', 'carpenter', 'electrician', 'plumber', 'pest', 'cleaning', 'painting'
  state text not null,
  city text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, service_key, state, city)
);

create index if not exists idx_home_service_providers_service_state_city
  on public.home_service_providers(service_key, state, city, is_active);
create index if not exists idx_home_service_providers_user_id
  on public.home_service_providers(user_id, is_active);

-- RLS
alter table public.home_service_providers enable row level security;

-- Policies: Providers manage their own listings
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'home_service_providers' and policyname = 'Providers can insert own service listings'
  ) then
    create policy "Providers can insert own service listings"
    on public.home_service_providers for insert
    with check (user_id = auth.uid());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'home_service_providers' and policyname = 'Providers can read own service listings'
  ) then
    create policy "Providers can read own service listings"
    on public.home_service_providers for select
    using (user_id = auth.uid());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'home_service_providers' and policyname = 'Providers can update own service listings'
  ) then
    create policy "Providers can update own service listings"
    on public.home_service_providers for update
    using (user_id = auth.uid());
  end if;
end $$;

-- Admin can read all provider listings
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'home_service_providers' and policyname = 'Admin can read all provider listings'
  ) then
    create policy "Admin can read all provider listings"
    on public.home_service_providers for select
    using (
      exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.role in ('admin', 'staff')
      )
    );
  end if;
end $$;
