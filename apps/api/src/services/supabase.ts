import type { Database } from "@connorco/supabase/types";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

function normalizeSupabaseUrl(value: string | null | undefined): string {
  const rawUrl = value?.trim();

  if (!rawUrl) {
    return "";
  }

  try {
    const parsed = new URL(rawUrl);

    if (parsed.hostname === "local.supabase.co") {
      parsed.hostname = "127.0.0.1";

      if (!parsed.port) {
        parsed.port = "54321";
      }

      return parsed.toString().replace(/\/$/, "");
    }

    return rawUrl;
  } catch {
    return rawUrl;
  }
}

export async function createClient(accessToken?: string) {
  const supabaseUrl = normalizeSupabaseUrl(process.env.SUPABASE_URL);

  return createSupabaseClient<Database>(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_KEY!,
    {
      accessToken() {
        return Promise.resolve(accessToken || "");
      },
    },
  );
}

export async function createAdminClient() {
  const supabaseUrl = normalizeSupabaseUrl(process.env.SUPABASE_URL);

  return createSupabaseClient<Database>(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_KEY!,
  );
}
