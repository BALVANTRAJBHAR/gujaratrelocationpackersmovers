-- Storage buckets for home service uploads (RAW + processed)

insert into storage.buckets (id, name, public)
values ('home-service-uploads-raw', 'home-service-uploads-raw', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('home-service-uploads', 'home-service-uploads', true)
on conflict (id) do nothing;

-- RAW bucket policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Customers can upload own home service uploads raw'
  ) THEN
    CREATE POLICY "Customers can upload own home service uploads raw"
    ON storage.objects FOR INSERT
    WITH CHECK (
      bucket_id = 'home-service-uploads-raw'
      AND EXISTS (
        SELECT 1
        FROM public.home_service_requests r
        WHERE r.id::text = (storage.foldername(name))[2]
          AND r.user_id = auth.uid()
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Customers can view own home service uploads raw'
  ) THEN
    CREATE POLICY "Customers can view own home service uploads raw"
    ON storage.objects FOR SELECT
    USING (
      bucket_id = 'home-service-uploads-raw'
      AND EXISTS (
        SELECT 1
        FROM public.home_service_requests r
        WHERE r.id::text = (storage.foldername(name))[2]
          AND r.user_id = auth.uid()
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Admin can upload home service uploads raw'
  ) THEN
    CREATE POLICY "Admin can upload home service uploads raw"
    ON storage.objects FOR INSERT
    WITH CHECK (
      bucket_id = 'home-service-uploads-raw'
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
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Admin can update home service uploads raw'
  ) THEN
    CREATE POLICY "Admin can update home service uploads raw"
    ON storage.objects FOR UPDATE
    USING (
      bucket_id = 'home-service-uploads-raw'
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
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Admin can delete home service uploads raw'
  ) THEN
    CREATE POLICY "Admin can delete home service uploads raw"
    ON storage.objects FOR DELETE
    USING (
      bucket_id = 'home-service-uploads-raw'
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
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Customers can upload own home service uploads'
  ) THEN
    CREATE POLICY "Customers can upload own home service uploads"
    ON storage.objects FOR INSERT
    WITH CHECK (
      bucket_id = 'home-service-uploads'
      AND EXISTS (
        SELECT 1
        FROM public.home_service_requests r
        WHERE r.id::text = (storage.foldername(name))[2]
          AND r.user_id = auth.uid()
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Anyone can view home service uploads'
  ) THEN
    CREATE POLICY "Anyone can view home service uploads"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'home-service-uploads');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Admin can update home service uploads'
  ) THEN
    CREATE POLICY "Admin can update home service uploads"
    ON storage.objects FOR UPDATE
    USING (
      bucket_id = 'home-service-uploads'
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
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Admin can delete home service uploads'
  ) THEN
    CREATE POLICY "Admin can delete home service uploads"
    ON storage.objects FOR DELETE
    USING (
      bucket_id = 'home-service-uploads'
      AND EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role IN ('admin', 'staff')
      )
    );
  END IF;
END $$;
