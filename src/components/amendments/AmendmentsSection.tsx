import { useEffect, useMemo, useState } from "react";
import { useAppData } from "@/context/AppContext";
import { useSettings } from "@/context/SettingsContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, FileEdit, Eye, Trash2, AlertTriangle, Undo2, ChevronDown, Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCurrency, formatDate } from "@/lib/formatters";
import {
  getEffectiveLeaseTerms, getOriginalLeaseTerms, getLeaseAmendments,
} from "@/lib/amendments";
import { AmendmentDialog } from "./AmendmentDialog";
import { AmendmentChangesDialog } from "./AmendmentChangesDialog";
import type { LeaseAmendment, AmendmentStatus } from "@/types/amendments";
import { useIntegrityState } from "@/hooks/use-integrity-state";

interface Props {
  leaseId: string;
  newAmendmentSignal?: number;
  documentCounts?: Record<string, number>;
  onOpenDocuments?: (amendmentId: string) => void;
}

const STATUS_CLS: Record<AmendmentStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-primary/15 text-primary border-primary/30",
  active: "bg-success/15 text-success border-success/30",
  ended: "bg-muted text-muted-foreground",
  terminated: "bg-muted text-muted-foreground line-through",
};

export function AmendmentsSection({ leaseId, newAmendmentSignal, documentCounts, onOpenDocuments }: Props) {
  const { t, locale } = useSettings();
  const {
    leases, units, tenants,
    deleteAmendment,
    revertAmendmentToDraft, getAmendmentChanges,
  } = useAppData();
  const s = useIntegrityState();
  const lease = leases.find(l => l.id === leaseId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LeaseAmendment | null>(null);
  const [sectionOpen, setSectionOpen] = useState(true);
  const [changesDialog, setChangesDialog] = useState<LeaseAmendment | null>(null);

  useEffect(() => {
    if (newAmendmentSignal && newAmendmentSignal > 0) {
      setEditing(null);
      setDialogOpen(true);
    }
  }, [newAmendmentSignal]);

  const ams = useMemo(() => getLeaseAmendments(leaseId, s.amendments), [leaseId, s.amendments]);
  const current = useMemo(
    () => lease ? getEffectiveLeaseTerms(leaseId, new Date().toISOString().slice(0, 10), s) : null,
    [lease, leaseId, s],
  );
  const original = useMemo(() => lease ? getOriginalLeaseTerms(leaseId, s) : null, [lease, leaseId, s]);

  if (!lease) return null;
  const currency = "EUR";
  const currentEndDate = current?.endDate ?? lease.endDate;

  const unitLabel = (id: string) => units.find(u => u.id === id)?.unitCode ?? id;
  const tenantLabel = (id: string) => {
    const tn = tenants.find(x => x.id === id);
    return tn ? `${tn.firstName} ${tn.lastName}` : id;
  };

  const openEdit = (a: LeaseAmendment) => { setEditing(a); setDialogOpen(true); };

  const renderTermsAsList = (terms: NonNullable<typeof current>) => {
    const sortedUnits = terms.units.slice().sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0));
    const coTenants = terms.coTenantIds;
    const sumR = sortedUnits.reduce((s, u) => s + (u.rentShare ?? 0), 0);
    const sumC = sortedUnits.reduce((s, u) => s + (u.chargesShare ?? 0), 0);
    const grand = sumR + sumC;
    return (
      <div className="space-y-4">
      <div className="space-y-4">
          <div className="flex flex-wrap gap-x-8 gap-y-2 items-start">
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">{t("leases.tenant")}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium text-foreground">{tenantLabel(terms.primaryTenantId)}</span>
                </div>
                {coTenants.map(id => (
                  <div key={id} className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-foreground">{tenantLabel(id)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div><p className="text-xs text-muted-foreground mb-1">{t("leases.noticePeriod")}</p><p className="text-sm font-medium text-foreground">{terms.noticePeriodText || "—"}</p></div>
            <div><p className="text-xs text-muted-foreground mb-1">Deposit</p><p className="text-sm font-medium text-foreground">{terms.depositAmount != null ? formatCurrency(terms.depositAmount, currency, locale) : "—"}</p></div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">
              {sortedUnits.length > 1 ? `${t("table.unit")}s` : t("table.unit")}
            </p>
            <div className="rounded border overflow-hidden">
              <Table className="[&_th]:px-2 [&_td]:px-2">
                <TableHeader>
                  <TableRow className="h-8">
                    <TableHead className="h-8 text-sm">{t("leases.col.unit")}</TableHead>
                    <TableHead className="h-8 text-sm">{t("leases.col.role")}</TableHead>
                    <TableHead className="h-8 text-sm">{t("leases.col.start")}</TableHead>
                    <TableHead className="h-8 text-sm">{t("leases.col.signed")}</TableHead>
                    <TableHead className="h-8 text-sm">{t("leases.col.end")}</TableHead>
                    <TableHead className="h-8 text-sm text-right">{t("leases.col.rentShare")}</TableHead>
                    <TableHead className="h-8 text-sm text-right">{t("leases.col.chargesShare")}</TableHead>
                    <TableHead className="h-8 text-sm text-right">{t("common.total")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedUnits.map(u => {
                    const rowTotal = (u.rentShare ?? 0) + (u.chargesShare ?? 0);
                    return (
                      <TableRow key={u.unitId} className="h-9">
                        <TableCell className="py-1 text-sm font-medium text-foreground">{unitLabel(u.unitId)}</TableCell>
                        <TableCell className="py-1">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${u.isPrimary ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                            {u.isPrimary ? t("leases.role.primary") : t("leases.role.secondary")}
                          </span>
                        </TableCell>
                        <TableCell className="py-1 text-sm text-muted-foreground">{formatDate(lease.startDate, locale)}</TableCell>
                        <TableCell className="py-1 text-sm text-muted-foreground">{lease.signedDate ? formatDate(lease.signedDate, locale) : "—"}</TableCell>
                        <TableCell className="py-1 text-sm text-muted-foreground">{formatDate(terms.endDate, locale)}</TableCell>
                        <TableCell className="py-1 text-right text-sm tabular-nums">{formatCurrency(u.rentShare ?? 0, currency, locale)}</TableCell>
                        <TableCell className="py-1 text-right text-sm tabular-nums">{formatCurrency(u.chargesShare ?? 0, currency, locale)}</TableCell>
                        <TableCell className="py-1 text-right text-sm font-medium tabular-nums">{formatCurrency(rowTotal, currency, locale)}</TableCell>
                      </TableRow>
                    );
                  })}
                  {sortedUnits.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="py-3 text-center text-xs text-muted-foreground">—</TableCell></TableRow>
                  )}
                  {sortedUnits.length > 0 && (
                    <TableRow className="border-t border-border bg-muted/30 h-9">
                      <TableCell colSpan={5} className="py-1 text-sm font-medium text-muted-foreground">Σ</TableCell>
                      <TableCell className="py-1 text-right text-sm font-semibold text-foreground tabular-nums">{formatCurrency(sumR, currency, locale)}</TableCell>
                      <TableCell className="py-1 text-right text-sm font-semibold text-foreground tabular-nums">{formatCurrency(sumC, currency, locale)}</TableCell>
                      <TableCell className="py-1 text-right text-sm font-semibold text-primary tabular-nums">{formatCurrency(grand, currency, locale)}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Collapsible open={sectionOpen} onOpenChange={setSectionOpen}>
    <Card>
      <CollapsibleTrigger asChild>
        <CardHeader className="py-3 cursor-pointer flex-row items-center space-y-0">
          <CardTitle className="text-base font-medium flex items-center gap-1.5 flex-1 justify-start">
            {t("amendments.title")} <span className="text-muted-foreground">({ams.length})</span>
          </CardTitle>
          <div className="flex items-center gap-2">
            {lease.lifecycleStage !== "draft" && (
              <Button size="sm" className="h-8" onClick={(e) => { e.stopPropagation(); setEditing(null); setDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-1" />{t("amendments.add")}
              </Button>
            )}
            <span className="inline-flex items-center justify-center h-7 w-7">
              <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", sectionOpen && "rotate-180")} />
            </span>
          </div>
        </CardHeader>
      </CollapsibleTrigger>
      <CollapsibleContent>
      <CardContent>
        <Tabs defaultValue="timeline" className="w-full">
          <TabsList className="h-8">
            <TabsTrigger value="timeline" className="text-xs">{t("amendments.timeline")}</TabsTrigger>
            <TabsTrigger value="original" className="text-xs">{t("amendments.originalTerms")}</TabsTrigger>
          </TabsList>

          <TabsContent value="timeline" className="pt-3">
            {ams.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">{t("amendments.empty")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="h-8">#</TableHead>
                    <TableHead className="h-8">{t("amendments.type")}</TableHead>
                    <TableHead className="h-8">{t("amendments.titleField")}</TableHead>
                    <TableHead className="h-8">{t("amendments.effectiveDate")}</TableHead>
                    <TableHead className="h-8">{t("amendments.col.changes")}</TableHead>
                    <TableHead className="h-8">{t("amendments.status")}</TableHead>
                    <TableHead className="h-8 w-1" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ams.map(a => {
                    const chs = getAmendmentChanges(a.id);
                    const hasGap = a.effectiveDate > currentEndDate;
                    return (
                       <TableRow
                         key={a.id}
                         className="cursor-pointer hover:bg-accent/30"
                         onClick={() => openEdit(a)}
                       >
                         <TableCell className="py-1.5">{a.amendmentNumber}</TableCell>
                         <TableCell className="py-1.5">
                           {a.amendmentType === "mixed" ? (() => {
                             const cats = Array.from(new Set(chs.map(c => {
                               switch (c.fieldName) {
                                 case "baseMonthlyRentTotal":
                                 case "unitRentShare": return "rent-change";
                                 case "baseMonthlyChargesTotal":
                                 case "unitChargesShare": return "charges-change";
                                 case "leaseEndDate":
                                   return String(c.newValue) > lease.endDate ? "term-extension" : "term-shortening";
                                 case "depositAmount": return "deposit-change";
                                 case "noticePeriodText": return "notice-change";
                                 case "clauseSummary": return "clause-change";
                                 case "unitAssignments":
                                   return c.changeType === "add" ? "unit-addition" : "unit-removal";
                                 case "coTenantIds":
                                   return c.changeType === "add" ? "tenant-addition" : "tenant-removal";
                                 default: return null;
                               }
                             }).filter(Boolean) as string[]));
                             const list = cats.map(c => t(`amendments.type.${c}` as any)).join(", ");
                             return (
                               <Tooltip>
                                 <TooltipTrigger asChild>
                                   <span className="underline decoration-dotted underline-offset-2">
                                     {t("amendments.type.mixed")}
                                   </span>
                                 </TooltipTrigger>
                                 <TooltipContent>
                                   <span className="text-xs">
                                     {t("amendments.mixedCategories").replace("{list}", list)}
                                   </span>
                                 </TooltipContent>
                               </Tooltip>
                             );
                           })() : t(`amendments.type.${a.amendmentType}` as any)}
                         </TableCell>
                        <TableCell className="py-1.5">{a.title}</TableCell>
                        <TableCell className="py-1.5">
                          <span className="inline-flex items-center gap-1">
                            {formatDate(a.effectiveDate, locale)}
                            {hasGap && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                                </TooltipTrigger>
                                <TooltipContent><span className="text-xs">{t("amendments.gapWarning")}</span></TooltipContent>
                              </Tooltip>
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="py-1.5">
                          {chs.length === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span
                              className="cursor-pointer underline decoration-dotted underline-offset-2 text-sm text-foreground"
                              onClick={(e) => { e.stopPropagation(); setChangesDialog(a); }}
                            >
                              {chs.length}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="py-1.5">
                          <Badge className={STATUS_CLS[a.status]} variant="outline">
                            {a.status === "active" ? t("amendments.badge.current") : t(`amendments.statusLabel.${a.status}` as any)}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-1.5">
                          <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                            {onOpenDocuments && (() => {
                              const n = documentCounts?.[a.id] ?? 0;
                              const label = t("amendments.tooltip.documents").replace("{n}", String(n));
                              return (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7 relative"
                                      onClick={() => onOpenDocuments(a.id)}
                                      aria-label={label}
                                    >
                                      <Paperclip className="h-3.5 w-3.5" />
                                      {n > 0 && (
                                        <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-medium leading-[14px] text-center">
                                          {n}
                                        </span>
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>{label}</TooltipContent>
                                </Tooltip>
                              );
                            })()}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(a)} aria-label={t("amendments.tooltip.edit")}>
                                  {(a.status === "draft" || a.status === "scheduled")
                                    ? <FileEdit className="h-3.5 w-3.5" />
                                    : <Eye className="h-3.5 w-3.5" />}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{t("amendments.tooltip.edit")}</TooltipContent>
                            </Tooltip>
                            {a.status === "scheduled" && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => revertAmendmentToDraft(a.id)} aria-label={t("amendments.tooltip.revertDraft")}>
                                    <Undo2 className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{t("amendments.tooltip.revertDraft")}</TooltipContent>
                              </Tooltip>
                            )}
                            {a.status === "draft" && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => { if (confirm(t("amendments.confirmDelete"))) deleteAmendment(a.id); }} aria-label={t("amendments.tooltip.delete")}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{t("amendments.tooltip.delete")}</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </TabsContent>



          <TabsContent value="original" className="pt-3">
            {original && renderTermsAsList(original)}
          </TabsContent>
        </Tabs>
      </CardContent>
      </CollapsibleContent>
      <AmendmentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        lease={lease}
        existing={editing}
      />
      <AmendmentChangesDialog
        open={!!changesDialog}
        onOpenChange={(o) => { if (!o) setChangesDialog(null); }}
        amendment={changesDialog}
        changes={changesDialog ? getAmendmentChanges(changesDialog.id) : []}
      />
    </Card>
    </Collapsible>
  );
}