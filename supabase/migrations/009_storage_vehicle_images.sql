-- Storage bucket for vehicle images
insert into storage.buckets (id, name, public)
values ('vehicle-images', 'vehicle-images', true)
on conflict (id) do nothing;

-- Allow admin/staff to upload/manage vehicle images
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Admin can upload vehicle images'
  ) THEN
    CREATE POLICY "Admin can upload vehicle images"
    ON storage.objects FOR INSERT
    WITH CHECK (
      bucket_id = 'vehicle-images'
      AND EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role IN ('admin', 'staff')
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Admin can update vehicle images'
  ) THEN
    CREATE POLICY "Admin can update vehicle images"
    ON storage.objects FOR UPDATE
    USING (
      bucket_id = 'vehicle-images'
      AND EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role IN ('admin', 'staff')
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Admin can delete vehicle images'
  ) THEN
    CREATE POLICY "Admin can delete vehicle images"
    ON storage.objects FOR DELETE
    USING (
      bucket_id = 'vehicle-images'
      AND EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role IN ('admin', 'staff')
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Anyone can view vehicle images'
  ) THEN
    CREATE POLICY "Anyone can view vehicle images"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'vehicle-images');
  END IF;
END $$;
