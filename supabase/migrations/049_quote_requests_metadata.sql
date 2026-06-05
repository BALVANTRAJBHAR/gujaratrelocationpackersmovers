-- Add metadata columns for quote requests

alter table public.quote_requests
  add column if not exists request_ip text,
  add column if not exists request_device text,
  add column if not exists request_browser text,
  add column if not exists request_os text,
  add column if not exists request_language text,
  add column if not exists request_timezone text;
