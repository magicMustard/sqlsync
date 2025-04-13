-- SQLSync Migration: test_init
-- Generated At: 2025-04-12T02:02:46.290Z
-- Based on detected changes between states.

-- >>> ADDED FILES <<<

-- Added File: schema/schemas.sql
-- sqlsync: startStatement:5a9f9b700ad4ec30007ef7fd22f5a0aa712c784ebaab7f7fe4d213ea931678a7
-- Create schemas
CREATE SCHEMA IF NOT EXISTS functions;
-- sqlsync: endStatement:5a9f9b700ad4ec30007ef7fd22f5a0aa712c784ebaab7f7fe4d213ea931678a7

-- Added File: schema/extensions.sql
-- sqlsync: startStatement:bba1ea53de622dcb59b9fbf91037b596387a330ea2731bdbb8602ba9a102b84b
-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "pg_jsonschema" WITH SCHEMA "extensions";
-- sqlsync: endStatement:bba1ea53de622dcb59b9fbf91037b596387a330ea2731bdbb8602ba9a102b84b

-- Added File: schema/roles/roles.sql
-- sqlsync: startStatement:8eddee9d87b1cf8bdbf3ecf156fd2410b4d16e3d1296e132de8a72f8d3cc9c5d
-- Create roles
CREATE ROLE jackson;

GRANT jackson TO authenticated;
-- sqlsync: endStatement:8eddee9d87b1cf8bdbf3ecf156fd2410b4d16e3d1296e132de8a72f8d3cc9c5d

-- Added File: schema/functions/uuid_v7.sql
-- sqlsync: startStatement:7c14d3a8c193197e846bef78c2583516e1237ad21ac3e90b6cb7c6c06666d5a9
CREATE OR REPLACE FUNCTION functions.uuid_v7() RETURNS uuid AS $$
DECLARE
BEGIN
	RETURN functions.uuid_v7(clock_timestamp());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION functions.uuid_v7(p_timestamp timestamp with time zone) RETURNS uuid AS $$
DECLARE
	v_time double precision := null;

	v_unix_t bigint := null;
	v_rand_a bigint := null;
	v_rand_b bigint := null;

	v_unix_t_hex varchar := null;
	v_rand_a_hex varchar := null;
	v_rand_b_hex varchar := null;

	c_milli double precision := 10^3;  -- 1 000
	c_micro double precision := 10^6;  -- 1 000 000
	c_scale double precision := 4.1; -- 4.0 * (1024 / 1000)
	
	c_version bigint := x'0000000000007000'::bigint; -- RFC-9562 version: b'0111...'
	c_variant bigint := x'8000000000000000'::bigint; -- RFC-9562 variant: b'10xx...'
BEGIN
	v_time := extract(epoch FROM p_timestamp);

	v_unix_t := trunc(v_time * c_milli);
	v_rand_a := trunc((v_time * c_micro - v_unix_t * c_milli) * c_scale);
	v_rand_b := trunc(random() * 2^30)::bigint << 32 | trunc(random() * 2^32)::bigint;

	v_unix_t_hex := lpad(to_hex(v_unix_t), 12, '0');
	v_rand_a_hex := lpad(to_hex((v_rand_a | c_version)::bigint), 4, '0');
	v_rand_b_hex := lpad(to_hex((v_rand_b | c_variant)::bigint), 16, '0');

    -- Generate the random bytes
    -- Another test comment to trigger change detection

	RETURN (v_unix_t_hex || v_rand_a_hex || v_rand_b_hex)::uuid;
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Test modification for standard file diff;
-- sqlsync: endStatement:7c14d3a8c193197e846bef78c2583516e1237ad21ac3e90b6cb7c6c06666d5a9

-- Added File: schema/functions/update_updated_at_column.sql
-- sqlsync: startStatement:f43b798ba684996ee4e7a914194c195e572b056dfd42d492b32c2f7d460bf276
-- Create a trigger function to update the `updated_at` timestamp
-- Function: update_updated_at_column()
-- This function automatically updates the 'updated_at' column to the current timestamp
-- Whenever a row is updated in a table with this trigger
-- ensure this function is included in the migration
-- updated: 2025-04-12 11:43 AM
CREATE OR REPLACE FUNCTION functions.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now(); 
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Test comment update: 2025-04-12T11:55:00+10:00;
-- sqlsync: endStatement:f43b798ba684996ee4e7a914194c195e572b056dfd42d492b32c2f7d460bf276

