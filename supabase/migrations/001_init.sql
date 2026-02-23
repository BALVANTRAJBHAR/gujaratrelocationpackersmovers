-- Packers & Movers initial schema

create extension if not exists "pgcrypto";

-- Users profile (linked to auth.users)
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  phone text unique,
  email text,
  role text default 'customer',
  is_verified boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.vehicle_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  base_fare numeric default 0,
  per_km_rate numeric default 0,
  capacity text,
  is_active boolean default true
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  driver_id uuid references public.users(id) on delete set null,
  pickup_address text,
  drop_address text,
  pickup_location jsonb,
  drop_location jsonb,
  distance_km numeric,
  estimated_price numeric,
  final_price numeric,
  status text default 'pending',
  payment_status text default 'pending',
  otp_verified boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.driver_locations (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid references public.users(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete cascade,
  lat numeric,
  lng numeric,
  speed numeric,
  updated_at timestamptz default now()
);

create table if not exists public.booking_uploads (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete cascade,
  file_url text,
  file_type text,
  created_at timestamptz default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete cascade,
  amount numeric,
  status text,
  razorpay_order_id text,
  razorpay_payment_id text,
  created_at timestamptz default now()
);

-- RLS
alter table public.users enable row level security;
alter table public.bookings enable row level security;
alter table public.driver_locations enable row level security;
alter table public.booking_uploads enable row level security;
alter table public.payments enable row level security;

create policy "Users can read own profile"
on public.users for select
using (auth.uid() = id);

create policy "Users can update own profile"
on public.users for update
using (auth.uid() = id);

create policy "Users can insert own profile"
on public.users for insert
with check (auth.uid() = id);

create policy "Customer can view own bookings"
on public.bookings for select
using (auth.uid() = user_id);

create policy "Customer can create booking"
on public.bookings for insert
with check (auth.uid() = user_id);

create policy "Customer can update own booking"
on public.bookings for update
using (auth.uid() = user_id);

create policy "Driver can insert own location"
on public.driver_locations for insert
with check (auth.uid() = driver_id);

create policy "Customer can see driver location for booking"
on public.driver_locations for select
using (
  exists (
    select 1 from public.bookings
    where public.bookings.id = booking_id
      and public.bookings.user_id = auth.uid()
  )
);
