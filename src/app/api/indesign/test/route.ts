import { NextResponse } from "next/server";
import { errorResponse, guard } from "@/server/guard";
import { testConnection } from "@/server/indesign/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  try {
    return NextResponse.json(await testConnection());
  } catch (e) {
    return errorResponse(e);
  }
}
