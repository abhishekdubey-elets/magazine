import "server-only";
import JSZip from "jszip";
import { renderSampleSvg } from "@/lib/artwork";
import { MANIFEST_SCHEMA, type BuildOptions, type BuildReport, type InDesignManifestV2, type JobOutput, type JobView } from "@/lib/indesign/manifest-types";
import { accessToken, jobStatus, listScripts, registerScript, runScript, type RawStatus } from "../adobe/indesign-api";
import { env } from "../config";
import * as store from "../storage/s3";
import buildScript from "./script/build.jsx?raw";

/**
 * The automated InDesign pipeline:
 *   1. make sure the PressFlow build script is registered with Adobe
 *   2. stage the manifest, images and fonts in S3 (pre-signed GET URLs)
 *   3. start the custom-script job — InDesign builds, preflights and exports
 *   4. read the job status: download links (Adobe temp storage, 24 h) + report
 */

export const SCRIPT_NAME = "pressflow.build-issue";
/** Bump whenever build.jsx changes so Adobe registers the new version. */
export const SCRIPT_VERSION = "1.0.0";

export class PipelineError extends Error {
  constructor(
    message: string,
    public status = 400,
    public details?: unknown,
  ) {
    super(message);
  }
}

/* -------------------------------------------------------------- script */

export async function scriptBundle(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "manifest.json",
    JSON.stringify(
      {
        manifestVersion: "1.0.0",
        id: "com.elets.pressflow.build-issue",
        name: SCRIPT_NAME,
        version: SCRIPT_VERSION,
        host: { app: "indesign", appVersionStrategy: "latest_version" },
        apiEntryPoints: [{ type: "capability", path: "build.jsx", language: "extendscript" }],
      },
      null,
      2,
    ),
  );
  zip.file("build.jsx", buildScript);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

interface Registry {
  name: string;
  version: string;
  url: string;
  registeredAt: string;
}

/** Execution URL for the build script, registering it with Adobe when needed. */
export async function ensureScript(): Promise<string> {
  if (env.adobe.scriptUrl) return env.adobe.scriptUrl;
  const raw = await store.getText("registry/script.json");
  const reg = raw ? (JSON.parse(raw) as Registry) : null;
  if (reg && reg.version === SCRIPT_VERSION && reg.url) return reg.url;
  const res = await registerScript(await scriptBundle(), `${SCRIPT_NAME}-${SCRIPT_VERSION}.zip`);
  if (!res.url) throw new PipelineError("Adobe accepted the script but returned no execution URL.", 502, res);
  const next: Registry = { name: SCRIPT_NAME, version: SCRIPT_VERSION, url: res.url, registeredAt: new Date().toISOString() };
  await store.put("registry/script.json", JSON.stringify(next, null, 2), "application/json");
  return res.url;
}

/* -------------------------------------------------------------- assets */

const UPLOAD_NAME = /^img-up-[a-z0-9]+\.(jpg|jpeg|png|webp|svg|tif)$/;
const SAMPLE_NAME = /^img-[a-z0-9-]+\.svg$/;
const MAX_UPLOAD = 15 * 1024 * 1024;

export function assetKey(path: string, source: "sample" | "upload") {
  const file = path.replace(/^links\//, "");
  if (source === "sample") {
    if (!SAMPLE_NAME.test(file)) throw new PipelineError(`Invalid sample asset name: ${file}`);
    return `assets/sample/${file}`;
  }
  if (!UPLOAD_NAME.test(file)) throw new PipelineError(`Invalid upload name: ${file}`);
  return `assets/uploads/${file}`;
}

/** Which uploaded images are not yet in storage. */
export async function missingUploads(files: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const f of files) if (!(await store.exists(assetKey(`links/${f}`, "upload")))) out.push(f);
  return out;
}

