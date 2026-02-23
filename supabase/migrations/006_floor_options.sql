-- Floor options (admin-managed)

create table if not exists public.floor_options (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  sort_order int not null default 0,
  charge_with_lift numeric,
  charge_without_lift numeric,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists floor_options_label_unique on public.floor_options (label);

insert into public.floor_options (label, sort_order, charge_with_lift, charge_without_lift, is_active)
select 'Ground Floor', 0, 0, 0, true
where not exists (select 1 from public.floor_options where label = 'Ground Floor');
