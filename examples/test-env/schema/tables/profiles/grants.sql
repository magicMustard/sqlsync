-- Revoke default `PUBLIC` access
REVOKE ALL ON public.profiles FROM PUBLIC, anon, authenticated, authenticator, jackson;

-- Needed for authenticator to log user in.
GRANT REFERENCES ON public.profiles TO authenticator;

-- Grant for admin
GRANT
	SELECT,
	UPDATE(name, phone, email, operating_hours,available_on_chat_platform, active)
	ON public.profiles TO jackson;
