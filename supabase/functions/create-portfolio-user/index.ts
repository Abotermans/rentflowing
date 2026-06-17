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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
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

  let body: any;
  try { body = await req.json(); } catch { return json(400, { error: "Invalid JSON" }); }

  const portfolio_id = String(body.portfolio_id ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const role = String(body.role ?? "") as Role;
  const first_name = body.first_name ? String(body.first_name).trim().slice(0, 100) : null;
  const last_name = body.last_name ? String(body.last_name).trim().slice(0, 100) : null;

  if (!portfolio_id) return json(400, { error: "portfolio_id required" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
    return json(400, { error: "Invalid email" });
  if (password.length < 8 || password.length > 128)
    return json(400, { error: "Password must be 8-128 characters" });
  if (!ROLES.includes(role)) return json(400, { error: "Invalid role" });

  const { data: callerMember, error: cmErr } = await admin
    .from("portfolio_members")
    .select("role")
    .eq("portfolio_id", portfolio_id)
    .eq("user_id", callerId)
    .maybeSingle();
  if (cmErr) return json(500, { error: cmErr.message });
  if (!callerMember) return json(403, { error: "Not a member of this portfolio" });
  const callerRole = callerMember.role as Role;
  if (callerRole !== "owner" && callerRole !== "admin")
    return json(403, { error: "Only owners and admins can add members" });
  if (role === "owner" && callerRole !== "owner")
    return json(403, { error: "Only owners can add another owner" });

  let userId: string | null = null;
  let created = false;

  // Find existing auth user by email (paginate)
  let page = 1;
  while (true) {
    const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (listErr) return json(500, { error: listErr.message });
    const hit = list.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (hit) { userId = hit.id; break; }
    if (list.users.length < 200) break;
    page++;
    if (page > 25) break; // safety
  }

  if (!userId) {
    const { data: createdUser, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: first_name ?? "", last_name: last_name ?? "" },
    });
    if (createErr || !createdUser.user)
      return json(400, { error: createErr?.message ?? "Failed to create user" });
    userId = createdUser.user.id;
    created = true;
  }

  await admin.from("profiles").upsert(
    { id: userId, first_name, last_name },
    { onConflict: "id" },
  );

  const { error: memErr } = await admin
    .from("portfolio_members")
    .upsert(
      { portfolio_id, user_id: userId, role },
      { onConflict: "portfolio_id,user_id" },
    );
  if (memErr) return json(400, { error: memErr.message });

  return json(200, { user_id: userId, created, email });
});