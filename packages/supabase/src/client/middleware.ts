import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import { normalizeSupabaseUrl } from "./normalize-url";

function hasSupabaseAuthCookie(request: NextRequest) {
  return request.cookies
    .getAll()
    .some((cookie) => cookie.name.includes("-auth-token"));
}

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
    error,
  } = await supabase.auth.getUser();

  const cookieSession = hasSupabaseAuthCookie(request);
  const hasSession = Boolean(user) || (cookieSession && Boolean(error));

  return {
    response,
    hasSession,
  };
}
