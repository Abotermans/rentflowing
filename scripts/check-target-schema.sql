-- Read-only attestation of critical release capabilities. Migration history
-- alone is insufficient when SQL was applied outside the version table.
SELECT check_name, present
FROM (VALUES
  ('lease_document_types_table', (
    SELECT count(*) = 4 AND bool_and(
      CASE column_name
        WHEN 'id' THEN data_type = 'uuid' AND is_nullable = 'NO'
        WHEN 'portfolio_id' THEN data_type = 'uuid' AND is_nullable = 'NO'
        WHEN 'slug' THEN data_type = 'text' AND is_nullable = 'NO'
        WHEN 'label' THEN data_type = 'text' AND is_nullable = 'NO'
        ELSE false
      END
    )
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lease_document_types'
      AND column_name = ANY (ARRAY['id', 'portfolio_id', 'slug', 'label'])
  ) AND (
    SELECT count(*) = 4 AND bool_and(c.convalidated)
    FROM pg_constraint c
    WHERE c.conrelid = to_regclass('public.lease_document_types')
      AND c.conname = ANY (ARRAY[
        'lease_document_types_slug_format_check',
        'lease_document_types_label_check',
        'lease_document_types_not_builtin_check',
        'lease_document_types_portfolio_slug_key'
      ])
  ) AND EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = to_regclass('public.lease_document_types')
      AND c.conname = 'lease_document_types_portfolio_slug_key'
      AND c.contype = 'u' AND c.convalidated
      AND pg_get_constraintdef(c.oid) = 'UNIQUE (portfolio_id, slug)'
  ) AND EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = to_regclass('public.lease_documents')
      AND t.tgname = 'lease_documents_check_type'
      AND t.tgfoid = to_regprocedure('public.check_lease_document_type()')
      AND t.tgenabled = 'O' AND NOT t.tgisinternal
  ) AND EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = to_regclass('public.lease_document_types')
      AND t.tgname = 'lease_document_types_prevent_used_delete'
      AND t.tgfoid = to_regprocedure('public.prevent_used_lease_document_type_deletion()')
      AND t.tgenabled = 'O' AND NOT t.tgisinternal
  )),
  ('lease_documents_type_column', EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lease_documents' AND column_name = 'document_type'
  )),
  ('lease_documents_status_column', EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lease_documents' AND column_name = 'status'
  )),
  ('lease_documents_contractual_model', (
    SELECT count(*) = 3 AND bool_and(
      CASE column_name
        WHEN 'document_type' THEN data_type = 'text' AND is_nullable = 'NO'
        WHEN 'status' THEN data_type = 'text'
        WHEN 'signed_date' THEN data_type = 'date'
        ELSE false
      END
    )
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lease_documents'
      AND column_name = ANY (ARRAY['document_type', 'status', 'signed_date'])
  ) AND (
    SELECT count(*) = 2 AND bool_and(c.contype = 'c' AND c.convalidated)
    FROM pg_constraint c
    WHERE c.conrelid = to_regclass('public.lease_documents')
      AND c.conname = ANY (ARRAY[
        'lease_documents_document_type_check',
        'lease_documents_contractual_status_check'
      ])
  ) AND EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_class idx ON idx.oid = i.indexrelid
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = i.indkey[0]
    WHERE n.nspname = 'public' AND t.relname = 'lease_documents'
      AND idx.relname = 'lease_documents_one_initial_contract_per_lease_idx'
      AND a.attname = 'lease_id' AND i.indnkeyatts = 1
      AND i.indisunique AND i.indisvalid AND i.indpred IS NOT NULL
      AND pg_get_expr(i.indpred, i.indrelid) = '(document_type = ''initial-contract''::text)'
  )),
  ('unique_lease_document_storage_paths', EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = i.indkey[0]
    WHERE n.nspname = 'public' AND t.relname = 'lease_documents'
      AND a.attname = 'storage_path' AND i.indisunique AND i.indisvalid
      AND i.indnkeyatts = 1 AND i.indpred IS NULL AND i.indexprs IS NULL
  )),
  ('cost_amortization_model', (
    SELECT count(*) = 4 AND bool_and(
      CASE table_name || '.' || column_name
        WHEN 'cost_categories.recognition_mode_default' THEN data_type = 'text' AND is_nullable = 'NO'
        WHEN 'cost_entries.recognition_mode' THEN data_type = 'text' AND is_nullable = 'NO'
        WHEN 'cost_entries.amortization_start_date' THEN data_type = 'date'
        WHEN 'cost_entries.amortization_end_date' THEN data_type = 'date'
        ELSE false
      END
    )
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND ((table_name = 'cost_categories' AND column_name = 'recognition_mode_default')
        OR (table_name = 'cost_entries' AND column_name = ANY (ARRAY[
          'recognition_mode', 'amortization_start_date', 'amortization_end_date'
        ])))
  ) AND (
    SELECT count(*) = 3 AND bool_and(c.contype = 'c' AND c.convalidated)
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND ((t.relname = 'cost_categories' AND c.conname = 'cost_categories_recognition_mode_default_check')
        OR (t.relname = 'cost_entries' AND c.conname = ANY (ARRAY[
          'cost_entries_recognition_mode_check', 'cost_entries_amortization_dates_check'
        ])))
  )),
  ('lease_indexation_model', (
    SELECT count(*) = 8 AND bool_and(
      CASE column_name
        WHEN 'indexation_enabled' THEN data_type = 'boolean' AND is_nullable = 'NO'
        WHEN 'indexation_frequency' THEN data_type = 'text' AND is_nullable = 'NO'
        WHEN 'indexation_base_date' THEN data_type = 'date'
        WHEN 'indexation_base_index' THEN data_type = 'numeric'
          AND numeric_precision = 14 AND numeric_scale = 4
        WHEN 'indexation_current_index' THEN data_type = 'numeric'
          AND numeric_precision = 14 AND numeric_scale = 4
        WHEN 'indexation_cap_percent' THEN data_type = 'numeric'
          AND numeric_precision = 7 AND numeric_scale = 4
        WHEN 'indexation_rounding_mode' THEN data_type = 'text' AND is_nullable = 'NO'
        WHEN 'indexation_notes' THEN data_type = 'text' AND is_nullable = 'NO'
        ELSE false
      END
    )
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leases'
      AND column_name = ANY (ARRAY[
        'indexation_enabled', 'indexation_frequency', 'indexation_base_date',
        'indexation_base_index', 'indexation_current_index',
        'indexation_cap_percent', 'indexation_rounding_mode', 'indexation_notes'
      ])
  ) AND (
    SELECT count(*) = 3 AND bool_and(c.contype = 'c' AND c.convalidated)
    FROM pg_constraint c
    WHERE c.conrelid = to_regclass('public.leases')
      AND c.conname = ANY (ARRAY[
        'leases_indexation_frequency_check',
        'leases_indexation_rounding_mode_check',
        'leases_indexation_values_check'
      ])
  )),
  ('lease_billing_inputs', (
    SELECT count(*) = 4 AND bool_and(c.contype = 'c' AND c.convalidated)
    FROM pg_constraint c
    WHERE c.conrelid = to_regclass('public.leases')
      AND c.conname = ANY (ARRAY[
        'leases_due_day_range_check',
        'leases_rent_formula_positive_check',
        'leases_monthly_amounts_nonnegative_check',
        'leases_date_window_check'
      ])
  )),
  ('property_time_zone_model', EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'properties'
      AND column_name = 'time_zone' AND data_type = 'text'
      AND is_nullable = 'NO' AND column_default IS NULL
  ) AND EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = to_regclass('public.properties')
      AND c.conname = 'properties_time_zone_length_check'
      AND c.contype = 'c' AND c.convalidated
  ) AND EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = to_regclass('public.properties')
      AND t.tgname = 'validate_property_time_zone'
      AND t.tgfoid = to_regprocedure('public.validate_property_time_zone()')
      AND t.tgenabled = 'O' AND NOT t.tgisinternal
      AND (t.tgtype & 2) = 2 AND (t.tgtype & 4) = 4
      AND (t.tgtype & 16) = 16
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = to_regprocedure('public.validate_property_time_zone()')
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
  )),
  ('scheduled_job_health_table', EXISTS (
    SELECT 1 FROM pg_class t JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'scheduled_job_health'
      AND t.relkind = 'r' AND t.relrowsecurity
      AND has_table_privilege('service_role', t.oid, 'SELECT')
      AND has_table_privilege('service_role', t.oid, 'INSERT')
      AND has_table_privilege('service_role', t.oid, 'UPDATE')
      AND NOT has_table_privilege('anon', t.oid, 'SELECT')
      AND NOT has_table_privilege('anon', t.oid, 'INSERT')
      AND NOT has_table_privilege('anon', t.oid, 'UPDATE')
      AND NOT has_table_privilege('authenticated', t.oid, 'SELECT')
      AND NOT has_table_privilege('authenticated', t.oid, 'INSERT')
      AND NOT has_table_privilege('authenticated', t.oid, 'UPDATE')
  ) AND (
    SELECT count(*) = 2 AND bool_and(
      CASE column_name
        WHEN 'job_name' THEN data_type = 'text' AND is_nullable = 'NO'
        WHEN 'last_succeeded_at' THEN data_type = 'timestamp with time zone' AND is_nullable = 'NO'
        ELSE false
      END
    )
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'scheduled_job_health'
      AND column_name = ANY (ARRAY['job_name', 'last_succeeded_at'])
  ) AND EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = to_regclass('public.scheduled_job_health')
      AND c.contype = 'p' AND c.convalidated
      AND pg_get_constraintdef(c.oid) = 'PRIMARY KEY (job_name)'
  ) AND EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = to_regclass('public.scheduled_job_health')
      AND c.conname = 'scheduled_job_health_job_name_check'
      AND c.contype = 'c' AND c.convalidated
      AND pg_get_constraintdef(c.oid) LIKE '%advance-receivables%'
      AND pg_get_constraintdef(c.oid) LIKE '%cleanup-lease-document-files%'
  )),
  ('lifecycle_job_no_silent_lock_skips', EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = to_regprocedure('public.advance_due_lease_lifecycle_for_zone(date,text)')
      AND p.proconfig @> ARRAY['lock_timeout=15s']::text[]
      AND p.prosrc LIKE '%FOR UPDATE OF l%'
      AND p.prosrc NOT ILIKE '%SKIP LOCKED%'
      AND has_function_privilege('service_role', p.oid, 'EXECUTE')
      AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
  )),
  ('portfolio_data_rls', (
    SELECT count(*) = 13 AND bool_and(c.relrowsecurity)
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND c.relname = ANY (ARRAY[
        'portfolios', 'portfolio_members', 'properties', 'units', 'tenants',
        'leases', 'lease_documents', 'lease_document_types', 'cash_receipts',
        'receipt_allocations', 'receivable_items', 'cost_entries',
        'cost_allocation_results'
      ])
  )),
  ('all_portfolio_tables_rls', (
    SELECT count(*) > 0 AND bool_and(c.relrowsecurity)
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      AND a.attname = 'portfolio_id' AND a.attnum > 0 AND NOT a.attisdropped
  )),
  ('portfolio_data_read_policies', (
    SELECT count(DISTINCT tablename) = 11
      AND bool_and(coalesce(position('is_portfolio_member' IN lower(qual)), 0) > 0)
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY (ARRAY[
        'properties', 'units', 'tenants', 'leases', 'lease_documents',
        'lease_document_types', 'cash_receipts', 'receipt_allocations',
        'receivable_items', 'cost_entries', 'cost_allocation_results'
      ])
      AND cmd IN ('SELECT', 'ALL')
      AND roles && ARRAY['public', 'authenticated']::name[]
  )),
  ('all_portfolio_table_read_policies', NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      AND a.attname = 'portfolio_id' AND a.attnum > 0 AND NOT a.attisdropped
      AND EXISTS (
        SELECT 1 FROM pg_policies p
        WHERE p.schemaname = 'public' AND p.tablename = c.relname
          AND p.cmd IN ('SELECT', 'ALL')
          AND p.roles && ARRAY['public', 'authenticated', 'anon']::name[]
          AND coalesce(position('is_portfolio_member' IN lower(p.qual)), 0) = 0
      )
  )),
  ('lease_document_write_policy_scope', (
    SELECT count(*) = 2
      AND bool_and(position('lease.portfolio_id = lease_documents.portfolio_id'
        IN lower(with_check)) > 0)
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lease_documents'
      AND cmd IN ('INSERT', 'UPDATE')
      AND roles && ARRAY['public', 'authenticated', 'anon']::name[]
  )),
  ('lease_document_write_role_policies', (
    SELECT count(*) = 3
      AND count(*) FILTER (WHERE cmd = 'INSERT') = 1
      AND count(*) FILTER (WHERE cmd = 'UPDATE') = 1
      AND count(*) FILTER (WHERE cmd = 'DELETE') = 1
      AND bool_and(roles = ARRAY['authenticated']::name[])
      AND bool_and(position('is_portfolio_member' IN
        lower(coalesce(qual, '') || coalesce(with_check, ''))) = 0)
      AND bool_and(CASE cmd
        WHEN 'INSERT' THEN position('has_portfolio_role' IN lower(coalesce(with_check, ''))) > 0
        WHEN 'UPDATE' THEN position('has_portfolio_role' IN lower(coalesce(qual, ''))) > 0
          AND position('has_portfolio_role' IN lower(coalesce(with_check, ''))) > 0
        WHEN 'DELETE' THEN position('has_portfolio_role' IN lower(coalesce(qual, ''))) > 0
        ELSE false END)
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lease_documents'
      AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      AND roles && ARRAY['public', 'authenticated', 'anon']::name[]
  )),
  ('restricted_lease_metadata_writes', (
    CASE WHEN to_regclass('public.leases') IS NULL THEN false
      ELSE NOT has_table_privilege('authenticated', 'public.leases', 'UPDATE') END
    AND NOT EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.oid = to_regprocedure(
        'public.save_lease_with_tenant_statuses(jsonb,jsonb,timestamptz,text,text)')
        AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
    )
    AND EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.oid = to_regprocedure(
        'public.client_save_lease_metadata(jsonb,jsonb,timestamptz,text,text)')
        AND p.prosecdef AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
    )
  )),
  ('restricted_lease_creation_and_assignments', (
    CASE WHEN to_regclass('public.leases') IS NULL
      OR to_regclass('public.lease_unit_assignments') IS NULL THEN false
    ELSE NOT has_table_privilege('authenticated', 'public.leases', 'INSERT')
      AND NOT has_table_privilege('authenticated', 'public.lease_unit_assignments', 'INSERT')
      AND NOT has_table_privilege('authenticated', 'public.lease_unit_assignments', 'UPDATE')
      AND NOT has_table_privilege('authenticated', 'public.lease_unit_assignments', 'DELETE')
    END
    AND NOT EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.oid = to_regprocedure(
        'public.close_lease_atomically(jsonb,timestamptz,date,boolean,text,text)')
        AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
    )
  )),
  ('restricted_lease_status_history_writes', (
    CASE WHEN to_regclass('public.lease_status_changes') IS NULL THEN false
      ELSE NOT has_table_privilege('authenticated', 'public.lease_status_changes', 'INSERT')
    END
    AND EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.oid = to_regprocedure('public.ensure_lease_status_history()')
        AND p.prosecdef
        AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
    )
  )),
  ('lease_stage_main_unit_guard', EXISTS (
    SELECT 1 FROM pg_trigger trigger
    JOIN pg_proc function ON function.oid = trigger.tgfoid
    WHERE trigger.tgrelid = to_regclass('public.leases')
      AND trigger.tgname = 'guard_lease_stage_main_unit'
      AND trigger.tgenabled <> 'D'
      AND trigger.tgdeferrable AND trigger.tginitdeferred
      AND NOT trigger.tgisinternal
      AND NOT function.prosecdef
      AND NOT has_function_privilege('authenticated', function.oid, 'EXECUTE')
  ) AND EXISTS (
    SELECT 1 FROM pg_trigger trigger
    JOIN pg_proc function ON function.oid = trigger.tgfoid
    WHERE trigger.tgrelid = to_regclass('public.lease_unit_assignments')
      AND trigger.tgname = 'guard_retained_lease_main_unit'
      AND trigger.tgenabled <> 'D'
      AND trigger.tgdeferrable AND trigger.tginitdeferred
      AND NOT trigger.tgisinternal
      AND NOT function.prosecdef
      AND NOT has_function_privilege('authenticated', function.oid, 'EXECUTE')
  )),
  ('lease_assignment_totals_guard', EXISTS (
    SELECT 1 FROM pg_trigger trigger
    JOIN pg_proc function ON function.oid = trigger.tgfoid
    WHERE trigger.tgrelid = to_regclass('public.leases')
      AND trigger.tgname = 'guard_lease_assignment_totals_on_lease'
      AND trigger.tgenabled <> 'D'
      AND trigger.tgdeferrable AND trigger.tginitdeferred
      AND NOT trigger.tgisinternal
      AND NOT function.prosecdef
      AND NOT has_function_privilege('authenticated', function.oid, 'EXECUTE')
  ) AND EXISTS (
    SELECT 1 FROM pg_trigger trigger
    JOIN pg_proc function ON function.oid = trigger.tgfoid
    WHERE trigger.tgrelid = to_regclass('public.lease_unit_assignments')
      AND trigger.tgname = 'guard_lease_assignment_totals_on_assignment'
      AND trigger.tgenabled <> 'D'
      AND trigger.tgdeferrable AND trigger.tginitdeferred
      AND NOT trigger.tgisinternal
      AND NOT function.prosecdef
      AND NOT has_function_privilege('authenticated', function.oid, 'EXECUTE')
  )),
  ('same_lease_unit_overlap_guard', EXISTS (
    SELECT 1 FROM pg_trigger trigger
    JOIN pg_proc function ON function.oid = trigger.tgfoid
    WHERE trigger.tgrelid = to_regclass('public.lease_unit_assignments')
      AND trigger.tgname = 'guard_same_lease_unit_overlap_on_assignment'
      AND trigger.tgenabled <> 'D'
      AND trigger.tgdeferrable AND trigger.tginitdeferred
      AND NOT trigger.tgisinternal
      AND NOT function.prosecdef
      AND NOT has_function_privilege('authenticated', function.oid, 'EXECUTE')
  )),
  ('cross_lease_unit_overlap_guard', EXISTS (
    SELECT 1 FROM pg_trigger trigger
    JOIN pg_proc function ON function.oid = trigger.tgfoid
    WHERE trigger.tgrelid = to_regclass('public.lease_unit_assignments')
      AND trigger.tgname = 'guard_cross_lease_overlap_on_assignment'
      AND trigger.tgenabled <> 'D'
      AND trigger.tgdeferrable AND trigger.tginitdeferred
      AND NOT trigger.tgisinternal
      AND NOT function.prosecdef
      AND NOT has_function_privilege('authenticated', function.oid, 'EXECUTE')
  ) AND EXISTS (
    SELECT 1 FROM pg_trigger trigger
    JOIN pg_proc function ON function.oid = trigger.tgfoid
    WHERE trigger.tgrelid = to_regclass('public.leases')
      AND trigger.tgname = 'guard_cross_lease_overlap_on_lease'
      AND trigger.tgenabled <> 'D'
      AND trigger.tgdeferrable AND trigger.tginitdeferred
      AND NOT trigger.tgisinternal
      AND NOT function.prosecdef
      AND NOT has_function_privilege('authenticated', function.oid, 'EXECUTE')
  )),
  ('tenant_status_lease_guard', EXISTS (
    SELECT 1 FROM pg_trigger trigger
    JOIN pg_proc function ON function.oid = trigger.tgfoid
    WHERE trigger.tgrelid = to_regclass('public.tenants')
      AND trigger.tgname = 'guard_tenant_lease_status'
      AND trigger.tgenabled <> 'D'
      AND NOT trigger.tgisinternal
      AND function.prosecdef
      AND NOT has_function_privilege('authenticated', function.oid, 'EXECUTE')
  )),
  ('secure_definer_search_paths', NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
      AND (NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) AS setting
        WHERE setting LIKE 'search_path=%'
      ) OR 'search_path=public' = ANY(p.proconfig))
  )),
  ('no_client_executable_definer_triggers', NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
      AND p.prorettype = 'trigger'::regtype
      AND (has_function_privilege('anon', p.oid, 'EXECUTE')
        OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  )),
  ('public_schema_not_client_writable',
    NOT has_schema_privilege('anon', 'public', 'CREATE')
    AND NOT has_schema_privilege('authenticated', 'public', 'CREATE')),
  ('atomic_lease_create_rpc', EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'client_create_lease_with_schedule'
  )),
  ('atomic_receipt_rpc', EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'client_save_receipt_allocations'
  )),
  ('receipt_payload_cent_precision', EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = to_regprocedure(
      'public.client_save_receipt_allocations(jsonb,jsonb,jsonb,timestamptz)')
      AND p.prosecdef
      AND to_regprocedure('public.validate_receipt_cent_payload(jsonb,jsonb,jsonb)') IS NOT NULL
      AND position('public.validate_receipt_cent_payload' IN lower(pg_get_functiondef(p.oid))) > 0
  )),
  ('atomic_amendment_rpc', EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'client_activate_amendment_with_schedule'
  )),
  ('atomic_cost_rpc', EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'client_save_cost_entry_with_allocations'
  )),
  ('secure_invitation_rpc', EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'accept_portfolio_invitation'
  )),
  ('document_file_guard', EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'can_delete_lease_document_file'
  )),
  ('lease_document_bucket_config', EXISTS (
    SELECT 1 FROM storage.buckets b
    WHERE b.id = 'lease-documents' AND b.public = false
      AND b.file_size_limit = 20971520
      AND b.allowed_mime_types @> ARRAY[
        'application/pdf', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/jpeg', 'image/png'
      ]::text[]
      AND b.allowed_mime_types <@ ARRAY[
        'application/pdf', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/jpeg', 'image/png'
      ]::text[]
  )),
  ('lease_document_storage_objects_rls', EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'storage' AND c.relname = 'objects'
      AND c.relrowsecurity
  )),
  ('lease_document_storage_read_policy', (
    SELECT count(*) = 1
      AND bool_and(position('lease-documents' IN coalesce(qual, '')) > 0)
      AND bool_and(position('is_portfolio_member' IN coalesce(qual, '')) > 0)
    FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND cmd IN ('SELECT', 'ALL')
      AND roles && ARRAY['public', 'anon', 'authenticated']::name[]
  )),
  ('lease_document_storage_upload_policy', (
    SELECT count(*) = 1
      AND bool_and(position('lease-documents' IN coalesce(with_check, '')) > 0)
      AND bool_and(position('has_portfolio_role' IN coalesce(with_check, '')) > 0)
    FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND cmd IN ('INSERT', 'ALL')
      AND roles && ARRAY['public', 'anon', 'authenticated']::name[]
  )),
  ('lease_document_storage_delete_guard', (
    SELECT count(*) = 1
      AND bool_and(position('lease-documents' IN coalesce(qual, '')) > 0)
      AND bool_and(position('can_delete_lease_document_file' IN coalesce(qual, '')) > 0)
    FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND cmd IN ('DELETE', 'ALL')
      AND roles && ARRAY['public', 'anon', 'authenticated']::name[]
  )),
  ('lease_document_storage_no_update_policy', NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND cmd IN ('UPDATE', 'ALL')
      AND roles && ARRAY['public', 'anon', 'authenticated']::name[]
  )),
  ('duplicate_schedule_trigger', EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = to_regclass('public.receivable_items')
      AND t.tgname = 'prevent_duplicate_lease_receivable'
      AND NOT t.tgisinternal AND t.tgenabled IN ('O', 'A')
  )),
  ('lease_wide_duplicate_guard', EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'prevent_duplicate_lease_receivable'
      AND position('existing.unit_id' IN lower(pg_get_functiondef(p.oid))) = 0
      AND position('new.unit_id' IN lower(pg_get_functiondef(p.oid))) = 0
  )),
  ('retimed_receivable_cycle_guard', EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'prevent_duplicate_lease_receivable'
      AND position('existing.cycle_end_date is null' IN lower(pg_get_functiondef(p.oid))) > 0
      AND position('new.cycle_end_date is null' IN lower(pg_get_functiondef(p.oid))) > 0
      AND position('existing.cycle_end_date = new.cycle_end_date' IN lower(pg_get_functiondef(p.oid))) > 0
      AND position('pg_advisory_xact_lock' IN lower(pg_get_functiondef(p.oid))) > 0
  ) AND EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'insert_due_lease_receivables'
      AND position('existing.cycle_end_date is null' IN lower(pg_get_functiondef(p.oid))) > 0
      AND position('v_cycle_end_date is null' IN lower(pg_get_functiondef(p.oid))) > 0
      AND position('existing.cycle_end_date = v_cycle_end_date' IN lower(pg_get_functiondef(p.oid))) > 0
      AND p.prosecdef
      AND has_function_privilege('service_role', p.oid, 'EXECUTE')
      AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
  )),
  ('retained_lease_receivable_assignment_guard', EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_constraint c ON c.oid = t.tgconstraint
    WHERE t.tgrelid = to_regclass('public.lease_unit_assignments')
      AND t.tgname = 'guard_retained_lease_receivable_assignment'
      AND t.tgfoid = to_regprocedure('public.guard_retained_lease_receivable_assignment()')
      AND t.tgtype & 25 = 25
      AND NOT t.tgisinternal AND t.tgenabled IN ('O', 'A')
      AND c.condeferrable AND c.condeferred
  )),
  ('new_assignment_pricing_guard', EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE t.tgrelid = to_regclass('public.lease_unit_assignments')
      AND t.tgname = 'guard_new_assignment_pricing'
      AND t.tgfoid = to_regprocedure('public.guard_new_assignment_pricing()')
      AND t.tgtype & 23 = 23
      AND NOT t.tgisinternal AND t.tgenabled IN ('O', 'A')
      AND NOT p.prosecdef
      AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
  )),
  ('paid_receivable_delete_trigger', EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = to_regclass('public.receivable_items')
      AND t.tgname = 'guard_paid_receivable_deletion'
      AND NOT t.tgisinternal AND t.tgenabled IN ('O', 'A')
  )),
  ('cash_receipt_balance_trigger', EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = to_regclass('public.cash_receipts')
      AND t.tgname = 'cash_receipt_allocation_balance'
      AND NOT t.tgisinternal AND t.tgenabled IN ('O', 'A')
  )),
  ('cash_receipt_scope_trigger', EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE t.tgrelid = to_regclass('public.cash_receipts')
      AND t.tgname = 'guard_cash_receipt_scope'
      AND t.tgfoid = to_regprocedure('public.guard_cash_receipt_scope()')
      AND t.tgtype & 23 = 23
      AND NOT t.tgisinternal AND t.tgenabled IN ('O', 'A')
      AND p.prosecdef
      AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
  )),
  ('receipt_allocation_balance_trigger', EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = to_regclass('public.receipt_allocations')
      AND t.tgname = 'receipt_allocation_balance'
      AND NOT t.tgisinternal AND t.tgenabled IN ('O', 'A')
  )),
  ('receipt_allocation_property_trigger', EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE t.tgrelid = to_regclass('public.receipt_allocations')
      AND t.tgname = 'guard_receipt_allocation_property'
      AND t.tgfoid = to_regprocedure('public.guard_receipt_allocation_property()')
      AND t.tgtype & 23 = 23
      AND NOT t.tgisinternal AND t.tgenabled IN ('O', 'A')
      AND p.prosecdef
      AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
  )),
  ('cash_receipt_status_balance_constraint', EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = to_regclass('public.cash_receipts')
      AND c.conname = 'cash_receipts_status_balance_consistent'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%partially-matched%'
  )),
  ('guarantee_raw_cent_precision', (
    SELECT count(*) = 3
    FROM pg_attribute a
    WHERE a.attrelid = to_regclass('public.guarantees')
      AND a.attname IN ('expected_amount', 'received_amount', 'retention_amount')
      AND a.attnum > 0 AND NOT a.attisdropped
      AND format_type(a.atttypid, a.atttypmod) = 'numeric'
  )),
  ('guarantee_amount_guard', EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = to_regclass('public.guarantees')
      AND c.conname = 'guarantees_amounts_valid' AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%trunc%'
  )),
  ('guarantee_status_guard', EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = to_regclass('public.guarantees')
      AND c.conname = 'guarantees_status_consistent' AND c.contype = 'c'
  )),
  ('one_guarantee_per_lease', EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = i.indkey[0]
    WHERE n.nspname = 'public' AND t.relname = 'guarantees'
      AND a.attname = 'lease_id' AND i.indisunique AND i.indisvalid
      AND i.indnkeyatts = 1 AND i.indpred IS NULL AND i.indexprs IS NULL
  ))) AS checks(check_name, present)
ORDER BY check_name;
