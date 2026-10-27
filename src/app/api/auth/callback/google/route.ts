import { NextResponse, type NextRequest } from "next/server";
import { audit } from "@/server/audit";
import { exchangeCode, origin } from "@/server/auth/google";
import { HttpError, upsertUser } from "@/server/auth/session";
import { cookieOptions, OAUTH_COOKIE, SESSION_COOKIE, SESSION_HOURS, signSession, verifyOAuthState } from "@/server/auth/token";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

function fail(req: NextRequest, message: string) {
  const res = NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, origin(req)));
  res.cookies.delete(OAUTH_COOKIE);
  return res;
}

/** Google redirects here after sign-in. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  if (q.get("error")) return fail(req, q.get("error") === "access_denied" ? "Sign-in was cancelled." : `Google: ${q.get("error")}`);
  const saved = await verifyOAuthState(req.cookies.get(OAUTH_COOKIE)?.value);
  const code = q.get("code");
  if (!saved || !code || q.get("state") !== saved.state) return fail(req, "Sign-in expired or was started in another browser. Please try again.");
  try {
    const profile = await exchangeCode(req, code, saved.verifier, saved.nonce);
    const user = await upsertUser(profile);
    await audit(await db(), user, "session", user.id, "sign-in", `Signed in with Google as ${user.role}`);
    const res = NextResponse.redirect(new URL(saved.next, origin(req)));
    res.cookies.delete(OAUTH_COOKIE);
    res.cookies.set(SESSION_COOKIE, await signSession({ sub: user.id, email: user.email }), cookieOptions(SESSION_HOURS * 3600));
    return res;
  } catch (e) {
    if (!(e instanceof HttpError)) console.error(e);
    return fail(req, e instanceof Error ? e.message : "Sign-in failed.");
  }
}
