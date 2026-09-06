import { NextResponse } from "next/server";
import { COOKIE_NAME, verifySession } from "@/lib/auth";

// Everything in Jamarik sits behind the login gate. The matcher below already
// excludes Next's own asset routes; the login page and its API are the only
// paths allowed through unauthenticated.
const PUBLIC = ["/login", "/api/auth/login"];

export async function middleware(req) {
  const { pathname, search } = req.nextUrl;

  const session = await verifySession(req.cookies.get(COOKIE_NAME)?.value);
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"));

  // Signed in and heading for the login page — send them to the portal.
  if (session && pathname === "/login") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  if (session || isPublic) return NextResponse.next();

  // API calls get a clean 401 rather than an HTML redirect.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const url = new URL("/login", req.url);
  if (pathname !== "/") url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|fonts/).*)"],
};
