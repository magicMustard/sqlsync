DROP INDEX IF EXISTS tenants_unique_name;
DROP INDEX IF EXISTS tenants_unique_email;
DROP INDEX IF EXISTS tenants_unique_phone;

-- Create unique index for name, phone and email where not null
CREATE UNIQUE INDEX tenants_unique_name
	ON public.tenants (name)
	WHERE name IS NOT NULL;

CREATE UNIQUE INDEX tenants_unique_email
	ON public.tenants (email)
	WHERE email IS NOT NULL;

CREATE UNIQUE INDEX tenants_unique_phone
	ON public.tenants (phone)
	WHERE phone IS NOT NULL;