import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/server/auth/token";

/**
 * Server mode (DATABASE_URL set): every page needs a signed-in session.
 * API routes check the session themselves and answer 401 JSON instead.
 */
export async function middleware(req: NextRequest) {
  if (!process.env.DATABASE_URL) return NextResponse.next();
  const { pathname, search } = req.nextUrl;
  if (pathname === "/login") return NextResponse.next();
  const ok = (process.env.AUTH_SECRET ?? "").length >= 32 && (await verifySession(req.cookies.get(SESSION_COOKIE)?.value));
  if (ok) return NextResponse.next();
  const url = new URL("/login", req.url);
  if (pathname !== "/") url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  // Pages only: skip API routes, Next.js internals and files with an extension.
  matcher: ["/((?!api/|_next/|.*\\..*).*)"],
};
