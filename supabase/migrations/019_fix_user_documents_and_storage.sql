alter table public.user_documents
  add column if not exists created_by uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_documents_created_by_fkey'
  ) then
    alter table public.user_documents
      add constraint user_documents_created_by_fkey
      foreign key (created_by)
      references public.users(id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_user_documents_user_id on public.user_documents(user_id);

alter table public.user_documents enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public' and tablename = 'user_documents' and policyname = 'Users can read own documents'
  ) then
    create policy "Users can read own documents"
    on public.user_documents for select
    using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public' and tablename = 'user_documents' and policyname = 'Admin can manage user documents'
  ) then
    create policy "Admin can manage user documents"
    on public.user_documents for all
    using (
      exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.role in ('admin', 'staff')
      )
    )
    with check (
      exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.role in ('admin', 'staff')
      )
    );
  end if;
end $$;

insert into storage.buckets (id, name, public)
values ('driver-docs', 'driver-docs', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'Admin can upload driver docs'
  ) then
    create policy "Admin can upload driver docs"
    on storage.objects for insert
    with check (
      bucket_id = 'driver-docs'
      and exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.role in ('admin', 'staff')
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'Admin can update driver docs'
  ) then
    create policy "Admin can update driver docs"
    on storage.objects for update
    using (
      bucket_id = 'driver-docs'
      and exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.role in ('admin', 'staff')
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'Anyone can view driver docs'
  ) then
    create policy "Anyone can view driver docs"
    on storage.objects for select
    using (bucket_id = 'driver-docs');
  end if;
end $$;

