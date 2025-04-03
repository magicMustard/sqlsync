INSERT INTO public.system_config (
    key,
    value
) VALUES
	('VERSION','{ "value": "1.0.0" }') ON CONFLICT(key)
DO UPDATE SET value = EXCLUDED.value;