-- Added File: schema/functions/new_test_function.sql
-- sqlsync: startStatement:455bc5f20691cf03369a112d701bb723a3fa18b40a84cfcdccfe0339e12d5256
-- Create a new test function
-- This will test adding a new file

CREATE OR REPLACE FUNCTION functions.new_test_function()
RETURNS TEXT AS $$
BEGIN
    RETURN 'This is a test function for SQLSync';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
-- sqlsync: endStatement:455bc5f20691cf03369a112d701bb723a3fa18b40a84cfcdccfe0339e12d5256

-- Added File: schema/tables/system_config/table.sql
-- sqlsync: startStatement:c051436735f0907f6013d188c12f74b0869dc390b542f27b612f454fd84c3bf4
-- sqlsync: declarativeTable:true
-- Table: system_config
CREATE TABLE public.system_config (
	"id" uuid NOT NULL DEFAULT uuid_generate_v4(),
	"key" text NOT NULL,
	"value" jsonb,
	"created_at" timestamp with time zone NOT NULL DEFAULT now(),
	"updated_at" timestamp with time zone NOT NULL DEFAULT now(),
	"description" text,
	"last_modified_by" text,
	PRIMARY KEY ("id"),
	UNIQUE ("key")
);
-- sqlsync: endStatement:c051436735f0907f6013d188c12f74b0869dc390b542f27b612f454fd84c3bf4

-- Added File: schema/tables/system_config/rls.sql
-- sqlsync: startStatement:a925737aa2b0863f8ac9c17c260fdc838df84389bbcb686915a8cb580ad44960
ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;
-- sqlsync: endStatement:a925737aa2b0863f8ac9c17c260fdc838df84389bbcb686915a8cb580ad44960

-- Added File: schema/tables/system_config/grants.sql
-- sqlsync: startStatement:96af15a0940e1689a924cb85b5658137e71944d377960818edb232e01c919775
REVOKE ALL ON public.system_config FROM PUBLIC, anon, authenticated, authenticator, jackson;

-- Grant for jackson
GRANT
    SELECT,
	DELETE
    ON public.system_config TO jackson;
-- sqlsync: endStatement:96af15a0940e1689a924cb85b5658137e71944d377960818edb232e01c919775

-- Added File: schema/tables/tenants/table.sql
-- NOTE: File is declarative. Using raw content.
-- sqlsync: startStatement:7c33d910250ce3d7e79211f8c062b776bd14d5e172871d611fd55a263fb5917b
-- sqlsync: declarativeTable=true
-- Create tenants table
CREATE TABLE public.tenants (
    id UUID NOT NULL PRIMARY KEY DEFAULT functions.uuid_v7(),
    phone TEXT DEFAULT NULL,
    email TEXT DEFAULT NULL,
    setup_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    description TEXT DEFAULT NULL,
    active BOOLEAN DEFAULT TRUE NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'active',
    last_login_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
);

-- Test comment added to trigger migration.

-- Test comment to trigger change detection;
-- sqlsync: endStatement:7c33d910250ce3d7e79211f8c062b776bd14d5e172871d611fd55a263fb5917b

-- Added File: schema/tables/tenants/rls.sql
-- sqlsync: startStatement:4e8f0a412cbe0d859aa67263e44caa79df18d93fe64e5d7bb4e60404a84dfc7e
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
-- sqlsync: endStatement:4e8f0a412cbe0d859aa67263e44caa79df18d93fe64e5d7bb4e60404a84dfc7e

-- Added File: schema/tables/tenants/grants.sql
-- sqlsync: startStatement:fc9bc4534e70422b4a6f591018cf9523c0780a9bc91a030eb161012084ad2673
-- Revoke default `PUBLIC` access
REVOKE ALL ON public.tenants FROM PUBLIC, anon, authenticated, authenticator, jackson;

-- Grant for jackson
GRANT
    SELECT,
    UPDATE,
    INSERT
    ON public.tenants TO jackson;
