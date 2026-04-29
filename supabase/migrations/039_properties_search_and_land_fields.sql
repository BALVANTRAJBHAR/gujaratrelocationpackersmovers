-- Properties: search filters + land/plot fields

alter table public.properties
  add column if not exists property_category text,
  add column if not exists ad_type text,
  add column if not exists facing text,
  add column if not exists plot_area_sqft numeric,
  add column if not exists plot_length_ft numeric,
  add column if not exists plot_width_ft numeric,
  add column if not exists boundary_wall smallint,
  add column if not exists floors_allowed int,
  add column if not exists corner_plot smallint,
  add column if not exists inside_gated_project smallint,
  add column if not exists gated_project_name text,
  add column if not exists land_water_supply text,
  add column if not exists land_electricity_connection text,
  add column if not exists land_sewage_connection text,
  add column if not exists facing_road_width_ft numeric,
  add column if not exists land_sale_deed_certificate text,
  add column if not exists land_encumbrance_certificate text,
  add column if not exists land_conversion_certificate text,
  add column if not exists land_rera_approved text,
  add column if not exists land_khata_certificate text,
  add column if not exists property_status text,
  add column if not exists new_builder_project boolean,
  add column if not exists pg_tenant_type text,
  add column if not exists pg_room_type text,
  add column if not exists flatmates_tenant_type text,
  add column if not exists flatmates_room_type text,
  add column if not exists commercial_availability text;

create index if not exists idx_properties_property_category on public.properties(property_category);
create index if not exists idx_properties_ad_type on public.properties(ad_type);
create index if not exists idx_properties_property_status on public.properties(property_status);
create index if not exists idx_properties_new_builder_project on public.properties(new_builder_project);
create index if not exists idx_properties_facing on public.properties(facing);
create index if not exists idx_properties_plot_area_sqft on public.properties(plot_area_sqft);
create index if not exists idx_properties_commercial_availability on public.properties(commercial_availability);
