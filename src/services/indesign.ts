"use client";

/**
 * Browser client for the Adobe InDesign API pipeline (see src/server/indesign).
 *
 * The browser builds the manifest from the live page model, makes sure
 * uploaded images are staged on the server, starts the job and polls it.
 * Composition, preflight and PDF/X / INDD / IDML export happen in InDesign.
 */

import { buildInDesignManifestV2 } from "@/lib/indesign/build-manifest";
import type { BuildOptions, GateResult, InDesignManifestV2, JobView } from "@/lib/indesign/manifest-types";
import { canNow, flushSync, isServerMode, knownVersion } from "@/lib/sync/engine";
import { findImage } from "@/lib/images";
import type { LayoutContext } from "@/lib/layout-engine";
import type { ImageAsset, Settings } from "@/lib/types";

export interface ServerReadiness {
  adobe: boolean;
  storage: boolean;
  apiKey: boolean;
  ready: boolean;
  missing: string[];
  script: { name: string; version: string };
}

export interface IntegrationState {
  /** Server env is complete, the app is set to use it and has the access key. */
  usable: boolean;
  reason?: string;
}

export const PDF_PRESETS = ["[PDF/X-4:2008]", "[PDF/X-1a:2001]", "[PDF/X-3:2002]", "[Press Quality]", "[High Quality Print]"];

export async function fetchReadiness(): Promise<ServerReadiness | null> {
  try {
    const res = await fetch("/api/indesign/status", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as ServerReadiness;
  } catch {
    return null;
  }
}

export function integrationState(settings: Settings, server: ServerReadiness | null): IntegrationState {
  if (settings.integration.mode !== "adobe-indesign-api") return { usable: false, reason: "Switch Settings → InDesign integration to “Adobe InDesign API”." };
  if (!server) return { usable: false, reason: "Server status unavailable." };
  if (!server.ready) return { usable: false, reason: `Server not configured: ${server.missing.join(", ")}.` };
  if (isServerMode()) {
    // Signed-in team: the role decides, no shared key.
    return canNow("build-indesign") ? { usable: true } : { usable: false, reason: "Designers and editors run InDesign builds." };
  }
  if (!settings.integration.accessKey?.trim()) return { usable: false, reason: "Enter the PressFlow access key in Settings → InDesign integration." };
  return { usable: true };
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
  }
}

async function api<T>(path: string, key: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", "x-pressflow-key": key, ...(init.headers ?? {}) },
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string; details?: unknown; gates?: unknown };
  if (!res.ok) throw new ApiError(body.error ?? `Request failed (HTTP ${res.status})`, res.status, body.gates ?? body.details);
  return body as T;
}

export async function testServer(key: string) {
  return api<{ ok: boolean; checks: { name: string; ok: boolean; detail: string }[] }>("/api/indesign/test", key, { method: "POST", body: "{}" });
}

export function buildOptions(settings: Settings, outputs: BuildOptions["outputs"]): BuildOptions {
  return {
    pdfPreset: settings.integration.pdfPreset ?? PDF_PRESETS[0],
    jpegResolution: settings.integration.jpegResolution ?? 72,
    preflightProfile: settings.integration.preflightProfile?.trim() || "[Basic]",
    outputs,
  };
}

export function makeManifest(ctx: LayoutContext, uploads: ImageAsset[], pages: number[], settings: Settings): InDesignManifestV2 {
  return buildInDesignManifestV2(ctx, uploads, pages, { fontMap: settings.integration.fontFamilies });
}

