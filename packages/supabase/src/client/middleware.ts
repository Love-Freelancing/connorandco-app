import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import { normalizeSupabaseUrl } from "./normalize-url";

export async function updateSession(
  request: NextRequest,
  response: NextResponse,
) {
  const supabaseUrl = normalizeSupabaseUrl(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  );

  const supabase = createServerClient(
    supabaseUrl,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            request.cookies.set({ name, value, ...options });
            response.cookies.set({ name, value, ...options });
          }
        },
      },
    },
  );

  // Required for SSR auth: refreshes/validates the session and persists any
  // updated auth cookies back to the response.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return {
    response,
    hasSession: Boolean(user),
  };
}
