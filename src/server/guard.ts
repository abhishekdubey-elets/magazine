import "server-only";
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import type { Capability } from "@/lib/roles";
import { env, readiness, serverMode } from "./config";
import { AdobeError } from "./adobe/indesign-api";
import { apiError, HttpError, requireUser } from "./auth/session";
import { PipelineError } from "./indesign/pipeline";

/**
 * Paid InDesign operations need a complete configuration and, in server mode,
 * a signed-in person with the right role (demo mode: the shared PressFlow key).
 */
export async function guard(req: Request, cap: Capability = "build-indesign"): Promise<NextResponse | null> {
  const r = readiness();
  if (!r.ready) {
    return NextResponse.json({ error: "The InDesign pipeline is not configured on the server.", missing: r.missing }, { status: 503 });
  }
  if (serverMode()) {
    try {
      await requireUser(req as NextRequest, cap);
      return null;
    } catch (e) {
      return apiError(e);
    }
  }
  const sent = req.headers.get("x-pressflow-key") ?? "";
  const a = Buffer.from(sent);
  const b = Buffer.from(env.apiKey);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Invalid or missing PressFlow access key." }, { status: 401 });
  }
  return null;
}

export function errorResponse(e: unknown) {
  if (e instanceof HttpError) return apiError(e);
  if (e instanceof PipelineError) return NextResponse.json({ error: e.message, details: e.details }, { status: e.status });
  if (e instanceof AdobeError) return NextResponse.json({ error: e.message }, { status: e.status === 401 || e.status === 403 ? 502 : e.status >= 500 ? 502 : e.status });
  console.error(e);
  return NextResponse.json({ error: e instanceof Error ? e.message : "Unexpected server error" }, { status: 500 });
}
