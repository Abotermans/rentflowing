import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatusType = "active" | "paid" | "occupied" | "pending" | "upcoming" | "overdue" | "expired" | "vacant";

const statusStyles: Record<StatusType, string> = {
  active: "bg-success/15 text-success border-success/30",
  paid: "bg-success/15 text-success border-success/30",
  occupied: "bg-success/15 text-success border-success/30",
  pending: "bg-warning/15 text-warning border-warning/30",
  upcoming: "bg-primary/15 text-primary border-primary/30",
  overdue: "bg-destructive/15 text-destructive border-destructive/30",
  expired: "bg-destructive/15 text-destructive border-destructive/30",
  vacant: "bg-muted text-muted-foreground border-border",
};

export function StatusBadge({ status }: { status: StatusType }) {
  return (
    <Badge variant="outline" className={cn("capitalize font-medium text-xs", statusStyles[status])}>
      {status}
    </Badge>
  );
}
