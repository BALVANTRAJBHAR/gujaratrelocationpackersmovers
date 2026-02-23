create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text,
  discount_type text,
  discount_value numeric(12,2),
  max_discount numeric(12,2),
  min_order_amount numeric(12,2) default 0,
  is_active boolean not null default true,
  valid_from date,
  valid_until date,
  usage_limit int,
  used_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_coupons_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_set_coupons_updated_at on public.coupons;
create trigger trg_set_coupons_updated_at
before update on public.coupons
for each row
execute function public.set_coupons_updated_at();

alter table public.coupons enable row level security;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'coupons' AND policyname = 'Anyone can read active coupons'
  ) THEN
    CREATE POLICY "Anyone can read active coupons"
    ON public.coupons FOR SELECT
    USING (is_active = true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'coupons' AND policyname = 'Admin can manage coupons'
  ) THEN
    CREATE POLICY "Admin can manage coupons"
    ON public.coupons FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role IN ('admin', 'staff')
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role IN ('admin', 'staff')
      )
    );
  END IF;
END $$;
