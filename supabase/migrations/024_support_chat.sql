-- Support chat (AI + guided)

create table if not exists public.support_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  status text default 'open',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists support_conversations_user_id_created_at_idx
  on public.support_conversations(user_id, created_at desc);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.support_conversations(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  sender text not null, -- user | ai | agent
  message text not null,
  meta jsonb,
  created_at timestamptz default now()
);

create index if not exists support_messages_conversation_id_created_at_idx
  on public.support_messages(conversation_id, created_at asc);

alter table public.support_conversations enable row level security;
alter table public.support_messages enable row level security;

-- Policies
-- Conversations
create policy "support_conversations_select_own" on public.support_conversations
  for select
  using (auth.uid() = user_id);

create policy "support_conversations_insert_own" on public.support_conversations
  for insert
  with check (auth.uid() = user_id);

create policy "support_conversations_update_own" on public.support_conversations
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Allow staff/admin to read/update all
create policy "support_conversations_staff_admin_select" on public.support_conversations
  for select
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and lower(coalesce(u.role, '')) in ('admin','staff')
    )
  );

create policy "support_conversations_staff_admin_update" on public.support_conversations
  for update
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and lower(coalesce(u.role, '')) in ('admin','staff')
    )
  )
  with check (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and lower(coalesce(u.role, '')) in ('admin','staff')
    )
  );

-- Messages
create policy "support_messages_select_own" on public.support_messages
  for select
  using (
    exists (
      select 1
      from public.support_conversations c
      where c.id = conversation_id
        and c.user_id = auth.uid()
    )
  );

create policy "support_messages_insert_own" on public.support_messages
  for insert
  with check (
    sender = 'user'
    and auth.uid() = user_id
    and exists (
      select 1
      from public.support_conversations c
      where c.id = conversation_id
        and c.user_id = auth.uid()
    )
  );

create policy "support_messages_staff_admin_select" on public.support_messages
  for select
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and lower(coalesce(u.role, '')) in ('admin','staff')
    )
  );

create policy "support_messages_staff_admin_insert" on public.support_messages
  for insert
  with check (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and lower(coalesce(u.role, '')) in ('admin','staff')
    )
  );
