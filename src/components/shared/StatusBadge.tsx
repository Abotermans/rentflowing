import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatusType = "active" | "inactive" | "occupied" | "vacant" | "reserved" | "unavailable";

const statusStyles: Record<StatusType, string> = {
  active: "bg-success/15 text-success border-success/30",
  occupied: "bg-success/15 text-success border-success/30",
  vacant: "bg-warning/15 text-warning border-warning/30",
  reserved: "bg-primary/15 text-primary border-primary/30",
  unavailable: "bg-muted text-muted-foreground border-border",
  inactive: "bg-muted text-muted-foreground border-border",
};

export function StatusBadge({ status }: { status: StatusType }) {
  return (
    <Badge variant="outline" className={cn("capitalize font-medium text-xs", statusStyles[status])}>
      {status}
    </Badge>
  );
}
