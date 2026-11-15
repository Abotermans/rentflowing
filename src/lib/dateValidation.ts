/**
 * Lightweight date-ordering helpers used by entity forms to block users from
 * saving inconsistent dates (e.g. end before start, released before received).
 *
 * All dates handled here are ISO `YYYY-MM-DD` strings, so a lexical compare
 * is equivalent to a calendar compare. `null`/`undefined`/`""` values are
 * treated as "not set" and skipped.
 */

export type DatePairRule = {
  /** The date that should come first (lower bound). */
  earlier: string | null | undefined;
  /** The date that should come on or after `earlier`. */
  later: string | null | undefined;
  /** User-facing message returned when the rule fails. */
  message: string;
};

/** True only for a real calendar date written as YYYY-MM-DD. */
export function isISOCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Return the messages for every rule whose `later` value is strictly before
 * `earlier`. Rules with either side missing are skipped (use a separate
 * required-field check for those).
 */
export function validateDateOrder(rules: DatePairRule[]): string[] {
  const errs: string[] = [];
  for (const r of rules) {
    if (!r.earlier || !r.later) continue;
    if (r.later < r.earlier) errs.push(r.message);
  }
  // De-duplicate identical messages so callers can show a single concise toast.
  return Array.from(new Set(errs));
}

/** True when every rule is satisfied (or either side is missing). */
export function isDateOrderValid(rules: DatePairRule[]): boolean {
  return validateDateOrder(rules).length === 0;
}
