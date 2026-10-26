import "server-only";
import { env } from "../config";

/**
 * Minimal client for Adobe's InDesign APIs (Firefly Services).
 * Auth: OAuth Server-to-Server (client credentials) via Adobe IMS.
 * Docs: developer.adobe.com/firefly-services/docs/indesign-apis
 */

export class AdobeError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: string,
  ) {
    super(message);
  }
}

let cached: { token: string; expires: number } | null = null;

export async function accessToken(): Promise<string> {
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const res = await fetch(env.adobe.imsUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: env.adobe.clientId,
      client_secret: env.adobe.clientSecret,
      scope: env.adobe.scopes,
    }),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new AdobeError(`Adobe sign-in failed (HTTP ${res.status}). Check ADOBE_CLIENT_ID, ADOBE_CLIENT_SECRET and ADOBE_SCOPES.`, res.status, text.slice(0, 500));
  const json = JSON.parse(text) as { access_token: string; expires_in: number };
  // expires_in is in seconds (tokens last 24 h).
  cached = { token: json.access_token, expires: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

async function headers(extra: Record<string, string> = {}) {
  const h: Record<string, string> = {
    Authorization: `Bearer ${await accessToken()}`,
    "x-api-key": env.adobe.clientId,
    ...extra,
  };
  if (env.adobe.orgId) h["x-gw-ims-org-id"] = env.adobe.orgId;
  return h;
}

/** Fetch with Adobe's recommended retry policy: only 5xx, exponential back-off, 3 retries. */
async function call(url: string, init: RequestInit & { headers?: Record<string, string> } = {}): Promise<Response> {
  let attempt = 0;
  for (;;) {
    const res = await fetch(url, { ...init, headers: await headers(init.headers ?? {}), cache: "no-store" });
    if (res.status < 500 || attempt >= 3) return res;
    attempt++;
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
  }
}

async function json<T>(res: Response, what: string): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    let detail = text.slice(0, 400);
    try {
      const j = JSON.parse(text) as { message?: string; error_code?: string; errors?: { message?: string }[] };
      detail = j.message ?? j.errors?.[0]?.message ?? detail;
    } catch {
      /* not JSON */
    }
    throw new AdobeError(`${what} failed (HTTP ${res.status}): ${detail}`, res.status, text.slice(0, 2000));
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export interface RegisteredScript {
  url: string;
  capability?: string;
  version?: string;
}

export async function registerScript(zip: Uint8Array, fileName = "bundle.zip"): Promise<RegisteredScript> {
  const form = new FormData();
  form.append("file", new Blob([zip as BlobPart], { type: "application/zip" }), fileName);
  const res = await call(`${env.adobe.apiBase}/v3/scripts`, { method: "POST", body: form });
  return json<RegisteredScript>(res, "Registering the InDesign build script");
}

export async function listScripts(): Promise<unknown> {
  const res = await call(`${env.adobe.apiBase}/v3/scripts`, { method: "GET" });
  return json<unknown>(res, "Listing InDesign scripts");
}

export interface ExecutionAccepted {
  jobId: string;
  statusUrl?: string;
}

export async function runScript(executionUrl: string, body: unknown): Promise<ExecutionAccepted> {
  const res = await call(executionUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return json<ExecutionAccepted>(res, "Starting the InDesign job");
}

export interface RawStatus {
  jobId?: string;
  status?: string;
  message?: string;
  data?: unknown;
  dataURL?: string;
  outputs?: { source?: string; destination?: { url?: string } }[] | Record<string, unknown>;
  errors?: { error_code?: string; message?: string; source?: string }[];
  paging?: { nextUrl?: string };
}

/** Job status with all output pages merged (outputs are paginated 10 at a time by default). */
export async function jobStatus(jobId: string): Promise<RawStatus> {
  const first = await json<RawStatus>(await call(`${env.adobe.apiBase}/v3/status/${encodeURIComponent(jobId)}?size=100`), "Reading job status");
  const outputs = Array.isArray(first.outputs) ? [...first.outputs] : [];
  let next = first.paging?.nextUrl;
  for (let i = 0; next && i < 20; i++) {
    const page = await json<RawStatus>(await call(next), "Reading job status");
    if (Array.isArray(page.outputs)) outputs.push(...page.outputs);
    next = page.paging?.nextUrl;
  }
  return { ...first, outputs };
}
