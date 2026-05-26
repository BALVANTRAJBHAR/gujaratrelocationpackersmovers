-- Ensure home_service_providers has state and city columns

alter table public.home_service_providers
  add column if not exists state text;

alter table public.home_service_providers
  add column if not exists city text;

-- Fill existing null rows with a placeholder before making not null
update public.home_service_providers
  set state = 'Unknown'
  where state is null;

update public.home_service_providers
  set city = 'Unknown'
  where city is null;

-- Now safe to set not null
alter table public.home_service_providers
  alter column state set not null;

alter table public.home_service_providers
  alter column city set not null;

-- Recreate the unique constraint to include state & city
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.home_service_providers'::regclass
    and conname = 'home_service_providers_user_id_service_key_state_city_key'
  ) then
    alter table public.home_service_providers
      add constraint home_service_providers_user_id_service_key_state_city_key
      unique (user_id, service_key, state, city);
  end if;
end $$;
