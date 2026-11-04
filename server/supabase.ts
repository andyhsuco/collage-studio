import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { jsonError } from "./http.js";

let client: SupabaseClient | null = null;
let cacheKey = "";

/**
 * Service-role client. The key bypasses RLS and must stay on the server.
 * Returns a 503 response when the project env vars are missing.
 */
export function getServiceClient(): SupabaseClient | Response {
  const url = process.env.SUPABASE_URL?.trim() ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  if (!url || !key) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return jsonError(
      "Collage storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      503,
    );
  }

  const nextKey = `${url}\n${key.length}`;
  if (!client || cacheKey !== nextKey) {
    client = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    cacheKey = nextKey;
  }
  return client;
}
