-- Driver verification status
alter table public.users
  add column if not exists driver_status text default 'pending',
  add column if not exists driver_verified boolean default false;
