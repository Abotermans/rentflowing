## Goal
Manage documents on a lease: upload, list, view (new tab), download, delete. Documents can optionally be linked to an amendment, and an amendment row exposes a shortcut to its documents.

## UX

### Entry points
- **Lease header** — new outline button `Documents (n)` next to Edit / status actions in `LeaseDetail.tsx`. Opens the modal in "all lease documents" mode.
- **Amendments table** — new icon column "Docs" with a paperclip button + small count badge per row. Opens the same modal, filtered to that amendment. The modal preselects the amendment in the upload form too.

### The modal (centered shadcn `Dialog`, project standard for CRUD)
Header: "Documents" + count. Optional sub-header chip "Filtered by amendment n°X — clear" when launched from an amendment row.

Toolbar (right-aligned): `Upload document` button (`h-8`, primary).

Body: dense `Table` matching existing lease tables.

| Title | Amendment | Document date | Uploaded | Size | Actions |
|---|---|---|---|---|---|

- **Title** — clickable, opens the file in a new tab (same as the eye icon).
- **Amendment** — "—" if none, else `n°{X} – {title}` linking to the amendment row.
- **Document date** — user-entered.
- **Uploaded** — `formatDate` + uploader name (from `profiles`).
- **Size** — human-readable.
- **Actions** — `Eye` (open new tab, signed URL), `Download` (signed URL with `download` param), `Trash2` (confirm dialog, any member).

Empty state: shared `EmptyState` pattern. Sorting via existing `useTableSort`.

### Upload form (inline panel inside the same modal, toggled by the Upload button — keeps the single-modal rule)
Fields:
- **File** (required, single file, `<input type="file">` with drag-drop zone; accept any type; client max 20 MB).
- **Title** (required, defaults to file name minus extension).
- **Document date** (required, defaults to today, `<input type="date">`).
- **Amendment** (optional `Select` of the lease's amendments; preselected when opened from a row).
- **Notes** (optional `Textarea`).

`Save` / `Cancel`. Save uploads to Storage then inserts the metadata row; toast on success/error.

### Amendment row column
Compact icon button (`h-7 w-7`, `Paperclip`) with a tiny numeric badge of attached docs (omit badge if 0). Opens modal filtered to that amendment. Tooltip: "Documents (n)".

## Data model

New private bucket `lease-documents`.
- Object path: `{portfolio_id}/{lease_id}/{document_id}/{original_filename}` — keeps tenants isolated and avoids collisions.

New table `public.lease_documents`:
- `id uuid pk`
- `lease_id uuid not null fk leases(id) on delete cascade`
- `amendment_id uuid null fk lease_amendments(id) on delete set null`
- `portfolio_id uuid not null` (denormalized for RLS + path)
- `title text not null`
- `document_date date not null`
- `notes text null`
- `storage_path text not null` (object path in bucket)
- `mime_type text null`
- `size_bytes bigint null`
- `original_filename text not null`
- `uploaded_by uuid null fk auth.users(id)`
- `created_at`, `updated_at`

GRANTs to `authenticated` + `service_role` (no `anon`). RLS: full CRUD for portfolio members via `is_portfolio_member(portfolio_id, auth.uid())`. `touch_updated_at` trigger.

Storage policies on `storage.objects` for bucket `lease-documents`: SELECT/INSERT/DELETE restricted to portfolio members, derived by joining the first path segment (`portfolio_id`) against `portfolio_members`.

## File operations
- **Upload**: `supabase.storage.from('lease-documents').upload(path, file)` → insert metadata row. Rollback row insert on storage failure and vice versa.
- **View**: `createSignedUrl(path, 60)` then `window.open(url, '_blank')`.
- **Download**: `createSignedUrl(path, 60, { download: original_filename })` then trigger an `<a>` click.
- **Delete**: remove storage object first, then delete row (best-effort; surface partial-failure toast).

## Implementation outline
1. **Migration** — create bucket via `supabase--storage_create_bucket` (private), then a migration creating `lease_documents`, GRANTs, RLS, trigger, and storage.objects policies.
2. **Context** — extend `AppContext` with `leaseDocuments` cache + `listLeaseDocuments(leaseId)`, `createLeaseDocument`, `deleteLeaseDocument`. Fetch on lease detail load.
3. **Component** — `src/components/leases/LeaseDocumentsDialog.tsx` (the centered Dialog described above). Reuses `useTableSort`, `EmptyState`, `formatDate`, signed-URL helpers.
4. **LeaseDetail** — add `documentsOpen` state, header button with count, render the dialog. Pass `initialAmendmentFilter` prop.
5. **AmendmentsSection** — add the `Paperclip` column with count badge, wire onClick to open the documents dialog (lift state via a callback prop from `LeaseDetail`, since the dialog lives there).
6. **i18n** — add `documents.title`, `documents.upload`, `documents.col.*`, `documents.empty`, `documents.confirmDelete`, `documents.filteredBy`, `documents.clearFilter`, `documents.tooltip.view`, `documents.tooltip.download`, `documents.tooltip.delete`, `documents.amendment`, `documents.notes`, `documents.size`, `amendments.tooltip.documents`, in EN + FR.
7. **Validation** — `zod` schema for the upload form (title non-empty ≤ 200 chars, date required, notes ≤ 1000 chars, file size ≤ 20 MB).

## Gaps in the original prompt (called out for confirmation later)
- **No versioning / revision history** — uploads are immutable; to "replace" you delete + re-upload. Confirm acceptable.
- **No bulk upload, multi-select, or zip download** — out of scope.
- **No preview thumbnails / inline PDF viewer** — "view" opens a new tab. Browser handles rendering.
- **No virus scanning** — relies on private bucket + portfolio-member ACL. Document this limitation.
- **No category/type field** (you opted out). Filter is only by amendment.
- **No audit trail of views/downloads** — only upload metadata is stored.
- **Deletion is hard-delete** — does NOT go through the domain-integrity layer (matches your "any member can delete anytime" choice). Note: this diverges from the project rule "never hard-delete records with history"; confirm documents are exempt.
- **Amendment unlink** — deleting an amendment sets `amendment_id` to NULL on its documents; the document stays in the lease list. Confirm vs. cascading delete.
- **File-size cap = 20 MB** (client-enforced; matches Lovable upload cap). Storage bucket itself has no per-file cap configured.
- **MIME whitelist** — none; any file type accepted. Confirm whether to restrict to pdf/doc/image.
