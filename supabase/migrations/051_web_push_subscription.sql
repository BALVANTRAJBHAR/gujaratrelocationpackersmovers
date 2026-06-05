alter table public.users
  add column if not exists web_push_subscription jsonb;

create index if not exists users_web_push_subscription_idx
  on public.users(web_push_subscription)
  where web_push_subscription is not null;
