// admin-users — Mamos Trend Color
// Admin-only Edge Function to list users and toggle premium status.
// Only accessible by the admin email (crypto.mamos@gmail.com).
//
// Deploy: supabase functions deploy admin-users
//
// Endpoints:
//   GET  / → list all users with premium status
//   POST / → { userId, premiumActive } → toggle premium for a user

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL        = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_EMAIL          = "crypto.mamos@gmail.com";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Verify caller is authenticated
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const jwt = authHeader.replace("Bearer ", "");

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // Verify JWT and check admin email
  const anonClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: { user: caller }, error: authErr } = await anonClient.auth.getUser();
  if (authErr || !caller) return json({ error: "Invalid session" }, 401);
  if (caller.email !== ADMIN_EMAIL) return json({ error: "Forbidden" }, 403);

  // ── GET: list users ────────────────────────────────────────────────────────
  if (req.method === "GET") {
    const { data: { users }, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (error) return json({ error: error.message }, 500);

    const list = users.map(u => ({
      id:            u.id,
      email:         u.email ?? "",
      createdAt:     u.created_at,
      lastSignIn:    u.last_sign_in_at ?? null,
      premiumActive: u.user_metadata?.premium_active === true,
      plan:          u.user_metadata?.plan ?? "Free Plan",
    }));

    // Sort: premium first, then by creation date
    list.sort((a, b) => {
      if (a.premiumActive !== b.premiumActive) return a.premiumActive ? -1 : 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return json({ users: list });
  }

  // ── POST: toggle premium ───────────────────────────────────────────────────
  if (req.method === "POST") {
    const body = await req.json().catch(() => null);
    if (!body?.userId || typeof body.premiumActive !== "boolean") {
      return json({ error: "Missing userId or premiumActive" }, 400);
    }

    const { userId, premiumActive } = body;

    // Get current user metadata to merge
    const { data: { user: target }, error: fetchErr } = await admin.auth.admin.getUserById(userId);
    if (fetchErr || !target) return json({ error: "User not found" }, 404);

    const plan  = premiumActive ? (body.plan ?? "Premium Monthly") : "Free Plan";
    const price = premiumActive ? (plan === "Premium Annual" ? "$39.99/year" : "$4.99/month") : "Free";

    const { error: updateErr } = await admin.auth.admin.updateUserById(userId, {
      user_metadata: {
        ...target.user_metadata,
        premium_active: premiumActive,
        plan,
        price,
      },
    });

    if (updateErr) return json({ error: updateErr.message }, 500);

    console.log(`[admin-users] ${caller.email} set premium=${premiumActive} for ${target.email}`);
    return json({ ok: true, userId, premiumActive, plan });
  }

  return json({ error: "Method not allowed" }, 405);
});
