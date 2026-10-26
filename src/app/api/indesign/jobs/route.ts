import { NextResponse } from "next/server";
import type { BuildOptions } from "@/lib/indesign/manifest-types";
import { errorResponse, guard } from "@/server/guard";
import { submitJob } from "@/server/indesign/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Start an InDesign build: { manifest, options } → { jobId, ... } */
export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  try {
    const body = (await req.json()) as { manifest?: unknown; options?: Partial<BuildOptions> };
    return NextResponse.json(await submitJob(body.manifest, body.options), { status: 202 });
  } catch (e) {
    return errorResponse(e);
  }
}
