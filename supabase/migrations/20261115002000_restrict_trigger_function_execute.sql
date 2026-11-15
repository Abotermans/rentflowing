-- Supabase projects may grant EXECUTE on new functions directly to client
-- roles. Revoking only from PUBLIC does not remove those explicit grants.
DO $$
DECLARE
  trigger_function record;
BEGIN
  FOR trigger_function IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prorettype = 'trigger'::regtype
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated',
      trigger_function.signature
    );
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prorettype = 'trigger'::regtype
      AND (has_function_privilege('anon', p.oid, 'EXECUTE')
        OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  ) THEN
    RAISE EXCEPTION 'Client role can still execute a trigger function';
  END IF;
END;
$$;
