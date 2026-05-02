-- Subscription payments, quota tracking, and search optimizations

-- 1) Payments: allow non-booking payments (subscriptions) and index razorpay IDs
alter table if exists public.payments
  drop constraint if exists payments_booking_id_fkey;

alter table if exists public.payments
  add constraint payments_booking_id_fkey
  foreign key (booking_id) references public.bookings(id) on delete set null;

create index if not exists idx_payments_razorpay_order_id on public.payments(razorpay_order_id);
create unique index if not exists uq_payments_razorpay_payment_id on public.payments(razorpay_payment_id);
create index if not exists idx_payments_user_id on public.payments(user_id);

-- 2) Subscription quotas + linkage to payment/order
alter table if exists public.user_subscriptions
  add column if not exists quota_total int,
  add column if not exists quota_used int not null default 0,
  add column if not exists razorpay_order_id text,
  add column if not exists razorpay_payment_id text,
  add column if not exists activation_source text,
  add column if not exists activated_at timestamptz;

create unique index if not exists uq_user_subscriptions_razorpay_order_id on public.user_subscriptions(razorpay_order_id);

-- Ensure one active subscription per user (soft)
create unique index if not exists uq_user_subscriptions_user_active
  on public.user_subscriptions(user_id)
  where status = 'active';

-- 3) Premium search usage: count 1 per base search token
create table if not exists public.user_premium_search_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  subscription_id uuid not null references public.user_subscriptions(id) on delete cascade,
  base_search_token text not null,
  created_at timestamptz not null default now(),
  unique (user_id, base_search_token)
);

create index if not exists idx_user_premium_search_usage_user_id on public.user_premium_search_usage(user_id);
create index if not exists idx_user_premium_search_usage_subscription_id on public.user_premium_search_usage(subscription_id);

alter table public.user_premium_search_usage enable row level security;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_premium_search_usage' AND policyname = 'Users can manage own premium search usage'
  ) THEN
    CREATE POLICY "Users can manage own premium search usage"
    ON public.user_premium_search_usage FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- Atomically consume premium quota for the active subscription.
-- Rule: same base_search_token counts only once.
create or replace function public.consume_premium_search(base_search_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_sub public.user_subscriptions%rowtype;
  v_inserted boolean := false;
  v_used int;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if base_search_token is null or length(trim(base_search_token)) = 0 then
    raise exception 'base_search_token required';
  end if;

  select * into v_sub
  from public.user_subscriptions
  where user_id = v_user_id
    and status = 'active'
    and (valid_until is null or valid_until > now())
  order by created_at desc
  limit 1
  for update;

  if v_sub.id is null then
    raise exception 'No active subscription';
  end if;

  v_used := coalesce(v_sub.quota_used, 0);
  if v_sub.quota_total is not null and v_used >= v_sub.quota_total then
    raise exception 'Quota exceeded';
  end if;

  begin
    insert into public.user_premium_search_usage(user_id, subscription_id, base_search_token)
    values (v_user_id, v_sub.id, base_search_token);
    v_inserted := true;
  exception when unique_violation then
    v_inserted := false;
  end;

  if v_inserted then
    update public.user_subscriptions
    set quota_used = coalesce(quota_used, 0) + 1,
        updated_at = now()
    where id = v_sub.id;
    v_used := v_used + 1;
  end if;

  return jsonb_build_object(
    'subscription_id', v_sub.id,
    'counted', v_inserted,
    'quota_used', v_used,
    'quota_total', v_sub.quota_total
  );
end;
$$;

revoke all on function public.consume_premium_search(text) from public;
grant execute on function public.consume_premium_search(text) to authenticated;

-- 4) properties: optimize heavy filters by caching has_photo
alter table if exists public.properties
  add column if not exists has_photo boolean not null default false;

create index if not exists idx_properties_has_photo on public.properties(has_photo);

-- Maintain has_photo on property_uploads changes
create or replace function public.fn_sync_property_has_photo() returns trigger as $$
begin
  if (tg_op = 'INSERT') then
    update public.properties
      set has_photo = true
      where id = new.property_id;
    return new;
  end if;

  if (tg_op = 'DELETE') then
    update public.properties p
      set has_photo = exists(
        select 1 from public.property_uploads u
        where u.property_id = old.property_id and u.file_type = 'photo'
      )
      where p.id = old.property_id;
    return old;
  end if;

  return null;
end;
$$ language plpgsql;

drop trigger if exists trg_property_uploads_sync_has_photo_ins on public.property_uploads;
drop trigger if exists trg_property_uploads_sync_has_photo_del on public.property_uploads;

create trigger trg_property_uploads_sync_has_photo_ins
after insert on public.property_uploads
for each row execute function public.fn_sync_property_has_photo();

create trigger trg_property_uploads_sync_has_photo_del
after delete on public.property_uploads
for each row execute function public.fn_sync_property_has_photo();

-- Backfill has_photo for existing rows
update public.properties p
set has_photo = exists (
  select 1 from public.property_uploads u
  where u.property_id = p.id and u.file_type = 'photo'
)
where true;

-- 5) Composite indexes for search
create index if not exists idx_properties_search_core
  on public.properties(status, listing_type, city, created_at desc, id);

create index if not exists idx_properties_search_category
  on public.properties(status, property_category, ad_type, city, created_at desc, id);

create index if not exists idx_properties_search_price
  on public.properties(status, city, price);

create index if not exists idx_properties_search_area
  on public.properties(status, city, area_sqft);

create index if not exists idx_properties_search_carpet
  on public.properties(status, city, carpet_area_sqft);

create index if not exists idx_properties_search_plot
  on public.properties(status, city, plot_area_sqft);
