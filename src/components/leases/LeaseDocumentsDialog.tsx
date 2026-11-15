import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { singleRowMutationError } from "@/lib/repo/mutationAcknowledgement";
import { useSettings } from "@/context/SettingsContext";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { DateInput } from "@/components/shared/DateInput";
import { Plus, Eye, Download, Trash2, FileText, Paperclip } from "lucide-react";
import { formatDate } from "@/lib/formatters";
import { usePortfolioWriteAccess } from "@/hooks/use-portfolio-write-access";
import type { Lease } from "@/types";
import {
  LEASE_DOCUMENT_STATUSES,
  buildLeaseDocumentTypeDefinitions,
  canCreateInitialContract,
  isMissingLeaseDocumentTypesTableError,
  hasInitialContract,
  isContractualDocument,
  isContractualDocumentType,
  leaseDocumentMimeType,
  shouldPromptInitialContractRevert,
  type LeaseDocumentStatus,
  type LeaseDocumentType,
} from "@/lib/leaseDocuments";

interface LeaseDocumentRow {
  id: string;
  lease_id: string;
  portfolio_id: string;
  document_type: LeaseDocumentType;
  status: LeaseDocumentStatus | null;
  signed_date: string | null;
  title: string;
  document_date: string;
  notes: string | null;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  original_filename: string;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

interface CustomDocumentTypeRow {
  id: string;
  portfolio_id: string;
  slug: string;
  label: string;
  created_at: string;
  updated_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leaseId: string;
  portfolioId: string;
  lease: Pick<Lease, "id" | "lifecycleStage" | "startDate" | "signedDate">;
  todayISO: string;
  onDocumentsChanged?: () => void;
}

const BUCKET = "lease-documents";
const MAX_BYTES = 20 * 1024 * 1024;
const FILE_ACCEPT = ".pdf,.doc,.docx,.jpg,.jpeg,.png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png";
const DOCUMENT_METADATA_NOTES_KEY = "__rentflowingLeaseDocumentMetadata";

interface DocumentMetadataNotes {
  documentType?: string;
  status?: LeaseDocumentStatus | null;
  signedDate?: string | null;
}

function readDocumentMetadataNotes(notes: string | null | undefined): DocumentMetadataNotes | null {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes) as Record<string, unknown>;
    const metadata = parsed?.[DOCUMENT_METADATA_NOTES_KEY] as DocumentMetadataNotes | undefined;
    if (!metadata || typeof metadata !== "object") return null;
    return metadata;
  } catch {
    return null;
  }
}

function normalizeDocumentRow(row: Partial<LeaseDocumentRow>): LeaseDocumentRow {
  const metadata = readDocumentMetadataNotes(row.notes);
  return {
    ...row,
    document_type: row.document_type ?? metadata?.documentType ?? "supporting",
    status: "status" in row ? row.status ?? null : metadata?.status ?? null,
    signed_date: "signed_date" in row ? row.signed_date ?? null : metadata?.signedDate ?? null,
    notes: row.notes ?? null,
  } as LeaseDocumentRow;
}

type DocumentWriteIdentity = Pick<LeaseDocumentRow,
  "id" | "lease_id" | "portfolio_id" | "document_type" | "status" | "signed_date" |
  "title" | "document_date" | "storage_path" | "original_filename">;

function confirmedDocumentRow(row: Partial<LeaseDocumentRow> | null, expected: DocumentWriteIdentity): LeaseDocumentRow {
  if (!row || !row.updated_at ||
      row.id !== expected.id || row.lease_id !== expected.lease_id ||
      row.portfolio_id !== expected.portfolio_id || row.document_type !== expected.document_type ||
      row.status !== expected.status || row.signed_date !== expected.signed_date ||
      row.title !== expected.title || row.document_date !== expected.document_date ||
      row.storage_path !== expected.storage_path || row.original_filename !== expected.original_filename) {
    throw new Error("The database did not confirm the requested document details. Reload before retrying; the uploaded file was retained.");
  }
  return normalizeDocumentRow(row);
}

