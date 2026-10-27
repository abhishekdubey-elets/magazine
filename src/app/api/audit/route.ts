import { and, desc, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { requireUser, route } from "@/server/auth/session";
import { env } from "@/server/config";
import { db, schema } from "@/server/db";

export const dynamic = "force-dynamic";

/** Audit trail, newest first. Optional ?entity=pages&id=page-1. */
export const GET = route(async (req: NextRequest) => {
  await requireUser(req);
  const q = req.nextUrl.searchParams;
  const a = schema.auditLog;
  const conds = [eq(a.orgId, env.orgId)];
  if (q.get("entity")) conds.push(eq(a.entity, q.get("entity")!));
  if (q.get("id")) conds.push(eq(a.entityId, q.get("id")!));
  const limit = Math.min(500, Math.max(1, Number(q.get("limit") ?? 100)));
  const entries = await (await db()).select().from(a).where(and(...conds)).orderBy(desc(a.id)).limit(limit);
  return NextResponse.json({ entries });
});
