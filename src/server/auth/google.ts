import "server-only";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { NextRequest } from "next/server";
import { env } from "../config";
import { HttpError } from "./session";

/**
 * Google Workspace sign-in (OpenID Connect, authorization code + PKCE).
 * Only verified addresses on AUTH_ALLOWED_DOMAINS may sign in; the Workspace
 * `hd` claim is checked as well as the address so personal Gmail accounts
 * with a matching alias cannot get in.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

const b64url = (buf: ArrayBuffer | Uint8Array) => Buffer.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf)).toString("base64url");
export const randomToken = () => b64url(crypto.getRandomValues(new Uint8Array(32)));

export const origin = (req: NextRequest) => env.appUrl || req.nextUrl.origin;
export const redirectUri = (req: NextRequest) => `${origin(req)}/api/auth/callback/google`;

export async function authorizationUrl(req: NextRequest, s: { state: string; nonce: string; verifier: string }) {
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s.verifier)));
  const u = new URL(AUTH_URL);
  u.searchParams.set("client_id", env.auth.googleClientId);
  u.searchParams.set("redirect_uri", redirectUri(req));
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "openid email profile");
  u.searchParams.set("state", s.state);
  u.searchParams.set("nonce", s.nonce);
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("prompt", "select_account");
  // Pre-selects the Workspace account picker; enforcement happens on the callback.
  if (env.auth.allowedDomains.length === 1) u.searchParams.set("hd", env.auth.allowedDomains[0]);
  return u.toString();
}

export interface GoogleProfile {
  subject: string;
  email: string;
  name?: string;
  picture?: string;
}

export async function exchangeCode(req: NextRequest, code: string, verifier: string, nonce: string): Promise<GoogleProfile> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.auth.googleClientId,
      client_secret: env.auth.googleClientSecret,
      redirect_uri: redirectUri(req),
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { id_token?: string; error?: string; error_description?: string };
  if (!res.ok || !json.id_token) throw new HttpError(401, `Google sign-in failed: ${json.error_description ?? json.error ?? res.status}`);

  const { payload } = await jwtVerify(json.id_token, JWKS, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: env.auth.googleClientId,
  });
  if (payload.nonce !== nonce) throw new HttpError(401, "Sign-in response did not match this browser. Please try again.");
  const email = String(payload.email ?? "").toLowerCase();
  if (!email || payload.email_verified !== true) throw new HttpError(403, "Your Google address is not verified.");
  const domain = email.split("@")[1] ?? "";
  const hd = String(payload.hd ?? "").toLowerCase();
  if (!env.auth.allowedDomains.includes(domain) || !env.auth.allowedDomains.includes(hd)) {
    throw new HttpError(403, `Sign in with your company Google Workspace account (${env.auth.allowedDomains.join(", ") || "no domains configured"}).`);
  }
  return {
    subject: String(payload.sub),
    email,
    name: typeof payload.name === "string" ? payload.name : undefined,
    picture: typeof payload.picture === "string" ? payload.picture : undefined,
  };
}
