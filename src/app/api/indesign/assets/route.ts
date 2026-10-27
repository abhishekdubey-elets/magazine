import { NextResponse } from "next/server";
import { serverMode } from "@/server/config";
import { errorResponse, guard } from "@/server/guard";
import { missingUploads, saveUpload } from "@/server/indesign/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * { action: "check", files: ["img-up-….jpg"] }                → { missing: [...] }
 * { action: "upload", file, contentType, data: "<base64>" }  → { ok: true }
 */
export async function POST(req: Request) {
  // Server mode uploads originals through /api/assets instead.
  if (serverMode()) return NextResponse.json({ error: "Not available in server mode." }, { status: 404 });
  const denied = await guard(req);
  if (denied) return denied;
  try {
    const body = (await req.json()) as { action?: string; files?: string[]; file?: string; contentType?: string; data?: string };
    if (body.action === "check") return NextResponse.json({ missing: await missingUploads((body.files ?? []).slice(0, 500)) });
    if (body.action === "upload" && body.file && body.contentType && body.data) {
      await saveUpload(body.file, body.contentType, body.data);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    return errorResponse(e);
  }
}
