import { NextResponse } from "next/server";
import { errorResponse, guard } from "@/server/guard";
import { getJob } from "@/server/indesign/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = guard(req);
  if (denied) return denied;
  try {
    const { id } = await params;
    return NextResponse.json(await getJob(id));
  } catch (e) {
    return errorResponse(e);
  }
}
