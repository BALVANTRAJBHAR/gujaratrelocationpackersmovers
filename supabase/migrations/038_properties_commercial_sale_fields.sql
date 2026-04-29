-- Properties: commercial sale / commercial common fields

alter table public.properties
  add column if not exists ownership_type text,
  add column if not exists commercial_power_backup_type text,
  add column if not exists commercial_lift_type text,
  add column if not exists commercial_parking_type text,
  add column if not exists commercial_parking_slots int,
  add column if not exists commercial_washroom_type text,
  add column if not exists commercial_water_storage_facility smallint,
  add column if not exists commercial_security smallint,
  add column if not exists commercial_business_running text,
  add column if not exists commercial_previous_occupancy text,
  add column if not exists commercial_want_painted smallint,
  add column if not exists commercial_want_cleaned smallint;
