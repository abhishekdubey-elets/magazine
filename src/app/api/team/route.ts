import { asc, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { requireUser, route } from "@/server/auth/session";
import { env } from "@/server/config";
import { db, schema } from "@/server/db";

export const dynamic = "force-dynamic";

/** Everyone who has signed in to this workspace. */
export const GET = route(async (req: NextRequest) => {
  await requireUser(req);
  const d = await db();
  const u = schema.users;
  const people = await d
    .select({ id: u.id, email: u.email, name: u.name, picture: u.picture, role: u.role, disabled: u.disabled, lastLoginAt: u.lastLoginAt })
    .from(u)
    .where(eq(u.orgId, env.orgId))
    .orderBy(asc(u.email));
  return NextResponse.json({ people, adminEmails: env.auth.adminEmails });
});
