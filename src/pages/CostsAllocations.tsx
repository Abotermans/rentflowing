import { useMemo } from "react";
import { useAppData } from "@/context/AppContext";
import { useSettings } from "@/context/SettingsContext";
import { CostsNav } from "@/components/costs/CostsNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PieChart, Building2, DoorOpen } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { RECOVERY_TYPE_LABELS } from "@/types/costs";

export default function CostsAllocations() {
  const {
    costEntries, costAllocationResults, costCategories, properties, units,
    getPropertyById, getUnitById, getCostCategoryById,
  } = useAppData();
  const { t } = useSettings();

  const activeEntries = costEntries.filter(e => e.status === "active");

  const totals = useMemo(() => {
    let charges = 0, taxes = 0, ownerBorne = 0, recoverable = 0;
    for (const e of activeEntries) {
      if (e.isTax) taxes += e.amount; else charges += e.amount;
    }
    // From allocation results + direct unit costs
    for (const r of costAllocationResults) {
      ownerBorne += r.ownerBurdenAmount;
      recoverable += r.recoverableAmount;
    }
    // Direct unit costs (no allocation results)
    for (const e of activeEntries) {
      if (e.unitId && !costAllocationResults.some(r => r.costEntryId === e.id)) {
        if (e.recoveryType === "owner-only") ownerBorne += e.amount;
        else if (e.recoveryType === "tenant-recoverable") recoverable += e.amount;
        else if (e.recoveryType === "partially-recoverable") { ownerBorne += e.amount / 2; recoverable += e.amount / 2; }
      }
    }
    return { charges, taxes, ownerBorne, recoverable };
  }, [activeEntries, costAllocationResults]);

  // Property-level breakdown
  const propertyBreakdown = useMemo(() => {
    const map = new Map<string, { totalCosts: number; totalTaxes: number; ownerBorne: number; recoverable: number }>();
    for (const e of activeEntries) {
      const prev = map.get(e.propertyId) ?? { totalCosts: 0, totalTaxes: 0, ownerBorne: 0, recoverable: 0 };
      if (e.isTax) prev.totalTaxes += e.amount; else prev.totalCosts += e.amount;
      map.set(e.propertyId, prev);
    }
    return Array.from(map.entries()).map(([propertyId, data]) => ({ propertyId, ...data }));
  }, [activeEntries]);

  // Unit burden summary
  const unitBurden = useMemo(() => {
    const map = new Map<string, { directCosts: number; allocatedCosts: number; ownerBorne: number; recoverable: number; propertyId: string }>();
    // Direct unit costs
    for (const e of activeEntries) {
      if (e.unitId) {
        const prev = map.get(e.unitId) ?? { directCosts: 0, allocatedCosts: 0, ownerBorne: 0, recoverable: 0, propertyId: e.propertyId };
        prev.directCosts += e.amount;
        if (e.recoveryType === "owner-only") prev.ownerBorne += e.amount;
        else if (e.recoveryType === "tenant-recoverable") prev.recoverable += e.amount;
        else if (e.recoveryType === "partially-recoverable") { prev.ownerBorne += e.amount / 2; prev.recoverable += e.amount / 2; }
        map.set(e.unitId, prev);
      }
    }
    // Allocated costs
    for (const r of costAllocationResults) {
      const prev = map.get(r.unitId) ?? { directCosts: 0, allocatedCosts: 0, ownerBorne: 0, recoverable: 0, propertyId: r.propertyId };
      prev.allocatedCosts += r.allocatedAmount;
      prev.ownerBorne += r.ownerBurdenAmount;
      prev.recoverable += r.recoverableAmount;
      prev.propertyId = r.propertyId;
      map.set(r.unitId, prev);
    }
    return Array.from(map.entries()).map(([unitId, data]) => ({ unitId, ...data }));
  }, [activeEntries, costAllocationResults]);

  return (
    <div className="space-y-6">
      <CostsNav />
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t("costs.allocations")}</h1>
        <p className="text-sm text-muted-foreground">{t("costs.allocationsSubtitle")}</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">{t("costs.totalCharges")}</p>
            <p className="text-xl font-bold text-foreground">{formatCurrency(totals.charges)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">{t("costs.totalTaxes")}</p>
            <p className="text-xl font-bold text-foreground">{formatCurrency(totals.taxes)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">{t("costs.ownerBorne")}</p>
            <p className="text-xl font-bold text-foreground">{formatCurrency(totals.ownerBorne)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">{t("costs.recoverable")}</p>
            <p className="text-xl font-bold text-foreground">{formatCurrency(totals.recoverable)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Property Allocation Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            Property Cost Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {propertyBreakdown.length === 0 ? (
            <EmptyState icon={PieChart} title={t("costs.noAllocations")} description={t("costs.noAllocationsDesc")} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("table.property")}</TableHead>
                  <TableHead className="text-right">{t("costs.totalCharges")}</TableHead>
                  <TableHead className="text-right">{t("costs.totalTaxes")}</TableHead>
                  <TableHead className="text-right">{t("common.total")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {propertyBreakdown.map(pb => {
                  const prop = getPropertyById(pb.propertyId);
                  return (
                    <TableRow key={pb.propertyId}>
                      <TableCell className="font-medium">{prop?.name ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatCurrency(pb.totalCosts)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatCurrency(pb.totalTaxes)}</TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold">{formatCurrency(pb.totalCosts + pb.totalTaxes)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Unit Burden Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <DoorOpen className="h-4 w-4 text-muted-foreground" />
            {t("costs.unitAllocationBreakdown")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {unitBurden.length === 0 ? (
            <EmptyState icon={PieChart} title={t("costs.noAllocations")} description={t("costs.noAllocationsDesc")} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("table.unit")}</TableHead>
                  <TableHead>{t("table.property")}</TableHead>
                  <TableHead className="text-right">{t("costs.directCosts")}</TableHead>
                  <TableHead className="text-right">{t("costs.allocatedCosts")}</TableHead>
                  <TableHead className="text-right">{t("costs.ownerBorne")}</TableHead>
                  <TableHead className="text-right">{t("costs.recoverable")}</TableHead>
                  <TableHead className="text-right">{t("common.total")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unitBurden.map(ub => {
                  const unit = getUnitById(ub.unitId);
                  const prop = getPropertyById(ub.propertyId);
                  const total = ub.directCosts + ub.allocatedCosts;
                  return (
                    <TableRow key={ub.unitId}>
                      <TableCell className="font-medium">{unit?.unitLabel ?? "—"}</TableCell>
                      <TableCell className="text-sm">{prop?.name ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatCurrency(ub.directCosts)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatCurrency(ub.allocatedCosts)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatCurrency(ub.ownerBorne)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatCurrency(ub.recoverable)}</TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold">{formatCurrency(total)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
