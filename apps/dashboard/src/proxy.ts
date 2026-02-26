import { updateSession } from "@connorco/supabase/middleware";
import { type NextRequest, NextResponse } from "next/server";
import { createI18nMiddleware } from "next-international/middleware";

const I18nMiddleware = createI18nMiddleware({
  locales: ["en"],
  defaultLocale: "en",
  urlMappingStrategy: "rewrite",
});

export async function proxy(request: NextRequest) {
  const { response, hasSession } = await updateSession(
    request,
    I18nMiddleware(request),
  );
  const origin = request.nextUrl.origin;
  const nextUrl = request.nextUrl;

  const pathnameLocale = nextUrl.pathname.split("/", 2)?.[1];

  // Remove the locale from the pathname
  const pathnameWithoutLocale = pathnameLocale
    ? nextUrl.pathname.slice(pathnameLocale.length + 1)
    : nextUrl.pathname;

  // Create a new URL without the locale in the pathname
  const newUrl = new URL(pathnameWithoutLocale || "/", origin);

  const encodedSearchParams = `${newUrl?.pathname?.substring(1)}${
    newUrl.search
  }`;

  const isPublicPath =
    newUrl.pathname === "/login" ||
    newUrl.pathname.includes("/i/") ||
    newUrl.pathname.includes("/client/") ||
    newUrl.pathname.includes("/p/") ||
    newUrl.pathname.includes("/s/") ||
    newUrl.pathname.includes("/r/") ||
    newUrl.pathname.includes("/verify") ||
    newUrl.pathname.includes("/oauth-callback") ||
    newUrl.pathname.includes("/desktop/search");

  if (!hasSession) {
    if (!isPublicPath) {
      const loginUrl = new URL("/login", origin);

      if (encodedSearchParams) {
        loginUrl.searchParams.append("return_to", encodedSearchParams);
      }

      return NextResponse.redirect(loginUrl);
    }

    return response;
  }

  // Auth cookie exists. Let server components and API route guards validate session
  // to keep client-side navigation responsive.
  if (newUrl.pathname !== "/onboarding" && newUrl.pathname !== "/teams") {
    const inviteCodeMatch = newUrl.pathname.startsWith("/teams/invite/");

    if (inviteCodeMatch) {
      return NextResponse.redirect(`${origin}${request.nextUrl.pathname}`);
    }
  }

  // If all checks pass, return the original or updated response
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};
