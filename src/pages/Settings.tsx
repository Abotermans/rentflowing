import { useSettings } from "@/context/SettingsContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Settings as SettingsIcon, Globe, CalendarClock, LayoutGrid, LogIn, FileText, Plus, Trash2 } from "lucide-react";
import { getTranslation, LOCALE_LABELS, type Locale } from "@/i18n/translations";
import { useToast } from "@/hooks/use-toast";
import { OPTIONAL_MODULES } from "@/config/modules";
import { usePortfolio } from "@/context/PortfolioContext";
import { supabase } from "@/integrations/supabase/client";
import { singleRowMutationError } from "@/lib/repo/mutationAcknowledgement";
import { useCallback, useEffect, useState } from "react";
import { formatDate } from "@/lib/formatters";
import {
  BUILT_IN_LEASE_DOCUMENT_TYPES,
  buildUniqueDocumentTypeSlug,
  documentTypeLabelExists,
  isMissingLeaseDocumentTypesTableError,
  normalizeDocumentTypeLabel,
  readLocalLeaseDocumentTypes,
  writeLocalLeaseDocumentTypes,
} from "@/lib/leaseDocuments";

interface CustomDocumentTypeRow {
  id: string;
  portfolio_id: string;
  slug: string;
  label: string;
  created_at: string;
  updated_at: string;
}

interface DocumentTypeUsageRow {
  id: string;
  title: string;
  original_filename: string;
  document_date: string;
  lease_id: string;
  leases?: { lease_reference?: string | null } | null;
}

