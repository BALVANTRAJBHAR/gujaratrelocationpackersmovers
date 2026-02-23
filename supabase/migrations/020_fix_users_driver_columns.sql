-- Ensure driver-related columns exist on public.users (required by app queries)

alter table public.users
  add column if not exists license_number text,
  add column if not exists vehicle_type text,
  add column if not exists vehicle_number text,
  add column if not exists vehicle_model text,
  add column if not exists license_doc_url text,
  add column if not exists id_doc_url text,
  add column if not exists driver_status text default 'pending',
  add column if not exists driver_verified boolean default false,
  add column if not exists approved_at timestamptz;
