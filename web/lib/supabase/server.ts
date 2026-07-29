import "server-only";
import { createClient } from "@supabase/supabase-js";

// "server-only" makes it a build error to accidentally import this file
// from a Client Component -- these two functions should only ever run on
// the server (in Server Components or Route Handlers).

/**
 * A read-only Supabase client using the public anon key. Safe to use in
 * Server Components that just display data -- Row Level Security still
 * restricts it to SELECT-only, same as if it ran in the browser.
 */
export function createAnonServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/**
 * A full-access Supabase client using the secret service_role key, which
 * bypasses Row Level Security entirely. Only ever use this where writes
 * are actually needed (e.g. the ESPN entry API route) -- never for a page
 * that's just displaying data.
 */
export function createServiceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