-- sqlsync: endStatement:fc9bc4534e70422b4a6f591018cf9523c0780a9bc91a030eb161012084ad2673

-- Added File: schema/tables/tenants/triggers.sql
-- sqlsync: startStatement:c44cb7c23fc6daf84d4d2d5921df092e61256dfcf0d68de15db410a7f9ea81dd
-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS set_updated_at ON public.tenants;
DROP TRIGGER IF EXISTS notify_api_when_tenant_is_updated ON public.tenants;

-- Create updated_at trigger
CREATE TRIGGER set_updated_at
	BEFORE UPDATE ON public.tenants
	FOR EACH ROW
	EXECUTE FUNCTION functions.update_updated_at_column();
-- sqlsync: endStatement:c44cb7c23fc6daf84d4d2d5921df092e61256dfcf0d68de15db410a7f9ea81dd

-- Added File: schema/tables/tenants/indexes.sql
-- sqlsync: startStatement:3e33d06174d1e92ae7d7a668a36070d37c7a421a49abe9c9ee39dad4c28e3516
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
-- sqlsync: endStatement:3e33d06174d1e92ae7d7a668a36070d37c7a421a49abe9c9ee39dad4c28e3516

-- Added File: schema/tables/profiles/types.sql
-- sqlsync: startStatement:efba5a0178c94cc39d05de47a59d464875bcc222090e62a46d4e1ac9335efb30
-- Create role_type enum
CREATE TYPE public.role_type AS ENUM ('jackson');
-- sqlsync: endStatement:efba5a0178c94cc39d05de47a59d464875bcc222090e62a46d4e1ac9335efb30

-- Added File: schema/tables/profiles/table.sql
-- sqlsync: startStatement:fa82731fa3d5ba0327548ca9b65c69a03afbb7c292f03cdd0217358e384cad2d
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
-- sqlsync: endStatement:fa82731fa3d5ba0327548ca9b65c69a03afbb7c292f03cdd0217358e384cad2d

-- Added File: schema/tables/profiles/rls.sql
-- sqlsync: startStatement:d0d86f22ca5d9cc0f9a4dc22cd600f4b60ebdcf7bf7dc7d49e266ce4f4cc7953
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
-- sqlsync: endStatement:d0d86f22ca5d9cc0f9a4dc22cd600f4b60ebdcf7bf7dc7d49e266ce4f4cc7953

-- Added File: schema/tables/profiles/grants.sql
-- sqlsync: startStatement:86c2c4133545000e5641178ab1d2f721041aa3c572b08985b901ee93589ec88b
-- Revoke default `PUBLIC` access
REVOKE ALL ON public.profiles FROM PUBLIC, anon, authenticated, authenticator, jackson;

-- Needed for authenticator to log user in.
GRANT REFERENCES ON public.profiles TO authenticator;

-- Grant for admin
GRANT
	SELECT,
	UPDATE(name, phone, email, operating_hours,available_on_chat_platform, active)
	ON public.profiles TO jackson;
-- sqlsync: endStatement:86c2c4133545000e5641178ab1d2f721041aa3c572b08985b901ee93589ec88b

-- Added File: schema/tables/profiles/indexes.sql
-- sqlsync: startStatement:0469103f4e2ec3ab9933b0c81d6fcc9a97202860294119b234eebb176ae18b22
DROP INDEX IF EXISTS profiles_phone_unique_idx;

CREATE INDEX profiles_phone_unique_idx ON public.profiles (phone) WHERE phone IS NOT NULL;
-- sqlsync: endStatement:0469103f4e2ec3ab9933b0c81d6fcc9a97202860294119b234eebb176ae18b22

-- Added File: schema/seeds/system_config.sql
-- sqlsync: startStatement:bc68413dbbe03f2ab81fadf448b15f44c528fc4fa4e215ce7670bb7e2064ce08
INSERT INTO public.system_config (
    key,
    value
) VALUES
	('VERSION','{ "value": "1.0.0" }') ON CONFLICT(key)
DO UPDATE SET value = EXCLUDED.value;
-- sqlsync: endStatement:bc68413dbbe03f2ab81fadf448b15f44c528fc4fa4e215ce7670bb7e2064ce08

-- >>> END ADDED FILES <<<
