-- Extend floor options to 100 floors

-- Insert floors 1-100 if they don't exist
INSERT INTO public.floor_options (label, sort_order, is_active)
SELECT 'Floor ' || seq::text, seq, true
FROM generate_series(1, 100) AS seq
WHERE NOT EXISTS (SELECT 1 FROM public.floor_options WHERE label = 'Floor ' || seq::text);

-- Update sort order for Ground Floor
UPDATE public.floor_options SET sort_order = 0 WHERE label = 'Ground Floor';
