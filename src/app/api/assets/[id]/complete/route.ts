import { NextResponse, type NextRequest } from "next/server";
import { audit } from "@/server/audit";
import { HttpError, requireUser, route } from "@/server/auth/session";
import { IMAGE_TYPES, inspectOriginal, MAX_ORIGINAL_BYTES } from "@/server/assets/inspect";
import { env } from "@/server/config";
import { db, schema } from "@/server/db";
import { getBytes, head, put, remove } from "@/server/storage";
import type { ImageAsset } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ID = /^img-up-[a-z0-9]{8,40}$/;

/** Measure the uploaded original, make a preview and add the image to the library. */
export const POST = route(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req, "upload-assets");
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { ext?: string; name?: string };
  if (!ID.test(id) || !Object.values(IMAGE_TYPES).includes(body.ext ?? "")) throw new HttpError(400, "Invalid upload.");
  const key = `assets/originals/${id}.${body.ext}`;
  const info = await head(key);
  if (!info) throw new HttpError(409, "The file did not arrive in storage. Try the upload again.");
  if (info.size > MAX_ORIGINAL_BYTES) {
    await remove(key);
    throw new HttpError(413, "The file is too large.");
  }
  const bytes = await getBytes(key);
  if (!bytes) throw new HttpError(409, "The file could not be read from storage.");

  let inspected;
  try {
    inspected = await inspectOriginal(bytes, key, body.ext!);
  } catch (e) {
    await remove(key);
    throw new HttpError(422, e instanceof Error ? e.message : "The file could not be read as an image.");
  }
  const { original, preview, vector } = inspected;
  await put(`previews/${id}.webp`, preview, "image/webp");

  // Displayed size follows the EXIF orientation; `original` keeps the raw pixels.
  const rotated = (original.orientation ?? 1) >= 5;
  const width = rotated ? original.height : original.width;
  const height = rotated ? original.width : original.height;
  const name = String(body.name ?? `${id}.${body.ext}`).slice(0, 200);
  const asset: ImageAsset = {
    id,
    name,
    source: "upload",
    src: `/api/assets/${id}/preview`,
    width,
    height,
    vector,
    subject: width < height ? "portrait" : "scene",
    alt: name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " "),
    credit: "Uploaded",
    createdAt: new Date().toISOString(),
    original,
  };
  const d = await db();
  await d.insert(schema.assets).values({ id, orgId: env.orgId, data: asset, version: 1, updatedBy: user.id }).onConflictDoNothing();
  await audit(d, user, "uploads", id, "create", `${name} · ${original.width}×${original.height}px · ${original.colorSpace}${original.iccProfile ? ` · ${original.iccProfile}` : ""}`);
  return NextResponse.json({ asset, version: 1 });
});