export default function Settings() {
  const { locale, setLocale, t, receivableLeadDays, isModuleHidden, setModuleHidden } = useSettings();
  const { toast } = useToast();
  const { currentPortfolio, refresh } = usePortfolio();
  const callerRole = currentPortfolio?.role as string | undefined;
  const canManage = callerRole === "owner" || callerRole === "admin";
  const [showOccupancyOps, setShowOccupancyOps] = useState(false);
  const [leadDaysDraft, setLeadDaysDraft] = useState(String(receivableLeadDays));
  const [leadDaysBusy, setLeadDaysBusy] = useState(false);
  const [customDocumentTypes, setCustomDocumentTypes] = useState<CustomDocumentTypeRow[]>([]);
  const [newDocumentTypeLabel, setNewDocumentTypeLabel] = useState("");
  const [documentTypeBusy, setDocumentTypeBusy] = useState(false);
  const [documentTypeSchemaMissing, setDocumentTypeSchemaMissing] = useState(false);
  const [localDocumentTypes, setLocalDocumentTypes] = useState<CustomDocumentTypeRow[]>([]);
  const [blockedDocumentType, setBlockedDocumentType] = useState<{ label: string; usages: DocumentTypeUsageRow[] } | null>(null);

  const loadDocumentTypes = useCallback(async () => {
    if (!currentPortfolio) {
      setCustomDocumentTypes([]);
      setLocalDocumentTypes([]);
      return;
    }
    setLocalDocumentTypes(readLocalLeaseDocumentTypes(currentPortfolio.id) as CustomDocumentTypeRow[]);
    const { data, error } = await supabase
      .from("lease_document_types")
      .select("*")
      .eq("portfolio_id", currentPortfolio.id)
      .order("label", { ascending: true });
    if (error) {
      if (isMissingLeaseDocumentTypesTableError(error)) {
        setDocumentTypeSchemaMissing(true);
        setCustomDocumentTypes([]);
        return;
      }
      toast({ title: t("settings.saveFailed"), description: error.message, variant: "destructive" });
      return;
    }
    setDocumentTypeSchemaMissing(false);
    setCustomDocumentTypes((data ?? []) as CustomDocumentTypeRow[]);
  }, [currentPortfolio, t, toast]);

  useEffect(() => {
    void loadDocumentTypes();
  }, [loadDocumentTypes]);

  const documentTypeLabel = (slug: string, fallback: string) => {
    if (slug === "initial-contract") return t("documents.type.initialContract");
    if (slug === "amendment") return t("documents.type.amendment");
    if (slug === "supporting") return t("documents.type.supporting");
    return fallback;
  };

  const handleAddDocumentType = async () => {
    if (!currentPortfolio || !canManage) return;
    if (documentTypeSchemaMissing) {
      toast({ title: t("settings.saveFailed"), description: t("settings.documentTypesMigrationRequired"), variant: "destructive" });
      return;
    }
    const label = normalizeDocumentTypeLabel(newDocumentTypeLabel);
    if (!label) {
      toast({ title: t("common.validationError"), description: t("settings.documentTypesNameRequired"), variant: "destructive" });
      return;
    }
    if (documentTypeLabelExists(label, customDocumentTypes)) {
      toast({ title: t("common.validationError"), description: t("settings.documentTypesDuplicate"), variant: "destructive" });
      return;
    }
    const slug = buildUniqueDocumentTypeSlug(label, customDocumentTypes.map((type) => type.slug));
    setDocumentTypeBusy(true);
    const { data, error } = await supabase.from("lease_document_types").insert({
      portfolio_id: currentPortfolio.id,
      slug,
      label,
    }).select("id");
    setDocumentTypeBusy(false);
    const failure = singleRowMutationError(error, data, "Document type creation");
    if (failure) {
      if (isMissingLeaseDocumentTypesTableError(error)) {
        setDocumentTypeSchemaMissing(true);
      }
      toast({ title: t("settings.saveFailed"), description: failure, variant: "destructive" });
      return;
    }
    setNewDocumentTypeLabel("");
    toast({ title: t("settings.saved") });
    void loadDocumentTypes();
  };

  const handleRemoveDocumentType = async (type: CustomDocumentTypeRow) => {
    if (!currentPortfolio || !canManage) return;
    if (documentTypeSchemaMissing) {
      toast({ title: t("settings.saveFailed"), description: t("settings.documentTypesMigrationRequired"), variant: "destructive" });
      return;
    }
    setDocumentTypeBusy(true);
    const { data, error } = await supabase
      .from("lease_documents")
      .select("id, title, original_filename, document_date, lease_id, leases:lease_id(lease_reference)")
      .eq("portfolio_id", currentPortfolio.id)
      .eq("document_type", type.slug)
      .order("document_date", { ascending: false })
      .limit(25);
    if (error) {
      setDocumentTypeBusy(false);
      toast({ title: t("settings.saveFailed"), description: error.message, variant: "destructive" });
      return;
    }
    const usages = (data ?? []) as DocumentTypeUsageRow[];
    if (usages.length > 0) {
      setDocumentTypeBusy(false);
      setBlockedDocumentType({ label: type.label, usages });
      return;
    }
    const { data: deletedRows, error: deleteError } = await supabase.from("lease_document_types").delete().eq("id", type.id).select("id");
    setDocumentTypeBusy(false);
    if (deleteError) {
      if (isMissingLeaseDocumentTypesTableError(deleteError)) {
        setDocumentTypeSchemaMissing(true);
      }
      toast({ title: t("settings.saveFailed"), description: deleteError.message, variant: "destructive" });
      return;
    }
    const deleteFailure = singleRowMutationError(deleteError, deletedRows, "Document type deletion");
    if (deleteFailure) {
      toast({ title: t("settings.saveFailed"), description: deleteFailure, variant: "destructive" });
      return;
    }
    toast({ title: t("settings.saved") });
    void loadDocumentTypes();
  };

  const importLocalDocumentTypes = async () => {
    if (!currentPortfolio || !canManage || documentTypeSchemaMissing || !localDocumentTypes.length) return;
    setDocumentTypeBusy(true);
    try {
      const existing = new Map(customDocumentTypes.map((type) => [type.slug, type]));
      for (const type of localDocumentTypes) {
        const matching = existing.get(type.slug);
        if (matching) {
          if (normalizeDocumentTypeLabel(matching.label) === normalizeDocumentTypeLabel(type.label)) continue;
          if (matching.label !== matching.slug) {
            throw new Error(`Document type ${type.slug} has a different saved label. Resolve the conflict before importing local types.`);
          }
          const { data, error } = await supabase.from("lease_document_types")
            .update({ label: type.label }).eq("id", matching.id).select("id");
          const failure = singleRowMutationError(error, data, "Document type label recovery");
          if (failure) throw new Error(failure);
          matching.label = type.label;
          continue;
        }
        const { data, error } = await supabase.from("lease_document_types")
          .insert({ portfolio_id: currentPortfolio.id, slug: type.slug, label: type.label })
          .select("id");
        const failure = singleRowMutationError(error, data, "Document type import");
        if (failure) throw new Error(failure);
        existing.set(type.slug, type);
      }
      writeLocalLeaseDocumentTypes(currentPortfolio.id, []);
      setLocalDocumentTypes([]);
      await loadDocumentTypes();
      toast({ title: t("settings.saved") });
    } catch (error) {
      toast({ title: t("settings.saveFailed"), description: error instanceof Error ? error.message : String(error), variant: "destructive" });
      await loadDocumentTypes();
    } finally {
      setDocumentTypeBusy(false);
    }
  };

  useEffect(() => {
    if (currentPortfolio) setShowOccupancyOps(!!currentPortfolio.show_occupancy_operations);
  }, [currentPortfolio]);

  const toggleOccupancyOps = async (checked: boolean) => {
    if (!currentPortfolio) return;
    setShowOccupancyOps(checked);
    const { data, error } = await supabase
      .from("portfolios")
      .update({ show_occupancy_operations: checked })
      .eq("id", currentPortfolio.id)
      .select("id");
    const failure = singleRowMutationError(error, data, "Occupancy setting update");
    if (failure) {
      setShowOccupancyOps(!checked);
      toast({ title: t("settings.saveFailed"), description: failure, variant: "destructive" });
      return;
    }
    toast({ title: t("settings.saved") });
    refresh();
  };

  const handleLocaleChange = (value: string) => {
    const nextLocale = value as Locale;
    setLocale(nextLocale);
    toast({ title: getTranslation(nextLocale, "settings.saved") });
  };

  useEffect(() => setLeadDaysDraft(String(receivableLeadDays)), [currentPortfolio?.id, receivableLeadDays]);

  const saveLeadDays = async () => {
    if (!currentPortfolio || !canManage || leadDaysBusy) return;
    const days = Number(leadDaysDraft);
    if (!Number.isInteger(days) || days < 0 || days > 120 || leadDaysDraft.trim() === "") {
      setLeadDaysDraft(String(receivableLeadDays));
      toast({ title: t("settings.saveFailed"), description: t("settings.receivableLeadDaysInvalid"), variant: "destructive" });
      return;
    }
    if (days === receivableLeadDays) return;
    setLeadDaysBusy(true);
    try {
      const { data, error } = await supabase.from("portfolios")
        .update({ receivable_lead_days: days })
        .eq("id", currentPortfolio.id)
        .select("id");
      const failure = singleRowMutationError(error, data, "Receivable lead time update");
      if (failure) throw new Error(failure);
      await refresh();
      toast({ title: t("settings.saved") });
    } catch (error) {
      setLeadDaysDraft(String(receivableLeadDays));
      toast({ title: t("settings.saveFailed"), description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally {
      setLeadDaysBusy(false);
    }
  };

  return (
    <div className="page-shell">
      <div className="flex items-center gap-3">
        <SettingsIcon className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="page-title">{t("settings.title")}</h1>
        </div>
      </div>

      <Separator />

      <div className="w-full space-y-6">
        {/* General Section */}
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-4">{t("settings.general")}</h2>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">{t("settings.language")}</CardTitle>
              </div>
              <CardDescription>{t("settings.languageDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Select value={locale} onValueChange={handleLocaleChange}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(LOCALE_LABELS) as [Locale, string][]).map(([code, label]) => (
                    <SelectItem key={code} value={code}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        </div>

        {/* Documents Section */}
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-4">{t("settings.documents")}</h2>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">{t("settings.documentTypes")}</CardTitle>
              </div>
              <CardDescription>{t("settings.documentTypesDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-x-auto rounded-md border">
                <Table className="min-w-[720px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("settings.documentTypesColumnName")}</TableHead>
                      <TableHead>{t("settings.documentTypesColumnSource")}</TableHead>
                      <TableHead>{t("settings.documentTypesColumnBehavior")}</TableHead>
                      <TableHead className="text-right">{t("settings.documentTypesColumnActions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {BUILT_IN_LEASE_DOCUMENT_TYPES.map((type) => (
                      <TableRow key={type.slug}>
                        <TableCell className="font-medium">{documentTypeLabel(type.slug, type.label)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="h-5 px-1.5 text-xs">
                            {t("settings.documentTypesDefault")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {type.contractual ? t("settings.documentTypesContractual") : t("settings.documentTypesSupporting")}
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">-</TableCell>
                      </TableRow>
                    ))}
                    {customDocumentTypes.map((type) => (
                      <TableRow key={type.id}>
                        <TableCell className="font-medium">{type.label}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                            {t("settings.documentTypesCustom")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{t("settings.documentTypesCustomHelp")}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            disabled={!canManage || documentTypeBusy}
                            onClick={() => void handleRemoveDocumentType(type)}
                            aria-label={t("settings.documentTypesRemove")}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  value={newDocumentTypeLabel}
                  onChange={(event) => setNewDocumentTypeLabel(event.target.value)}
                  placeholder={t("settings.documentTypesPlaceholder")}
                  maxLength={80}
                  disabled={!canManage || !currentPortfolio || documentTypeBusy || documentTypeSchemaMissing}
                />
                <Button type="button" className="gap-1" disabled={!canManage || !currentPortfolio || documentTypeBusy || documentTypeSchemaMissing} onClick={() => void handleAddDocumentType()}>
                  <Plus className="h-4 w-4" />{t("settings.documentTypesAdd")}
                </Button>
              </div>
              {documentTypeSchemaMissing && (
                <p className="text-xs text-destructive">{t("settings.documentTypesMigrationRequired")}</p>
              )}
              {localDocumentTypes.length > 0 && (
                <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>{t("settings.documentTypesLocalDrafts").replace("{count}", String(localDocumentTypes.length))}</span>
                  <Button type="button" variant="outline" size="sm" disabled={!canManage || documentTypeBusy || documentTypeSchemaMissing} onClick={() => void importLocalDocumentTypes()}>
                    {t("settings.documentTypesImportLocal")}
                  </Button>
                </div>
              )}
              {!canManage && currentPortfolio && (
                <p className="text-xs text-muted-foreground">{t("settings.adminOnly")}</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Receivables Section */}
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-4">{t("settings.receivables")}</h2>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">{t("settings.receivableLeadDays")}</CardTitle>
              </div>
              <CardDescription>{t("settings.receivableLeadDaysDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={120}
                  className="w-32"
                  value={leadDaysDraft}
                  onChange={(e) => setLeadDaysDraft(e.target.value)}
                  onBlur={() => void saveLeadDays()}
                  onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                  disabled={!canManage || leadDaysBusy}
                />
                <span className="text-sm text-muted-foreground">{t("settings.daysBeforeDue")}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Navigation / Modules visibility */}
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-4">{t("settings.navigation")}</h2>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <LayoutGrid className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">{t("settings.modulesVisibility")}</CardTitle>
              </div>
              <CardDescription>{t("settings.modulesVisibilityDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              {OPTIONAL_MODULES.map((mod, idx) => {
                const hidden = isModuleHidden(mod.key);
                const id = `module-toggle-${mod.key}`;
                return (
                  <div key={mod.key}>
                    {idx > 0 && <Separator className="my-2" />}
                    <div className="flex items-start justify-between gap-4 py-2">
                      <div className="min-w-0">
                        <Label htmlFor={id} className="text-sm font-medium text-foreground cursor-pointer">
                          {t(mod.labelKey)}
                        </Label>
                        <p className="text-xs text-muted-foreground mt-0.5">{t(mod.descriptionKey)}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground">
                          {hidden ? t("settings.moduleHidden") : t("settings.moduleVisible")}
                        </span>
                        <Switch
                          id={id}
                          checked={!hidden}
                          onCheckedChange={(checked) => {
                            setModuleHidden(mod.key, !checked);
                            toast({ title: t("settings.saved") });
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        {/* Leases / Occupancy operations */}
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-4">{t("settings.leases")}</h2>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <LogIn className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">{t("settings.occupancyOpsTitle")}</CardTitle>
              </div>
              <CardDescription>{t("settings.occupancyOpsDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="show-occupancy-ops" className="text-sm font-medium text-foreground">
                  {showOccupancyOps ? t("settings.moduleVisible") : t("settings.moduleHidden")}
                </Label>
                <Switch
                  id="show-occupancy-ops"
                  checked={showOccupancyOps}
                  onCheckedChange={toggleOccupancyOps}
                  disabled={!canManage || !currentPortfolio}
                />
              </div>
              {!canManage && currentPortfolio && (
                <p className="text-xs text-muted-foreground mt-2">{t("settings.adminOnly")}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      <AlertDialog open={!!blockedDocumentType} onOpenChange={(open) => { if (!open) setBlockedDocumentType(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.documentTypesRemoveBlockedTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {blockedDocumentType
                ? t("settings.documentTypesRemoveBlockedDesc").replace("{type}", blockedDocumentType.label)
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-72 space-y-2 overflow-auto rounded-md border border-border p-2">
            {blockedDocumentType?.usages.map((usage) => (
              <div key={usage.id} className="rounded-sm bg-muted/40 p-2 text-sm">
                <div className="font-medium text-foreground">{usage.title}</div>
                <div className="text-xs text-muted-foreground">
                  {(usage.leases?.lease_reference ?? usage.lease_id)} · {usage.original_filename} · {formatDate(usage.document_date, locale)}
                </div>
              </div>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogAction>{t("action.close")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
