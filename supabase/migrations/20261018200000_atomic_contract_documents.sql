-- Contractual document changes and their lease lifecycle effects commit together.
-- Supporting documents retain the ordinary table and storage workflow.
CREATE FUNCTION public.guard_direct_contract_document_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF current_user = 'authenticated'
    AND (TG_OP <> 'INSERT' AND OLD.document_type IN ('initial-contract', 'amendment')
      OR TG_OP <> 'DELETE' AND NEW.document_type IN ('initial-contract', 'amendment'))
    AND EXISTS (SELECT 1 FROM public.portfolios
      WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.portfolio_id ELSE NEW.portfolio_id END) THEN
    RAISE EXCEPTION 'Contractual documents must use the guarded document transaction'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_direct_contract_document_write() FROM PUBLIC;
CREATE TRIGGER guard_direct_contract_document_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.lease_documents
  FOR EACH ROW EXECUTE FUNCTION public.guard_direct_contract_document_write();

CREATE FUNCTION public.apply_initial_contract_lease_transition(
  p_lease_id uuid,
  p_was_signed boolean,
  p_is_signed boolean,
  p_signed_date date,
  p_keep_lease_signed boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lease public.leases%ROWTYPE;
BEGIN
  SELECT * INTO v_lease FROM public.leases WHERE id = p_lease_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lease was not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_is_signed AND v_lease.lifecycle_stage IN ('draft', 'pending-signature') THEN
    UPDATE public.leases SET lifecycle_stage = 'signed', signed_date = p_signed_date
    WHERE id = p_lease_id RETURNING * INTO v_lease;
  ELSIF p_was_signed AND NOT p_is_signed
    AND v_lease.lifecycle_stage = 'signed' AND v_lease.start_date > CURRENT_DATE THEN
    IF p_keep_lease_signed IS NULL THEN
      RAISE EXCEPTION 'Choose whether to keep the future lease signed'
        USING ERRCODE = '22023';
    END IF;
    IF NOT p_keep_lease_signed THEN
      UPDATE public.leases SET lifecycle_stage = 'pending-signature', signed_date = NULL
      WHERE id = p_lease_id RETURNING * INTO v_lease;
    END IF;
  END IF;
  RETURN to_jsonb(v_lease);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_initial_contract_lease_transition(
  uuid, boolean, boolean, date, boolean
) FROM PUBLIC, authenticated;

CREATE FUNCTION public.create_contract_document(p_document jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_document public.lease_documents%ROWTYPE;
  v_portfolio_id uuid;
  v_lease_id uuid;
  v_document_id uuid;
  v_lease jsonb;
BEGIN
  IF jsonb_typeof(p_document) <> 'object' THEN
    RAISE EXCEPTION 'Invalid document payload' USING ERRCODE = '22023';
  END IF;
  v_portfolio_id := (p_document->>'portfolio_id')::uuid;
  v_lease_id := (p_document->>'lease_id')::uuid;
  v_document_id := (p_document->>'id')::uuid;
  IF v_portfolio_id IS NULL OR v_lease_id IS NULL OR v_document_id IS NULL
    OR p_document->>'document_type' NOT IN ('initial-contract', 'amendment')
    OR NULLIF(trim(p_document->>'title'), '') IS NULL
    OR (p_document->>'document_date')::date IS NULL
    OR NULLIF(p_document->>'original_filename', '') IS NULL
    OR NOT starts_with(coalesce(p_document->>'storage_path', ''),
      v_portfolio_id::text || '/' || v_lease_id::text || '/' || v_document_id::text || '/') THEN
    RAISE EXCEPTION 'Contract document has invalid scope or metadata'
      USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_portfolio_role(
    v_portfolio_id, auth.uid(), ARRAY['owner', 'admin', 'editor']::public.portfolio_role[]
  ) THEN
    RAISE EXCEPTION 'Document write is not permitted' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.leases
  WHERE id = v_lease_id AND portfolio_id = v_portfolio_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lease was not found in this portfolio' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects
    WHERE bucket_id = 'lease-documents' AND name = p_document->>'storage_path') THEN
    RAISE EXCEPTION 'Uploaded file was not found' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.lease_documents (
    id, portfolio_id, lease_id, document_type, status, signed_date, title,
    document_date, notes, storage_path, mime_type, size_bytes,
    original_filename, uploaded_by
  ) VALUES (
    v_document_id, v_portfolio_id, v_lease_id, p_document->>'document_type',
    p_document->>'status', (p_document->>'signed_date')::date,
    trim(p_document->>'title'), (p_document->>'document_date')::date,
    p_document->>'notes', p_document->>'storage_path', p_document->>'mime_type',
    (p_document->>'size_bytes')::bigint, p_document->>'original_filename', auth.uid()
  ) RETURNING * INTO v_document;
  IF v_document.document_type = 'initial-contract' THEN
    v_lease := public.apply_initial_contract_lease_transition(
      v_lease_id, false, v_document.status = 'signed', v_document.signed_date, NULL
    );
  ELSE
    SELECT to_jsonb(l) INTO v_lease FROM public.leases AS l WHERE id = v_lease_id;
  END IF;
  RETURN jsonb_build_object('document', to_jsonb(v_document), 'lease', v_lease);
END;
$$;

CREATE FUNCTION public.change_contract_document_status(
  p_document_id uuid,
  p_portfolio_id uuid,
  p_expected_updated_at timestamptz,
  p_status text,
  p_signed_date date,
  p_keep_lease_signed boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_document public.lease_documents%ROWTYPE;
  v_lease_id uuid;
  v_was_signed boolean;
  v_lease jsonb;
BEGIN
  IF p_document_id IS NULL OR p_portfolio_id IS NULL
    OR p_expected_updated_at IS NULL OR p_status IS NULL THEN
    RAISE EXCEPTION 'Document, portfolio, version and status are required'
      USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_portfolio_role(
    p_portfolio_id, auth.uid(), ARRAY['owner', 'admin', 'editor']::public.portfolio_role[]
  ) THEN
    RAISE EXCEPTION 'Document write is not permitted' USING ERRCODE = '42501';
  END IF;
  SELECT lease_id INTO v_lease_id FROM public.lease_documents
  WHERE id = p_document_id AND portfolio_id = p_portfolio_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document was not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM 1 FROM public.leases
  WHERE id = v_lease_id AND portfolio_id = p_portfolio_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lease was not found in this portfolio' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_document FROM public.lease_documents
  WHERE id = p_document_id AND portfolio_id = p_portfolio_id FOR UPDATE;
  IF NOT FOUND OR v_document.lease_id IS DISTINCT FROM v_lease_id THEN
    RAISE EXCEPTION 'Document changed while saving. Reload and retry.' USING ERRCODE = '40001';
  END IF;
  IF v_document.document_type NOT IN ('initial-contract', 'amendment') THEN
    RAISE EXCEPTION 'Supporting documents have no signature status' USING ERRCODE = '23514';
  END IF;
  IF v_document.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Document changed since it was opened. Reload and retry.' USING ERRCODE = '40001';
  END IF;
  v_was_signed := v_document.status = 'signed';
  UPDATE public.lease_documents SET status = p_status, signed_date = p_signed_date
  WHERE id = p_document_id RETURNING * INTO v_document;
  IF v_document.document_type = 'initial-contract' THEN
    v_lease := public.apply_initial_contract_lease_transition(
      v_lease_id, v_was_signed, v_document.status = 'signed',
      v_document.signed_date, p_keep_lease_signed
    );
  ELSE
    SELECT to_jsonb(l) INTO v_lease FROM public.leases AS l WHERE id = v_lease_id;
  END IF;
  RETURN jsonb_build_object('document', to_jsonb(v_document), 'lease', v_lease);
END;
$$;

CREATE FUNCTION public.delete_contract_document(
  p_document_id uuid,
  p_portfolio_id uuid,
  p_expected_updated_at timestamptz,
  p_keep_lease_signed boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_document public.lease_documents%ROWTYPE;
  v_lease_id uuid;
  v_lease jsonb;
BEGIN
  IF p_document_id IS NULL OR p_portfolio_id IS NULL OR p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'Document, portfolio and version are required' USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_portfolio_role(
    p_portfolio_id, auth.uid(), ARRAY['owner', 'admin', 'editor']::public.portfolio_role[]
  ) THEN
    RAISE EXCEPTION 'Document deletion is not permitted' USING ERRCODE = '42501';
  END IF;
  SELECT lease_id INTO v_lease_id FROM public.lease_documents
  WHERE id = p_document_id AND portfolio_id = p_portfolio_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document was not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM 1 FROM public.leases
  WHERE id = v_lease_id AND portfolio_id = p_portfolio_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lease was not found in this portfolio' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_document FROM public.lease_documents
  WHERE id = p_document_id AND portfolio_id = p_portfolio_id FOR UPDATE;
  IF NOT FOUND OR v_document.lease_id IS DISTINCT FROM v_lease_id THEN
    RAISE EXCEPTION 'Document changed while deleting. Reload and retry.' USING ERRCODE = '40001';
  END IF;
  IF v_document.document_type NOT IN ('initial-contract', 'amendment') THEN
    RAISE EXCEPTION 'Supporting documents use ordinary deletion' USING ERRCODE = '23514';
  END IF;
  IF v_document.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Document changed since it was opened. Reload and retry.' USING ERRCODE = '40001';
  END IF;
  IF v_document.document_type = 'initial-contract' THEN
    v_lease := public.apply_initial_contract_lease_transition(
      v_lease_id, v_document.status = 'signed', false, NULL, p_keep_lease_signed
    );
  ELSE
    SELECT to_jsonb(l) INTO v_lease FROM public.leases AS l WHERE id = v_lease_id;
  END IF;
  DELETE FROM public.lease_documents WHERE id = p_document_id;
  RETURN jsonb_build_object('document_id', p_document_id,
    'storage_path', v_document.storage_path, 'lease', v_lease);
END;
$$;

REVOKE ALL ON FUNCTION public.create_contract_document(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.change_contract_document_status(
  uuid, uuid, timestamptz, text, date, boolean
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_contract_document(
  uuid, uuid, timestamptz, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_contract_document(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_contract_document_status(
  uuid, uuid, timestamptz, text, date, boolean
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_contract_document(
  uuid, uuid, timestamptz, boolean
) TO authenticated;
NOTIFY pgrst, 'reload schema';
