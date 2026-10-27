import { NextResponse, type NextRequest } from "next/server";
import { audit } from "@/server/audit";
import { origin } from "@/server/auth/google";
import { HttpError, requireUser, route } from "@/server/auth/session";
import { db } from "@/server/db";
import { FONT_FILE, fontLibrary } from "@/server/print/fonts";
import { remove, uploadTarget } from "@/server/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The licensed font library (parsed family/style names, as InDesign sees them). */
export const GET = route(async (req: NextRequest) => {
  await requireUser(req);
  return NextResponse.json({ files: await fontLibrary() });
});

/** Start a font upload: { name, size } → direct upload target into fonts/. */
export const POST = route(async (req: NextRequest) => {
  const user = await requireUser(req, "manage-fonts");
  const body = (await req.json().catch(() => ({}))) as { name?: string; size?: number };
  const name = String(body.name ?? "").replace(/[^\w.\- ]+/g, "").trim();
  if (!FONT_FILE.test(name)) throw new HttpError(415, "Upload OpenType or TrueType files (.otf, .ttf, .ttc).");
  if (!body.size || body.size > 50 * 1024 * 1024) throw new HttpError(413, "Font files can be up to 50 MB.");
  await audit(await db(), user, "fonts", name, "upload");
  return NextResponse.json({ upload: await uploadTarget(`fonts/${name}`, "application/octet-stream", origin(req)) });
});

/** Remove a font file: ?name=Roboto-Bold.ttf */
export const DELETE = route(async (req: NextRequest) => {
  const user = await requireUser(req, "manage-fonts");
  const name = req.nextUrl.searchParams.get("name") ?? "";
  if (!FONT_FILE.test(name) || name.includes("/")) throw new HttpError(400, "Invalid font file name.");
  await remove(`fonts/${name}`);
  await audit(await db(), user, "fonts", name, "delete");
  return NextResponse.json({ ok: true });
});
