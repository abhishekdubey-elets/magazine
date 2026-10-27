import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { isRole } from "@/lib/roles";
import { audit } from "@/server/audit";
import { HttpError, requireUser, route } from "@/server/auth/session";
import { env } from "@/server/config";
import { db, schema } from "@/server/db";

export const dynamic = "force-dynamic";

/** Admins change roles or suspend people. */
export const PATCH = route(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requireUser(req, "manage-team");
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { role?: string; disabled?: boolean };
  const d = await db();
  const u = schema.users;
  const [target] = await d.select().from(u).where(and(eq(u.id, id), eq(u.orgId, env.orgId))).limit(1);
  if (!target) throw new HttpError(404, "No such person.");
  if (target.id === admin.id) throw new HttpError(400, "You cannot change your own role or suspend yourself.");
  if (env.auth.adminEmails.includes(target.email)) throw new HttpError(400, "This person is an admin by ADMIN_EMAILS (server setting).");
  const patch: { role?: string; disabled?: boolean } = {};
  if (body.role !== undefined) {
    if (!isRole(body.role)) throw new HttpError(400, "Unknown role.");
    patch.role = body.role;
  }
  if (typeof body.disabled === "boolean") patch.disabled = body.disabled;
  if (!Object.keys(patch).length) throw new HttpError(400, "Nothing to change.");
  await d.update(u).set(patch).where(eq(u.id, id));
  await audit(d, admin, "user", id, patch.disabled !== undefined ? (patch.disabled ? "suspend" : "restore") : `role:${patch.role}`, target.email);
  return NextResponse.json({ ok: true });
});
