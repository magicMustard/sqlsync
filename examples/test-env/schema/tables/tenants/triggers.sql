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