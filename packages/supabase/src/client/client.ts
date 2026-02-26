import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "../types";
import { normalizeSupabaseUrl } from "./normalize-url";

export const createClient = () => {
  const supabaseUrl = normalizeSupabaseUrl(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  );

  return createBrowserClient<Database>(
    supabaseUrl,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
};
