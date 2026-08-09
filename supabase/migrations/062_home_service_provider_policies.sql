-- RLS: providers can view requests matching their service area and update their own assigned requests

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'home_service_requests' and policyname = 'Providers can view matching service requests'
  ) then
    create policy "Providers can view matching service requests"
      on public.home_service_requests
      for select
      using (
        exists (
          select 1
          from public.home_service_providers p
          where p.user_id = auth.uid()
            and p.is_active = true
            and p.service_key = public.home_service_requests.service_key
            and p.state = public.home_service_requests.state
            and p.city = public.home_service_requests.city
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'home_service_requests' and policyname = 'Providers can update own assigned requests'
  ) then
    create policy "Providers can update own assigned requests"
      on public.home_service_requests
      for update
      using (provider_id = auth.uid());
  end if;
end $$;