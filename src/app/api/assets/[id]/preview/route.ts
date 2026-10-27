import { NextResponse, type NextRequest } from "next/server";
import { HttpError, requireUser, route } from "@/server/auth/session";
import { getBytes } from "@/server/storage";

export const dynamic = "force-dynamic";

/** Screen preview of an uploaded image (signed-in people only). */
export const GET = route(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requireUser(req);
  const { id } = await ctx.params;
  if (!/^img-up-[a-z0-9]{8,40}$/.test(id)) throw new HttpError(400, "Invalid image id.");
  const bytes = await getBytes(`previews/${id}.webp`);
  if (!bytes) throw new HttpError(404, "Preview not found.");
  return new NextResponse(Buffer.from(bytes), {
    headers: { "content-type": "image/webp", "cache-control": "private, max-age=604800, immutable" },
  });
});
