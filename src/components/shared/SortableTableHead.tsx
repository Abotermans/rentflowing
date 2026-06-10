import { ReactNode } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { SortDirection, SortState } from "@/hooks/use-table-sort";

interface Props<K extends string> {
  sortKey: K;
  sort: SortState<K>;
  onSort: (key: K) => void;
  align?: "left" | "right" | "center";
  className?: string;
  children: ReactNode;
}

/**
 * Header cell wrapped in a clickable button that toggles column sort.
 * Pairs with `useTableSort` + `sortRows`.
 */
export function SortableTableHead<K extends string>({
  sortKey,
  sort,
  onSort,
  align = "left",
  className,
  children,
}: Props<K>) {
  const active = sort.key === sortKey;
  const dir: SortDirection = sort.dir;
  const Icon = !active ? ChevronsUpDown : dir === "asc" ? ChevronUp : ChevronDown;
  return (
    <TableHead
      className={cn(
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 select-none hover:text-foreground transition-colors",
          align === "right" && "flex-row-reverse",
          align === "center" && "mx-auto",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <span>{children}</span>
        <Icon className={cn("h-3 w-3 shrink-0", active ? "opacity-100" : "opacity-50")} />
      </button>
    </TableHead>
  );
}