import { NextResponse, type NextRequest } from "next/server";
import { isRole } from "@/lib/roles";
import { audit } from "@/server/audit";
import { apiError, upsertUser } from "@/server/auth/session";
import { cookieOptions, SESSION_COOKIE, SESSION_HOURS, signSession } from "@/server/auth/token";
import { env, serverMode } from "@/server/config";
import { db, schema } from "@/server/db";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/**
 * Password-less sign-in for local development and automated tests.
 * Requires AUTH_DEV_LOGIN=1, never works on Vercel, and only answers on localhost.
 */
export async function POST(req: NextRequest) {
  if (!serverMode() || !env.auth.devLogin || !LOCAL.test(req.headers.get("host") ?? "")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const body = (await req.json().catch(() => ({}))) as { email?: string; name?: string; role?: string };
    const email = String(body.email ?? "").toLowerCase().trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: "Enter an email address." }, { status: 400 });
    if (env.auth.allowedDomains.length && !env.auth.allowedDomains.includes(email.split("@")[1])) {
      return NextResponse.json({ error: `Use an address on ${env.auth.allowedDomains.join(", ")}.` }, { status: 403 });
    }
    const user = await upsertUser({ email, name: body.name || email.split("@")[0], subject: `dev${email}` });
    // Development convenience: pick a role to try the app as.
    if (body.role && isRole(body.role) && body.role !== user.role) {
      await (await db()).update(schema.users).set({ role: body.role }).where(eq(schema.users.id, user.id));
      user.role = body.role;
    }
    await audit(await db(), user, "session", user.id, "sign-in", `Development sign-in as ${user.role}`);
    const res = NextResponse.json({ user });
    res.cookies.set(SESSION_COOKIE, await signSession({ sub: user.id, email: user.email }), cookieOptions(SESSION_HOURS * 3600));
    return res;
  } catch (e) {
    return apiError(e);
  }
}
