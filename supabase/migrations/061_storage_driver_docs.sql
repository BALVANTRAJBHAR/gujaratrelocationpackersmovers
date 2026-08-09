-- Storage bucket for driver docs
insert into storage.buckets (id, name, public)
values ('driver-docs', 'driver-docs', true)
on conflict (id) do nothing;

-- Allow drivers to upload/view their own docs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Drivers can upload own docs'
  ) THEN
    CREATE POLICY "Drivers can upload own docs"
    ON storage.objects FOR INSERT
    WITH CHECK (
      bucket_id = 'driver-docs'
      AND auth.uid()::text = (storage.foldername(name))[1]
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Drivers can view own docs'
  ) THEN
    CREATE POLICY "Drivers can view own docs"
    ON storage.objects FOR SELECT
    USING (
      bucket_id = 'driver-docs'
      AND auth.uid()::text = (storage.foldername(name))[1]
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Admin can view all driver docs'
  ) THEN
    CREATE POLICY "Admin can view all driver docs"
    ON storage.objects FOR SELECT
    USING (
      bucket_id = 'driver-docs'
      AND EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role IN ('admin', 'staff')
      )
    );
  END IF;
END $$;
