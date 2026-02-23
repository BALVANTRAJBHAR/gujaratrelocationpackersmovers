-- RLS for floor_options

alter table public.floor_options enable row level security;

-- Anyone logged in can read active floor options
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'floor_options' AND policyname = 'Anyone can read active floor options'
  ) THEN
    CREATE POLICY "Anyone can read active floor options"
    ON public.floor_options FOR SELECT
    USING (is_active = true);
  END IF;
END $$;

-- Admin/staff can manage floor options
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'floor_options' AND policyname = 'Admin can manage floor options'
  ) THEN
    CREATE POLICY "Admin can manage floor options"
    ON public.floor_options FOR ALL
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
