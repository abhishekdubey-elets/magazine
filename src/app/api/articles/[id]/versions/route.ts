import { and, desc, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { requireUser, route } from "@/server/auth/session";
import { env } from "@/server/config";
import { db, schema } from "@/server/db";

export const dynamic = "force-dynamic";

/** Saved versions of an article (newest first). */
export const GET = route(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requireUser(req);
  const { id } = await ctx.params;
  const v = schema.articleVersions;
  const u = schema.users;
  const versions = await (await db())
    .select({ id: v.id, version: v.version, data: v.data, createdAt: v.createdAt, createdBy: u.name, email: u.email })
    .from(v)
    .leftJoin(u, eq(u.id, v.createdBy))
    .where(and(eq(v.orgId, env.orgId), eq(v.articleId, id)))
    .orderBy(desc(v.id))
    .limit(50);
  return NextResponse.json({ versions });
});
