import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { HttpError, requireUser, route } from "@/server/auth/session";
import { env } from "@/server/config";
import { db, schema } from "@/server/db";
import { downloadUrl, getBytes } from "@/server/storage";
import type { ImageAsset } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MIME: Record<string, string> = { jpg: "image/jpeg", png: "image/png", tif: "image/tiff", webp: "image/webp", svg: "image/svg+xml" };

/** The untouched original file (InDesign packages, re-downloads). */
export const GET = route(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requireUser(req);
  const { id } = await ctx.params;
  const [row] = await (await db())
    .select()
    .from(schema.assets)
    .where(and(eq(schema.assets.orgId, env.orgId), eq(schema.assets.id, id)))
    .limit(1);
  const original = (row?.data as ImageAsset | undefined)?.original;
  if (!row || row.deleted || !original) throw new HttpError(404, "Original not found.");
  const signed = await downloadUrl(original.key, 900);
  if (signed) return NextResponse.redirect(signed);
  const bytes = await getBytes(original.key);
  if (!bytes) throw new HttpError(404, "Original not found in storage.");
  return new NextResponse(Buffer.from(bytes), { headers: { "content-type": MIME[original.ext] ?? "application/octet-stream", "cache-control": "private, max-age=3600" } });
});
