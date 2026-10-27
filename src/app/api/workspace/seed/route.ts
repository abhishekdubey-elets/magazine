import { NextResponse, type NextRequest } from "next/server";
import { HttpError, requireUser, route } from "@/server/auth/session";
import { seed } from "@/server/workspace/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** First run: an admin fills the empty workspace (sample issue or blank). */
export const POST = route(async (req: NextRequest) => {
  const user = await requireUser(req, "manage-team");
  const body = (await req.json().catch(() => null)) as Parameters<typeof seed>[1] | null;
  if (!body || typeof body.collections !== "object" || typeof body.settings !== "object") throw new HttpError(400, "Expected collections and settings.");
  try {
    return NextResponse.json(await seed(user, body));
  } catch (e) {
    throw new HttpError(409, e instanceof Error ? e.message : "Could not set up the workspace.");
  }
});
