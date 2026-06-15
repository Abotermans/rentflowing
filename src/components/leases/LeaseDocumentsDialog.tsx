import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSettings } from "@/context/SettingsContext";
import { useAppData } from "@/context/AppContext";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Plus, Eye, Download, Trash2, X, FileText } from "lucide-react";
import { formatDate } from "@/lib/formatters";
import { getLeaseAmendments } from "@/lib/amendments";
import { useIntegrityState } from "@/hooks/use-integrity-state";

interface LeaseDocumentRow {
  id: string;
  lease_id: string;
  amendment_id: string | null;
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
  initialAmendmentFilter?: string | null;
}

const BUCKET = "lease-documents";
const MAX_BYTES = 20 * 1024 * 1024;

function formatBytes(n: number | null): string {
  if (!n && n !== 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function LeaseDocumentsDialog({ open, onOpenChange, leaseId, portfolioId, initialAmendmentFilter }: Props) {
  const { t, locale } = useSettings();
  const { toast } = useToast();
  const s = useIntegrityState();
  const { leases } = useAppData();
  const lease = leases.find(l => l.id === leaseId);
  const amendments = useMemo(
    () => (lease ? getLeaseAmendments(leaseId, s.amendments) : []),
    [lease, leaseId, s.amendments],
  );

  const [docs, setDocs] = useState<LeaseDocumentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [filterAmendmentId, setFilterAmendmentId] = useState<string | null>(initialAmendmentFilter ?? null);

  // Upload form
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [docDate, setDocDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [amendmentId, setAmendmentId] = useState<string>("none");
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
      setFilterAmendmentId(initialAmendmentFilter ?? null);
      void refresh();
    } else {
      setUploadOpen(false);
      resetForm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialAmendmentFilter]);

  const resetForm = () => {
    setFile(null); setTitle(""); setDocDate(new Date().toISOString().slice(0, 10));
    setAmendmentId(initialAmendmentFilter ?? "none"); setNotes("");
  };

  const openUpload = () => {
    resetForm();
    if (initialAmendmentFilter || filterAmendmentId) {
      setAmendmentId(initialAmendmentFilter ?? filterAmendmentId ?? "none");
    }
    setUploadOpen(true);
  };

  const visibleDocs = useMemo(() => {
    if (!filterAmendmentId) return docs;
    return docs.filter(d => d.amendment_id === filterAmendmentId);
  }, [docs, filterAmendmentId]);

  const amendmentLabel = (id: string | null) => {
    if (!id) return null;
    const a = amendments.find(x => x.id === id);
    if (!a) return `n°?`;
    return `n°${a.amendmentNumber} – ${a.title}`;
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
        amendment_id: amendmentId === "none" ? null : amendmentId,
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

        {filterAmendmentId && (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1">
              {t("documents.filteredBy").replace(
                "{n}",
                String(amendments.find(a => a.id === filterAmendmentId)?.amendmentNumber ?? "?"),
              )}
              <button onClick={() => setFilterAmendmentId(null)} className="ml-1" aria-label={t("documents.clearFilter")}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          </div>
        )}

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
                  className="h-9"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
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
              <div>
                <Label className="text-xs">{t("documents.amendment")}</Label>
                <Select value={amendmentId} onValueChange={setAmendmentId}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("documents.amendmentNone")}</SelectItem>
                    {amendments.map(a => (
                      <SelectItem key={a.id} value={a.id}>n°{a.amendmentNumber} – {a.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                <TableHead className="h-8">{t("documents.col.amendment")}</TableHead>
                <TableHead className="h-8">{t("documents.col.date")}</TableHead>
                <TableHead className="h-8">{t("documents.col.uploaded")}</TableHead>
                <TableHead className="h-8 text-right">{t("documents.col.size")}</TableHead>
                <TableHead className="h-8 w-[1%]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="py-6 text-center text-xs text-muted-foreground">…</TableCell></TableRow>
              ) : visibleDocs.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">{t("documents.empty")}</TableCell></TableRow>
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
                    <TableCell className="py-1 text-sm text-muted-foreground">
                      {d.amendment_id ? amendmentLabel(d.amendment_id) : "—"}
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