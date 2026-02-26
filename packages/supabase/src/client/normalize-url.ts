const LOCAL_SUPABASE_HOST = "local.supabase.co";
const LOCAL_SUPABASE_PORT = "54321";

export function normalizeSupabaseUrl(value: string | null | undefined): string {
  const rawUrl = value?.trim();

  if (!rawUrl) {
    return "";
  }

  try {
    const parsed = new URL(rawUrl);

    if (parsed.hostname === LOCAL_SUPABASE_HOST) {
      parsed.hostname = "127.0.0.1";

      if (!parsed.port) {
        parsed.port = LOCAL_SUPABASE_PORT;
      }

      return parsed.toString().replace(/\/$/, "");
    }

    return rawUrl;
  } catch {
    return rawUrl;
  }
}
