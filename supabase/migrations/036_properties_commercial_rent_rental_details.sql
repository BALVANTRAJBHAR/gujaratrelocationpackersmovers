-- Commercial Rent: rental details fields

alter table public.properties
  add column if not exists rent_negotiable boolean,
  add column if not exists deposit_negotiable boolean,
  add column if not exists maintenance_extra boolean,
  add column if not exists lease_duration_years int,
  add column if not exists lockin_period_years int,
  add column if not exists ideal_for_tags text[];
