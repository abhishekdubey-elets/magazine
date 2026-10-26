import "server-only";

/**
 * Server configuration for the Adobe InDesign API pipeline. Everything comes
 * from environment variables (Vercel → Project → Settings → Environment
 * Variables, or `.env.local` locally). Secrets never reach the browser.
 */
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
  /** Shared key the app must send (x-pressflow-key) to run paid InDesign jobs. */
  apiKey: process.env.PRESSFLOW_API_KEY ?? "",
};

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
  if (!env.apiKey) missing.push("PRESSFLOW_API_KEY");
  const adobe = !!(env.adobe.clientId && env.adobe.clientSecret);
  const storage = !!(env.s3.bucket && env.s3.region && env.s3.accessKeyId && env.s3.secretAccessKey);
  return { adobe, storage, apiKey: !!env.apiKey, ready: adobe && storage && !!env.apiKey, missing };
}
