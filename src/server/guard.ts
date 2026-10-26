import "server-only";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env, readiness } from "./config";
import { AdobeError } from "./adobe/indesign-api";
import { PipelineError } from "./indesign/pipeline";

/** Paid InDesign operations require the shared PressFlow key and a complete configuration. */
export function guard(req: Request): NextResponse | null {
  const r = readiness();
  if (!r.ready) {
    return NextResponse.json({ error: "The InDesign pipeline is not configured on the server.", missing: r.missing }, { status: 503 });
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
  if (e instanceof PipelineError) return NextResponse.json({ error: e.message, details: e.details }, { status: e.status });
  if (e instanceof AdobeError) return NextResponse.json({ error: e.message }, { status: e.status === 401 || e.status === 403 ? 502 : e.status >= 500 ? 502 : e.status });
  console.error(e);
  return NextResponse.json({ error: e instanceof Error ? e.message : "Unexpected server error" }, { status: 500 });
}
