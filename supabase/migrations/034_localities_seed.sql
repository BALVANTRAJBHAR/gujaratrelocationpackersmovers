-- Seed some localities for existing cities

DO $$
DECLARE
  ahmedabad uuid;
  surat uuid;
  vadodara uuid;
  rajkot uuid;
BEGIN
  SELECT id INTO ahmedabad FROM public.cities WHERE lower(name) = 'ahmedabad' LIMIT 1;
  SELECT id INTO surat FROM public.cities WHERE lower(name) = 'surat' LIMIT 1;
  SELECT id INTO vadodara FROM public.cities WHERE lower(name) = 'vadodara' LIMIT 1;
  SELECT id INTO rajkot FROM public.cities WHERE lower(name) = 'rajkot' LIMIT 1;

  IF ahmedabad IS NOT NULL THEN
    INSERT INTO public.localities (city_id, name)
    VALUES
      (ahmedabad, 'Navrangpura'),
      (ahmedabad, 'Bopal'),
      (ahmedabad, 'Maninagar'),
      (ahmedabad, 'Satellite'),
      (ahmedabad, 'Naranpura')
    ON CONFLICT (city_id, name) DO NOTHING;
  END IF;

  IF surat IS NOT NULL THEN
    INSERT INTO public.localities (city_id, name)
    VALUES
      (surat, 'Adajan'),
      (surat, 'Vesu'),
      (surat, 'Katargam'),
      (surat, 'Varachha'),
      (surat, 'Udhna')
    ON CONFLICT (city_id, name) DO NOTHING;
  END IF;

  IF vadodara IS NOT NULL THEN
    INSERT INTO public.localities (city_id, name)
    VALUES
      (vadodara, 'Alkapuri'),
      (vadodara, 'Manjalpur'),
      (vadodara, 'Gotri'),
      (vadodara, 'Karelibaug'),
      (vadodara, 'Akota')
    ON CONFLICT (city_id, name) DO NOTHING;
  END IF;

  IF rajkot IS NOT NULL THEN
    INSERT INTO public.localities (city_id, name)
    VALUES
      (rajkot, 'Kalavad Road'),
      (rajkot, 'Gondal Road'),
      (rajkot, 'University Road'),
      (rajkot, '150 Feet Ring Road'),
      (rajkot, 'Raiya Road')
    ON CONFLICT (city_id, name) DO NOTHING;
  END IF;
END $$;
