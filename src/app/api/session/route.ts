import { NextResponse, type NextRequest } from "next/server";
import { apiError, currentUser } from "@/server/auth/session";
import { env, setup } from "@/server/config";

export const dynamic = "force-dynamic";

/** Which mode the backend runs in, and who is signed in. */
export async function GET(req: NextRequest) {
  const s = setup();
  if (s.mode === "demo") return NextResponse.json({ setup: s, user: null });
  try {
    const user = s.auth.secret ? await currentUser(req) : null;
    return NextResponse.json({ setup: s, user, org: { id: env.orgId, name: env.orgName } });
  } catch (e) {
    return apiError(e);
  }
}
