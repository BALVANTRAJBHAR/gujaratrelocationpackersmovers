-- Storage buckets for property uploads (RAW + processed)

insert into storage.buckets (id, name, public)
values ('property-uploads-raw', 'property-uploads-raw', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('property-uploads', 'property-uploads', true)
on conflict (id) do nothing;

-- RAW bucket policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Owners can upload own property uploads raw'
  ) THEN
    CREATE POLICY "Owners can upload own property uploads raw"
    ON storage.objects FOR INSERT
    WITH CHECK (
      bucket_id = 'property-uploads-raw'
      AND EXISTS (
        SELECT 1
        FROM public.properties p
        WHERE p.id::text = (storage.foldername(name))[2]
          AND p.owner_user_id = auth.uid()
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Owners can view own property uploads raw'
  ) THEN
    CREATE POLICY "Owners can view own property uploads raw"
    ON storage.objects FOR SELECT
    USING (
      bucket_id = 'property-uploads-raw'
      AND EXISTS (
        SELECT 1
        FROM public.properties p
        WHERE p.id::text = (storage.foldername(name))[2]
          AND p.owner_user_id = auth.uid()
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Admin can upload property uploads raw'
  ) THEN
    CREATE POLICY "Admin can upload property uploads raw"
    ON storage.objects FOR INSERT
    WITH CHECK (
      bucket_id = 'property-uploads-raw'
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
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Admin can update property uploads raw'
  ) THEN
    CREATE POLICY "Admin can update property uploads raw"
    ON storage.objects FOR UPDATE
    USING (
      bucket_id = 'property-uploads-raw'
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
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Admin can delete property uploads raw'
  ) THEN
    CREATE POLICY "Admin can delete property uploads raw"
    ON storage.objects FOR DELETE
    USING (
      bucket_id = 'property-uploads-raw'
      AND EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role IN ('admin', 'staff')
      )
    );
  END IF;
END $$;

-- FINAL bucket policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Owners can upload own property uploads'
  ) THEN
    CREATE POLICY "Owners can upload own property uploads"
    ON storage.objects FOR INSERT
    WITH CHECK (
      bucket_id = 'property-uploads'
      AND EXISTS (
        SELECT 1
        FROM public.properties p
        WHERE p.id::text = (storage.foldername(name))[2]
          AND p.owner_user_id = auth.uid()
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Anyone can view property uploads'
  ) THEN
    CREATE POLICY "Anyone can view property uploads"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'property-uploads');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Admin can update property uploads'
  ) THEN
    CREATE POLICY "Admin can update property uploads"
    ON storage.objects FOR UPDATE
    USING (
      bucket_id = 'property-uploads'
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
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Admin can delete property uploads'
  ) THEN
    CREATE POLICY "Admin can delete property uploads"
    ON storage.objects FOR DELETE
    USING (
      bucket_id = 'property-uploads'
      AND EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role IN ('admin', 'staff')
      )
    );
  END IF;
END $$;
