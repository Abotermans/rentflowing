import { createClient } from "npm:@supabase/supabase-js@2";
import { authenticateScheduledRequest } from "../_shared/scheduled-auth.ts";
// @deno-types="../_shared/server-jobs.d.ts"
import {
  removeStorageFileIfPresent,
  runDocumentFileCleanup,
} from "../_shared/server-jobs.js";

const JOB_NAME = "cleanup-lease-document-files";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json(405, { error: "Method not allowed" });
  const authError = authenticateScheduledRequest(request);
  if (authError) return authError;
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json(503, { error: "Backend credentials unavailable" });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  try {
    const { data: pending, error: listError } = await admin
      .from("lease_document_file_deletions")
      .select("id,portfolio_id,lease_id,document_id,storage_path,attempts")
      .order("attempts", { ascending: true })
      .order("created_at")
      .limit(100);
    if (listError) throw listError;
    const result = await runDocumentFileCleanup(pending ?? [], {
      removeFile: async (path) => {
        await removeStorageFileIfPresent(admin.storage.from("lease-documents"), path);
      },
      acknowledge: async (id) => {
        const { data: acknowledged, error: ackError } = await admin
          .from("lease_document_file_deletions")
          .delete().eq("id", id).select("id");
        if (ackError || acknowledged?.length !== 1) {
          throw new Error(ackError?.message ?? "File cleanup acknowledgement was not saved");
        }
      },
      recordFailure: async (item, message) => {
        console.error("Document file cleanup failed", item.id, message);
        const { error: retryError } = await admin.from("lease_document_file_deletions")
          .update({ attempts: item.attempts + 1, last_error: message.slice(0, 500) })
          .eq("id", item.id);
        if (retryError) throw retryError;
      },
      countRemaining: async () => {
        const { count, error } = await admin.from("lease_document_file_deletions")
          .select("id", { count: "exact", head: true });
        if (error) throw error;
        return count ?? 0;
      },
    });
    if (result.failedIds.length || result.remaining) return json(409, result);
    const { error: healthError } = await admin.from("scheduled_job_health").upsert({
      job_name: JOB_NAME,
      last_succeeded_at: new Date().toISOString(),
    }, { onConflict: "job_name" });
    if (healthError) throw healthError;
    return json(200, result);
  } catch (error) {
    console.error("Document cleanup job failed", error);
    return json(500, { error: "Document cleanup outcome could not be verified" });
  }
});
