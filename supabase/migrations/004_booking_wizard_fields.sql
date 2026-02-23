-- Add booking wizard fields (non-breaking additions)

-- Vehicle types: add richer pricing + metadata
alter table public.vehicle_types
  add column if not exists description text,
  add column if not exists base_price numeric(12,2),
  add column if not exists per_km_price numeric(12,2),
  add column if not exists labor_price numeric(12,2),
  add column if not exists image_url text,
  add column if not exists updated_at timestamptz default now();

-- Keep legacy columns (base_fare/per_km_rate/capacity) as-is. Backfill new price columns if missing.
update public.vehicle_types
set
  base_price = coalesce(base_price, base_fare),
  per_km_price = coalesce(per_km_price, per_km_rate)
where base_price is null or per_km_price is null;

-- Bookings: add schedule, vehicle selection, floors/lift, items & payment details
alter table public.bookings
  add column if not exists vehicle_type_id uuid references public.vehicle_types(id) on delete set null,
  add column if not exists pickup_lat double precision,
  add column if not exists pickup_lng double precision,
  add column if not exists drop_lat double precision,
  add column if not exists drop_lng double precision,
  add column if not exists pickup_floor int default 0,
  add column if not exists drop_floor int default 0,
  add column if not exists pickup_lift_available boolean default true,
  add column if not exists drop_lift_available boolean default true,
  add column if not exists labor_count int default 2,
  add column if not exists scheduled_date date,
  add column if not exists scheduled_time text,
  add column if not exists scheduled_at timestamptz,
  add column if not exists fare_breakdown jsonb,
  add column if not exists items_description text,
  add column if not exists special_instructions text,
  add column if not exists advance_amount numeric(12,2),
  add column if not exists remaining_amount numeric(12,2),
  add column if not exists payment_method text,
  add column if not exists updated_at timestamptz default now();

-- Booking uploads: add file metadata
alter table public.booking_uploads
  add column if not exists file_name text,
  add column if not exists file_size bigint,
  add column if not exists uploaded_at timestamptz default now();

-- Helpful indexes
create index if not exists bookings_user_id_created_at_idx on public.bookings(user_id, created_at desc);
create index if not exists bookings_driver_id_created_at_idx on public.bookings(driver_id, created_at desc);
