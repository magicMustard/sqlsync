-- sqlsync: declarativeTable:true
-- Create profiles table
CREATE TABLE public.profiles (
	id UUID PRIMARY KEY DEFAULT functions.uuid_v7(),
	tenant_id UUID NULL REFERENCES public.tenants (id) ON UPDATE NO ACTION ON DELETE NO ACTION,
	role_type public.role_type NOT NULL,
	name TEXT NOT NULL,
	phone TEXT DEFAULT NULL,
	email TEXT NOT NULL UNIQUE,
	operating_hours JSONB DEFAULT NULL,
	active BOOLEAN NOT NULL DEFAULT TRUE,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);