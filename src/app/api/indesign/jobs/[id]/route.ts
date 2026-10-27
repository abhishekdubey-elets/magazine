import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/server/auth/session";
import { serverMode } from "@/server/config";
import { errorResponse, guard } from "@/server/guard";
import { getJob } from "@/server/indesign/pipeline";
import { refresh } from "@/server/print/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (serverMode()) {
      // Anyone signed in can follow a build; finishing it archives the files.
      await requireUser(req);
      return NextResponse.json(await refresh(id));
    }
    const denied = await guard(req);
    if (denied) return denied;
    return NextResponse.json(await getJob(id));
  } catch (e) {
    return errorResponse(e);
  }
}
