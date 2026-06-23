import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSettings } from "@/context/SettingsContext";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, Eye, Download, Trash2, FileText } from "lucide-react";
import { formatDate } from "@/lib/formatters";

interface LeaseDocumentRow {
  id: string;
  lease_id: string;
  portfolio_id: string;
  title: string;
  document_date: string;
  notes: string | null;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  original_filename: string;
  uploaded_by: string | null;
  created_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leaseId: string;
  portfolioId: string;
}

const BUCKET = "lease-documents";
const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
]);
const ALLOWED_EXTENSIONS = new Set([".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png"]);
const FILE_ACCEPT = ".pdf,.doc,.docx,.jpg,.jpeg,.png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png";

function formatBytes(n: number | null): string {
  if (!n && n !== 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function allowedLeaseDocument(file: File): boolean {
  const dot = file.name.lastIndexOf(".");
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : "";
  return ALLOWED_EXTENSIONS.has(ext) && (!file.type || ALLOWED_MIME_TYPES.has(file.type));
}

export function LeaseDocumentsDialog({ open, onOpenChange, leaseId, portfolioId }: Props) {
  const { t, locale } = useSettings();
  const { toast } = useToast();

  const [docs, setDocs] = useState<LeaseDocumentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  // Upload form
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [docDate, setDocDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("lease_documents")
      .select("*")
      .eq("lease_id", leaseId)
      .order("document_date", { ascending: false })
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      toast({ title: t("documents.toast.error"), description: error.message, variant: "destructive" });
      return;
    }
    setDocs((data ?? []) as LeaseDocumentRow[]);
  }, [leaseId, t, toast]);

  useEffect(() => {
    if (open) {
      void refresh();
    } else {
      setUploadOpen(false);
      resetForm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const resetForm = () => {
    setFile(null); setTitle(""); setDocDate(new Date().toISOString().slice(0, 10));
    setNotes("");
  };

  const openUpload = () => {
    resetForm();
    setUploadOpen(true);
  };

  const visibleDocs = docs;

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

  const handleDelete = async (d: LeaseDocumentRow) => {
    if (!confirm(t("documents.confirmDelete"))) return;
    const { error: rmErr } = await supabase.storage.from(BUCKET).remove([d.storage_path]);
    if (rmErr) {
      toast({ title: t("documents.toast.error"), description: rmErr.message, variant: "destructive" });
      // Still try DB delete so it doesn't linger if file is already gone
    }
    const { error: dbErr } = await supabase.from("lease_documents").delete().eq("id", d.id);
    if (dbErr) {
      toast({ title: t("documents.toast.error"), description: dbErr.message, variant: "destructive" });
      return;
    }
    toast({ title: t("documents.toast.deleted") });
    void refresh();
  };

  const handleSave = async () => {
    if (!file) {
      toast({ title: t("documents.error.fileRequired"), variant: "destructive" });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast({ title: t("documents.error.tooLarge"), variant: "destructive" });
      return;
    }
    if (!allowedLeaseDocument(file)) {
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
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? null;
      const docId = crypto.randomUUID();
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${portfolioId}/${leaseId}/${docId}/${safeName}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || undefined,
      });
      if (upErr) throw upErr;

      const { error: dbErr } = await supabase.from("lease_documents").insert({
        id: docId,
        lease_id: leaseId,
        portfolio_id: portfolioId,
        title: trimmed.slice(0, 200),
        document_date: docDate,
        notes: notes.trim() ? notes.trim().slice(0, 1000) : null,
        storage_path: path,
        mime_type: file.type || null,
        size_bytes: file.size,
        original_filename: file.name,
        uploaded_by: uid,
      });
      if (dbErr) {
        // Rollback storage if the row failed
        await supabase.storage.from(BUCKET).remove([path]);
        throw dbErr;
      }
      toast({ title: t("documents.toast.added") });
      setUploadOpen(false);
      resetForm();
      void refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: t("documents.toast.error"), description: msg, variant: "destructive" });
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
          {!uploadOpen && (
            <Button size="sm" className="h-8" onClick={openUpload}>
              <Plus className="h-4 w-4 mr-1" />{t("documents.upload")}
            </Button>
          )}
        </div>

        {uploadOpen && (
          <div className="rounded border p-3 space-y-3 bg-muted/30">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label htmlFor="doc-file" className="text-xs">{t("documents.file")} <span className="text-muted-foreground">({t("documents.fileHint")})</span></Label>
                <Input
                  id="doc-file"
                  type="file"
                  accept={FILE_ACCEPT}
                  className="h-9"
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
              </div>
              <div>
                <Label htmlFor="doc-title" className="text-xs">{t("documents.titleField")}</Label>
                <Input id="doc-title" className="h-9" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="doc-date" className="text-xs">{t("documents.documentDate")}</Label>
                <Input id="doc-date" type="date" className="h-9" value={docDate} onChange={(e) => setDocDate(e.target.value)} />
              </div>
              <div className="col-span-2">
                <Label htmlFor="doc-notes" className="text-xs">{t("documents.notes")}</Label>
                <Textarea id="doc-notes" value={notes} maxLength={1000} rows={2} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" className="h-8" onClick={() => { setUploadOpen(false); resetForm(); }} disabled={saving}>
                {t("documents.cancel")}
              </Button>
              <Button size="sm" className="h-8" onClick={handleSave} disabled={saving}>
                {saving ? t("documents.uploading") : t("documents.save")}
              </Button>
            </div>
          </div>
        )}

        <div className="rounded border overflow-hidden">
          <Table className="[&_th]:px-2 [&_td]:px-2">
            <TableHeader>
              <TableRow className="h-8">
                <TableHead className="h-8">{t("documents.col.title")}</TableHead>
                <TableHead className="h-8">{t("documents.col.date")}</TableHead>
                <TableHead className="h-8">{t("documents.col.uploaded")}</TableHead>
                <TableHead className="h-8 text-right">{t("documents.col.size")}</TableHead>
                <TableHead className="h-8 w-[1%]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="py-6 text-center text-xs text-muted-foreground">…</TableCell></TableRow>
              ) : visibleDocs.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">{t("documents.empty")}</TableCell></TableRow>
              ) : (
                visibleDocs.map(d => (
                  <TableRow key={d.id} className="h-9">
                    <TableCell className="py-1 text-sm">
                      <button
                        className="text-left font-medium text-foreground hover:underline underline-offset-2"
                        onClick={() => openInTab(d)}
                      >
                        {d.title}
                      </button>
                      {d.notes && <div className="text-xs text-muted-foreground truncate max-w-[260px]">{d.notes}</div>}
                    </TableCell>
                    <TableCell className="py-1 text-sm text-muted-foreground">{formatDate(d.document_date, locale)}</TableCell>
                    <TableCell className="py-1 text-xs text-muted-foreground">{formatDate(d.created_at.slice(0, 10), locale)}</TableCell>
                    <TableCell className="py-1 text-right text-xs tabular-nums text-muted-foreground">{formatBytes(d.size_bytes)}</TableCell>
                    <TableCell className="py-1">
                      <div className="flex gap-1 justify-end">
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
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(d)} aria-label={t("documents.tooltip.delete")}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t("documents.tooltip.delete")}</TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