/** Upload images that exist only in this browser so InDesign can place them. */
async function stageUploads(manifest: InDesignManifestV2, uploads: ImageAsset[], key: string, onStage: (s: string) => void) {
  const files = manifest.links.filter((l) => l.source === "upload").map((l) => l.path.replace(/^links\//, ""));
  if (!files.length) return;
  const { missing } = await api<{ missing: string[] }>("/api/indesign/assets", key, { method: "POST", body: JSON.stringify({ action: "check", files }) });
  for (let i = 0; i < missing.length; i++) {
    const file = missing[i];
    const link = manifest.links.find((l) => l.path === `links/${file}`)!;
    const asset = findImage(link.assetId, uploads);
    if (!asset?.src) throw new Error(`Image ${file} is no longer in this browser.`);
    onStage(`Uploading image ${i + 1} of ${missing.length}…`);
    const [, data] = asset.src.split(",", 2);
    await api("/api/indesign/assets", key, { method: "POST", body: JSON.stringify({ action: "upload", file, contentType: link.contentType, data }) });
  }
}

export interface StartResult {
  jobId: string;
  pages: number;
  links: number;
  fonts: number;
  manifest: InDesignManifestV2;
  /** Server mode: the gate results the build passed, and the server's job view. */
  gates?: GateResult;
  job?: JobView;
}

/** Thrown when the server's print quality gates refuse a build. */
export class GateError extends Error {
  constructor(
    message: string,
    public gates: GateResult,
  ) {
    super(message);
  }
}

export type BuildKind = "print" | "documents";

/** Server copy versions of the pages, so the server can refuse a build from a stale browser. */
function pageVersions(ctx: LayoutContext, manifest: InDesignManifestV2) {
  const out: Record<string, number> = {};
  for (const p of manifest.pages) if (ctx.pages.some((x) => x.id === p.pageId)) out[p.pageId] = knownVersion("pages", p.pageId);
  return out;
}

/** Server mode: run the print quality gates without starting a job. */
export async function checkPrintGates(ctx: LayoutContext, uploads: ImageAsset[], pages: number[], settings: Settings, kind: BuildKind): Promise<GateResult> {
  if (!(await flushSync())) throw new Error("Your latest edits are not saved yet — check the connection and try again.");
  const manifest = makeManifest(ctx, uploads, pages, settings);
  return api<GateResult>("/api/indesign/gates", "", {
    method: "POST",
    body: JSON.stringify({ manifest, options: buildOptions(settings, { pdf: true, indd: false, idml: false, jpeg: true }), kind, pageVersions: pageVersions(ctx, manifest) }),
  });
}

/** Server mode: an editor releases a clean print build to the printer, or rejects it. */
export async function decidePrintRelease(jobId: string, decision: "release" | "reject", note?: string): Promise<JobView> {
  return api<JobView>(`/api/indesign/jobs/${encodeURIComponent(jobId)}/release`, "", { method: "POST", body: JSON.stringify({ decision, note }) });
}

export async function startInDesignJob(
  ctx: LayoutContext,
  uploads: ImageAsset[],
  pages: number[],
  settings: Settings,
  outputs: BuildOptions["outputs"],
  onStage: (s: string) => void,
): Promise<StartResult> {
  const key = settings.integration.accessKey ?? "";
  if (isServerMode()) {
    onStage("Saving your latest edits…");
    if (!(await flushSync())) throw new Error("Your latest edits are not saved yet — check the connection and try again.");
    onStage("Checking print quality on the server…");
    const manifest = makeManifest(ctx, uploads, pages, settings);
    const kind: BuildKind = outputs.indd || outputs.idml ? "documents" : "print";
    try {
      const res = await api<{ job: JobView; gates: GateResult }>("/api/indesign/jobs", "", {
        method: "POST",
        body: JSON.stringify({ manifest, options: buildOptions(settings, outputs), kind, publicationId: ctx.publication.id, pageVersions: pageVersions(ctx, manifest) }),
      });
      return { jobId: res.job.jobId, pages: manifest.pages.length, links: manifest.links.length, fonts: manifest.fonts.length, manifest, gates: res.gates, job: res.job };
    } catch (e) {
      const gates = e instanceof ApiError ? (e.details as GateResult | undefined) : undefined;
      if (e instanceof ApiError && e.status === 422 && gates) throw new GateError(e.message, gates);
      throw e;
    }
  }
  onStage("Building the InDesign manifest…");
  const manifest = makeManifest(ctx, uploads, pages, settings);
  await stageUploads(manifest, uploads, key, onStage);
  onStage("Sending the job to Adobe InDesign…");
  const res = await api<{ jobId: string; pages: number; links: number; fonts: number }>("/api/indesign/jobs", key, {
    method: "POST",
    body: JSON.stringify({ manifest, options: buildOptions(settings, outputs) }),
  });
  return { ...res, manifest };
}

export async function getInDesignJob(jobId: string, settings: Settings): Promise<JobView> {
  return api<JobView>(`/api/indesign/jobs/${encodeURIComponent(jobId)}`, settings.integration.accessKey ?? "");
}

export const STAGE_LABEL: Record<JobView["status"], string> = {
  queued: "Queued at Adobe",
  running: "InDesign is building, preflighting and exporting the pages…",
  succeeded: "Finished",
  partial_success: "Finished with some errors",
  failed: "Failed",
};
