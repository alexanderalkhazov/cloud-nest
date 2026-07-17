// Route protection (Next 16 proxy — the middleware.ts successor).
//
// This is an OPTIMISTIC check: it only looks for the presence of the Auth.js
// session cookie, without verifying it (verification needs AUTH_SECRET +
// crypto, and our auth config imports the db, which can't run here). That's
// fine: this exists purely for UX (bounce logged-out users to /login before
// any page renders). Real security lives in every Server Component / Server
// Function that calls auth() and checks permissions.
import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSessionCookie = SESSION_COOKIES.some((name) =>
    request.cookies.has(name),
  );

  const isProtected = pathname.startsWith("/dashboard");
  const isAuthPage = pathname === "/login" || pathname === "/register";

  if (isProtected && !hasSessionCookie) {
    const url = new URL("/login", request.url);
    url.searchParams.set("from", pathname); // let login redirect back later
    return NextResponse.redirect(url);
  }

  if (isAuthPage && hasSessionCookie) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/register"],
};
