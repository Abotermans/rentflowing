import { useMemo } from "react";
import { useAppData } from "@/context/AppContext";
import { useSettings } from "@/context/SettingsContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PieChart, Building2, DoorOpen } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { useTableSort, sortRows } from "@/hooks/use-table-sort";
import { SortableTableHead } from "@/components/shared/SortableTableHead";
import { usePagination } from "@/hooks/use-pagination";
import { TablePagination } from "@/components/common/TablePagination";

export default function CostsAllocations() {
  const {
    costEntries, costAllocationResults, costCategories, properties, units,
    getPropertyById, getUnitById, getCostCategoryById,
  } = useAppData();
  const { t } = useSettings();

  type PBKey = "property" | "totalCosts" | "totalTaxes" | "total";
  const { sort: pbSort, toggle: pbToggle } = useTableSort<PBKey>();
  type UBKey = "unit" | "property" | "directCosts" | "allocatedCosts" | "ownerBorne" | "recoverable" | "total";
  const { sort: ubSort, toggle: ubToggle } = useTableSort<UBKey>();

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

  const sortedPropertyBreakdown = sortRows(propertyBreakdown, pbSort, (pb, key) => {
    switch (key) {
      case "property": return getPropertyById(pb.propertyId)?.name ?? "";
      case "totalCosts": return pb.totalCosts;
      case "totalTaxes": return pb.totalTaxes;
      case "total": return pb.totalCosts + pb.totalTaxes;
    }
  });
  const sortedUnitBurden = sortRows(unitBurden, ubSort, (ub, key) => {
    switch (key) {
      case "unit": return getUnitById(ub.unitId)?.unitLabel ?? "";
      case "property": return getPropertyById(ub.propertyId)?.name ?? "";
      case "directCosts": return ub.directCosts;
      case "allocatedCosts": return ub.allocatedCosts;
      case "ownerBorne": return ub.ownerBorne;
      case "recoverable": return ub.recoverable;
      case "total": return ub.directCosts + ub.allocatedCosts;
    }
  });
  const pbPg = usePagination(sortedPropertyBreakdown);
  const ubPg = usePagination(sortedUnitBurden);

  return (
    <div className="space-y-6">
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
            {t("costs.propertyCostSummary")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {propertyBreakdown.length === 0 ? (
            <EmptyState icon={PieChart} title={t("costs.noAllocations")} description={t("costs.noAllocationsDesc")} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead sortKey="property" sort={pbSort} onSort={pbToggle}>{t("table.property")}</SortableTableHead>
                  <SortableTableHead sortKey="totalCosts" sort={pbSort} onSort={pbToggle} align="right">{t("costs.totalCharges")}</SortableTableHead>
                  <SortableTableHead sortKey="totalTaxes" sort={pbSort} onSort={pbToggle} align="right">{t("costs.totalTaxes")}</SortableTableHead>
                  <SortableTableHead sortKey="total" sort={pbSort} onSort={pbToggle} align="right">{t("common.total")}</SortableTableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pbPg.pageItems.map(pb => {
                  const prop = getPropertyById(pb.propertyId);
                  return (
                    <TableRow key={pb.propertyId}>
                      <TableCell className="text-sm text-muted-foreground">{prop?.name ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatCurrency(pb.totalCosts)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatCurrency(pb.totalTaxes)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatCurrency(pb.totalCosts + pb.totalTaxes)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {propertyBreakdown.length > 0 && (
            <TablePagination page={pbPg.page} pageSize={pbPg.pageSize} total={pbPg.total} totalPages={pbPg.totalPages} from={pbPg.from} to={pbPg.to} onPageChange={pbPg.setPage} onPageSizeChange={pbPg.setPageSize} />
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
                  <SortableTableHead sortKey="unit" sort={ubSort} onSort={ubToggle}>{t("table.unit")}</SortableTableHead>
                  <SortableTableHead sortKey="property" sort={ubSort} onSort={ubToggle}>{t("table.property")}</SortableTableHead>
                  <SortableTableHead sortKey="directCosts" sort={ubSort} onSort={ubToggle} align="right">{t("costs.directCosts")}</SortableTableHead>
                  <SortableTableHead sortKey="allocatedCosts" sort={ubSort} onSort={ubToggle} align="right">{t("costs.allocatedCosts")}</SortableTableHead>
                  <SortableTableHead sortKey="ownerBorne" sort={ubSort} onSort={ubToggle} align="right">{t("costs.ownerBorne")}</SortableTableHead>
                  <SortableTableHead sortKey="recoverable" sort={ubSort} onSort={ubToggle} align="right">{t("costs.recoverable")}</SortableTableHead>
                  <SortableTableHead sortKey="total" sort={ubSort} onSort={ubToggle} align="right">{t("common.total")}</SortableTableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ubPg.pageItems.map(ub => {
                  const unit = getUnitById(ub.unitId);
                  const prop = getPropertyById(ub.propertyId);
                  const total = ub.directCosts + ub.allocatedCosts;
                  return (
                    <TableRow key={ub.unitId}>
                      <TableCell className="text-sm text-muted-foreground">{unit?.unitLabel ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{prop?.name ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatCurrency(ub.directCosts)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatCurrency(ub.allocatedCosts)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatCurrency(ub.ownerBorne)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatCurrency(ub.recoverable)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatCurrency(total)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {unitBurden.length > 0 && (
            <TablePagination page={ubPg.page} pageSize={ubPg.pageSize} total={ubPg.total} totalPages={ubPg.totalPages} from={ubPg.from} to={ubPg.to} onPageChange={ubPg.setPage} onPageSizeChange={ubPg.setPageSize} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
