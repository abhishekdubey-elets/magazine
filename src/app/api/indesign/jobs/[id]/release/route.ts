import { NextResponse, type NextRequest } from "next/server";
import { HttpError, requireUser, route } from "@/server/auth/session";
import { decideRelease } from "@/server/print/jobs";

export const dynamic = "force-dynamic";

/** Editor's sign-off: { decision: "release" | "reject", note? } */
export const POST = route(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req, "release-print");
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { decision?: string; note?: string };
  if (body.decision !== "release" && body.decision !== "reject") throw new HttpError(400, "decision must be release or reject.");
  if (body.decision === "reject" && !body.note?.trim()) throw new HttpError(400, "Say why the build is rejected.");
  return NextResponse.json(await decideRelease(user, id, body.decision, body.note?.trim()));
});
