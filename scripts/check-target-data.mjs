import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const requiredAuditChecks = [
  "financial_audit_schema_missing",
  "receivable_arithmetic",
  "duplicate_lease_schedule_rows",
  "retimed_cycle_collisions",
  "same_bill_schedule_collisions",
  "different_bill_schedule_collisions",
  "cross_currency_schedule_slots",
  "lease_schedule_missing_cycle_metadata",
  "lease_schedule_without_plausible_assignment",
  "allocated_schedule_without_plausible_assignment",
  "lease_assignment_missing_pricing",
  "overlapping_same_lease_unit_assignments",
  "overlapping_cross_lease_unit_assignments",
  "active_lease_share_total_mismatch",
  "open_lease_window_share_total_mismatch",
  "receivable_property_currency_mismatch",
  "receipt_property_currency_mismatch",
  "cash_receipt_scope_mismatch",
  "receipt_allocation_property_mismatch",
  "active_cost_property_currency_mismatch",
  "property_cost_overallocated",
  "nonpositive_receipt_without_terminal_status",
  "positive_receipt_unmatched_out_of_range",
  "nonpositive_allocation",
  "allocation_currency_mismatch",
  "positive_receipt_allocation_drift",
  "receivable_allocation_exceeds_paid",
  "positive_receipt_status_mismatch",
  "non_draft_lease_without_unit",
  "non_draft_lease_without_main_assignment",
  "lease_without_status_history",
  "lease_signed_after_end_date",
  "overlapping_charges_reconciliations",
  "lease_assignment_property_mismatch",
  "amendment_unit_reference_mismatch",
  "legacy_amendment_unit_reference_pending",
  "unit_millieme_key_over_base",
  "invalid_unit_millieme_root",
  "invalid_unit_millieme_share",
  "lease_receivable_property_mismatch",
  "active_lease_without_current_unit",
  "open_schedule_after_lease_end",
  "open_schedule_after_actual_move_out",
  "paid_schedule_after_actual_move_out",
  "active_lease_past_actual_move_out",
  "stored_lease_stage_behind_dates",
  "tenant_status_lease_mismatch",
  "guarantee_amount_mismatch",
  "guarantee_status_mismatch",
  "duplicate_lease_guarantees",
  "default_portfolio_inaccessible",
];

export async function checkTargetData(backendUrl, managementToken, fetchImpl = fetch) {
  const backend = new URL(backendUrl);
  const projectRef = /^([a-z0-9]{20})\.supabase\.co$/.exec(backend.hostname)?.[1];
  if (backend.protocol !== "https:" || backend.origin !== backendUrl.replace(/\/$/, "") || !projectRef) {
    throw new Error("Backend URL must be a hosted Supabase HTTPS origin");
  }
  if (!managementToken?.trim()) {
    throw new Error("SUPABASE_MANAGEMENT_READ_TOKEN is required for the read-only target-data check");
  }

  const query = await readFile(new URL("./audit-financial-consistency.sql", import.meta.url), "utf8");
  const response = await fetchImpl(`https://api.supabase.com/v1/projects/${projectRef}/database/query/read-only`, {
    method: "POST",
    headers: { Authorization: `Bearer ${managementToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
    redirect: "manual",
    cache: "no-store",
    signal: AbortSignal.timeout(60000),
  });
  if (response.status !== 201) {
    await response.body?.cancel();
    throw new Error(`Cannot audit target data: HTTP ${response.status}`);
  }
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length !== requiredAuditChecks.length) {
    throw new Error("Target financial audit returned an incomplete result");
  }
  const required = new Set(requiredAuditChecks);
  const seen = new Set();
  const failures = [];
  for (const row of rows) {
    if (!required.has(row?.check_name) || seen.has(row.check_name)) {
      throw new Error("Target financial audit returned unexpected or repeated checks");
    }
    seen.add(row.check_name);
    if ((typeof row.affected !== "string" && typeof row.affected !== "number")
      || !Number.isSafeInteger(Number(row.affected)) || Number(row.affected) < 0) {
      throw new Error(`Target financial audit returned an invalid count for ${row.check_name}`);
    }
    if (Number(row.affected) > 0) failures.push(`${row.check_name}: ${row.affected}`);
  }
  if (failures.length) throw new Error(`Target financial audit failed: ${failures.join(", ")}`);
  return rows.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const backendUrl = process.argv[2];
  if (!backendUrl) {
    console.error("Usage: npm run check:target-data -- <supabase-https-origin>");
    process.exit(2);
  }
  try {
    const count = await checkTargetData(backendUrl, process.env.SUPABASE_MANAGEMENT_READ_TOKEN);
    console.log(`${backendUrl}: ${count} financial data checks passed`);
  } catch (error) {
    console.error(`Target data check failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
