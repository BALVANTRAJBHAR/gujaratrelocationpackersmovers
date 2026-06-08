create table if not exists public.property_bookings (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  owner_user_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  message text,
  contact_name text,
  contact_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.property_bookings enable row level security;

create policy "Users can view own bookings" on public.property_bookings
  for select using (auth.uid() = user_id);

create policy "Owners can view bookings on their properties" on public.property_bookings
  for select using (auth.uid() = owner_user_id);

create policy "Admins can view all property bookings" on public.property_bookings
  for select using (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));

create policy "Users can insert own bookings" on public.property_bookings
  for insert with check (auth.uid() = user_id);

create policy "Users can update own bookings" on public.property_bookings
  for update using (auth.uid() = user_id);

create policy "Owners can update bookings on their properties" on public.property_bookings
  for update using (auth.uid() = owner_user_id);

create policy "Admins can update all property bookings" on public.property_bookings
  for update using (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));

create index idx_property_bookings_user_id on public.property_bookings(user_id);
create index idx_property_bookings_owner_user_id on public.property_bookings(owner_user_id);
create index idx_property_bookings_property_id on public.property_bookings(property_id);
