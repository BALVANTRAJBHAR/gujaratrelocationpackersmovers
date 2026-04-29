-- Properties: carpet area

alter table public.properties
  add column if not exists carpet_area_sqft numeric;
