import { useMemo, useState } from "react";
import { useAppData } from "@/context/AppContext";
import { useSettings } from "@/context/SettingsContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, FileEdit, CheckCircle2, XCircle, Trash2, AlertTriangle } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/formatters";
import {
  getEffectiveLeaseTerms, getOriginalLeaseTerms, getLeaseAmendments,
  getLeaseAmendmentImpact,
} from "@/lib/amendments";
import { AmendmentDialog } from "./AmendmentDialog";
import type { LeaseAmendment, AmendmentStatus } from "@/types/amendments";
import { useIntegrityState } from "@/hooks/use-integrity-state";

interface Props { leaseId: string }

const STATUS_CLS: Record<AmendmentStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  "pending-signature": "bg-warning/15 text-warning border-warning/30",
  active: "bg-success/15 text-success border-success/30",
  cancelled: "bg-muted text-muted-foreground line-through",
  superseded: "bg-muted text-muted-foreground",
};

export function AmendmentsSection({ leaseId }: Props) {
  const { t, locale } = useSettings();
  const {
    leases, units, tenants,
    deleteAmendment, cancelAmendment, activateAmendment, getAmendmentChanges,
  } = useAppData();
  const s = useIntegrityState();
  const lease = leases.find(l => l.id === leaseId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LeaseAmendment | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const ams = useMemo(() => getLeaseAmendments(leaseId, s.amendments), [leaseId, s.amendments]);
  const current = useMemo(
    () => lease ? getEffectiveLeaseTerms(leaseId, new Date().toISOString().slice(0, 10), s) : null,
    [lease, leaseId, s],
  );
  const original = useMemo(() => lease ? getOriginalLeaseTerms(leaseId, s) : null, [lease, leaseId, s]);
  const selected = selectedId ? ams.find(a => a.id === selectedId) ?? null : (ams.find(a => a.status !== "cancelled" && a.status !== "superseded") ?? null);
  const impact = useMemo(() => selected ? getLeaseAmendmentImpact(selected.id, s) : null, [selected, s]);

  if (!lease) return null;
  const currency = "EUR";

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

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium flex items-center gap-1.5">
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
            <TabsTrigger value="impact" className="text-xs">{t("amendments.impact")}</TabsTrigger>
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
                    <TableHead className="h-8">Title</TableHead>
                    <TableHead className="h-8">{t("amendments.effectiveDate")}</TableHead>
                    <TableHead className="h-8">{t("amendments.status")}</TableHead>
                    <TableHead className="h-8">{t("amendments.summary")}</TableHead>
                    <TableHead className="h-8 w-1" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ams.map(a => {
                    const chs = getAmendmentChanges(a.id);
                    const summary = chs.map(c => {
                      if (c.fieldName === "baseMonthlyRentTotal") return `Rent ${c.oldValue}→${c.newValue}`;
                      if (c.fieldName === "baseMonthlyChargesTotal") return `Charges ${c.oldValue}→${c.newValue}`;
                      if (c.fieldName === "leaseEndDate") return `End ${c.oldValue}→${c.newValue}`;
                      if (c.fieldName === "depositAmount") return `Deposit ${c.oldValue}→${c.newValue}`;
                      if (c.fieldName === "noticePeriodText") return `Notice "${c.newValue}"`;
                      if (c.fieldName === "unitAssignments" && c.changeType === "add") return `+${unitLabel(c.metadata?.unitId ?? "")}`;
                      if (c.fieldName === "unitAssignments" && c.changeType === "remove") return `−${unitLabel(c.metadata?.unitId ?? "")}`;
                      if (c.fieldName === "primaryUnitId") return `Primary→${unitLabel(String(c.newValue))}`;
                      return c.fieldName;
                    }).join(" · ");
                    return (
                      <TableRow key={a.id} className={selected?.id === a.id ? "bg-accent/30" : ""} onClick={() => setSelectedId(a.id)}>
                        <TableCell className="py-1.5">{a.amendmentNumber}</TableCell>
                        <TableCell className="py-1.5">{t(`amendments.type.${a.amendmentType}` as any)}</TableCell>
                        <TableCell className="py-1.5">{a.title}</TableCell>
                        <TableCell className="py-1.5">{formatDate(a.effectiveDate, locale)}</TableCell>
                        <TableCell className="py-1.5">
                          <Badge className={STATUS_CLS[a.status]} variant="outline">{t(`amendments.statusLabel.${a.status}` as any)}</Badge>
                        </TableCell>
                        <TableCell className="py-1.5 text-xs text-muted-foreground max-w-[200px] truncate" title={summary}>{summary}</TableCell>
                        <TableCell className="py-1.5">
                          <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                            {(a.status === "draft" || a.status === "pending-signature") && (
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditing(a); setDialogOpen(true); }} aria-label="Edit">
                                <FileEdit className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {(a.status === "draft" || a.status === "pending-signature") && (
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-success" onClick={() => activateAmendment(a.id)} aria-label="Activate">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {a.status === "active" && (
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-warning" onClick={() => cancelAmendment(a.id)} aria-label="Cancel">
                                <XCircle className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {a.status === "draft" && (
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => { if (confirm(t("amendments.confirmDelete"))) deleteAmendment(a.id); }} aria-label="Delete">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
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
            {current && renderTerms(current)}
          </TabsContent>

          <TabsContent value="original" className="pt-3">
            {original && renderTerms(original)}
          </TabsContent>

          <TabsContent value="impact" className="pt-3">
            {!selected || !impact ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Select an amendment in the timeline.</p>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="border rounded p-2">
                    <p className="text-xs text-muted-foreground mb-2">{t("amendments.before")}</p>
                    {impact.before && renderTerms(impact.before)}
                  </div>
                  <div className="border rounded p-2">
                    <p className="text-xs text-muted-foreground mb-2">{t("amendments.after")}</p>
                    {impact.after && renderTerms(impact.after)}
                  </div>
                </div>
                <div className="text-sm">
                  <strong>{t("amendments.financialDelta")}:</strong>{" "}
                  Rent {impact.financialDelta.rent >= 0 ? "+" : ""}{formatCurrency(impact.financialDelta.rent, currency, locale)} ·{" "}
                  Charges {impact.financialDelta.charges >= 0 ? "+" : ""}{formatCurrency(impact.financialDelta.charges, currency, locale)}
                </div>
                {impact.affectedUnitIds.length > 0 && (
                  <div className="text-sm">
                    <strong>{t("amendments.affectedUnits")}:</strong>{" "}
                    {impact.affectedUnitIds.map(unitLabel).join(", ")}
                  </div>
                )}
                {s.receivableItems.some(ri => ri.leaseId === leaseId && ri.outstandingAmount > 0 && ri.periodMonth >= selected.effectiveDate.slice(0, 7)) && (
                  <div className="flex items-start gap-2 text-warning text-xs">
                    <AlertTriangle className="h-4 w-4 mt-0.5" />
                    <span>This amendment overlaps unpaid receivable periods — review before activation.</span>
                  </div>
                )}
              </div>
            )}
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