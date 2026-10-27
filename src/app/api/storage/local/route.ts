import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/server/config";
import { put, verifyLocalToken } from "@/server/storage";

export const dynamic = "force-dynamic";

/** Development storage: receives direct uploads signed by `uploadTarget` (local driver only). */
export async function PUT(req: NextRequest) {
  if (env.storage.driver !== "local" || process.env.VERCEL) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const q = req.nextUrl.searchParams;
  const key = q.get("key") ?? "";
  if (!verifyLocalToken(key, Number(q.get("exp")), q.get("sig") ?? "")) return NextResponse.json({ error: "Upload link expired or invalid." }, { status: 403 });
  const body = new Uint8Array(await req.arrayBuffer());
  await put(key, body, req.headers.get("content-type") ?? "application/octet-stream");
  return new NextResponse(null, { status: 200 });
}
