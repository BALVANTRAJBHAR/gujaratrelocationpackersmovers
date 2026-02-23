-- Add driver onboarding fields
alter table public.users
  add column if not exists license_number text,
  add column if not exists vehicle_type text,
  add column if not exists vehicle_number text,
  add column if not exists vehicle_model text,
  add column if not exists license_doc_url text,
  add column if not exists id_doc_url text;
