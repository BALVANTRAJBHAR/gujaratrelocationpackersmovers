-- Allow admin/staff to manage properties

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'properties' AND policyname = 'Admin can manage properties'
  ) THEN
    CREATE POLICY "Admin can manage properties"
    ON public.properties FOR ALL
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
