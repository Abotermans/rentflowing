import { useState, useMemo } from "react";

export type SortDirection = "asc" | "desc";

export interface SortState<K extends string> {
  key: K | undefined;
  dir: SortDirection;
}

/**
 * Lightweight sortable-column state hook for list pages. Click a column to
 * sort ascending; click the same column again to flip to descending; click a
 * different column to switch the sort key (defaulting back to ascending).
 */
export function useTableSort<K extends string>(defaultKey?: K, defaultDir: SortDirection = "asc") {
  const [sort, setSort] = useState<SortState<K>>({ key: defaultKey, dir: defaultDir });
  const toggle = (key: K) => {
    setSort(s => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  };
  return { sort, toggle };
}

/** Comparator that handles strings, numbers, booleans, ISO dates, and null/undefined. */
function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return a === b ? 0 : a ? -1 : 1;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

/**
 * Sort rows by the value returned from `getValue(row, key)`. Stable: returns a
 * new array; original order preserved when no sort key is set.
 */
export function sortRows<T, K extends string>(
  rows: T[],
  sort: SortState<K>,
  getValue: (row: T, key: K) => unknown,
): T[] {
  if (!sort.key) return rows;
  const key = sort.key;
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => sign * compareValues(getValue(a, key), getValue(b, key)));
}

export function useSortedRows<T, K extends string>(
  rows: T[],
  sort: SortState<K>,
  getValue: (row: T, key: K) => unknown,
): T[] {
  return useMemo(() => sortRows(rows, sort, getValue), [rows, sort, getValue]);
}