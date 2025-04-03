DROP INDEX IF EXISTS profiles_phone_unique_idx;

CREATE INDEX profiles_phone_unique_idx ON public.profiles (phone) WHERE phone IS NOT NULL;