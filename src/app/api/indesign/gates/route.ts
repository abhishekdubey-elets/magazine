import { NextResponse, type NextRequest } from "next/server";
import type { BuildOptions, InDesignManifestV2 } from "@/lib/indesign/manifest-types";
import { HttpError, requireUser, route } from "@/server/auth/session";
import { checkGates } from "@/server/print/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Dry run of the print quality gates (nothing is sent to Adobe). */
export const POST = route(async (req: NextRequest) => {
  await requireUser(req);
  const body = (await req.json().catch(() => ({}))) as { manifest?: InDesignManifestV2; options?: Partial<BuildOptions>; kind?: string; pageVersions?: Record<string, number> };
  if (!body.manifest?.pages) throw new HttpError(400, "Missing manifest.");
  return NextResponse.json(await checkGates(body.manifest, body.kind === "documents" ? "documents" : "print", body.options ?? {}, body.pageVersions));
});
