import { createClient } from "@connorco/supabase/server";
import { sanitizeRedirectPath } from "@connorco/utils/sanitize-redirect";
import type { EmailOtpType } from "@supabase/supabase-js";
import { addSeconds } from "date-fns";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { Cookies } from "@/utils/constants";

export async function GET(req: NextRequest) {
  const requestUrl = new URL(req.url);
  const origin = requestUrl.origin;
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type") as EmailOtpType | null;
  const returnTo = requestUrl.searchParams.get("return_to") ?? "/";

  if (!tokenHash || !type) {
    return NextResponse.redirect(`${origin}/login?auth_error=invalid_link`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });

  if (error) {
    return NextResponse.redirect(`${origin}/login?auth_error=invalid_or_expired`);
  }

  const cookieStore = await cookies();
  cookieStore.set(Cookies.ForcePrimary, "true", {
    expires: addSeconds(new Date(), 30),
    httpOnly: false,
    sameSite: "lax",
  });

  const normalized = returnTo.startsWith("/") ? returnTo : `/${returnTo}`;
  const safePath = sanitizeRedirectPath(normalized);
  return NextResponse.redirect(`${origin}${safePath}`);
}
