-- Add expo push token storage for mobile push notifications

alter table public.users
  add column if not exists expo_push_token text;

