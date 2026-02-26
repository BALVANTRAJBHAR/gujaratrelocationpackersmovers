-- Storage bucket for booking uploads (photos/videos)
insert into storage.buckets (id, name, public)
values ('booking-uploads', 'booking-uploads', true)
on conflict (id) do nothing;

-- Storage policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Customers can upload own booking uploads'
  ) THEN
    CREATE POLICY "Customers can upload own booking uploads"
    ON storage.objects FOR INSERT
    WITH CHECK (
      bucket_id = 'booking-uploads'
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
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Admin can upload booking uploads'
  ) THEN
    CREATE POLICY "Admin can upload booking uploads"
    ON storage.objects FOR INSERT
    WITH CHECK (
      bucket_id = 'booking-uploads'
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
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Admin can update booking uploads'
  ) THEN
    CREATE POLICY "Admin can update booking uploads"
    ON storage.objects FOR UPDATE
    USING (
      bucket_id = 'booking-uploads'
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
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Admin can delete booking uploads'
  ) THEN
    CREATE POLICY "Admin can delete booking uploads"
    ON storage.objects FOR DELETE
    USING (
      bucket_id = 'booking-uploads'
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
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Anyone can view booking uploads'
  ) THEN
    CREATE POLICY "Anyone can view booking uploads"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'booking-uploads');
  END IF;
END $$;

-- booking_uploads table RLS policies (links to storage objects)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'booking_uploads' AND policyname = 'Customers can insert own booking uploads'
  ) THEN
    CREATE POLICY "Customers can insert own booking uploads"
    ON public.booking_uploads FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1
        FROM public.bookings b
        WHERE b.id = booking_id
          AND b.user_id = auth.uid()
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'booking_uploads' AND policyname = 'Customers can read own booking uploads'
  ) THEN
    CREATE POLICY "Customers can read own booking uploads"
    ON public.booking_uploads FOR SELECT
    USING (
      EXISTS (
        SELECT 1
        FROM public.bookings b
        WHERE b.id = booking_id
          AND b.user_id = auth.uid()
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'booking_uploads' AND policyname = 'Admin can read all booking uploads'
  ) THEN
    CREATE POLICY "Admin can read all booking uploads"
    ON public.booking_uploads FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role IN ('admin', 'staff')
      )
    );
  END IF;
END $$;
