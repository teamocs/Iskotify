-- Applied to production 2026-11-24 through MCP.
-- Sensitive details (grades, income, Indigenous status) are stored only with consent.
-- The app clears them before upload; app versions older than the consent feature do
-- not. This strips them from any backup whose settings carry no sensitiveConsentAt.
-- Keys keep their place (null / false); absent keys stay absent. Local data on the
-- device is never touched.
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.strip_unconsented_settings()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_key text;
BEGIN
  IF jsonb_typeof(NEW.settings) IS DISTINCT FROM 'object' THEN
    RETURN NEW;
  END IF;
  IF jsonb_typeof(NEW.settings -> 'sensitiveConsentAt') = 'number'
     AND (NEW.settings ->> 'sensitiveConsentAt')::numeric > 0 THEN
    RETURN NEW;
  END IF;
  FOREACH v_key IN ARRAY ARRAY['incomeBracket', 'gwa', 'hsGwaG8', 'hsGwaG9', 'hsGwaG10', 'hsGwaG11'] LOOP
    IF NEW.settings ? v_key THEN
      NEW.settings := jsonb_set(NEW.settings, ARRAY[v_key], 'null'::jsonb);
    END IF;
  END LOOP;
  IF NEW.settings ? 'isIndigenous' THEN
    NEW.settings := jsonb_set(NEW.settings, ARRAY['isIndigenous'], 'false'::jsonb);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.strip_unconsented_settings() FROM public, anon, authenticated;

CREATE OR REPLACE TRIGGER strip_unconsented_settings
  BEFORE INSERT OR UPDATE OF settings ON public.user_app_data
  FOR EACH ROW EXECUTE FUNCTION public.strip_unconsented_settings();