function confirmedContractDocument(data: unknown, expected: DocumentWriteIdentity): LeaseDocumentRow {
  if (!data || typeof data !== "object" || Array.isArray(data) ||
      !("document" in data) || !data.document || typeof data.document !== "object" || Array.isArray(data.document) ||
      !("lease" in data) || !data.lease || typeof data.lease !== "object" || Array.isArray(data.lease)) {
    throw new Error("The database did not confirm the contractual document and lease. Reload before retrying.");
  }
  const row = data.document as Partial<LeaseDocumentRow>;
  const returnedLease = data.lease as { id?: unknown; portfolio_id?: unknown };
  if (returnedLease.id !== expected.lease_id || returnedLease.portfolio_id !== expected.portfolio_id) {
    throw new Error("The database returned a different lease for this document. Reload before retrying.");
  }
  return confirmedDocumentRow(row, expected);
}

function contractualWriteError(error: { code?: string; message: string }): Error {
  if (error.code === "PGRST202" || error.code === "42883") {
    return new Error("The contractual document database migration must be applied before saving documents.");
  }
  return new Error(error.message);
}

function allowedLeaseDocument(file: File): boolean {
  return leaseDocumentMimeType(file.name, file.type) !== null;
}

function missingContractualColumns(error: { message?: string; code?: string } | null): boolean {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    error?.code === "PGRST204"
    || error?.code === "42703"
    || message.includes("schema cache")
    || message.includes("could not find")
  ) && (
    message.includes("document_type")
    || message.includes("status")
    || message.includes("signed_date")
  );
}

function statusClassName(status: LeaseDocumentStatus): string {
  if (status === "draft") return "border-slate-300 bg-slate-50 text-slate-700";
  if (status === "validated") return "border-indigo-200 bg-indigo-50 text-indigo-700";
  if (status === "sent") return "border-sky-200 bg-sky-50 text-sky-700";
  if (status === "partially-signed") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "signed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-rose-200 bg-rose-50 text-rose-700";
}

