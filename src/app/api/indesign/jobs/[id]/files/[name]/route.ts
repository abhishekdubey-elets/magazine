import { NextResponse, type NextRequest } from "next/server";
import { HttpError, requireUser, route } from "@/server/auth/session";
import { getBytes } from "@/server/storage";
import { outputFile } from "@/server/print/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Download an archived build file (PDF, INDD, IDML, page JPEG). */
export const GET = route(async (req: NextRequest, ctx: { params: Promise<{ id: string; name: string }> }) => {
  await requireUser(req);
  const { id, name } = await ctx.params;
  const f = await outputFile(id, decodeURIComponent(name));
  if (f.url) return NextResponse.redirect(f.url);
  const bytes = await getBytes(f.key);
  if (!bytes) throw new HttpError(404, "File missing from storage.");
  const inline = f.kind === "jpeg" || req.nextUrl.searchParams.has("inline");
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "content-type": f.contentType,
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${f.name.replace(/"/g, "")}"`,
      "cache-control": "private, max-age=3600",
    },
  });
});
