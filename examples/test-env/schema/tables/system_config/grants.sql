REVOKE ALL ON public.system_config FROM PUBLIC, anon, authenticated, authenticator, jackson;

-- Grant for jackson
GRANT
    SELECT,
	DELETE
    ON public.system_config TO jackson;