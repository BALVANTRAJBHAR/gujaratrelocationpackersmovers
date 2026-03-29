-- Home Services: requests + uploads

-- Requests table
create table if not exists public.home_service_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  service_key text not null,
  customer_name text,
  customer_phone text,
  address_line1 text,
  address_line2 text,
  state text,
  city text,
  locality text,
  notes text,
  preferred_date date,
  preferred_time text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_home_service_requests_user_id on public.home_service_requests(user_id);
create index if not exists idx_home_service_requests_status on public.home_service_requests(status);
create index if not exists idx_home_service_requests_service_key on public.home_service_requests(service_key);

-- Uploads table (validated media)
create table if not exists public.home_service_uploads (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.home_service_requests(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  file_url text not null,
  file_type text not null,
  file_name text,
  file_size bigint,
  created_at timestamptz not null default now(),
  uploaded_at timestamptz
);

create index if not exists idx_home_service_uploads_request_id on public.home_service_uploads(request_id);

-- RLS
alter table public.home_service_requests enable row level security;
alter table public.home_service_uploads enable row level security;

-- Policies: customers manage own requests
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'home_service_requests' AND policyname = 'Customers can insert own home service requests'
  ) THEN
    CREATE POLICY "Customers can insert own home service requests"
    ON public.home_service_requests FOR INSERT
    WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'home_service_requests' AND policyname = 'Customers can read own home service requests'
  ) THEN
    CREATE POLICY "Customers can read own home service requests"
    ON public.home_service_requests FOR SELECT
    USING (user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'home_service_requests' AND policyname = 'Customers can update own home service requests'
  ) THEN
    CREATE POLICY "Customers can update own home service requests"
    ON public.home_service_requests FOR UPDATE
    USING (user_id = auth.uid());
  END IF;
END $$;

-- Admin/staff can read all requests
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'home_service_requests' AND policyname = 'Admin can read all home service requests'
  ) THEN
    CREATE POLICY "Admin can read all home service requests"
    ON public.home_service_requests FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role IN ('admin', 'staff')
      )
    );
  END IF;
END $$;

-- Uploads policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'home_service_uploads' AND policyname = 'Customers can insert own home service uploads'
  ) THEN
    CREATE POLICY "Customers can insert own home service uploads"
    ON public.home_service_uploads FOR INSERT
    WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'home_service_uploads' AND policyname = 'Customers can read own home service uploads'
  ) THEN
    CREATE POLICY "Customers can read own home service uploads"
    ON public.home_service_uploads FOR SELECT
    USING (user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'home_service_uploads' AND policyname = 'Admin can read all home service uploads'
  ) THEN
    CREATE POLICY "Admin can read all home service uploads"
    ON public.home_service_uploads FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role IN ('admin', 'staff')
      )
    );
  END IF;
END $$;
