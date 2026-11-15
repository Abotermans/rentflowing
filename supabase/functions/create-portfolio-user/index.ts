import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Role = "owner" | "admin" | "editor" | "viewer";
const ROLES: Role[] = ["owner", "admin", "editor", "viewer"];

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errMsg(e: unknown, fallback = "Unknown error"): string {
  if (!e) return fallback;
  if (typeof e === "string") return e;
  if (typeof e !== "object") return fallback;
  const error = e as Record<string, unknown>;
  for (const key of ["message", "error_description", "msg", "details", "hint", "code"]) {
    if (typeof error[key] === "string" && error[key]) return error[key];
  }
  return fallback;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(SUPABASE_URL, SERVICE);

  const { data: claims, error: claimsErr } = await userClient.auth.getClaims(
    authHeader.replace("Bearer ", ""),
  );
  if (claimsErr || !claims?.claims?.sub) return json(401, { error: "Unauthorized" });
  const callerId = claims.claims.sub as string;

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return json(400, { error: "Invalid JSON" });
    body = parsed as Record<string, unknown>;
  } catch { return json(400, { error: "Invalid JSON" }); }

  const portfolio_id = String(body.portfolio_id ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const role = String(body.role ?? "") as Role;

  if (!portfolio_id) return json(400, { error: "portfolio_id required" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
    return json(400, { error: "Invalid email" });
  if (!ROLES.includes(role)) return json(400, { error: "Invalid role" });

  const { data: callerMember, error: cmErr } = await admin
    .from("portfolio_members")
    .select("role")
    .eq("portfolio_id", portfolio_id)
    .eq("user_id", callerId)
    .maybeSingle();
  if (cmErr) return json(500, { error: errMsg(cmErr, "Membership lookup failed") });
  if (!callerMember) return json(403, { error: "Not a member of this portfolio" });
  const callerRole = callerMember.role as Role;
  if (callerRole !== "owner" && callerRole !== "admin")
    return json(403, { error: "Only owners and admins can add members" });
  if (role === "owner" && callerRole !== "owner")
    return json(403, { error: "Only owners can add another owner" });

  let userId: string | null = null;
  let emailConfirmed = false;

  // Find existing auth user by email (paginate)
  let page = 1;
  while (true) {
    const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (listErr) return json(500, { error: errMsg(listErr, "User lookup failed") });
    const hit = list.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (hit) { userId = hit.id; emailConfirmed = !!hit.email_confirmed_at; break; }
    if (list.users.length < 200) break;
    page++;
    if (page > 25) break; // safety
  }

  if (!userId) return json(404, { error: "No existing account found. Send a portfolio invitation instead." });
  if (!emailConfirmed) return json(403, { error: "This account has not confirmed its email. Send an invitation instead." });

  // Insertion cannot change an existing member's role; that has a separate UI.
  const { data: membership, error: memErr } = await userClient
    .from("portfolio_members")
    .insert({ portfolio_id, user_id: userId, role })
    .select("user_id");
  if (memErr?.code === "23505") {
    return json(409, { error: "This account is already a member. Change its role in the member list." });
  }
  if (memErr?.code === "42501") {
    return json(403, { error: "You do not have permission to add this member with the selected role." });
  }
  if (memErr || membership?.length !== 1) {
    console.error("create-portfolio-user membership failed", memErr);
    return json(500, {
      error: "Portfolio access could not be saved. Check role permissions and try again.",
    });
  }

  return json(200, { user_id: userId, email });
  } catch (e) {
    console.error("create-portfolio-user fatal", e);
    return json(500, { error: errMsg(e, "Internal error") });
  }
});
