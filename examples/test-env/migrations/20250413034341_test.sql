-- SQLSync Migration: test
-- Generated At: 2025-04-13T03:43:41.395Z
-- Based on detected changes between states.


-- >>> MODIFIED FILES <<<

-- Modified File: schema/tables/tenants/table.sql
-- NOTE: File is declarative. Generated ALTER TABLE statements for incremental changes:

-- MODIFIED COLUMNS:
-- sqlsync: startStatement:9fe75e1ed38034a69160a3151806edd0cf3380cdab3007b9a6f8173d8dd75aa0
ALTER TABLE public.tenants ALTER COLUMN updated_at DROP NOT NULL;
ALTER TABLE public.tenants ALTER COLUMN updated_at SET DEFAULT NULL;
-- sqlsync: endStatement:9fe75e1ed38034a69160a3151806edd0cf3380cdab3007b9a6f8173d8dd75aa0

-- Modified File: schema/tables/tenants/triggers.sql

-- >>> Content for modified non-declarative file: schema/tables/tenants/triggers.sql <<<
-- sqlsync: splitStatements: true
-- Drop existing triggers if they exist
-- sqlsync: startStatement
-- Test comment
DROP TRIGGER IF EXISTS set_updated_at ON public.tenants;
DROP TRIGGER IF EXISTS notify_api_when_tenant_is_updated ON public.tenants;
-- Ensure checksum change!
-- sqlsync: endStatement

-- Create updated_at trigger
-- sqlsync: startStatement
CREATE TRIGGER set_updated_at
	BEFORE UPDATE ON public.tenants
	FOR EACH ROW
	EXECUTE FUNCTION functions.update_updated_at_column();
-- sqlsync: endStatement

-- sqlsync: startStatement
CREATE OR REPLACE FUNCTION tenants.notify_tenant_change()
RETURNS TRIGGER AS $$
-- Re-adding comment for test
BEGIN
  PERFORM pg_notify('tenant_changes', TG_OP || ':' || NEW.id::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- sqlsync: endStatement
-- <<< End content for: schema/tables/tenants/triggers.sql >>>


-- >>> END MODIFIED FILES <<<
