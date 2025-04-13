-- SQLSync Migration: test_rename_column_final
-- Generated At: 2025-04-12T02:11:16.568Z
-- Based on detected changes between states.


-- >>> MODIFIED FILES <<<

-- Modified File: schema/tables/tenants/triggers.sql

-- >>> Content for modified non-declarative file: schema/tables/tenants/triggers.sql <<<
-- sqlsync: splitStatement: true
-- Drop existing triggers if they exist
-- sqlsync: startStatement
DROP TRIGGER IF EXISTS set_updated_at ON public.tenants;
DROP TRIGGER IF EXISTS notify_api_rfrfwhen_tenant_is_updated ON public.tenants;
-- sqlsync: endStatement

-- Create updated_at trigger
-- sqlsync: startStatement
CREATE TRIGGER set_updated_at
	BEFORE UPDATE ON public.tenants
	FOR EACH ROW
	EXECUTE FUNCTION functions.update_updated_at_column();
-- sqlsync: endStatement
-- <<< End content for: schema/tables/tenants/triggers.sql >>>


-- >>> END MODIFIED FILES <<<
