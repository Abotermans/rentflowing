import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const requiredSchemaChecks = [
  "lease_document_types_table",
  "lease_documents_type_column",
  "lease_documents_status_column",
  "lease_documents_contractual_model",
  "unique_lease_document_storage_paths",
  "cost_amortization_model",
  "lease_indexation_model",
  "lease_billing_inputs",
  "property_time_zone_model",
  "scheduled_job_health_table",
  "lifecycle_job_no_silent_lock_skips",
  "portfolio_data_rls",
  "all_portfolio_tables_rls",
  "portfolio_data_read_policies",
  "all_portfolio_table_read_policies",
  "lease_document_write_policy_scope",
  "lease_document_write_role_policies",
  "restricted_lease_metadata_writes",
  "restricted_lease_creation_and_assignments",
  "restricted_lease_status_history_writes",
  "lease_stage_main_unit_guard",
  "lease_assignment_totals_guard",
  "same_lease_unit_overlap_guard",
  "cross_lease_unit_overlap_guard",
  "tenant_status_lease_guard",
  "secure_definer_search_paths",
  "no_client_executable_definer_triggers",
  "public_schema_not_client_writable",
  "atomic_lease_create_rpc",
  "atomic_receipt_rpc",
  "receipt_payload_cent_precision",
  "atomic_amendment_rpc",
  "atomic_cost_rpc",
  "secure_invitation_rpc",
  "document_file_guard",
  "lease_document_bucket_config",
  "lease_document_storage_objects_rls",
  "lease_document_storage_read_policy",
  "lease_document_storage_upload_policy",
  "lease_document_storage_delete_guard",
  "lease_document_storage_no_update_policy",
  "duplicate_schedule_trigger",
  "lease_wide_duplicate_guard",
  "retimed_receivable_cycle_guard",
  "retained_lease_receivable_assignment_guard",
  "new_assignment_pricing_guard",
  "paid_receivable_delete_trigger",
  "cash_receipt_balance_trigger",
  "cash_receipt_scope_trigger",
  "receipt_allocation_balance_trigger",
  "receipt_allocation_property_trigger",
  "cash_receipt_status_balance_constraint",
  "guarantee_raw_cent_precision",
  "guarantee_amount_guard",
  "guarantee_status_guard",
  "one_guarantee_per_lease",
];

export async function checkTargetSchema(backendUrl, managementToken, fetchImpl = fetch) {
  const backend = new URL(backendUrl);
  const projectRef = /^([a-z0-9]{20})\.supabase\.co$/.exec(backend.hostname)?.[1];
  if (backend.protocol !== "https:" || backend.origin !== backendUrl.replace(/\/$/, "") || !projectRef) {
    throw new Error("Backend URL must be a hosted Supabase HTTPS origin");
  }
  if (!managementToken?.trim()) {
    throw new Error("SUPABASE_MANAGEMENT_READ_TOKEN is required for the read-only target-schema check");
  }

  const query = await readFile(new URL("./check-target-schema.sql", import.meta.url), "utf8");
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
    throw new Error(`Cannot check target schema: HTTP ${response.status}`);
  }
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length !== requiredSchemaChecks.length) {
    throw new Error("Target schema check returned an incomplete result");
  }
  const required = new Set(requiredSchemaChecks);
  const seen = new Set();
  const missing = [];
  for (const row of rows) {
    if (!required.has(row?.check_name) || seen.has(row.check_name) || typeof row.present !== "boolean") {
      throw new Error("Target schema check returned malformed or repeated results");
    }
    seen.add(row.check_name);
    if (!row.present) missing.push(row.check_name);
  }
  if (missing.length) throw new Error(`Target schema is missing required capabilities: ${missing.join(", ")}`);
  return rows.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const backendUrl = process.argv[2];
  if (!backendUrl) {
    console.error("Usage: npm run check:target-schema -- <supabase-https-origin>");
    process.exit(2);
  }
  try {
    const count = await checkTargetSchema(backendUrl, process.env.SUPABASE_MANAGEMENT_READ_TOKEN);
    console.log(`${backendUrl}: ${count} required schema capabilities are present`);
  } catch (error) {
    console.error(`Target schema check failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
