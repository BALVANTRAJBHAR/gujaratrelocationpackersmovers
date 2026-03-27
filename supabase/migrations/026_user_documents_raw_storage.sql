-- Storage bucket for user document images RAW (staging before validation/compression)
insert into storage.buckets (id, name, public)
values ('user-documents-raw', 'user-documents-raw', false)
on conflict (id) do nothing;

-- Admin/staff can upload/manage raw user document images
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Admin can upload user documents raw'
  ) THEN
    CREATE POLICY "Admin can upload user documents raw"
    ON storage.objects FOR INSERT
    WITH CHECK (
      bucket_id = 'user-documents-raw'
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
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Admin can update user documents raw'
  ) THEN
    CREATE POLICY "Admin can update user documents raw"
    ON storage.objects FOR UPDATE
    USING (
      bucket_id = 'user-documents-raw'
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
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Admin can delete user documents raw'
  ) THEN
    CREATE POLICY "Admin can delete user documents raw"
    ON storage.objects FOR DELETE
    USING (
      bucket_id = 'user-documents-raw'
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
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Admin can view user documents raw'
  ) THEN
    CREATE POLICY "Admin can view user documents raw"
    ON storage.objects FOR SELECT
    USING (
      bucket_id = 'user-documents-raw'
      AND EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role IN ('admin', 'staff')
      )
    );
  END IF;
END $$;
