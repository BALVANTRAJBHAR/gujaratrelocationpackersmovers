-- Add reschedule tracking to home service requests

alter table public.home_service_requests
  add column if not exists reschedule_date timestamptz;
