import { NextResponse } from "next/server";
import { readiness } from "@/server/config";
import { SCRIPT_NAME, SCRIPT_VERSION } from "@/server/indesign/pipeline";

export const dynamic = "force-dynamic";

/** Public: which parts of the InDesign pipeline are configured (no secrets). */
export function GET() {
  return NextResponse.json({ ...readiness(), script: { name: SCRIPT_NAME, version: SCRIPT_VERSION } });
}
