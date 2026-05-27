alter table public.quote_requests
  add column if not exists status text not null default 'pending',
  add column if not exists remark text,
  add column if not exists updated_at timestamptz not null default now();

dO $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'quote_requests'
      and policyname = 'Admin can update quote requests'
  ) then
    create policy "Admin can update quote requests"
    on public.quote_requests for update
    using (
      exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.role in ('admin', 'staff')
      )
    );
  end if;
end $$;
