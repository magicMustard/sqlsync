-- sqlsync: declarativeTable=true
-- Create tenants table
CREATE TABLE public.tenants (
    id UUID NOT NULL PRIMARY KEY DEFAULT functions.uuid_v7(),
    name TEXT DEFAULT NULL,
    phone TEXT DEFAULT NULL,
    email TEXT DEFAULT NULL,
	setup_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    description TEXT DEFAULT NULL,
	subscription_id TEXT DEFAULT NULL,
    active BOOLEAN DEFAULT TRUE NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);