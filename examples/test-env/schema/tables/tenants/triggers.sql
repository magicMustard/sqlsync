-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS set_updated_at ON public.tenants;
DROP TRIGGER IF EXISTS notify_api_when_tenant_is_updated ON public.tenants;

-- Create updated_at trigger
CREATE TRIGGER set_updated_at
	BEFORE UPDATE ON public.tenants
	FOR EACH ROW
	EXECUTE FUNCTION functions.update_updated_at_column();