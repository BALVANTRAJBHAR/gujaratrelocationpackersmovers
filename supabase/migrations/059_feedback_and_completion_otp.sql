-- Home service completion OTP + cross-party feedback

alter table public.home_service_requests
  add column if not exists complete_otp text,
  add column if not exists complete_otp_verified_at timestamptz;

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete cascade,
  home_service_request_id uuid references public.home_service_requests(id) on delete cascade,
  from_user_id uuid not null references public.users(id) on delete cascade,
  to_user_id uuid not null references public.users(id) on delete cascade,
  rating smallint check (rating between 1 and 5),
  tags text[] not null default '{}',
  comment text,
  skipped boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_feedback_from on public.feedback(from_user_id);
create index if not exists idx_feedback_to on public.feedback(to_user_id);
create unique index if not exists uq_feedback_booking on public.feedback(from_user_id, booking_id) where booking_id is not null;
create unique index if not exists uq_feedback_hs on public.feedback(from_user_id, home_service_request_id) where home_service_request_id is not null;

alter table public.feedback enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'feedback' and policyname = 'Users can insert own feedback'
  ) then
    create policy "Users can insert own feedback"
      on public.feedback
      for insert
      with check (from_user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'feedback' and policyname = 'Users can read feedback about themselves'
  ) then
    create policy "Users can read feedback about themselves"
      on public.feedback
      for select
      using (from_user_id = auth.uid() or to_user_id = auth.uid());
  end if;
end $$;