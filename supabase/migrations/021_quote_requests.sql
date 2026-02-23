-- Quote requests (public / no-login)

create table if not exists public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  email text,
  service text,
  message text,
  source text,
  created_at timestamptz default now()
);

alter table public.quote_requests enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'quote_requests'
      and policyname = 'Anyone can create quote request'
  ) then
    create policy "Anyone can create quote request"
    on public.quote_requests for insert
    with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'quote_requests'
      and policyname = 'Admin can view quote requests'
  ) then
    create policy "Admin can view quote requests"
    on public.quote_requests for select
    using (
      exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.role in ('admin', 'staff')
      )
    );
  end if;
end $$;
