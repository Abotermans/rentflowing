import { useMemo, useState } from "react";
import { useAppData } from "@/context/AppContext";
import { useSettings } from "@/context/SettingsContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, FileEdit, CheckCircle2, XCircle, Trash2, AlertTriangle, CalendarClock, Undo2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCurrency, formatDate } from "@/lib/formatters";
import {
  getEffectiveLeaseTerms, getOriginalLeaseTerms, getLeaseAmendments,
} from "@/lib/amendments";
import { AmendmentDialog } from "./AmendmentDialog";
import type { LeaseAmendment, AmendmentStatus } from "@/types/amendments";
import { useIntegrityState } from "@/hooks/use-integrity-state";

interface Props { leaseId: string }

const STATUS_CLS: Record<AmendmentStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-primary/15 text-primary border-primary/30",
  active: "bg-success/15 text-success border-success/30",
  ended: "bg-muted text-muted-foreground",
  terminated: "bg-muted text-muted-foreground line-through",
};

export function AmendmentsSection({ leaseId }: Props) {
  const { t, locale } = useSettings();
  const {
    leases, units, tenants,
    deleteAmendment, terminateAmendment, scheduleAmendment, activateAmendment,
    revertAmendmentToDraft, getAmendmentChanges,
  } = useAppData();
  const s = useIntegrityState();
  const lease = leases.find(l => l.id === leaseId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LeaseAmendment | null>(null);

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

  const renderTerms = (terms: NonNullable<typeof current>) => (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
      <div><p className="text-xs text-muted-foreground">Rent</p><p className="font-medium">{formatCurrency(terms.monthlyRent, currency, locale)}</p></div>
      <div><p className="text-xs text-muted-foreground">Charges</p><p className="font-medium">{formatCurrency(terms.monthlyCharges, currency, locale)}</p></div>
      <div><p className="text-xs text-muted-foreground">End date</p><p className="font-medium">{formatDate(terms.endDate, locale)}</p></div>
      <div><p className="text-xs text-muted-foreground">Deposit</p><p className="font-medium">{terms.depositAmount != null ? formatCurrency(terms.depositAmount, currency, locale) : "—"}</p></div>
      <div><p className="text-xs text-muted-foreground">Notice</p><p className="font-medium">{terms.noticePeriodText || "—"}</p></div>
      <div><p className="text-xs text-muted-foreground">Primary tenant</p><p className="font-medium">{tenantLabel(terms.primaryTenantId)}</p></div>
      <div className="col-span-2 md:col-span-3">
        <p className="text-xs text-muted-foreground mb-1">Units</p>
        <div className="flex flex-wrap gap-1">
          {terms.units.map(u => (
            <Badge key={u.unitId} variant={u.isPrimary ? "default" : "secondary"}>
              {unitLabel(u.unitId)} · {formatCurrency(u.rentShare, currency, locale)}
            </Badge>
          ))}
          {terms.units.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
        </div>
      </div>
    </div>
  );

  const openEdit = (a: LeaseAmendment) => { setEditing(a); setDialogOpen(true); };

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center">
        <CardTitle className="text-sm font-medium flex items-center gap-1.5 flex-1 justify-center">
          <FileEdit className="h-4 w-4" />{t("amendments.title")} <span className="text-muted-foreground">({ams.length})</span>
        </CardTitle>
        <Button size="sm" className="h-8" onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" />{t("amendments.add")}
        </Button>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="timeline" className="w-full">
          <TabsList className="h-8">
            <TabsTrigger value="timeline" className="text-xs">{t("amendments.timeline")}</TabsTrigger>
            <TabsTrigger value="current" className="text-xs">{t("amendments.currentTerms")}</TabsTrigger>
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
                    <TableHead className="h-8">{t("amendments.newEndDateCol")}</TableHead>
                    <TableHead className="h-8">{t("amendments.status")}</TableHead>
                    <TableHead className="h-8 w-1" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ams.map(a => {
                    const chs = getAmendmentChanges(a.id);
                    const newEndCh = chs.find(c => c.fieldName === "leaseEndDate");
                    const newEnd = newEndCh ? String(newEndCh.newValue) : null;
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
                        <TableCell className="py-1.5">{newEnd ? formatDate(newEnd, locale) : "—"}</TableCell>
                        <TableCell className="py-1.5">
                          <Badge className={STATUS_CLS[a.status]} variant="outline">
                            {a.status === "active" ? t("amendments.badge.current") : t(`amendments.statusLabel.${a.status}` as any)}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-1.5">
                          <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                            {(a.status === "draft" || a.status === "scheduled") && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(a)} aria-label={t("amendments.tooltip.edit")}>
                                    <FileEdit className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{t("amendments.tooltip.edit")}</TooltipContent>
                              </Tooltip>
                            )}
                            {a.status === "draft" && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-primary" onClick={() => scheduleAmendment(a.id)} aria-label={t("amendments.tooltip.schedule")}>
                                    <CalendarClock className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{t("amendments.tooltip.schedule")}</TooltipContent>
                              </Tooltip>
                            )}
                            {a.status === "scheduled" && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-success" onClick={() => {
                                    const prev = ams.find(x => x.id !== a.id && x.status === "active");
                                    if (prev && !confirm(t("amendments.error.AMD_WILL_END_PREVIOUS").replace("{n}", String(prev.amendmentNumber)))) return;
                                    activateAmendment(a.id);
                                  }} aria-label={t("amendments.tooltip.activate")}>
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{t("amendments.tooltip.activate")}</TooltipContent>
                              </Tooltip>
                            )}
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
                            {(a.status === "active" || a.status === "scheduled") && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-warning" onClick={() => terminateAmendment(a.id)} aria-label={t("amendments.tooltip.terminate")}>
                                    <XCircle className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{t("amendments.tooltip.terminate")}</TooltipContent>
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

          <TabsContent value="current" className="pt-3">
            {current && (() => {
              const today = new Date().toISOString().slice(0, 10);
              const activeApplied = ams
                .filter(a => a.status === "active" && a.effectiveDate <= today)
                .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0];
              return (
                <div className="space-y-3">
                  {activeApplied ? (
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <FileEdit className="h-3.5 w-3.5" />
                      <span>
                        {t("amendments.basedOn").replace("{n}", String(activeApplied.amendmentNumber))}
                        {" · "}
                        {t("amendments.effectiveDate")}: {formatDate(activeApplied.effectiveDate, locale)}
                      </span>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">{t("amendments.originalTerms")}</div>
                  )}
                  {renderTerms(current)}
                </div>
              );
            })()}
          </TabsContent>

          <TabsContent value="original" className="pt-3">
            {original && renderTerms(original)}
          </TabsContent>
        </Tabs>

        <AmendmentDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          lease={lease}
          existing={editing}
        />
      </CardContent>
    </Card>
  );
}