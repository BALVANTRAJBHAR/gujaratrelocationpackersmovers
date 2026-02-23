create table if not exists public.booking_otps (
  phone text primary key,
  otp_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  verified boolean not null default false,
  last_sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists booking_otps_expires_at_idx on public.booking_otps (expires_at);

create or replace function public.set_booking_otps_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'set_booking_otps_updated_at'
  ) then
    create trigger set_booking_otps_updated_at
    before update on public.booking_otps
    for each row
    execute function public.set_booking_otps_updated_at();
  end if;
end $$;

alter table public.booking_otps enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'booking_otps'
      and policyname = 'Service role only'
  ) then
    create policy "Service role only"
    on public.booking_otps
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');
  end if;
end $$;
