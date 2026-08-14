-- Remaining payment settlement after delivery
-- Tracks when/how/by whom the remaining amount was collected

alter table public.bookings
  add column if not exists remaining_paid_at timestamptz,
  add column if not exists remaining_paid_method text check (remaining_paid_method in ('online', 'cash')),
  add column if not exists remaining_paid_by uuid references public.users(id) on delete set null;

create index if not exists bookings_remaining_paid_idx on public.bookings(remaining_paid_at) where remaining_paid_at is not null;