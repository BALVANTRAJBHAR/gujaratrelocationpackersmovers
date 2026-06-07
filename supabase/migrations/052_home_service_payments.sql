alter table public.home_service_requests
  add column if not exists payment_option text check (payment_option in ('online_now', 'after_service')),
  add column if not exists payment_status text check (payment_status in ('pending', 'paid', 'cancelled_with_charge', 'cancelled_free')),
  add column if not exists advance_payment numeric default 0,
  add column if not exists razorpay_order_id text,
  add column if not exists razorpay_payment_id text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancel_reason text,
  add column if not exists after_service_payment_method text check (after_service_payment_method in ('online', 'cash')),
  add column if not exists cash_paid_at timestamptz,
  add column if not exists cash_paid_by_provider_id uuid references public.users(id) on delete set null;
