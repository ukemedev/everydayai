/**
 * set-admin.ts
 *
 * One-time script: grants is_admin = true to a user by email.
 *
 * Usage (run from workspace root):
 *   ADMIN_EMAIL=ukemedaniel18@gmail.com \
 *   VITE_SUPABASE_URL=https://xxxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=service_role_key_here \
 *   pnpm --filter @workspace/scripts tsx src/set-admin.ts
 *
 * Safe to run multiple times (idempotent UPDATE).
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL  = process.env.ADMIN_EMAIL;

if (!SUPABASE_URL || !SERVICE_KEY || !ADMIN_EMAIL) {
  console.error(
    "❌  Missing env vars. Required: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAIL"
  );
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

async function run() {
  console.log(`Looking up user: ${ADMIN_EMAIL} …`);

  // 1. Find the user's ID from auth.users via the admin API
  const { data: listData, error: listErr } = await sb.auth.admin.listUsers({
    perPage: 1000,
  });

  if (listErr) {
    console.error("❌  Failed to list auth users:", listErr.message);
    process.exit(1);
  }

  const user = listData.users.find((u) => u.email === ADMIN_EMAIL);

  if (!user) {
    console.error(`❌  No auth user found with email "${ADMIN_EMAIL}".`);
    console.error(
      "    If you just signed up, try again in a few seconds. Otherwise check the email spelling."
    );
    process.exit(1);
  }

  console.log(`Found user  id=${user.id}  email=${user.email}`);

  // 2. Upsert the profiles row with is_admin = true
  const { error: upsertErr } = await sb
    .from("profiles")
    .upsert(
      { id: user.id, is_admin: true },
      { onConflict: "id" }
    );

  if (upsertErr) {
    console.error("❌  Failed to set is_admin:", upsertErr.message);
    process.exit(1);
  }

  console.log(`✅  is_admin = true set for ${ADMIN_EMAIL} (id=${user.id})`);
  console.log("    You can now log in and visit /admin.");
}

run().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
