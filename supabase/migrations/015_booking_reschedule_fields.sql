-- Add reschedule fields for bookings

alter table public.bookings
  add column if not exists reschedule_date timestamptz;
