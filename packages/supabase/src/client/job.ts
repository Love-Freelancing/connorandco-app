import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/db";
import { normalizeSupabaseUrl } from "./normalize-url";

export const createClient = () => {
  const supabaseUrl = normalizeSupabaseUrl(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  );

  return createSupabaseClient<Database>(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_KEY!,
  );
};
