import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ArrowRight } from "lucide-react";
import { useSettings } from "@/context/SettingsContext";
import { useLeaseStatusHistory } from "@/hooks/useLeaseStatusHistory";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import type { LifecycleStage } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leaseId: string;
  leaseReference: string;
  currentStage: LifecycleStage;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

export function LeaseStatusHistoryDialog({ open, onOpenChange, leaseId, leaseReference, currentStage }: Props) {
  const { t } = useSettings();
  const { entries, loading } = useLeaseStatusHistory(open ? leaseId : null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[860px] max-w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span>{t("lease.statusHistory.title")}</span>
            <span className="text-sm text-muted-foreground font-normal">· {leaseReference}</span>
            <StatusBadge status={currentStage} />
          </DialogTitle>
        </DialogHeader>
        <div className="mt-4">
          {loading ? (
            <p className="text-xs text-muted-foreground italic px-3 py-6 text-center">{t("lease.statusHistory.loading")}</p>
          ) : entries.length === 0 ? (
            <p className="text-xs text-muted-foreground italic px-3 py-6 text-center">{t("lease.statusHistory.empty")}</p>
          ) : (
            <TooltipProvider>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">{t("lease.statusHistory.columns.date")}</TableHead>
                    <TableHead className="text-xs">{t("lease.statusHistory.columns.transition")}</TableHead>
                    <TableHead className="text-xs">{t("lease.statusHistory.columns.reason")}</TableHead>
                    <TableHead className="text-xs">{t("lease.statusHistory.columns.notes")}</TableHead>
                    <TableHead className="text-xs">{t("lease.statusHistory.columns.by")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map(e => (
                    <TableRow key={e.id}>
                      <TableCell className="text-xs whitespace-nowrap">{formatDateTime(e.changedAt)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {e.fromStage ? <StatusBadge status={e.fromStage as LifecycleStage} /> : <span className="text-xs text-muted-foreground">—</span>}
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          <StatusBadge status={e.toStage as LifecycleStage} />
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{e.reason || "—"}</TableCell>
                      <TableCell className="text-xs max-w-[220px]">
                        {e.notes ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="truncate block cursor-help">{e.notes}</span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-md whitespace-pre-wrap">{e.notes}</TooltipContent>
                          </Tooltip>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-xs">{e.changedByName || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TooltipProvider>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}