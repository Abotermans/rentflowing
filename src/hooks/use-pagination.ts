import { useEffect, useState, useMemo } from "react";

export const DEFAULT_PAGE_SIZE = 25;
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export function usePagination<T>(items: T[], defaultPageSize: number = DEFAULT_PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(defaultPageSize);

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Clamp page if out of range (filter/search changed)
  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [page, totalPages]);

  const setPageSize = (n: number) => {
    setPageSizeState(n);
    setPage(1);
  };

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return { page, pageSize, setPage, setPageSize, pageItems, total, totalPages, from, to };
}