export async function saveUpload(file: string, contentType: string, base64: string) {
  const data = Buffer.from(base64, "base64");
  if (data.length > MAX_UPLOAD) throw new PipelineError("Image is larger than 15 MB.");
  if (!/^image\/(jpeg|png|webp|svg\+xml)$/.test(contentType)) throw new PipelineError(`Unsupported image type ${contentType}.`);
  await store.put(assetKey(`links/${file}`, "upload"), new Uint8Array(data), contentType);
}

/* ---------------------------------------------------------------- jobs */

export const DEFAULT_OPTIONS: BuildOptions = {
  pdfPreset: "[PDF/X-4:2008]",
  jpegResolution: 72,
  outputs: { pdf: true, indd: true, idml: true, jpeg: true },
  preflightProfile: "[Basic]",
};

function validate(m: unknown): asserts m is InDesignManifestV2 {
  const x = m as Partial<InDesignManifestV2>;
  if (!x || x.schema !== MANIFEST_SCHEMA) throw new PipelineError(`Expected a ${MANIFEST_SCHEMA} manifest.`);
  if (!Array.isArray(x.pages) || !x.pages.length) throw new PipelineError("The manifest has no pages.");
  if (x.pages.length > 400) throw new PipelineError("Too many pages for one job (max 400).");
  if (!x.document || !x.paragraphStyles || !Array.isArray(x.stories) || !Array.isArray(x.links)) throw new PipelineError("The manifest is incomplete.");
}

export interface SubmitContext {
  /** Server mode: storage key of an uploaded image's untouched original (null = not available). */
  resolveUpload?: (assetId: string) => string | null;
}

