import { NextResponse, type NextRequest } from "next/server";
import { env, serverMode } from "@/server/config";
import { authorizationUrl, randomToken } from "@/server/auth/google";
import { cookieOptions, OAUTH_COOKIE, safeNext, signOAuthState } from "@/server/auth/token";

export const dynamic = "force-dynamic";

/** Start Google Workspace sign-in. */
export async function GET(req: NextRequest) {
  if (!serverMode() || !env.auth.googleClientId) return NextResponse.redirect(new URL("/login?error=Google+sign-in+is+not+configured", req.url));
  const s = { state: randomToken(), nonce: randomToken(), verifier: randomToken(), next: safeNext(req.nextUrl.searchParams.get("next")) };
  const res = NextResponse.redirect(await authorizationUrl(req, s));
  res.cookies.set(OAUTH_COOKIE, await signOAuthState(s), cookieOptions(600));
  return res;
}
