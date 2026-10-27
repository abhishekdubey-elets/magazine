import { NextResponse, type NextRequest } from "next/server";
import { HttpError, requireUser, route } from "@/server/auth/session";
import { IMAGE_TYPES, MAX_ORIGINAL_BYTES } from "@/server/assets/inspect";
import { uploadTarget } from "@/server/storage";
import { origin } from "@/server/auth/google";

export const dynamic = "force-dynamic";

/**
 * Start an image upload. The browser sends the original file straight to
 * storage (no resizing, no recompression), then calls /complete.
 */
export const POST = route(async (req: NextRequest) => {
  await requireUser(req, "upload-assets");
  const body = (await req.json().catch(() => ({}))) as { name?: string; contentType?: string; size?: number };
  const ext = IMAGE_TYPES[body.contentType ?? ""];
  if (!ext) throw new HttpError(415, "Upload JPEG, PNG, TIFF, WebP or SVG images.");
  if (!body.size || body.size > MAX_ORIGINAL_BYTES) throw new HttpError(413, `Images can be up to ${MAX_ORIGINAL_BYTES / 1024 / 1024} MB.`);
  const id = `img-up-${Date.now().toString(36)}${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
  const key = `assets/originals/${id}.${ext}`;
  return NextResponse.json({ id, ext, upload: await uploadTarget(key, body.contentType!, origin(req)) });
});
