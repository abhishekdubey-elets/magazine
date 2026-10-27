import { NextResponse, type NextRequest } from "next/server";
import { requireUser, route } from "@/server/auth/session";
import { snapshot } from "@/server/workspace/sync";

export const dynamic = "force-dynamic";

/** The whole workspace for the signed-in user. */
export const GET = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  return NextResponse.json({ user, ...(await snapshot()) });
});