export function LeaseDocumentsDialog({ open, onOpenChange, leaseId, portfolioId, lease, todayISO, onDocumentsChanged }: Props) {
  const { t, locale } = useSettings();
  const canWrite = usePortfolioWriteAccess();
  const { toast } = useToast();

  const [docs, setDocs] = useState<LeaseDocumentRow[]>([]);
  const [customDocumentTypes, setCustomDocumentTypes] = useState<CustomDocumentTypeRow[]>([]);
  const [documentSchemaError, setDocumentSchemaError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  // Upload form
  const [file, setFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState<LeaseDocumentType>("supporting");
  const [documentStatus, setDocumentStatus] = useState<LeaseDocumentStatus>("draft");
  const [signedDate, setSignedDate] = useState<string>(todayISO);
  const [title, setTitle] = useState("");
  const [docDate, setDocDate] = useState<string>(todayISO);
  const [saving, setSaving] = useState(false);
  const [deleteDoc, setDeleteDoc] = useState<LeaseDocumentRow | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingStatusChange, setPendingStatusChange] = useState<{ docId: string; status: LeaseDocumentStatus; signedDate: string } | null>(null);
  const [revertPromptOpen, setRevertPromptOpen] = useState(false);
  const documentLoadId = useRef(0);
  const typeLoadId = useRef(0);
  const [pendingRevertAction, setPendingRevertAction] = useState<
    | { kind: "delete"; doc: LeaseDocumentRow }
    | { kind: "status"; doc: LeaseDocumentRow; nextStatus: LeaseDocumentStatus }
    | null
  >(null);

  const initialContractExists = useMemo(() => hasInitialContract(leaseId, docs), [docs, leaseId]);
  const documentTypeDefinitions = useMemo(
    () => buildLeaseDocumentTypeDefinitions(customDocumentTypes),
    [customDocumentTypes],
  );
  const uploadIsContractual = isContractualDocumentType(documentType);

  const refreshDocumentTypes = useCallback(async () => {
    const loadId = ++typeLoadId.current;
    setCustomDocumentTypes([]);
    if (!portfolioId) return;
    const { data, error } = await supabase
      .from("lease_document_types")
      .select("*")
      .eq("portfolio_id", portfolioId)
      .order("label", { ascending: true });
    if (loadId !== typeLoadId.current) return;
    if (error) {
      if (isMissingLeaseDocumentTypesTableError(error)) {
        setCustomDocumentTypes([]);
        return;
      }
      toast({ title: t("documents.toast.error"), description: error.message, variant: "destructive" });
      return;
    }
    setCustomDocumentTypes((data ?? []) as CustomDocumentTypeRow[]);
  }, [portfolioId, t, toast]);

  const refresh = useCallback(async () => {
    const loadId = ++documentLoadId.current;
    setLoading(true);
    setDocs([]);
    setDocumentSchemaError(null);
    const { data, error } = await supabase
      .from("lease_documents")
      .select("*")
      .eq("lease_id", leaseId)
      .order("document_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (loadId !== documentLoadId.current) return;
    if (error) {
      setLoading(false);
      setDocumentSchemaError(error.message);
      toast({ title: t("documents.toast.error"), description: error.message, variant: "destructive" });
      return;
    }
    const { error: schemaError } = await supabase
      .from("lease_documents")
      .select("document_type,status,signed_date")
      .eq("lease_id", leaseId)
      .limit(1);
    if (loadId !== documentLoadId.current) return;
    setDocumentSchemaError(schemaError
      ? missingContractualColumns(schemaError) ? t("documents.error.migrationRequired") : schemaError.message
      : null);
    setLoading(false);
    setDocs((data ?? []).map((row) => normalizeDocumentRow(row as Partial<LeaseDocumentRow>)));
    onDocumentsChanged?.();
  }, [leaseId, onDocumentsChanged, t, toast]);

  useEffect(() => {
    if (open) {
      void refreshDocumentTypes();
      void refresh();
    } else {
      setDocs([]);
      setLoading(false);
      setUploadOpen(false);
      resetForm();
    }
    return () => {
      documentLoadId.current += 1;
      typeLoadId.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, refresh, refreshDocumentTypes]);

  const resetForm = () => {
    setFile(null); setTitle(""); setDocDate(todayISO);
    setDocumentType("supporting"); setDocumentStatus("draft"); setSignedDate(todayISO);
  };

  const openUpload = () => {
    if (!canWrite || loading || documentSchemaError) return;
    resetForm();
    setUploadOpen(true);
  };

  const visibleDocs = docs;

  const documentTypeLabel = (type: LeaseDocumentType) => {
    if (type === "initial-contract") return t("documents.type.initialContract");
    if (type === "amendment") return t("documents.type.amendment");
    if (type === "supporting") return t("documents.type.supporting");
    return documentTypeDefinitions.find((definition) => definition.slug === type)?.label ?? type;
  };

  const statusBadge = (status: LeaseDocumentStatus) => (
    <Badge variant="outline" className={`h-5 px-2 py-0 text-[10px] ${statusClassName(status)}`}>
      {statusLabel(status)}
    </Badge>
  );

  const statusLabel = (status: LeaseDocumentStatus) => {
    if (status === "draft") return t("documents.status.draft");
    if (status === "validated") return t("documents.status.validated");
    if (status === "sent") return t("documents.status.sent");
    if (status === "partially-signed") return t("documents.status.partiallySigned");
    if (status === "signed") return t("documents.status.signed");
    return t("documents.status.cancelled");
  };

  const openInTab = async (d: LeaseDocumentRow) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(d.storage_path, 60);
    if (error || !data) {
      toast({ title: t("documents.toast.error"), description: error?.message, variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const download = async (d: LeaseDocumentRow) => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(d.storage_path, 60, { download: d.original_filename });
    if (error || !data) {
      toast({ title: t("documents.toast.error"), description: error?.message, variant: "destructive" });
      return;
    }
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = d.original_filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const applyStatusChange = async (
    d: LeaseDocumentRow,
    nextStatus: LeaseDocumentStatus,
    nextSignedDate: string | null,
    keepLeaseSigned = true,
  ) => {
    if (!canWrite) return false;
    setActionBusy(true);
    const payload = {
      status: nextStatus,
      signed_date: nextStatus === "signed" ? nextSignedDate : null,
    };
    try {
      const { data, error } = await supabase.rpc("change_contract_document_status", {
        p_document_id: d.id,
        p_portfolio_id: portfolioId,
        p_expected_updated_at: d.updated_at,
        p_status: payload.status,
        p_signed_date: payload.signed_date,
        p_keep_lease_signed: d.document_type === "initial-contract" && d.status === "signed" && nextStatus !== "signed"
          ? keepLeaseSigned : null,
      });
      if (error) throw contractualWriteError(error);
      const updated = confirmedContractDocument(data, { ...d, ...payload });
      setDocs((prev) => prev.map((doc) => doc.id === d.id ? updated : doc));
      if (d.document_type === "initial-contract" && nextStatus === "signed" &&
          (lease.lifecycleStage === "draft" || lease.lifecycleStage === "pending-signature")) {
        toast({ title: t("documents.toast.leaseSigned") });
      }
      toast({ title: t("documents.toast.updated") });
      onDocumentsChanged?.();
      return true;
    } catch (error) {
      toast({ title: t("documents.toast.error"), description: error instanceof Error ? error.message : String(error), variant: "destructive" });
      return false;
    } finally {
      setActionBusy(false);
    }
  };

  const requestStatusChange = (d: LeaseDocumentRow, nextStatus: LeaseDocumentStatus) => {
    if (!canWrite) return;
    if (nextStatus === d.status) return;
    if (nextStatus === "signed") {
      setPendingStatusChange({ docId: d.id, status: nextStatus, signedDate: d.signed_date ?? todayISO });
      return;
    }
    if (shouldPromptInitialContractRevert(lease, d, todayISO)) {
      setPendingRevertAction({ kind: "status", doc: d, nextStatus });
      setRevertPromptOpen(true);
      return;
    }
    void applyStatusChange(d, nextStatus, null);
  };

  const performDelete = async (d: LeaseDocumentRow, keepLeaseSigned = true) => {
    if (!canWrite) return false;
    setActionBusy(true);
    try {
      if (isContractualDocument(d)) {
        const { data, error } = await supabase.rpc("delete_contract_document", {
          p_document_id: d.id,
          p_portfolio_id: portfolioId,
          p_expected_updated_at: d.updated_at,
          p_keep_lease_signed: d.document_type === "initial-contract" && d.status === "signed"
            ? keepLeaseSigned : null,
        });
        if (error) throw contractualWriteError(error);
        if (!data || typeof data !== "object" || Array.isArray(data) ||
            !("document_id" in data) || data.document_id !== d.id ||
            !("lease" in data) || !data.lease || typeof data.lease !== "object" ||
            (data.lease as { id?: unknown }).id !== d.lease_id ||
            (data.lease as { portfolio_id?: unknown }).portfolio_id !== portfolioId) {
          throw new Error("The database did not confirm the document deletion. Reload before retrying.");
        }
      } else {
        const { data, error } = await supabase.from("lease_documents")
          .delete().eq("id", d.id).eq("portfolio_id", portfolioId)
          .eq("updated_at", d.updated_at).select("id");
        const failure = singleRowMutationError(error, data, "Document deletion");
        if (failure) throw new Error(failure);
      }
      setDocs((prev) => prev.filter((doc) => doc.id !== d.id));
      onDocumentsChanged?.();
      const { error: rmErr } = await supabase.storage.from(BUCKET).remove([d.storage_path]);
      if (rmErr) {
        toast({ title: t("documents.toast.deleted"), description: `Document record deleted, but file cleanup failed: ${rmErr.message}`, variant: "destructive" });
        return true;
      }
      toast({ title: t("documents.toast.deleted") });
      return true;
    } catch (error) {
      toast({ title: t("documents.toast.error"), description: error instanceof Error ? error.message : String(error), variant: "destructive" });
      return false;
    } finally {
      setActionBusy(false);
    }
  };

  const requestDelete = (d: LeaseDocumentRow) => {
    if (!canWrite) return;
    setDeleteDoc(d);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteDoc) return;
    const d = deleteDoc;
    if (shouldPromptInitialContractRevert(lease, d, todayISO)) {
      setDeleteConfirmOpen(false);
      setDeleteDoc(null);
      setPendingRevertAction({ kind: "delete", doc: d });
      setRevertPromptOpen(true);
      return;
    }
    if (await performDelete(d)) {
      setDeleteConfirmOpen(false);
      setDeleteDoc(null);
    }
  };

  const resolveRevertPrompt = async (keepLeaseSigned: boolean) => {
    if (!pendingRevertAction) return;
    const action = pendingRevertAction;
    const saved = action.kind === "delete"
      ? await performDelete(action.doc, keepLeaseSigned)
      : await applyStatusChange(action.doc, action.nextStatus, null, keepLeaseSigned);
    if (saved) {
      setPendingRevertAction(null);
      setRevertPromptOpen(false);
    }
  };

  const handleSave = async () => {
    if (!canWrite) return;
    if (documentSchemaError) {
      toast({ title: t("documents.toast.error"), description: documentSchemaError, variant: "destructive" });
      return;
    }
    if (!file) {
      toast({ title: t("documents.error.fileRequired"), variant: "destructive" });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast({ title: t("documents.error.tooLarge"), variant: "destructive" });
      return;
    }
    const contentType = leaseDocumentMimeType(file.name, file.type);
    if (!contentType) {
      toast({ title: t("documents.toast.error"), description: "Only PDF, Word, JPG, and PNG lease documents can be uploaded.", variant: "destructive" });
      return;
    }
    const trimmed = title.trim();
    if (!trimmed) {
      toast({ title: t("documents.error.titleRequired"), variant: "destructive" });
      return;
    }
    if (!docDate) {
      toast({ title: t("documents.error.dateRequired"), variant: "destructive" });
      return;
    }
    if (documentType === "initial-contract" && !canCreateInitialContract(leaseId, docs)) {
      toast({ title: t("documents.toast.error"), description: t("documents.error.initialContractExists"), variant: "destructive" });
      return;
    }
    if (uploadIsContractual && documentStatus === "signed" && !signedDate) {
      toast({ title: t("documents.toast.error"), description: t("documents.error.signedDateRequired"), variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? null;
      const docId = crypto.randomUUID();
      const safeName = file.name.replace(/[^\w.-]+/g, "_");
      const path = `${portfolioId}/${leaseId}/${docId}/${safeName}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType,
      });
      if (upErr) throw upErr;

      const metadataStatus = uploadIsContractual ? documentStatus : null;
      const metadataSignedDate = uploadIsContractual && documentStatus === "signed" ? signedDate : null;
      const basePayload = {
        id: docId,
        lease_id: leaseId,
        portfolio_id: portfolioId,
        title: trimmed.slice(0, 200),
        document_date: docDate,
        notes: null,
        storage_path: path,
        mime_type: contentType,
        size_bytes: file.size,
        original_filename: file.name,
        uploaded_by: uid,
      };
      const documentPayload = {
        ...basePayload,
        document_type: documentType,
        status: metadataStatus,
        signed_date: metadataSignedDate,
      };
      let insertedRow: LeaseDocumentRow | null = null;
      let dbErr: { code?: string; message: string } | null = null;
      if (uploadIsContractual) {
        const result = await supabase.rpc("create_contract_document", { p_document: documentPayload });
        dbErr = result.error;
        if (!dbErr) insertedRow = confirmedContractDocument(result.data, documentPayload);
      } else {
        const result = await supabase.from("lease_documents")
          .insert(documentPayload).select("*").single();
        dbErr = result.error;
        if (!dbErr) insertedRow = confirmedDocumentRow(result.data as Partial<LeaseDocumentRow>, documentPayload);
      }
      if (dbErr) {
        const cause = missingContractualColumns(dbErr)
          ? "Lease document database migration is required before uploading documents."
          : uploadIsContractual ? contractualWriteError(dbErr).message : dbErr.message;
        const { data: persisted, error: lookupError } = await supabase.from("lease_documents")
          .select("*").eq("id", docId).eq("portfolio_id", portfolioId)
          .eq("lease_id", leaseId).maybeSingle();
        if (lookupError) {
          throw new Error(`${cause}; save outcome could not be verified. Reload before retrying. The uploaded file was retained.`);
        }
        if (persisted) {
          if (persisted.storage_path !== path) {
            throw new Error(`${cause}; save outcome did not match the uploaded file. Reload before retrying. The uploaded file was retained.`);
          }
          insertedRow = confirmedDocumentRow(persisted as Partial<LeaseDocumentRow>, documentPayload);
        } else {
          const { error: cleanupError } = await supabase.storage.from(BUCKET).remove([path]);
          throw new Error(cleanupError ? `${cause}; uploaded file cleanup failed: ${cleanupError.message}` : cause);
        }
      }
      if (!insertedRow) throw new Error("The database did not confirm the document. Reload before retrying.");
      toast({ title: t("documents.toast.added") });
      setDocs((prev) => [insertedRow, ...prev]);
      onDocumentsChanged?.();
      setUploadOpen(false);
      resetForm();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: t("documents.toast.uploadFailed"), description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {t("documents.title")}
            <span className="text-muted-foreground text-sm font-normal">({visibleDocs.length})</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-end">
          {canWrite && !uploadOpen && (
            <Button size="sm" className="h-8" onClick={openUpload} disabled={loading || !!documentSchemaError}>
              <Plus className="h-4 w-4 mr-1" />{t("documents.upload")}
            </Button>
          )}
        </div>
        {documentSchemaError && (
          <p role="alert" className="text-sm text-destructive">{documentSchemaError}</p>
        )}

        <div className="rounded border overflow-hidden">
          <Table className="[&_th]:px-2 [&_td]:px-2 [&_td]:text-sm">
            <TableHeader>
              <TableRow className="h-8">
                <TableHead className="h-8">{t("documents.col.title")}</TableHead>
                <TableHead className="h-8">{t("documents.col.type")}</TableHead>
                <TableHead className="h-8">{t("documents.col.status")}</TableHead>
                <TableHead className="h-8">{t("documents.col.date")}</TableHead>
                <TableHead className="h-8">{t("documents.col.files")}</TableHead>
                <TableHead className="h-8 text-right">{t("documents.col.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {canWrite && uploadOpen && (
                <TableRow className="align-top bg-muted/30">
                  <TableCell className="py-2 min-w-[180px]">
                    <Input
                      id="doc-title"
                      className="h-8 text-xs"
                      value={title}
                      maxLength={200}
                      placeholder={t("documents.titleField")}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </TableCell>
                  <TableCell className="py-2 min-w-[160px]">
                    <Select
                      value={documentType}
                      onValueChange={(value) => {
                        setDocumentType(value);
                        if (!isContractualDocumentType(value)) setDocumentStatus("draft");
                      }}
                    >
                      <SelectTrigger id="doc-type" className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {documentTypeDefinitions.map((definition) => {
                          if (definition.slug === "initial-contract" && initialContractExists) return null;
                          return (
                            <SelectItem key={definition.slug} value={definition.slug}>
                              {documentTypeLabel(definition.slug)}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    {initialContractExists && (
                      <p className="mt-1 text-[11px] text-muted-foreground">{t("documents.initialContractExists")}</p>
                    )}
                  </TableCell>
                  <TableCell className="py-2 min-w-[170px]">
                    {uploadIsContractual ? (
                      <div className="space-y-2">
                        <Select value={documentStatus} onValueChange={(value) => setDocumentStatus(value as LeaseDocumentStatus)}>
                          <SelectTrigger id="doc-status" className="h-8 text-xs">
                            {statusBadge(documentStatus)}
                          </SelectTrigger>
                          <SelectContent>
                            {LEASE_DOCUMENT_STATUSES.map((status) => (
                              <SelectItem key={status} value={status}>{statusBadge(status)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {documentStatus === "signed" && (
                          <DateInput
                            id="doc-signed-date"
                            className="h-8 text-xs"
                            value={signedDate}
                            aria-label={t("documents.signedDate")}
                            onChange={setSignedDate}
                          />
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="py-2">
                    <DateInput id="doc-date" className="h-8 text-xs min-w-[130px]" value={docDate} onChange={setDocDate} />
                  </TableCell>
                  <TableCell className="py-2 min-w-[150px] text-muted-foreground">
                    <span className="block max-w-[150px] truncate" title={file?.name ?? ""}>{file?.name ?? "—"}</span>
                  </TableCell>
                  <TableCell className="py-2 min-w-[240px]">
                    <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                      <Input
                        id="doc-file"
                        type="file"
                        accept={FILE_ACCEPT}
                        className="sr-only"
                        onChange={(e) => {
                          const f = e.target.files?.[0] ?? null;
                          if (f && !allowedLeaseDocument(f)) {
                            toast({ title: t("documents.toast.error"), description: "Only PDF, Word, JPG, and PNG lease documents can be uploaded.", variant: "destructive" });
                            e.target.value = "";
                            setFile(null);
                            return;
                          }
                          setFile(f);
                          if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ""));
                        }}
                      />
                      <Label
                        htmlFor="doc-file"
                        className="inline-flex h-8 max-w-[120px] cursor-pointer items-center gap-1 rounded-md border border-input bg-background px-2 text-xs font-medium hover:bg-accent hover:text-accent-foreground"
                        title={file?.name ?? t("documents.chooseFile")}
                      >
                        <Paperclip className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{t("documents.chooseFile")}</span>
                      </Label>
                      <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => { setUploadOpen(false); resetForm(); }} disabled={saving}>
                        {t("documents.cancel")}
                      </Button>
                      <Button size="sm" className="h-8 px-2" onClick={handleSave} disabled={saving}>
                        {saving ? t("documents.uploading") : t("documents.save")}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {loading ? (
                <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">…</TableCell></TableRow>
              ) : visibleDocs.length === 0 && !uploadOpen ? (
                <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">{t("documents.empty")}</TableCell></TableRow>
              ) : (
                visibleDocs.map(d => (
                  <TableRow key={d.id} className="h-9">
                    <TableCell className="py-1">
                      <button
                        className="text-left font-medium text-foreground hover:underline underline-offset-2"
                        onClick={() => openInTab(d)}
                      >
                        {d.title}
                      </button>
                    </TableCell>
                    <TableCell className="py-1 text-muted-foreground">{documentTypeLabel(d.document_type)}</TableCell>
                    <TableCell className="py-1">
                      {isContractualDocument(d) && d.status ? (
                        !canWrite ? statusBadge(d.status) : pendingStatusChange?.docId === d.id ? (
                          <div className="space-y-1.5">
                            <Select
                              value={pendingStatusChange.status}
                              onValueChange={(value) => {
                                const nextStatus = value as LeaseDocumentStatus;
                                if (nextStatus === "signed") {
                                  setPendingStatusChange({ ...pendingStatusChange, status: nextStatus });
                                  return;
                                }
                                setPendingStatusChange(null);
                                requestStatusChange(d, nextStatus);
                              }}
                              disabled={actionBusy}
                            >
                              <SelectTrigger className="h-8 w-[150px] text-xs">
                                {statusBadge(pendingStatusChange.status)}
                              </SelectTrigger>
                              <SelectContent>
                                {LEASE_DOCUMENT_STATUSES.map((status) => (
                                  <SelectItem key={status} value={status}>{statusBadge(status)}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <DateInput
                              className="h-8 w-[150px] text-xs"
                              value={pendingStatusChange.signedDate}
                              aria-label={t("documents.signedDate")}
                              onChange={(value) => setPendingStatusChange({ ...pendingStatusChange, signedDate: value })}
                            />
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                className="h-7 px-2 text-xs"
                                disabled={actionBusy || !pendingStatusChange.signedDate}
                                onClick={() => {
                                  void applyStatusChange(d, "signed", pendingStatusChange.signedDate).then((saved) => {
                                    if (saved) setPendingStatusChange(null);
                                  });
                                }}
                              >
                                {t("documents.save")}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs"
                                disabled={actionBusy}
                                onClick={() => setPendingStatusChange(null)}
                              >
                                {t("documents.cancel")}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Select value={d.status} onValueChange={(value) => requestStatusChange(d, value as LeaseDocumentStatus)} disabled={actionBusy}>
                            <SelectTrigger className="h-8 w-[150px] text-xs">
                              {statusBadge(d.status)}
                            </SelectTrigger>
                            <SelectContent>
                              {LEASE_DOCUMENT_STATUSES.map((status) => (
                                <SelectItem key={status} value={status}>{statusBadge(status)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                      {pendingStatusChange?.docId !== d.id && d.status === "signed" && d.signed_date && (
                        <div className="mt-1 text-[11px] text-muted-foreground">{formatDate(d.signed_date, locale)}</div>
                      )}
                    </TableCell>
                    <TableCell className="py-1 text-muted-foreground">{formatDate(d.document_date, locale)}</TableCell>
                    <TableCell className="py-1 min-w-[160px]">
                      <span className="block max-w-[160px] truncate text-muted-foreground" title={d.original_filename}>
                        {d.original_filename}
                      </span>
                    </TableCell>
                    <TableCell className="py-1 min-w-[150px]">
                      <div className="flex items-center gap-1 justify-end">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openInTab(d)} aria-label={t("documents.tooltip.view")}>
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t("documents.tooltip.view")}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => download(d)} aria-label={t("documents.tooltip.download")}>
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t("documents.tooltip.download")}</TooltipContent>
                        </Tooltip>
                        {canWrite && <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => requestDelete(d)} aria-label={t("documents.tooltip.delete")}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t("documents.tooltip.delete")}</TooltipContent>
                        </Tooltip>}
                        {canWrite && <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={openUpload} aria-label={t("documents.tooltip.attach")}>
                              <Paperclip className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t("documents.tooltip.attach")}</TooltipContent>
                        </Tooltip>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <AlertDialog open={canWrite && deleteConfirmOpen} onOpenChange={(nextOpen) => { if (!actionBusy) { setDeleteConfirmOpen(nextOpen); if (!nextOpen) setDeleteDoc(null); } }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("documents.deleteTitle")}</AlertDialogTitle>
              <AlertDialogDescription>{t("documents.confirmDelete")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={actionBusy}>{t("documents.cancel")}</AlertDialogCancel>
              <AlertDialogAction disabled={actionBusy} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={event => { event.preventDefault(); void confirmDelete(); }}>
                {t("documents.delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={canWrite && revertPromptOpen} onOpenChange={(nextOpen) => { if (!actionBusy) { setRevertPromptOpen(nextOpen); if (!nextOpen) setPendingRevertAction(null); } }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("documents.keepLeaseSignedTitle")}</AlertDialogTitle>
              <AlertDialogDescription>{t("documents.keepLeaseSignedDesc")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={actionBusy} onClick={event => { event.preventDefault(); void resolveRevertPrompt(false); }}>
                {t("documents.keepLeaseSignedNo")}
              </AlertDialogCancel>
              <AlertDialogAction disabled={actionBusy} onClick={event => { event.preventDefault(); void resolveRevertPrompt(true); }}>
                {t("documents.keepLeaseSignedYes")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
