-- Feedback visibility: admin/staff only for others; sender keeps read of own submitted feedback (popup dedup)

drop policy if exists "Users can read feedback about themselves" on public.feedback;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'feedback' and policyname = 'Users can read own feedback'
  ) then
    create policy "Users can read own feedback" on public.feedback
      for select using (auth.uid() = from_user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'feedback' and policyname = 'Admin or staff can read all feedback'
  ) then
    create policy "Admin or staff can read all feedback" on public.feedback
      for select using (
        exists (
          select 1 from public.users
          where id = auth.uid() and role in ('admin', 'staff')
        )
      );
  end if;
end $$;