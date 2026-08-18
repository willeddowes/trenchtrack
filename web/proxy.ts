import { NextRequest, NextResponse } from "next/server";

// Password-protects everything under /internal/* (the page AND the API
// route it posts to) with a simple cookie-based login -- no accounts
// table, just one shared password compared against an env var.
//
// Why a cookie instead of HTTP Basic Auth: Basic Auth's native browser
// login prompt doesn't play well with fetch() calls made from JavaScript
// (the browser can try to show an invisible credential prompt for an
// unauthenticated fetch, which just hangs instead of returning a normal
// 401 the code can handle). A cookie, once set by /internal/login, is
// automatically sent with every same-origin request including fetch() --
// no special handling needed.
//
// Named `proxy.ts` (not `middleware.ts`) -- Next.js 16 renamed this file
// convention; `middleware.ts` is deprecated as of this version.

const COOKIE_NAME = "tt_admin";

export function proxy(request: NextRequest) {
  // The login page itself must stay reachable, or a visitor without a
  // cookie yet would be redirected to /internal/login only to be
  // redirected right back to itself, forever.
  if (request.nextUrl.pathname === "/internal/login") {
    return NextResponse.next();
  }

  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  if (cookie === process.env.ADMIN_SESSION_TOKEN) {
    return NextResponse.next();
  }

  // The API route can't be redirected to an HTML login page -- it needs a
  // plain 401 so the fetch() call in the browser can detect the failure.
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  return NextResponse.redirect(new URL("/internal/login", request.url));
}

export const config = {
  matcher: [
    "/internal/:path*",
    "/api/espn-entry/:path*",
    "/api/recompute-grades/:path*",
    "/api/articles/:path*",
  ],
};
