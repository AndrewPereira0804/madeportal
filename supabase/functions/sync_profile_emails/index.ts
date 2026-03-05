import { createClient } from "@supabase/supabase-js";

declare const Deno: {
  env: {
    get(name: string): string | undefined;
  };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

type ProfileEmailRow = {
  user_id: string;
  email: string | null;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function getRequiredEnv(names: string[]) {
  for (const name of names) {
    const value = Deno.env.get(name);
    if (value) {
      return value;
    }
  }

  throw new Error(`Missing required environment variable: ${names.join(" or ")}`);
}

const supabaseUrl = getRequiredEnv(["SUPABASE_URL", "VITE_SUPABASE_URL"]);
const serviceRoleKey = getRequiredEnv(["SUPABASE_SERVICE_ROLE_KEY"]);

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function requireAdmin(req: Request) {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return {
      error: json({ ok: false, error: "Missing bearer token" }, 401),
      userId: null,
    };
  }

  const token = authorization.slice("Bearer ".length);
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token);

  if (userError || !user) {
    return {
      error: json({ ok: false, error: "Invalid auth token" }, 401),
      userId: null,
    };
  }

  const { data: adminRole, error: roleError } = await supabase
    .from("user_roles")
    .select("role_slug")
    .eq("user_id", user.id)
    .eq("role_slug", "admin")
    .maybeSingle();

  if (roleError || !adminRole) {
    return {
      error: json({ ok: false, error: "Admin role required" }, 403),
      userId: null,
    };
  }

  return {
    error: null,
    userId: user.id,
  };
}

async function listAllAuthUsers() {
  const emailsByUserId = new Map<string, string | null>();
  const perPage = 200;
  let page = 1;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw error;
    }

    const users = data.users ?? [];
    for (const user of users) {
      emailsByUserId.set(user.id, user.email ?? null);
    }

    if (users.length < perPage) {
      break;
    }

    page += 1;
  }

  return emailsByUserId;
}

async function listAllProfiles() {
  const profiles: ProfileEmailRow[] = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("profiles")
      .select("user_id,email")
      .order("user_id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      throw error;
    }

    const rows = (data ?? []) as ProfileEmailRow[];
    profiles.push(...rows);

    if (rows.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return profiles;
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "Use POST" }, 405);
  }

  try {
    const authResult = await requireAdmin(req);
    if (authResult.error) {
      return authResult.error;
    }

    const emailsByUserId = await listAllAuthUsers();
    const profiles = await listAllProfiles();

    const updates = profiles.filter((profile) => {
      const nextEmail = emailsByUserId.get(profile.user_id) ?? null;
      return profile.email !== nextEmail;
    });

    let updatedProfiles = 0;

    for (const batch of chunk(updates, 50)) {
      const results = await Promise.all(
        batch.map(async (profile) => {
          const email = emailsByUserId.get(profile.user_id) ?? null;
          const { error } = await supabase
            .from("profiles")
            .update({ email })
            .eq("user_id", profile.user_id);

          if (error) {
            throw error;
          }

          return 1;
        })
      );

      updatedProfiles += results.length;
    }

    return json({
      ok: true,
      requested_by: authResult.userId,
      scanned_auth_users: emailsByUserId.size,
      scanned_profiles: profiles.length,
      updated_profiles: updatedProfiles,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("sync_profile_emails failed:", message);
    return json({ ok: false, error: message }, 500);
  }
});

