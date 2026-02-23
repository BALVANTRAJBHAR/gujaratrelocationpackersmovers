-- Drop legacy JSON location columns (we use pickup_lat/lng and drop_lat/lng)

alter table public.bookings
  drop column if exists pickup_location,
  drop column if exists drop_location;
