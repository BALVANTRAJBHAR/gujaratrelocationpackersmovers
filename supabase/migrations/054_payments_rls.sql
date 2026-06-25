-- payments table has RLS enabled but ZERO policies
-- This migration adds the missing policies

create policy "Users can view own payments" on public.payments
  for select using (auth.uid() = user_id);

create policy "Drivers can view payments for their bookings" on public.payments
  for select using (
    exists (
      select 1 from public.bookings
      where bookings.id = payments.booking_id
      and bookings.driver_id = auth.uid()
    )
  );

create policy "Admins and staff can view all payments" on public.payments
  for select using (
    exists (
      select 1 from public.users
      where users.id = auth.uid()
      and users.role in ('admin', 'staff')
    )
  );

create policy "Users can insert own payments" on public.payments
  for insert with check (auth.uid() = user_id);

create policy "Admins and staff can insert payments" on public.payments
  for insert with check (
    exists (
      select 1 from public.users
      where users.id = auth.uid()
      and users.role in ('admin', 'staff')
    )
  );

create policy "Admins and staff can update payments" on public.payments
  for update using (
    exists (
      select 1 from public.users
      where users.id = auth.uid()
      and users.role in ('admin', 'staff')
    )
  );
