import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import type { Article } from "@/lib/types";
import { audit } from "@/server/audit";
import { AI_ACTIONS, runEditorialAi, type AiAction } from "@/server/ai/editorial";
import { HttpError, requireUser, route } from "@/server/auth/session";
import { env } from "@/server/config";
import { db, schema } from "@/server/db";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Run an editorial AI action on an article: { articleId, action } → stored proposal. */
export const POST = route(async (req: NextRequest) => {
  const user = await requireUser(req, "use-ai");
  const body = (await req.json().catch(() => ({}))) as { articleId?: string; action?: string };
  if (!AI_ACTIONS.includes(body.action as AiAction)) throw new HttpError(400, `action must be one of ${AI_ACTIONS.join(", ")}.`);
  const d = await db();
  const t = schema.articles;
  const [row] = await d
    .select()
    .from(t)
    .where(and(eq(t.orgId, env.orgId), eq(t.id, String(body.articleId ?? ""))))
    .limit(1);
  if (!row || row.deleted) throw new HttpError(404, "Article not found on the server — wait for it to save, then try again.");
  const article = row.data as Article;

  let result;
  try {
    result = await runEditorialAi(body.action as AiAction, article);
  } catch (e) {
    throw new HttpError(502, e instanceof Error ? e.message : "The AI service failed.");
  }
  const id = `ai-${Date.now().toString(36)}${crypto.randomUUID().slice(0, 6)}`;
  await d.insert(schema.aiSuggestions).values({
    id,
    orgId: env.orgId,
    articleId: article.id,
    action: body.action!,
    provider: result.provider,
    model: result.model,
    output: { result: result.output, rejected: result.rejected, articleVersion: row.version },
    usage: result.usage ?? null,
    createdBy: user.id,
  });
  await audit(d, user, "ai", id, `propose:${body.action}`, `${article.title} (${result.provider}${result.model ? ` ${result.model}` : ""})`);
  return NextResponse.json({ id, ...result });
});
