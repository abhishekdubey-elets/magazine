import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { audit } from "@/server/audit";
import { HttpError, requireUser, route } from "@/server/auth/session";
import { env } from "@/server/config";
import { db, schema } from "@/server/db";

export const dynamic = "force-dynamic";

/** Record what a person did with a proposal: { decision: "accepted" | "rejected", detail? } */
export const POST = route(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req, "use-ai");
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { decision?: string; detail?: string };
  if (body.decision !== "accepted" && body.decision !== "rejected") throw new HttpError(400, "decision must be accepted or rejected.");
  const d = await db();
  const s = schema.aiSuggestions;
  const res = await d
    .update(s)
    .set({ status: body.decision, decidedBy: user.id, decidedAt: new Date() })
    .where(and(eq(s.id, id), eq(s.orgId, env.orgId), eq(s.status, "proposed")))
    .returning({ id: s.id, action: s.action, articleId: s.articleId });
  if (!res.length) throw new HttpError(409, "This suggestion was already decided or does not exist.");
  await audit(d, user, "ai", id, body.decision, `${res[0].action} on ${res[0].articleId}${body.detail ? ` — ${body.detail}` : ""}`);
  return NextResponse.json({ ok: true });
});
