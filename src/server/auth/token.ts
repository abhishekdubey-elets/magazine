import { jwtVerify, SignJWT } from "jose";

/**
 * Signed session cookie (HS256, AUTH_SECRET). Edge-safe: also used by the
 * middleware. The role in the token is informational; API routes reload the
 * user from the database on every request, so role changes and suspensions
 * apply immediately.
 */

export const SESSION_COOKIE = "pf_session";
export const OAUTH_COOKIE = "pf_oauth";
export const SESSION_HOURS = 12;

const key = () => {
  const s = process.env.AUTH_SECRET ?? "";
  if (s.length < 32) throw new Error("AUTH_SECRET must be at least 32 characters.");
  return new TextEncoder().encode(s);
};

export interface SessionClaims {
  sub: string;
  email: string;
}

export async function signSession(c: SessionClaims): Promise<string> {
  return new SignJWT({ email: c.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(c.sub)
    .setIssuedAt()
    .setAudience("pressflow-session")
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(key());
}

export async function verifySession(token: string | undefined): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { audience: "pressflow-session", algorithms: ["HS256"] });
    if (!payload.sub || typeof payload.email !== "string") return null;
    return { sub: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

/** Short-lived OAuth state (state, nonce, PKCE verifier, return path). */
export interface OAuthState {
  state: string;
  nonce: string;
  verifier: string;
  next: string;
}

export async function signOAuthState(s: OAuthState): Promise<string> {
  return new SignJWT({ ...s }).setProtectedHeader({ alg: "HS256" }).setAudience("pressflow-oauth").setExpirationTime("10m").sign(key());
}

export async function verifyOAuthState(token: string | undefined): Promise<OAuthState | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { audience: "pressflow-oauth", algorithms: ["HS256"] });
    const { state, nonce, verifier, next } = payload as Record<string, unknown>;
    if (typeof state !== "string" || typeof nonce !== "string" || typeof verifier !== "string") return null;
    return { state, nonce, verifier, next: typeof next === "string" ? next : "/" };
  } catch {
    return null;
  }
}

export const cookieOptions = (maxAgeSeconds: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: maxAgeSeconds,
});

/** Only same-site relative paths are allowed as post-login destinations. */
export const safeNext = (n: string | null | undefined) => (n && /^\/(?!\/)[^\s\\]*$/.test(n) && !n.startsWith("/api/") ? n : "/");
