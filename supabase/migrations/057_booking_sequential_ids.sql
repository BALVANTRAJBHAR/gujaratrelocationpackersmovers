-- Sequential booking IDs for Shifting and Home Service bookings.
-- Creates PostgreSQL SEQUENCEs and uses triggers to auto-assign on INSERT.

-- ============================================================
-- 1. Shifting Bookings (prefix: GRS)
-- ============================================================

-- Sequence starts at 1; it's a bigint so we never run out.
CREATE SEQUENCE IF NOT EXISTS public.shifting_booking_seq
  START WITH 1
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

-- Add booking_number column (nullable — existing rows get NULL, new rows get the trigger value)
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS booking_number bigint;

-- Backfill existing bookings with sequential numbers based on created_at order
-- (oldest booking gets 1, newest gets N)
DO $$
DECLARE
  next_val bigint;
  existing_count bigint;
BEGIN
  SELECT count(*) INTO existing_count FROM public.bookings WHERE booking_number IS NOT NULL;
  IF existing_count = 0 THEN
    SELECT coalesce(max(booking_number), 0) + 1 INTO next_val FROM public.bookings;
    UPDATE public.bookings
      SET booking_number = next_val + rn - 1
      FROM (
        SELECT id, row_number() OVER (ORDER BY created_at ASC) AS rn
        FROM public.bookings
        WHERE booking_number IS NULL
      ) sub
      WHERE public.bookings.id = sub.id;
    -- Advance the sequence past the highest assigned number
    PERFORM setval('public.shifting_booking_seq', coalesce((SELECT max(booking_number) FROM public.bookings), 0));
  END IF;
END $$;

-- Trigger function: auto-assign next sequential booking_number on INSERT
CREATE OR REPLACE FUNCTION public.assign_shifting_booking_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.booking_number IS NULL THEN
    NEW.booking_number := nextval('public.shifting_booking_seq');
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_bookings_assign_number
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_shifting_booking_number();

-- ============================================================
-- 2. Home Service Requests (prefix: GRH)
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS public.home_service_booking_seq
  START WITH 1
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

ALTER TABLE public.home_service_requests
  ADD COLUMN IF NOT EXISTS booking_number bigint;

-- Backfill existing requests
DO $$
DECLARE
  next_val bigint;
  existing_count bigint;
BEGIN
  SELECT count(*) INTO existing_count FROM public.home_service_requests WHERE booking_number IS NOT NULL;
  IF existing_count = 0 THEN
    SELECT coalesce(max(booking_number), 0) + 1 INTO next_val FROM public.home_service_requests;
    UPDATE public.home_service_requests
      SET booking_number = next_val + rn - 1
      FROM (
        SELECT id, row_number() OVER (ORDER BY created_at ASC) AS rn
        FROM public.home_service_requests
        WHERE booking_number IS NULL
      ) sub
      WHERE public.home_service_requests.id = sub.id;
    PERFORM setval('public.home_service_booking_seq', coalesce((SELECT max(booking_number) FROM public.home_service_requests), 0));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.assign_home_service_booking_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.booking_number IS NULL THEN
    NEW.booking_number := nextval('public.home_service_booking_seq');
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_home_service_requests_assign_number
  BEFORE INSERT ON public.home_service_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_home_service_booking_number();
