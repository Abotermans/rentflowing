import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from "lucide-react";
import { useSettings } from "@/context/SettingsContext";
import { PAGE_SIZE_OPTIONS } from "@/hooks/use-pagination";

interface TablePaginationProps {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  from: number;
  to: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
}

export function TablePagination({
  page,
  pageSize,
  total,
  totalPages,
  from,
  to,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
}: TablePaginationProps) {
  const { t } = useSettings();
  if (total === 0) return null;

  const showNav = totalPages > 1;

  return (
    <div className="flex items-center justify-between gap-4 px-3 py-2 border-t bg-card text-sm text-muted-foreground">
      <div className="flex items-center gap-2">
        <span>{t("pagination.rowsPerPage")}</span>
        <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
          <SelectTrigger className="h-8 w-[72px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizeOptions.map((n) => (
              <SelectItem key={n} value={String(n)}>{n}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-4">
        <span className="tabular-nums whitespace-nowrap">
          {from}–{to} {t("pagination.of")} {total}
        </span>
        {showNav && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page === 1} onClick={() => onPageChange(1)} aria-label="First page">
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page === 1} onClick={() => onPageChange(page - 1)} aria-label="Previous page">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="tabular-nums whitespace-nowrap px-2">
              {t("pagination.page")} {page} / {totalPages}
            </span>
            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page === totalPages} onClick={() => onPageChange(page + 1)} aria-label="Next page">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page === totalPages} onClick={() => onPageChange(totalPages)} aria-label="Last page">
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}