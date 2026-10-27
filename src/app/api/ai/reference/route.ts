import { NextResponse, type NextRequest } from "next/server";
import { recognizeReference, validateRequest } from "@/server/ai/reference";
import { apiError, HttpError, requireUser } from "@/server/auth/session";
import { serverMode, setup } from "@/server/config";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Best-effort throttle for demo mode (no sign-in): a few batches per client
 * per quarter hour on this instance. Server mode relies on sign-in and roles.
 */
const WINDOW_MS = 15 * 60_000;
const DEMO_LIMIT = 24;
const hits = new Map<string, number[]>();
function throttled(key: string) {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= DEMO_LIMIT) return true;
  list.push(now);
  hits.set(key, list);
  return false;
}

/** AI recognition of reference pages: { title, pageCount, bodySize, pages[≤12] } → page types, sections, block roles. */
export async function POST(req: NextRequest) {
  try {
    if (!setup().ai.provider) throw new HttpError(503, "No AI provider is configured on the server.");
    if (serverMode()) {
      await requireUser(req, "use-ai");
    } else {
      if (process.env.AI_REFERENCE_DEMO === "0") throw new HttpError(403, "AI recognition is switched off in demo mode (AI_REFERENCE_DEMO=0).");
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
      if (throttled(ip)) throw new HttpError(429, "Too many AI analyses from this connection — try again in a few minutes.");
    }
    let request;
    try {
      request = validateRequest(await req.json());
    } catch (e) {
      throw new HttpError(400, e instanceof Error ? e.message : "Bad request.");
    }
    try {
      return NextResponse.json(await recognizeReference(request));
    } catch (e) {
      throw new HttpError(502, e instanceof Error ? e.message : "The AI service failed.");
    }
  } catch (e) {
    return apiError(e);
  }
}
