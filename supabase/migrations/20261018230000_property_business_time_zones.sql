-- Billing and lifecycle dates belong to the property's legal calendar day,
-- not the manager's browser or a UTC cron host.
ALTER TABLE public.properties
  ADD COLUMN time_zone text NOT NULL DEFAULT 'Europe/Brussels';

UPDATE public.properties
SET time_zone = CASE country_code
  WHEN 'AT' THEN 'Europe/Vienna'
  WHEN 'BE' THEN 'Europe/Brussels'
  WHEN 'CH' THEN 'Europe/Zurich'
  WHEN 'CZ' THEN 'Europe/Prague'
  WHEN 'DE' THEN 'Europe/Berlin'
  WHEN 'DK' THEN 'Europe/Copenhagen'
  WHEN 'ES' THEN 'Europe/Madrid'
  WHEN 'FI' THEN 'Europe/Helsinki'
  WHEN 'FR' THEN 'Europe/Paris'
  WHEN 'GB' THEN 'Europe/London'
  WHEN 'IE' THEN 'Europe/Dublin'
  WHEN 'IT' THEN 'Europe/Rome'
  WHEN 'LU' THEN 'Europe/Luxembourg'
  WHEN 'NL' THEN 'Europe/Amsterdam'
  WHEN 'NO' THEN 'Europe/Oslo'
  WHEN 'PL' THEN 'Europe/Warsaw'
  WHEN 'PT' THEN 'Europe/Lisbon'
  WHEN 'SE' THEN 'Europe/Stockholm'
  ELSE 'Europe/Brussels'
END;

ALTER TABLE public.properties ALTER COLUMN time_zone DROP DEFAULT;

ALTER TABLE public.properties
  ADD CONSTRAINT properties_time_zone_length_check
  CHECK (length(time_zone) BETWEEN 1 AND 64);

CREATE FUNCTION public.validate_property_time_zone()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.time_zone IS NULL THEN
    NEW.time_zone := CASE NEW.country_code
      WHEN 'AT' THEN 'Europe/Vienna'
      WHEN 'BE' THEN 'Europe/Brussels'
      WHEN 'CH' THEN 'Europe/Zurich'
      WHEN 'CZ' THEN 'Europe/Prague'
      WHEN 'DE' THEN 'Europe/Berlin'
      WHEN 'DK' THEN 'Europe/Copenhagen'
      WHEN 'ES' THEN 'Europe/Madrid'
      WHEN 'FI' THEN 'Europe/Helsinki'
      WHEN 'FR' THEN 'Europe/Paris'
      WHEN 'GB' THEN 'Europe/London'
      WHEN 'IE' THEN 'Europe/Dublin'
      WHEN 'IT' THEN 'Europe/Rome'
      WHEN 'LU' THEN 'Europe/Luxembourg'
      WHEN 'NL' THEN 'Europe/Amsterdam'
      WHEN 'NO' THEN 'Europe/Oslo'
      WHEN 'PL' THEN 'Europe/Warsaw'
      WHEN 'PT' THEN 'Europe/Lisbon'
      WHEN 'SE' THEN 'Europe/Stockholm'
      ELSE 'Europe/Brussels'
    END;
  END IF;
  PERFORM now() AT TIME ZONE NEW.time_zone;
  RETURN NEW;
EXCEPTION WHEN invalid_parameter_value THEN
  RAISE EXCEPTION 'Property time zone must be a valid IANA time zone'
    USING ERRCODE = '22023';
END;
$$;

REVOKE ALL ON FUNCTION public.validate_property_time_zone()
  FROM PUBLIC, anon, authenticated;
CREATE TRIGGER validate_property_time_zone
  BEFORE INSERT OR UPDATE OF time_zone ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.validate_property_time_zone();

NOTIFY pgrst, 'reload schema';
