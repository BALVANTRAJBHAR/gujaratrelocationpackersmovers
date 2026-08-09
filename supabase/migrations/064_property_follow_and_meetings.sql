-- Free property follow (normal subscription) + visit/schedule meeting

create table if not exists public.property_followers (
  user_id uuid not null references public.users(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, property_id)
);

create index if not exists idx_property_followers_property on public.property_followers(property_id);

alter table public.property_followers enable row level security;

create policy "Users can view own property follows" on public.property_followers
  for select using (auth.uid() = user_id);

create policy "Owners can view followers of their properties" on public.property_followers
  for select using (
    exists (
      select 1 from public.properties
      where id = property_id and owner_user_id = auth.uid()
    )
  );

create policy "Admins can view all property followers" on public.property_followers
  for select using (exists (select 1 from public.users where id = auth.uid() and role in ('admin', 'staff')));

create policy "Users can follow and unfollow properties" on public.property_followers
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.property_meetings (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  owner_user_id uuid not null references public.users(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  meeting_date date not null,
  meeting_time time not null,
  message text,
  contact_name text,
  contact_phone text,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rescheduled', 'rejected', 'cancelled')),
  reschedule_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_property_meetings_property on public.property_meetings(property_id);
create index if not exists idx_property_meetings_owner on public.property_meetings(owner_user_id);
create index if not exists idx_property_meetings_user on public.property_meetings(user_id);

alter table public.property_meetings enable row level security;

create policy "Customers can view own meeting requests" on public.property_meetings
  for select using (auth.uid() = user_id);

create policy "Owners can view meetings on their properties" on public.property_meetings
  for select using (auth.uid() = owner_user_id);

create policy "Admins can view all property meetings" on public.property_meetings
  for select using (exists (select 1 from public.users where id = auth.uid() and role in ('admin', 'staff')));

create policy "Customers can request meetings" on public.property_meetings
  for insert with check (auth.uid() = user_id);

create policy "Customers can update own meeting requests" on public.property_meetings
  for update using (auth.uid() = user_id);

create policy "Owners can update meetings on their properties" on public.property_meetings
  for update using (auth.uid() = owner_user_id);

create policy "Admins can update all property meetings" on public.property_meetings
  for update using (exists (select 1 from public.users where id = auth.uid() and role in ('admin', 'staff')));