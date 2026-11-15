-- Older previews stored contractual metadata in notes when the live schema was
-- missing document_type/status/signed_date. Preserve it before the UI stops
-- reading those notes as the source of truth.
DO $$
DECLARE
  document_row record;
  payload jsonb;
  metadata jsonb;
  legacy_type text;
  legacy_status text;
  legacy_signed_date date;
BEGIN
  FOR document_row IN
    SELECT id, portfolio_id, notes
    FROM public.lease_documents
    WHERE notes LIKE '%__rentflowingLeaseDocumentMetadata%'
  LOOP
    BEGIN
      payload := document_row.notes::jsonb;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Document % has invalid legacy metadata JSON', document_row.id;
    END;

    metadata := payload -> '__rentflowingLeaseDocumentMetadata';
    IF jsonb_typeof(metadata) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Document % has invalid legacy metadata', document_row.id;
    END IF;

    legacy_type := metadata ->> 'documentType';
    legacy_status := metadata ->> 'status';
    IF legacy_type IS NULL OR legacy_type !~ '^[a-z0-9][a-z0-9-]{0,63}$' THEN
      RAISE EXCEPTION 'Document % has invalid legacy document type', document_row.id;
    END IF;

    IF legacy_type IN ('initial-contract', 'amendment') THEN
      IF legacy_status IS NULL OR legacy_status NOT IN
        ('draft', 'validated', 'sent', 'partially-signed', 'signed', 'cancelled') THEN
        RAISE EXCEPTION 'Document % has invalid legacy contractual status', document_row.id;
      END IF;
      IF legacy_status = 'signed' THEN
        IF metadata ->> 'signedDate' IS NULL THEN
          RAISE EXCEPTION 'Document % has no legacy signed date', document_row.id;
        END IF;
        legacy_signed_date := (metadata ->> 'signedDate')::date;
      ELSE
        legacy_signed_date := NULL;
      END IF;
    ELSE
      IF legacy_status IS NOT NULL OR metadata ->> 'signedDate' IS NOT NULL THEN
        RAISE EXCEPTION 'Document % has unexpected status on non-contractual type', document_row.id;
      END IF;
      legacy_signed_date := NULL;
    END IF;

    IF legacy_type NOT IN ('initial-contract', 'amendment', 'supporting') THEN
      INSERT INTO public.lease_document_types (portfolio_id, slug, label)
      VALUES (document_row.portfolio_id, legacy_type, legacy_type)
      ON CONFLICT (portfolio_id, slug) DO NOTHING;
    END IF;

    UPDATE public.lease_documents
    SET document_type = legacy_type,
        status = legacy_status,
        signed_date = legacy_signed_date,
        notes = CASE
          WHEN payload = jsonb_build_object('__rentflowingLeaseDocumentMetadata', metadata)
          THEN NULL ELSE notes
        END
    WHERE id = document_row.id;
  END LOOP;
END;
$$;
