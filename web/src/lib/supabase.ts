import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

/** Null when the deployment has no Supabase config — the app then runs guest-only. */
export function supabase(): SupabaseClient | null {
  if (!url || !key || typeof window === "undefined") return null;
  client ??= createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
  return client;
}

export async function getAccessToken(): Promise<string | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.access_token ?? null;
}
