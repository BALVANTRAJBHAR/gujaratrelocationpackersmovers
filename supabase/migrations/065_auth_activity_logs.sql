-- Auth activity audit log: who logged in/out, when, from which device/app

create table if not exists public.auth_activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  action text not null check (action in ('login', 'logout')),
  device_type text not null default 'unknown' check (device_type in ('mobile_app', 'mobile_web', 'desktop_web', 'unknown')),
  platform text,
  os text,
  browser text,
  user_agent text,
  app_version text,
  ip_address text,
  created_at timestamptz not null default now()
);

create index if not exists idx_auth_activity_logs_user on public.auth_activity_logs(user_id);
create index if not exists idx_auth_activity_logs_created on public.auth_activity_logs(created_at desc);

alter table public.auth_activity_logs enable row level security;

create policy "Users can insert own auth activity logs" on public.auth_activity_logs
  for insert with check (auth.uid() = user_id);

create policy "Users can read own auth activity logs" on public.auth_activity_logs
  for select using (auth.uid() = user_id);

create policy "Admin or staff can read all auth activity logs" on public.auth_activity_logs
  for select using (
    exists (select 1 from public.users where id = auth.uid() and role in ('admin', 'staff'))
  );