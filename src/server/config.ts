import "server-only";
import type { ServerSetup } from "@/lib/sync/collections";

export type { ServerSetup };

/**
 * Server configuration. Everything comes from environment variables (Vercel →
 * Project → Settings → Environment Variables, or `.env.local` locally).
 * Secrets never reach the browser.
 */
const list = (v: string | undefined) =>
  (v ?? "")
    .split(/[,\s]+/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);

export const env = {
  adobe: {
    clientId: process.env.ADOBE_CLIENT_ID ?? "",
    clientSecret: process.env.ADOBE_CLIENT_SECRET ?? "",
    /** Copy the exact scopes from your Adobe Developer Console OAuth Server-to-Server credential. */
    scopes: process.env.ADOBE_SCOPES ?? "openid,AdobeID,read_organizations,firefly_api,ff_apis",
    orgId: process.env.ADOBE_ORG_ID ?? "",
    imsUrl: process.env.ADOBE_IMS_URL ?? "https://ims-na1.adobelogin.com/ims/token/v3",
    apiBase: (process.env.INDESIGN_API_BASE ?? "https://indesign.adobe.io").replace(/\/$/, ""),
    /** Optional: execution URL of an already-registered build script (skips auto-registration). */
    scriptUrl: process.env.INDESIGN_SCRIPT_URL ?? "",
  },
  s3: {
    bucket: process.env.S3_BUCKET ?? "",
    // Only explicit S3_* settings: Vercel sets AWS_REGION to the function region, not the bucket's.
    region: process.env.S3_REGION ?? "",
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
    prefix: (process.env.S3_PREFIX ?? "pressflow").replace(/^\/|\/$/g, ""),
  },
  /** Shared key the app must send (x-pressflow-key) to run paid InDesign jobs (demo mode only). */
  apiKey: process.env.PRESSFLOW_API_KEY ?? "",
  /** Workspace id. One deployment serves one organisation. */
  orgId: process.env.PRESSFLOW_ORG_ID ?? "elets",
  orgName: process.env.PRESSFLOW_ORG_NAME ?? "Elets Technomedia",
  /** Public URL of the app (OAuth redirects). Defaults to the request origin. */
  appUrl: (process.env.APP_URL ?? "").replace(/\/$/, ""),
  auth: {
    /** 32+ random characters; signs session cookies. */
    secret: process.env.AUTH_SECRET ?? "",
    googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    /** Google Workspace domains allowed to sign in, e.g. "elets.in,elets.co.in". */
    allowedDomains: list(process.env.AUTH_ALLOWED_DOMAINS),
    /** Always admins. If empty, the first person to sign in becomes admin. */
    adminEmails: list(process.env.ADMIN_EMAILS),
    defaultRole: process.env.AUTH_DEFAULT_ROLE ?? "contributor",
    /** Local development only: password-less sign-in on localhost. Ignored on Vercel. */
    devLogin: process.env.AUTH_DEV_LOGIN === "1" && !process.env.VERCEL,
  },
  storage: {
    /** "s3" (default when S3_BUCKET is set) or "local" (development; files under STORAGE_DIR). */
    driver: process.env.STORAGE_DRIVER ?? (process.env.S3_BUCKET ? "s3" : "local"),
    localDir: process.env.STORAGE_DIR ?? ".data/storage",
  },
  print: {
    /** Images below this effective resolution block a print release. */
    minPpi: Number(process.env.PRINT_MIN_PPI ?? 200),
    /** Images below this effective resolution are flagged for review. */
    targetPpi: Number(process.env.PRINT_TARGET_PPI ?? 300),
  },
  cronSecret: process.env.CRON_SECRET ?? "",
};

/** Server mode: a database is configured, so the workspace lives on the server and people sign in. */
export const serverMode = () => !!process.env.DATABASE_URL;

export interface Readiness {
  adobe: boolean;
  storage: boolean;
  apiKey: boolean;
  ready: boolean;
  missing: string[];
}

export function readiness(): Readiness {
  const missing: string[] = [];
  if (!env.adobe.clientId) missing.push("ADOBE_CLIENT_ID");
  if (!env.adobe.clientSecret) missing.push("ADOBE_CLIENT_SECRET");
  if (!env.s3.bucket) missing.push("S3_BUCKET");
  if (!env.s3.region) missing.push("S3_REGION");
  if (!env.s3.accessKeyId) missing.push("S3_ACCESS_KEY_ID");
  if (!env.s3.secretAccessKey) missing.push("S3_SECRET_ACCESS_KEY");
  // In server mode people sign in; the shared key is only for the demo deployment.
  const keyOk = serverMode() || !!env.apiKey;
  if (!keyOk) missing.push("PRESSFLOW_API_KEY");
  const adobe = !!(env.adobe.clientId && env.adobe.clientSecret);
  const storage = !!(env.s3.bucket && env.s3.region && env.s3.accessKeyId && env.s3.secretAccessKey);
  return { adobe, storage, apiKey: keyOk, ready: adobe && storage && keyOk, missing };
}

/** What the backend is configured for (no secrets). */
export function setup(): ServerSetup {
  const missing: string[] = [];
  const database = serverMode();
  const secret = env.auth.secret.length >= 32;
  const google = !!(env.auth.googleClientId && env.auth.googleClientSecret);
  if (database) {
    if (!secret) missing.push("AUTH_SECRET (32+ characters)");
    if (!google && !env.auth.devLogin) missing.push("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET");
    if (google && !env.auth.allowedDomains.length) missing.push("AUTH_ALLOWED_DOMAINS");
  }
  const s3 = !!(env.s3.bucket && env.s3.region && env.s3.accessKeyId && env.s3.secretAccessKey);
  const storageReady = env.storage.driver === "s3" ? s3 : !process.env.VERCEL;
  if (database && !storageReady) missing.push(env.storage.driver === "s3" ? "S3_BUCKET / S3_REGION / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY" : "S3 storage (local storage does not work on Vercel)");
  return {
    mode: database ? "server" : "demo",
    database,
    auth: { secret, google, devLogin: env.auth.devLogin, allowedDomains: env.auth.allowedDomains },
    storage: { driver: env.storage.driver, ready: storageReady },
    ai: { provider: process.env.AI_PROVIDER === "anthropic" && process.env.ANTHROPIC_API_KEY ? "anthropic" : process.env.OPENAI_API_KEY ? "openai" : process.env.ANTHROPIC_API_KEY ? "anthropic" : null },
    missing,
  };
}
