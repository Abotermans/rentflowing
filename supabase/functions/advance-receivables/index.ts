import { createClient } from "npm:@supabase/supabase-js@2";
import {
  collectRowsById,
  isValidBusinessDate,
  runDueReceivableJob,
  type DatabaseRow,
} from "../../../src/lib/serverReceivableJob.ts";
import { runDueAmendmentJob } from "../../../src/lib/serverAmendmentJob.ts";
import { isCompleteAmendmentActivationResponse, type ServerAmendmentRows } from "../../../src/lib/serverAmendmentActivation.ts";
import { calendarDateISO } from "../../../src/lib/calendarToday.ts";
import { DEFAULT_BUSINESS_TIME_ZONE } from "../../../src/lib/businessTimeZone.ts";
import { parseScheduledBusinessInstant } from "../../../src/lib/scheduledBusinessInstant.ts";
import { hasScheduledJobSecret, isConfiguredScheduledJobSecret } from "../../../src/lib/scheduledJobAuth.ts";

const JOB_NAME = "advance-receivables";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json(405, { error: "Method not allowed" });
  const secret = Deno.env.get("SCHEDULED_JOB_SECRET");
  if (!isConfiguredScheduledJobSecret(secret)) return json(503, { error: "Scheduled job secret is not configured securely" });
  if (!hasScheduledJobSecret(request, secret)) {
    return json(401, { error: "Unauthorized" });
  }
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json(503, { error: "Backend credentials unavailable" });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Invalid JSON" });
  }
  let businessInstant: Date;
  try {
    businessInstant = parseScheduledBusinessInstant(
      typeof body === "object" && body !== null && "businessInstant" in body
        ? body.businessInstant
        : null,
    );
  } catch (error) {
    return json(400, { error: error instanceof Error ? error.message : "Invalid businessInstant" });
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const unwrap = (result: { data: DatabaseRow[] | null; error: { message: string } | null }): DatabaseRow[] => {
    if (result.error) throw new Error(result.error.message);
    return result.data ?? [];
  };
  const listAll = async (
    query: (afterId: string | null, limit: number) => PromiseLike<{ data: DatabaseRow[] | null; error: { message: string } | null }>,
  ): Promise<DatabaseRow[]> => collectRowsById(
    async (afterId, limit) => unwrap(await query(afterId, limit)),
  );

  const listByIds = async (table: string, column: string, ids: string[]): Promise<DatabaseRow[]> => {
    const rows: DatabaseRow[] = [];
    for (let start = 0; start < ids.length; start += 100) {
      const group = ids.slice(start, start + 100);
      rows.push(...await listAll((afterId, limit) => {
        const query = admin.from(table).select("*").in(column, group).order("id").limit(limit);
        return afterId ? query.gt("id", afterId) : query;
      }));
    }
    return rows;
  };

  const loadAmendmentRows = async (amendment: DatabaseRow): Promise<ServerAmendmentRows> => {
    const portfolioId = String(amendment.portfolio_id);
    const leaseId = String(amendment.lease_id);
    const leases = await listAll((afterId, limit) => {
      const query = admin.from("leases").select("*").eq("portfolio_id", portfolioId)
        .order("id").limit(limit);
      return afterId ? query.gt("id", afterId) : query;
    });
    const lease = leases.find(row => row.id === leaseId);
    if (!lease) throw new Error(`Lease ${leaseId} no longer exists`);
    const propertyId = String(lease.property_id);
    const propertyLeases = leases.filter(row => row.property_id === propertyId);
    const amendments = await listAll((afterId, limit) => {
      const query = admin.from("lease_amendments").select("*").eq("lease_id", leaseId)
        .order("id").limit(limit);
      return afterId ? query.gt("id", afterId) : query;
    });
    const receivables = await listAll((afterId, limit) => {
      const query = admin.from("receivable_items").select("*").eq("lease_id", leaseId)
        .order("id").limit(limit);
      return afterId ? query.gt("id", afterId) : query;
    });
    const [properties, units, tenants, assignments, changes, allocations] = await Promise.all([
      listAll((afterId, limit) => {
        const query = admin.from("properties").select("*")
          .eq("id", propertyId).eq("portfolio_id", portfolioId).order("id").limit(limit);
        return afterId ? query.gt("id", afterId) : query;
      }),
      listAll((afterId, limit) => {
        const query = admin.from("units").select("*")
          .eq("property_id", propertyId).eq("portfolio_id", portfolioId).order("id").limit(limit);
        return afterId ? query.gt("id", afterId) : query;
      }),
      listAll((afterId, limit) => {
        const query = admin.from("tenants").select("*")
          .eq("portfolio_id", portfolioId).order("id").limit(limit);
        return afterId ? query.gt("id", afterId) : query;
      }),
      listByIds("lease_unit_assignments", "lease_id", propertyLeases.map(row => String(row.id))),
      listByIds("lease_amendment_changes", "amendment_id", amendments.map(row => String(row.id))),
      listByIds("receipt_allocations", "receivable_item_id", receivables.map(row => String(row.id))),
    ]);
    if (properties.length !== 1) throw new Error(`Property ${propertyId} no longer exists`);
    return { properties, units, tenants, leases, assignments, amendments, changes, receivables, allocations };
  };

  try {
    const properties = await listAll((afterId, limit) => {
      const query = admin.from("properties")
        .select("id,portfolio_id,currency_code,time_zone").order("id").limit(limit);
      return afterId ? query.gt("id", afterId) : query;
    });
    const propertyById = new Map(properties.map(row => [String(row.id), row]));
    const zones = [...new Set(properties.map(row => String(row.time_zone || DEFAULT_BUSINESS_TIME_ZONE)))];
    const dateByZone = new Map(zones.map(zone => [zone, calendarDateISO(businessInstant, zone)]));
    const maxDate = [...dateByZone.values()].sort().at(-1) ?? calendarDateISO(businessInstant, DEFAULT_BUSINESS_TIME_ZONE);
    if (!isValidBusinessDate(maxDate)) throw new Error("Invalid property business date");
    const dateForProperty = (property: DatabaseRow): string => {
      const zone = String(property.time_zone || DEFAULT_BUSINESS_TIME_ZONE);
      const date = dateByZone.get(zone);
      if (!date) throw new Error(`Missing business date for time zone ${zone}`);
      return date;
    };
    const amendments = await runDueAmendmentJob({
      listDueAmendments: async (date) => listAll((afterId, limit) => {
        const query = admin.from("lease_amendments")
          .select("*").eq("status", "scheduled").lte("effective_date", date)
          .order("id").limit(limit);
        return afterId ? query.gt("id", afterId) : query;
      }),
      dateForAmendment: async (amendment) => {
        const lease = unwrap(await admin.from("leases")
          .select("id,property_id").eq("id", String(amendment.lease_id)).limit(1))[0];
        const property = lease && propertyById.get(String(lease.property_id));
        if (!property) throw new Error(`Missing property for amendment ${String(amendment.id)}`);
        return dateForProperty(property);
      },
      loadRows: loadAmendmentRows,
      getLeadDays: async (portfolioId) => {
        const portfolio = unwrap(await admin.from("portfolios")
          .select("id,receivable_lead_days").eq("id", portfolioId).limit(1));
        if (portfolio.length !== 1) throw new Error(`Portfolio ${portfolioId} no longer exists`);
        return Number(portfolio[0].receivable_lead_days ?? 15);
      },
      activate: async (args) => {
        const response = await admin.rpc("activate_amendment_with_schedule", args);
        if (response.error) throw new Error(response.error.message);
        if (!isCompleteAmendmentActivationResponse(args, response.data)) {
          throw new Error("The database did not confirm the complete amendment activation.");
        }
      },
    }, maxDate);

    if (amendments.incompleteAmendmentIds.length > 0) {
      console.error("Scheduled amendments incomplete; skipping lifecycle and receivable generation", amendments.incompleteAmendmentIds);
      return json(409, { businessInstant: businessInstant.toISOString(), amendments });
    }

    const lifecycle: DatabaseRow[] = [];
    for (const zone of zones) {
      const transition = await admin.rpc("advance_due_lease_lifecycle_for_zone", {
        p_business_date: dateByZone.get(zone), p_time_zone: zone,
      });
      if (transition.error) throw new Error(transition.error.message);
      lifecycle.push({ timeZone: zone, businessDate: dateByZone.get(zone), result: transition.data });
    }

    const result = await runDueReceivableJob({
      listPortfolios: async (afterId, limit) => {
        const query = admin.from("portfolios").select("id,receivable_lead_days")
          .order("id").limit(limit);
        return unwrap(await (afterId ? query.gt("id", afterId) : query));
      },
      listLeases: async (portfolioId, afterId, limit) => {
        const query = admin.from("leases").select("*").eq("portfolio_id", portfolioId)
          .in("lifecycle_stage", ["signed", "active"])
          .order("id").limit(limit);
        return unwrap(await (afterId ? query.gt("id", afterId) : query));
      },
      listProperties: async (ids) => ids.map(id => propertyById.get(id)).filter((row): row is DatabaseRow => Boolean(row)),
      listAssignments: async (ids) => listAll((afterId, limit) => {
        const query = admin.from("lease_unit_assignments")
          .select("*").in("lease_id", ids).order("id").limit(limit);
        return afterId ? query.gt("id", afterId) : query;
      }),
      listUnits: async (ids) => listByIds("units", "id", ids),
      listAmendments: async (ids) => listAll((afterId, limit) => {
        const query = admin.from("lease_amendments")
          .select("*").in("lease_id", ids).in("status", ["active", "ended", "terminated"])
          .order("id").limit(limit);
        return afterId ? query.gt("id", afterId) : query;
      }),
      listChanges: async (ids) => listAll((afterId, limit) => {
        const query = admin.from("lease_amendment_changes")
          .select("*").in("amendment_id", ids).order("id").limit(limit);
        return afterId ? query.gt("id", afterId) : query;
      }),
      insert: async (portfolioId, rows) => {
        const response = await admin.rpc("insert_due_lease_receivables", {
          p_portfolio_id: portfolioId,
          p_rows: rows,
        });
        if (response.error) throw new Error(response.error.message);
        if (typeof response.data !== "number" || !Number.isInteger(response.data)) {
          throw new Error("The database did not confirm the receivable insertion count.");
        }
        return response.data;
      },
    }, maxDate, undefined, dateForProperty);

    if (result.incompleteLeaseIds.length > 0) {
      console.error("Incomplete scheduled work", result.incompleteLeaseIds);
      return json(409, { businessInstant: businessInstant.toISOString(), lifecycle, amendments, ...result });
    }
    const { error: healthError } = await admin.from("scheduled_job_health").upsert({
      job_name: JOB_NAME,
      last_succeeded_at: new Date().toISOString(),
    }, { onConflict: "job_name" });
    if (healthError) throw healthError;
    return json(200, { businessInstant: businessInstant.toISOString(), lifecycle, amendments, ...result });
  } catch (error) {
    console.error("advance-receivables failed", error);
    return json(500, { error: "Scheduled receivable job failed" });
  }
});
