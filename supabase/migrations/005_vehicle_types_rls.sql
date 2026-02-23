-- RLS for vehicle_types (admin-managed, readable by customers)

alter table public.vehicle_types enable row level security;

-- Anyone logged in can read active vehicle types
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'vehicle_types' AND policyname = 'Anyone can read active vehicle types'
  ) THEN
    CREATE POLICY "Anyone can read active vehicle types"
    ON public.vehicle_types FOR SELECT
    USING (is_active = true);
  END IF;
END $$;

-- Admin/staff can manage vehicle types
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'vehicle_types' AND policyname = 'Admin can manage vehicle types'
  ) THEN
    CREATE POLICY "Admin can manage vehicle types"
    ON public.vehicle_types FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role IN ('admin', 'staff')
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role IN ('admin', 'staff')
      )
    );
  END IF;
END $$;
