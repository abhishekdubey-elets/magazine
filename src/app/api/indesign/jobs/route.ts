import { NextResponse, type NextRequest } from "next/server";
import type { BuildOptions, InDesignManifestV2 } from "@/lib/indesign/manifest-types";
import { requireUser } from "@/server/auth/session";
import { serverMode } from "@/server/config";
import { errorResponse, guard } from "@/server/guard";
import { submitJob } from "@/server/indesign/pipeline";
import { listJobs, startBuild } from "@/server/print/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Body {
  manifest?: InDesignManifestV2;
  options?: Partial<BuildOptions>;
  kind?: "print" | "documents";
  publicationId?: string;
  pageVersions?: Record<string, number>;
}

/**
 * Start an InDesign build.
 * Server mode: quality gates first (422 with the gate results if a print build is blocked).
 * Demo mode: { manifest, options } → { jobId, ... }
 */
export async function POST(req: NextRequest) {
  const denied = await guard(req);
  if (denied) return denied;
  try {
    const body = (await req.json()) as Body;
    if (!serverMode()) return NextResponse.json(await submitJob(body.manifest, body.options), { status: 202 });
    const user = await requireUser(req, "build-indesign");
    if (!body.manifest || !body.publicationId) return NextResponse.json({ error: "Missing manifest or publication." }, { status: 400 });
    const res = await startBuild(user, {
      manifest: body.manifest,
      options: body.options ?? {},
      kind: body.kind === "documents" ? "documents" : "print",
      publicationId: body.publicationId,
      pageVersions: body.pageVersions,
    });
    if (!res.job) return NextResponse.json({ error: "Print quality checks failed — nothing was sent to InDesign.", gates: res.gates }, { status: 422 });
    return NextResponse.json(res, { status: 202 });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Server mode: builds of a publication, newest first. */
export async function GET(req: NextRequest) {
  if (!serverMode()) return NextResponse.json({ error: "Not available in demo mode." }, { status: 404 });
  try {
    await requireUser(req);
    const pub = req.nextUrl.searchParams.get("publicationId");
    if (!pub) return NextResponse.json({ error: "Missing ?publicationId=" }, { status: 400 });
    return NextResponse.json({ jobs: await listJobs(pub) });
  } catch (e) {
    return errorResponse(e);
  }
}
