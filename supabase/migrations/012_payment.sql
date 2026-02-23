alter table if exists public.payments
add column if not exists user_id uuid references public.users(id) on delete set null;

alter table if exists public.payments
add column if not exists error jsonb;

alter table if exists public.payments
add column if not exists metadata jsonb;
