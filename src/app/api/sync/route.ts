import { NextResponse, type NextRequest } from "next/server";
import { MAX_PUSH_BYTES, type Change } from "@/lib/sync/collections";
import { HttpError, requireUser, route } from "@/server/auth/session";
import { applyChanges, changesSince } from "@/server/workspace/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Pull: everything changed since the cursor. */
export const GET = route(async (req: NextRequest) => {
  await requireUser(req);
  const since = req.nextUrl.searchParams.get("since");
  if (!since) throw new HttpError(400, "Missing ?since=");
  return NextResponse.json(await changesSince(since));
});

/** Push: the app's edits, each checked against the version it started from. */
export const POST = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const text = await req.text();
  if (text.length > MAX_PUSH_BYTES * 1.2) throw new HttpError(413, "Too much data in one request.");
  const body = JSON.parse(text) as { changes?: Change[] };
  if (!Array.isArray(body.changes) || body.changes.length > 500) throw new HttpError(400, "Expected up to 500 changes.");
  return NextResponse.json({ results: await applyChanges(user, body.changes) });
});
