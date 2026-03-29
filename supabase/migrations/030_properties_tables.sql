-- Properties: listings + uploads

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  listing_type text not null default 'rent',
  property_type text,
  title text,
  description text,
  price numeric,
  deposit numeric,
  maintenance numeric,
  available_from date,
  bedrooms int,
  bathrooms int,
  area_sqft int,
  furnishing text,
  parking text,
  address_line1 text,
  address_line2 text,
  state text,
  city text,
  locality text,
  pincode text,
  latitude double precision,
  longitude double precision,
  contact_name text,
  contact_phone text,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_properties_owner_user_id on public.properties(owner_user_id);
create index if not exists idx_properties_status on public.properties(status);
create index if not exists idx_properties_city on public.properties(city);
create index if not exists idx_properties_locality on public.properties(locality);
create index if not exists idx_properties_listing_type on public.properties(listing_type);

create table if not exists public.property_uploads (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  owner_user_id uuid not null references public.users(id) on delete cascade,
  file_url text not null,
  file_type text not null,
  file_name text,
  file_size bigint,
  created_at timestamptz not null default now(),
  uploaded_at timestamptz
);

create index if not exists idx_property_uploads_property_id on public.property_uploads(property_id);

alter table public.properties enable row level security;
alter table public.property_uploads enable row level security;

-- Properties policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'properties' AND policyname = 'Owners can insert own properties'
  ) THEN
    CREATE POLICY "Owners can insert own properties"
    ON public.properties FOR INSERT
    WITH CHECK (owner_user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'properties' AND policyname = 'Owners can update own properties'
  ) THEN
    CREATE POLICY "Owners can update own properties"
    ON public.properties FOR UPDATE
    USING (owner_user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'properties' AND policyname = 'Owners can read own properties'
  ) THEN
    CREATE POLICY "Owners can read own properties"
    ON public.properties FOR SELECT
    USING (owner_user_id = auth.uid());
  END IF;
END $$;

-- Public can read published properties
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'properties' AND policyname = 'Anyone can read published properties'
  ) THEN
    CREATE POLICY "Anyone can read published properties"
    ON public.properties FOR SELECT
    USING (status = 'published');
  END IF;
END $$;

-- Admin/staff can read all properties
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'properties' AND policyname = 'Admin can read all properties'
  ) THEN
    CREATE POLICY "Admin can read all properties"
    ON public.properties FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role IN ('admin', 'staff')
      )
    );
  END IF;
END $$;

-- property_uploads policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'property_uploads' AND policyname = 'Owners can insert own property uploads'
  ) THEN
    CREATE POLICY "Owners can insert own property uploads"
    ON public.property_uploads FOR INSERT
    WITH CHECK (owner_user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'property_uploads' AND policyname = 'Owners can read own property uploads'
  ) THEN
    CREATE POLICY "Owners can read own property uploads"
    ON public.property_uploads FOR SELECT
    USING (owner_user_id = auth.uid());
  END IF;
END $$;

-- Anyone can read uploads for published properties
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'property_uploads' AND policyname = 'Anyone can read uploads for published properties'
  ) THEN
    CREATE POLICY "Anyone can read uploads for published properties"
    ON public.property_uploads FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.properties p
        WHERE p.id = property_id AND p.status = 'published'
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'property_uploads' AND policyname = 'Admin can read all property uploads'
  ) THEN
    CREATE POLICY "Admin can read all property uploads"
    ON public.property_uploads FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role IN ('admin', 'staff')
      )
    );
  END IF;
END $$;
