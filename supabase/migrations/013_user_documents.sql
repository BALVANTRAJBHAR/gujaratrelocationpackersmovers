-- Store document verification details for staff/driver/admin onboarding

alter table public.users
  add column if not exists document_type text,
  add column if not exists document_number text,
  add column if not exists document_image_url text;

