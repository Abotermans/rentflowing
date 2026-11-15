-- The scheduled receivable Edge Function activates due amendments with the
-- service-role client before advancing leases and generating new receivables.
GRANT EXECUTE ON FUNCTION public.activate_amendment_with_schedule(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, timestamptz) TO service_role;
