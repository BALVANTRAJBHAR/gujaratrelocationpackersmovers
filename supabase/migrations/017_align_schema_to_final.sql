-- Align schema to final structure (development mode, ok to drop legacy columns)

-- USERS
alter table public.users
  add column if not exists updated_at timestamptz default now(),
  add column if not exists status smallint default 1,
  add column if not exists updated_by uuid;

do $$
begin
  -- Make sure updated_by has FK to users.id
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_updated_by_fkey'
  ) then
    alter table public.users
      add constraint users_updated_by_fkey
      foreign key (updated_by)
      references public.users(id)
      on delete set null;
  end if;
end $$;

-- Drop legacy single-document columns on users (we use public.user_documents)
alter table public.users
  drop column if exists document_type,
  drop column if exists document_number,
  drop column if exists document_image_url;


-- USER DOCUMENTS
-- Ensure table exists (so this migration can run even if 016 wasn't applied)
create table if not exists public.user_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  document_type text not null,
  document_number text not null,
  image_url text,
  created_at timestamptz not null default now()
);

-- Ensure id has default
alter table public.user_documents
  alter column id set default gen_random_uuid();


-- VEHICLE TYPES
alter table public.vehicle_types
  add column if not exists vehicle_type text,
  add column if not exists vehicle_number text,
  add column if not exists vehicle_model text,
  add column if not exists created_by uuid,
  add column if not exists updated_by uuid,
  add column if not exists updated_at timestamptz default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'vehicle_types_created_by_fkey'
  ) then
    alter table public.vehicle_types
      add constraint vehicle_types_created_by_fkey
      foreign key (created_by)
      references public.users(id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'vehicle_types_updated_by_fkey'
  ) then
    alter table public.vehicle_types
      add constraint vehicle_types_updated_by_fkey
      foreign key (updated_by)
      references public.users(id)
      on delete set null;
  end if;
end $$;

-- Drop legacy pricing columns if present
alter table public.vehicle_types
  drop column if exists base_fare,
  drop column if exists per_km_rate;
