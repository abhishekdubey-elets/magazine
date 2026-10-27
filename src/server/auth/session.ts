import "server-only";
import { and, count, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { can, isRole, type Capability, type Role, type SessionUser } from "@/lib/roles";
import { env } from "../config";
import { db, schema } from "../db";
import { SESSION_COOKIE, verifySession } from "./token";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

/** The signed-in user (fresh from the database), or null. */
export async function currentUser(req: NextRequest): Promise<SessionUser | null> {
  const claims = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!claims) return null;
  const d = await db();
  const [u] = await d
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.id, claims.sub), eq(schema.users.orgId, env.orgId)))
    .limit(1);
  if (!u || u.disabled || u.email !== claims.email) return null;
  return { id: u.id, email: u.email, name: u.name ?? u.email, picture: u.picture, role: isRole(u.role) ? u.role : "viewer" };
}

/** Signed-in user with the capability, or throws 401/403. */
export async function requireUser(req: NextRequest, cap?: Capability): Promise<SessionUser> {
  const u = await currentUser(req);
  if (!u) throw new HttpError(401, "Please sign in.");
  if (cap && !can(u.role, cap)) throw new HttpError(403, `Your role (${u.role}) cannot do this.`);
  return u;
}

/**
 * Create or refresh the user record on sign-in. ADMIN_EMAILS are always
 * admins; with no ADMIN_EMAILS the first person to sign in becomes admin.
 */
export async function upsertUser(p: { email: string; name?: string; picture?: string; subject: string }): Promise<SessionUser> {
  const d = await db();
  const email = p.email.toLowerCase();
  await d.insert(schema.orgs).values({ id: env.orgId, name: env.orgName }).onConflictDoNothing();
  const [existing] = await d.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  const forcedAdmin = env.auth.adminEmails.includes(email);
  if (existing) {
    if (existing.disabled) throw new HttpError(403, "Your PressFlow account has been suspended. Ask an admin.");
    const role: Role = forcedAdmin ? "admin" : isRole(existing.role) ? existing.role : "viewer";
    await d
      .update(schema.users)
      .set({ name: p.name ?? existing.name, picture: p.picture ?? existing.picture, role, lastLoginAt: new Date() })
      .where(eq(schema.users.id, existing.id));
    return { id: existing.id, email, name: p.name ?? existing.name ?? email, picture: p.picture ?? existing.picture, role };
  }
  const [{ n }] = await d.select({ n: count() }).from(schema.users).where(eq(schema.users.orgId, env.orgId));
  const first = Number(n) === 0 && env.auth.adminEmails.length === 0;
  const role: Role = forcedAdmin || first ? "admin" : isRole(env.auth.defaultRole) ? env.auth.defaultRole : "contributor";
  const id = `usr-${p.subject.replace(/[^a-zA-Z0-9]/g, "").slice(-24) || crypto.randomUUID()}`;
  await d.insert(schema.users).values({ id, orgId: env.orgId, email, name: p.name ?? email, picture: p.picture, role, lastLoginAt: new Date() });
  return { id, email, name: p.name ?? email, picture: p.picture, role };
}

/** JSON error response for HttpError and friends. */
export function apiError(e: unknown) {
  if (e instanceof HttpError) return NextResponse.json({ error: e.message, details: e.details }, { status: e.status });
  console.error(e);
  return NextResponse.json({ error: e instanceof Error ? e.message : "Unexpected server error" }, { status: 500 });
}

/** Wrap a route handler: server mode only, consistent errors. */
export function route<A extends unknown[]>(fn: (req: NextRequest, ...args: A) => Promise<Response>) {
  return async (req: NextRequest, ...args: A): Promise<Response> => {
    if (!process.env.DATABASE_URL) return NextResponse.json({ error: "This deployment runs in demo mode (no database configured)." }, { status: 404 });
    try {
      return await fn(req, ...args);
    } catch (e) {
      return apiError(e);
    }
  };
}
