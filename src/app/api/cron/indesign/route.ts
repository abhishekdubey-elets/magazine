import { NextResponse, type NextRequest } from "next/server";
import { env, serverMode } from "@/server/config";
import { refreshRunning } from "@/server/print/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Scheduled fallback: finish and archive builds nobody is watching (Adobe keeps outputs only 24 h). */
export async function GET(req: NextRequest) {
  if (!serverMode() || !env.cronSecret) return NextResponse.json({ error: "Not configured" }, { status: 404 });
  if (req.headers.get("authorization") !== `Bearer ${env.cronSecret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ results: await refreshRunning() });
}
