-- Revoke default `PUBLIC` access
REVOKE ALL ON public.tenants FROM PUBLIC, anon, authenticated, authenticator, jackson;

-- Grant for jackson
GRANT
    SELECT,
    UPDATE,
    INSERT
    ON public.tenants TO jackson;