export async function submitJob(manifest: unknown, options: Partial<BuildOptions> = {}, ctx: SubmitContext = {}) {
  validate(manifest);
  const opts: BuildOptions = { ...DEFAULT_OPTIONS, ...options, outputs: { ...DEFAULT_OPTIONS.outputs, ...options.outputs } };
  const executionUrl = await ensureScript();
  const jobKey = `jobs/${new Date().toISOString().slice(0, 10)}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  await store.put(`${jobKey}/manifest.json`, JSON.stringify(manifest), "application/json");
  const assets: { source: { url: string }; destination: string }[] = [{ source: { url: await store.signedGet(`${jobKey}/manifest.json`) }, destination: "manifest.json" }];

  // Images referenced by the pages.
  const missing: string[] = [];
  for (const link of manifest.links) {
    if (ctx.resolveUpload && link.source === "upload") {
      const original = ctx.resolveUpload(link.assetId);
      if (!original || !(await store.exists(original))) {
        missing.push(link.path);
        continue;
      }
      assets.push({ source: { url: await store.signedGet(original) }, destination: link.path });
      continue;
    }
    const k = assetKey(link.path, link.source);
    if (!(await store.exists(k))) {
      if (link.source === "sample") {
        const svg = renderSampleSvg(link.assetId);
        if (!svg) {
          missing.push(link.path);
          continue;
        }
        await store.put(k, svg, "image/svg+xml");
      } else {
        missing.push(link.path);
        continue;
      }
    }
    assets.push({ source: { url: await store.signedGet(k) }, destination: link.path });
  }
  if (missing.length) throw new PipelineError("Some images have not been uploaded yet.", 409, { missing });

  // Every font in the house font folder travels with the job.
  const fonts = (await store.list("fonts/")).filter((f) => /\.(otf|ttf|ttc|otc)$/i.test(f.key));
  for (const f of fonts) assets.push({ source: { url: await store.signedGet(f.key) }, destination: `Document Fonts/${f.key.split("/").pop()}` });

  const accepted = await runScript(executionUrl, {
    assets,
    params: {
      manifest: "manifest.json",
      options: opts,
      generalSettings: { fonts: { fontsDirectories: ["Document Fonts"] } },
    },
  });
  return { jobId: accepted.jobId, jobKey, fonts: fonts.length, links: manifest.links.length, pages: manifest.pages.length };
}

function kindOf(name: string): JobOutput["kind"] {
  const ext = name.split(".").pop()?.toLowerCase();
  if (name.endsWith("report.json")) return "report";
  if (ext === "pdf") return "pdf";
  if (ext === "indd") return "indd";
  if (ext === "idml") return "idml";
  if (ext === "jpg" || ext === "jpeg") return "jpeg";
  return "other";
}

const STATUS: Record<string, JobView["status"]> = {
  not_started: "queued",
  notstarted: "queued",
  queued: "queued",
  pending: "queued",
  running: "running",
  succeeded: "succeeded",
  partial_success: "partial_success",
  failed: "failed",
};

export async function getJob(jobId: string): Promise<JobView> {
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(jobId)) throw new PipelineError("Invalid job id.");
  const raw: RawStatus = await jobStatus(jobId);
  const status = STATUS[(raw.status ?? "").toLowerCase()] ?? "running";
  const outputs: JobOutput[] = (Array.isArray(raw.outputs) ? raw.outputs : [])
    .filter((o) => o.destination?.url && o.source)
    .map((o) => {
      const path = String(o.source).replace(/\\/g, "/");
      const name = path.split("/").pop() ?? path;
      return { name, path, url: o.destination!.url!, kind: kindOf(name) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  let report: BuildReport | undefined;
  const data = raw.data as Record<string, unknown> | undefined;
  if (data && typeof data === "object" && "overset" in data) report = data as unknown as BuildReport;
  const reportUrl = (typeof raw.dataURL === "string" && /^https:/.test(raw.dataURL) ? raw.dataURL : undefined) ?? outputs.find((o) => o.kind === "report")?.url;
  if (!report && reportUrl && (status === "succeeded" || status === "partial_success")) {
    try {
      const res = await fetch(reportUrl, { cache: "no-store" });
      if (res.ok) report = (await res.json()) as BuildReport;
    } catch {
      /* report is optional */
    }
  }
  return {
    jobId,
    status,
    message: raw.message,
    outputs: outputs.filter((o) => o.kind !== "report"),
    report,
    errors: (raw.errors ?? []).map((e) => [e.error_code, e.message, e.source].filter(Boolean).join(" — ")),
  };
}

/* ---------------------------------------------------------------- test */

export async function testConnection() {
  const checks: { name: string; ok: boolean; detail: string }[] = [];
  try {
    await accessToken();
    checks.push({ name: "Adobe sign-in", ok: true, detail: "Access token issued by Adobe IMS." });
    const scripts = await listScripts();
    const count = Array.isArray((scripts as { items?: unknown[] })?.items) ? (scripts as { items: unknown[] }).items.length : undefined;
    checks.push({ name: "InDesign API", ok: true, detail: count === undefined ? "Custom Scripts API reachable." : `Custom Scripts API reachable (${count} scripts registered).` });
  } catch (e) {
    checks.push({ name: "Adobe InDesign API", ok: false, detail: e instanceof Error ? e.message : String(e) });
  }
  try {
    const fonts = (await store.list("fonts/")).filter((f) => /\.(otf|ttf|ttc|otc)$/i.test(f.key));
    checks.push({ name: "S3 storage", ok: true, detail: `Bucket reachable · ${fonts.length} font file${fonts.length === 1 ? "" : "s"} in ${env.s3.prefix}/fonts/` });
    const reg = await store.getText("registry/script.json");
    checks.push({ name: "Build script", ok: true, detail: env.adobe.scriptUrl ? "Using INDESIGN_SCRIPT_URL." : reg ? `Registered: ${(JSON.parse(reg) as Registry).version}` : "Not registered yet — registers automatically on the first job." });
  } catch (e) {
    checks.push({ name: "S3 storage", ok: false, detail: e instanceof Error ? e.message : String(e) });
  }
  return { ok: checks.every((c) => c.ok), checks };
}
