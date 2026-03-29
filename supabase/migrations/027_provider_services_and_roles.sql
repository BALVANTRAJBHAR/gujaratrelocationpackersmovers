-- Add provider-specific fields and align roles

alter table public.users
  add column if not exists provider_services text[] default '{}'::text[];

-- Keep role values free-form (text), but ensure default is customer
alter table public.users
  alter column role set default 'customer';
