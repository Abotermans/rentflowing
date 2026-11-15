import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useAppData } from "@/context/AppContext";
import { useSettings } from "@/context/SettingsContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PieChart, Building2, DoorOpen, AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { formatMoneyGroups, type MoneyGroup } from "@/lib/money";
import { buildCostOverview } from "@/lib/costOverview";
import { usePortfolioWriteAccess } from "@/hooks/use-portfolio-write-access";
import { useTableSort, sortRows } from "@/hooks/use-table-sort";
import { SortableTableHead } from "@/components/shared/SortableTableHead";
import { usePagination } from "@/hooks/use-pagination";
import { TablePagination } from "@/components/common/TablePagination";
import type { Property } from "@/types";

export default function CostsAllocations() {
  const {
    costEntries, costAllocationResults, properties, units,
    getPropertyById, getUnitById,
  } = useAppData();
  const { t } = useSettings();
  const canWrite = usePortfolioWriteAccess();

  type PBKey = "property";
  const { sort: pbSort, toggle: pbToggle } = useTableSort<PBKey>();
  type UBKey = "unit" | "property";
  const { sort: ubSort, toggle: ubToggle } = useTableSort<UBKey>();

  const overview = useMemo(
    () => buildCostOverview(costEntries, costAllocationResults, properties, units),
    [costEntries, costAllocationResults, properties, units],
  );
  const propertyBreakdown = overview.properties;
  const unitBurden = overview.units;
  const display = (groups: MoneyGroup[], property?: Property) =>
    formatMoneyGroups(groups, formatCurrency(0, property?.currencyCode, property?.locale));

  const sortedPropertyBreakdown = sortRows(propertyBreakdown, pbSort, pb => getPropertyById(pb.propertyId)?.name ?? "");
  const sortedUnitBurden = sortRows(unitBurden, ubSort, (ub, key) => {
    switch (key) {
      case "unit": return getUnitById(ub.unitId)?.unitLabel ?? "";
      case "property": return getPropertyById(ub.propertyId)?.name ?? "";
    }
  });
  const pbPg = usePagination(sortedPropertyBreakdown);
  const ubPg = usePagination(sortedUnitBurden);

  return (
    <div className="page-shell">
      <div>
        <h1 className="page-title">{t("costs.allocations")}</h1>
        <p className="page-description">{t("costs.allocationsSubtitle")}</p>
      </div>

      {overview.allocationExcesses.length > 0 && (
        <Alert className="border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400 [&>svg]:text-amber-600">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <p>{t("costs.allocationExcessWarning")}</p>
            <ul className="mt-2 space-y-1">
              {overview.allocationExcesses.map(excess => {
                const entry = costEntries.find(item => item.id === excess.costEntryId);
                const property = getPropertyById(excess.propertyId);
                return (
                  <li key={excess.costEntryId} className="flex flex-wrap items-baseline gap-x-2">
                    {canWrite ? (
                      <Link className="font-medium underline underline-offset-2 hover:text-primary" to={`/costs/entries?edit=${encodeURIComponent(excess.costEntryId)}`}>
                        {entry?.label || excess.costEntryId}
                      </Link>
                    ) : <span className="font-medium">{entry?.label || excess.costEntryId}</span>}
                    <span>{property?.name ?? "—"}</span>
                    <span>{t("costs.allocationExcessAmount")}: {formatCurrency(excess.excessAmount, excess.currencyCode, property?.locale)}</span>
                  </li>
                );
              })}
            </ul>
          </AlertDescription>
        </Alert>
      )}


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
                  <TableHead className="text-right">{t("costs.totalCharges")}</TableHead>
                  <TableHead className="text-right">{t("costs.totalTaxes")}</TableHead>
                  <TableHead className="text-right">{t("common.total")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pbPg.pageItems.map(pb => {
                  const prop = getPropertyById(pb.propertyId);
                  return (
                    <TableRow key={pb.propertyId}>
                      <TableCell className="text-sm text-muted-foreground">{prop?.name ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">{display(pb.charges, prop)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">{display(pb.taxes, prop)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">{display(pb.total, prop)}</TableCell>
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
                  <TableHead className="text-right">{t("costs.directCosts")}</TableHead>
                  <TableHead className="text-right">{t("costs.allocatedCosts")}</TableHead>
                  <TableHead className="text-right">{t("costs.ownerBorne")}</TableHead>
                  <TableHead className="text-right">{t("costs.recoverable")}</TableHead>
                  <TableHead className="text-right">{t("common.total")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ubPg.pageItems.map(ub => {
                  const unit = getUnitById(ub.unitId);
                  const prop = getPropertyById(ub.propertyId);
                  return (
                    <TableRow key={ub.unitId}>
                      <TableCell className="text-sm text-muted-foreground">{unit?.unitLabel ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{prop?.name ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">{display(ub.directCosts, prop)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">{display(ub.allocatedCosts, prop)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">{display(ub.ownerBorne, prop)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">{display(ub.recoverable, prop)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">{display(ub.total, prop)}</TableCell>
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