/*
Deno.serve(async (req: Request) => {
  try {
    // Only allow POST for safety
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Use POST" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 1) Ensure column exists
    const alterSql = `
      ALTER TABLE public.profiles
      ADD COLUMN IF NOT EXISTS email text;
    `;

    let res = await supabase.rpc("sql_exec", { sql: alterSql }).catch(() => null);

    // The supabase-js client does not provide a direct sql_exec RPC by default.
    // Use the Postgres REST endpoint via RPC: use the built-in query via
    // the SQL function is not present; instead execute via the /rest/v1/rpc or
    // use the SQL API. To avoid needing an admin extension, we'll run ALTER via
    // a normal query using the database REST: use the 'query' RPC (pg_exec) is not standard.
    // Instead, run the DDL using a Postgres function created by the project owner,
    // or use the SQL Admin API. If that's unavailable, fall back to running the UPDATE
    // via supabase.from(). Note: In hosted Supabase Edge Functions, you can call
    // the Postgres SQL using the service role by using the JS client with
    // supabase.rpc('sql', { q: '...' }) only if such RPC exists.
    // To keep the function portable, we'll attempt the DDL via the `query` endpoint
    // by calling the Postgres REST `POST /rest/v1/rpc` is not suitable.
    //
    // Practical approach: perform backfill/update via SQL through supabase-js
    // by issuing an UPDATE with FROM which will succeed if column exists; if not,
    // create column via PG ALTER using a simple attempt with a query through
    // the 'sql' special function. Because typical projects don't have an RPC for arbitrary SQL,
    // we'll attempt the ALTER using a minimal helper: create column if not exists using try/catch in JS.
    //
    // To simplify: attempt ALTER via a direct RPC call to Postgres using '/rest/v1/rpc' is not possible
    // here. So we will attempt the ALTER via a small PL/pgSQL function upsert that creates column if missing.
    //
    // However, the hosted environment permits running arbitrary SQL via the client using
    // the 'supabase.postgres.query' method in newer SDKs — but not available in this import.
    //
    // Simpler and reliable approach: perform the backfill using an UPSERT pattern that
    // will work even if the column is absent: first check column existence via information_schema,
    // then run ALTER using an embedded SQL function executed via supabase.rpc on a helper function
    // 'public.run_sql' which may not exist. Given these environment variations, the recommended
    // flow for you is:
    // 1) Run the ALTER TABLE statement yourself in SQL editor (one-liner provided below).
    // 2) Use this Edge Function only for backfill and verification.
    //
    // We'll therefore:
    // - Check if column exists via querying information_schema.columns
    // - If missing, return a response instructing to run ALTER (include the exact SQL)
    // - If exists, run the UPDATE to backfill and return counts.

    // 1) Check column exists
    const colCheck = await supabase
      .from("information_schema.columns")
      .select("column_name")
      .eq("table_schema", "public")
      .eq("table_name", "profiles")
      .eq("column_name", "email")
      .limit(1)
      .maybeSingle();

    const columnExists = (colCheck.data && Object.keys(colCheck.data).length > 0) || false;

    if (!columnExists) {
      const alterStmt = `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;`;
      return new Response(
        JSON.stringify({
          ok: false,
          message:
            "Column public.profiles.email does not exist. Run the following SQL (as project owner/service role) and re-run this function.",
          sql: alterStmt,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2) Backfill: update profiles.email from auth.users.email where user_id matches auth.users.id
    const updateSql = `
      WITH updated AS (
        UPDATE public.profiles p
        SET email = u.email
        FROM auth.users u
        WHERE p.user_id = u.id
          AND (p.email IS DISTINCT FROM u.email OR p.email IS NULL)
        RETURNING 1
      )
      SELECT count(*) as updated_count FROM updated;
    `;

    // We will run the update via a SQL function call using supabase.rpc to a small SQL function.
    // If you don't have a helper to execute arbitrary SQL via RPC, we can perform the update
    // using the Postgres client by calling a predefined RPC. Since that helper may not exist,
    // instead perform the update by selecting rows from auth.users and updating each profile via JS.
    // That will be done in batches to avoid large payloads.

    // Fetch pairs of (id, email) from auth.users
    const { data: users, error: usersErr } = await supabase
      .from("users")
      .select("id,email")
      .schema("auth");

    if (usersErr) {
      return new Response(
        JSON.stringify({ ok: false, error: "Failed to fetch auth.users: " + usersErr.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!users || users.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: "No users found in auth.users" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Build map user_id -> email
    const updates: Array<{ user_id: string; email: string | null }> = users.map((u: any) => ({
      user_id: u.id,
      email: u.email ?? null,
    }));

    // Update profiles in batches using upsert (insert on conflict) pattern:
    // We'll use supabase.from('profiles').upsert([...], { onConflict: 'user_id' })
    // But upsert requires a primary key or unique constraint; assuming profiles.user_id is PK/unique.
    // Use upsert to set email for existing rows.
    const batchSize = 500;
    let totalUpdated = 0;
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize).map((r) => ({
        user_id: r.user_id,
        email: r.email,
      }));
      const { data: upsertData, error: upsertErr } = await supabase
        .from("profiles")
        .upsert(batch, { onConflict: "user_id", returning: "minimal" });

      if (upsertErr) {
        // If upsert fails (e.g., because user_id isn't primary key), fall back to row-by-row update
        for (const row of batch) {
          const { error: singleErr } = await supabase
            .from("profiles")
            .update({ email: row.email })
            .eq("user_id", row.user_id);
          if (!singleErr) totalUpdated += 1;
        }
      } else {
        // We can't easily tell how many rows changed from upsert response when returning minimal,
        // so count attempts as updated (conservative).
        totalUpdated += batch.length;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message: "Backfill attempted",
        total_users_scanned: updates.length,
        total_profiles_updated_estimate: totalUpdated,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Function error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
*/
