-- Storage bucket for booking uploads RAW (staging before validation/compression)
insert into storage.buckets (id, name, public)
values ('booking-uploads-raw', 'booking-uploads-raw', false)
on conflict (id) do nothing;

-- Storage policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Customers can upload own booking uploads raw'
  ) THEN
    CREATE POLICY "Customers can upload own booking uploads raw"
    ON storage.objects FOR INSERT
    WITH CHECK (
      bucket_id = 'booking-uploads-raw'
      AND EXISTS (
        SELECT 1
        FROM public.bookings b
        WHERE b.id::text = (storage.foldername(name))[2]
          AND b.user_id = auth.uid()
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Admin can upload booking uploads raw'
  ) THEN
    CREATE POLICY "Admin can upload booking uploads raw"
    ON storage.objects FOR INSERT
    WITH CHECK (
      bucket_id = 'booking-uploads-raw'
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
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Admin can update booking uploads raw'
  ) THEN
    CREATE POLICY "Admin can update booking uploads raw"
    ON storage.objects FOR UPDATE
    USING (
      bucket_id = 'booking-uploads-raw'
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
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Admin can delete booking uploads raw'
  ) THEN
    CREATE POLICY "Admin can delete booking uploads raw"
    ON storage.objects FOR DELETE
    USING (
      bucket_id = 'booking-uploads-raw'
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
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Customers can view own booking uploads raw'
  ) THEN
    CREATE POLICY "Customers can view own booking uploads raw"
    ON storage.objects FOR SELECT
    USING (
      bucket_id = 'booking-uploads-raw'
      AND EXISTS (
        SELECT 1
        FROM public.bookings b
        WHERE b.id::text = (storage.foldername(name))[2]
          AND b.user_id = auth.uid()
      )
    );
  END IF;
END $$;
