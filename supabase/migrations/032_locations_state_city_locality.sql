-- Locations: states, cities, localities (DB-driven pickers)

create table if not exists public.states (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.cities (
  id uuid primary key default gen_random_uuid(),
  state_id uuid not null references public.states(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(state_id, name)
);

create index if not exists idx_cities_state_id on public.cities(state_id);

create table if not exists public.localities (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(city_id, name)
);

create index if not exists idx_localities_city_id on public.localities(city_id);

alter table public.states enable row level security;
alter table public.cities enable row level security;
alter table public.localities enable row level security;

-- Public read policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'states' AND policyname = 'Anyone can read active states'
  ) THEN
    CREATE POLICY "Anyone can read active states"
    ON public.states FOR SELECT
    USING (is_active = true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'cities' AND policyname = 'Anyone can read active cities'
  ) THEN
    CREATE POLICY "Anyone can read active cities"
    ON public.cities FOR SELECT
    USING (is_active = true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'localities' AND policyname = 'Anyone can read active localities'
  ) THEN
    CREATE POLICY "Anyone can read active localities"
    ON public.localities FOR SELECT
    USING (is_active = true);
  END IF;
END $$;

-- Admin/staff manage policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'states' AND policyname = 'Admin can manage states'
  ) THEN
    CREATE POLICY "Admin can manage states"
    ON public.states FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role IN ('admin','staff')
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role IN ('admin','staff')
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'cities' AND policyname = 'Admin can manage cities'
  ) THEN
    CREATE POLICY "Admin can manage cities"
    ON public.cities FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role IN ('admin','staff')
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role IN ('admin','staff')
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'localities' AND policyname = 'Admin can manage localities'
  ) THEN
    CREATE POLICY "Admin can manage localities"
    ON public.localities FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role IN ('admin','staff')
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role IN ('admin','staff')
      )
    );
  END IF;
END $$;

-- Seed minimal data (idempotent)
insert into public.states (name)
values ('Gujarat'), ('Maharashtra'), ('Rajasthan'), ('Madhya Pradesh')
on conflict (name) do nothing;

with s as (select id, name from public.states where name in ('Gujarat','Maharashtra','Rajasthan','Madhya Pradesh'))
insert into public.cities (state_id, name)
select s.id, c.name
from s
join (
  values
    ('Gujarat','Ahmedabad'),('Gujarat','Surat'),('Gujarat','Vadodara'),('Gujarat','Rajkot'),
    ('Maharashtra','Mumbai'),('Maharashtra','Pune'),('Maharashtra','Nagpur'),('Maharashtra','Nashik'),
    ('Rajasthan','Jaipur'),('Rajasthan','Jodhpur'),('Rajasthan','Udaipur'),('Rajasthan','Kota'),
    ('Madhya Pradesh','Bhopal'),('Madhya Pradesh','Indore'),('Madhya Pradesh','Jabalpur'),('Madhya Pradesh','Gwalior')
) as c(state_name, name)
  on c.state_name = s.name
on conflict (state_id, name) do nothing;
