import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/server/auth/token";

export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
