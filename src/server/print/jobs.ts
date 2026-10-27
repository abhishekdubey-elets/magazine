import "server-only";
import { and, desc, eq, inArray, lt, or, isNull } from "drizzle-orm";
import { can, type SessionUser } from "@/lib/roles";
import type { BuildOptions, BuildReport, GateResult, InDesignManifestV2, JobOutput, JobView, ReleaseInfo } from "@/lib/indesign/manifest-types";
import type { ImageAsset } from "@/lib/types";
import { audit } from "../audit";
import { HttpError } from "../auth/session";
import { env } from "../config";
import { db, schema } from "../db";
import { DEFAULT_OPTIONS, getJob, PipelineError, submitJob } from "../indesign/pipeline";
import { copyFromUrl, downloadUrl, head, put } from "../storage";
import { tableOf } from "../workspace/sync";
import { runGates } from "./gates";

/**
 * Server-mode InDesign builds: gated start, persistent job records, outputs
 * archived into the workspace's own storage (Adobe keeps them only 24 h), and
 * an editor's release decision on clean print builds.
 */

type JobRow = typeof schema.indesignJobs.$inferSelect;
const TERMINAL = ["succeeded", "partial_success", "failed"];

interface StoredOutput {
  name: string;
  kind: JobOutput["kind"];
  key: string;
  bytes: number;
}

const MIME: Record<string, string> = { pdf: "application/pdf", indd: "application/x-indesign", idml: "application/vnd.adobe.indesign-idml-package", jpeg: "image/jpeg", report: "application/json", other: "application/octet-stream" };

export async function checkGates(manifest: InDesignManifestV2, kind: "print" | "documents", options: Partial<BuildOptions>, pageVersions?: Record<string, number>) {
  return runGates(manifest, { kind, pdfPreset: options.pdfPreset ?? DEFAULT_OPTIONS.pdfPreset, pageVersions });
}

/** Run the gates and, if they pass, start the InDesign job. */
export async function startBuild(
  user: SessionUser,
  input: { manifest: InDesignManifestV2; options: Partial<BuildOptions>; kind: "print" | "documents"; publicationId: string; pageVersions?: Record<string, number> },
): Promise<{ job?: JobView; gates: GateResult }> {
  const { manifest, options, kind } = input;
  if (kind === "print" && !options.outputs?.pdf) throw new HttpError(400, "A print build must export the PDF.");
  const gates = await checkGates(manifest, kind, options, input.pageVersions);
  if (!gates.ok) {
    await audit(await db(), user, "print", input.publicationId, "blocked", gates.checks.filter((c) => c.status === "block").map((c) => c.label).join("; "));
    return { gates };
  }

  // Originals for uploaded images (exactly as uploaded).
  const d = await db();
  const at = tableOf("uploads");
  const ids = manifest.links.filter((l) => l.source === "upload").map((l) => l.assetId);
  const rows = ids.length ? await d.select().from(at).where(and(eq(at.orgId, env.orgId), inArray(at.id, ids))) : [];
  const originals = new Map(rows.map((r) => [r.id, (r.data as ImageAsset).original?.key ?? null]));

  let submitted;
  try {
    submitted = await submitJob(manifest, options, { resolveUpload: (id) => originals.get(id) ?? null });
  } catch (e) {
    if (e instanceof PipelineError) throw new HttpError(e.status, e.message, e.details);
    throw e;
  }
  const id = `pfj-${Date.now().toString(36)}${crypto.randomUUID().slice(0, 6)}`;
  await d.insert(schema.indesignJobs).values({
    id,
    orgId: env.orgId,
    publicationId: input.publicationId,
    kind,
    adobeJobId: submitted.jobId,
    jobKey: submitted.jobKey,
    status: "running",
    releaseStatus: "none",
    pages: manifest.pages.map((p) => p.number),
    gates,
    createdBy: user.id,
  });
  await audit(d, user, "print", id, `start:${kind}`, `${manifest.pages.length} pages · ${submitted.fonts} fonts · ${submitted.links} images`);
  const [row] = await d.select().from(schema.indesignJobs).where(eq(schema.indesignJobs.id, id));
  return { job: await view(row), gates };
}

/* ------------------------------------------------------------ release */

export function evaluateRelease(status: string, report: BuildReport | null | undefined, outputs: StoredOutput[]): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (status !== "succeeded") reasons.push("The InDesign job did not finish cleanly.");
  if (!report) reasons.push("No InDesign build report.");
  else {
    if (report.overset.length) reasons.push(`${report.overset.length} text frame(s) overset — text would be cut off.`);
    if (report.missingFonts.length) reasons.push(`Missing fonts in InDesign: ${report.missingFonts.join(", ")}.`);
    const bad = report.images.filter((i) => i.status !== "placed" && i.link);
    if (bad.length) reasons.push(`${bad.length} image(s) not placed.`);
    if (!report.preflight) reasons.push("InDesign preflight did not run.");
    else if (report.preflight.errors > 0) reasons.push(`InDesign preflight found ${report.preflight.errors} error(s) (${report.preflight.profile}).`);
  }
  if (!outputs.some((o) => o.kind === "pdf")) reasons.push("No print PDF was produced.");
  return { eligible: reasons.length === 0, reasons };
}

export async function decideRelease(user: SessionUser, id: string, decision: "release" | "reject", note?: string) {
  if (!can(user.role, "release-print")) throw new HttpError(403, "Only editors can release an issue to print.");
  const d = await db();
  const row = await load(id);
  if (row.kind !== "print") throw new HttpError(400, "Only print builds can be released.");
  if (row.releaseStatus !== "pending") throw new HttpError(409, row.releaseStatus === "released" ? "Already released." : "This build is not awaiting release.");
  const r = evaluateRelease(row.status, row.report as BuildReport | null, (row.outputs as StoredOutput[] | null) ?? []);
  if (decision === "release" && !r.eligible) throw new HttpError(409, `Cannot release: ${r.reasons.join(" ")}`);
  await d
    .update(schema.indesignJobs)
    .set({ releaseStatus: decision === "release" ? "released" : "rejected", releasedBy: user.id, releasedAt: new Date(), releaseNote: note?.slice(0, 1000) ?? null })
    .where(eq(schema.indesignJobs.id, id));
  await audit(d, user, "print", id, decision, note);
  return view(await load(id));
}

/* ------------------------------------------------------------ refresh */

async function load(id: string): Promise<JobRow> {
  if (!/^pfj-[a-z0-9-]{6,40}$/.test(id)) throw new HttpError(400, "Invalid job id.");
  const [row] = await (await db())
    .select()
    .from(schema.indesignJobs)
    .where(and(eq(schema.indesignJobs.id, id), eq(schema.indesignJobs.orgId, env.orgId)));
  if (!row) throw new HttpError(404, "No such build.");
  return row;
}

/** Poll Adobe for a running job; archive outputs and evaluate release when it finishes. */
export async function refresh(id: string): Promise<JobView> {
  let row = await load(id);
  if (TERMINAL.includes(row.status) || !row.adobeJobId) return view(row);
  const d = await db();
  const live = await getJob(row.adobeJobId);
  if (!TERMINAL.includes(live.status)) {
    if (row.status !== live.status && row.status !== "finalizing") {
      await d.update(schema.indesignJobs).set({ status: live.status }).where(eq(schema.indesignJobs.id, id));
      row = { ...row, status: live.status };
    }
    return view(row, live);
  }

  // Claim the finalisation (another poller or the cron may race us).
  const claimed = await d
    .update(schema.indesignJobs)
    .set({ status: "finalizing", finishedAt: new Date() })
    .where(
      and(
        eq(schema.indesignJobs.id, id),
        or(
          inArray(schema.indesignJobs.status, ["queued", "running"]),
          and(eq(schema.indesignJobs.status, "finalizing"), or(isNull(schema.indesignJobs.finishedAt), lt(schema.indesignJobs.finishedAt, new Date(Date.now() - 10 * 60_000)))),
        ),
      ),
    )
    .returning({ id: schema.indesignJobs.id });
  if (!claimed.length) return view(await load(id), live);

  const outputs: StoredOutput[] = [];
  const errors: string[] = [...live.errors];
  for (const o of live.outputs) {
    const key = `${row.jobKey}/output/${o.name}`;
    try {
      const existing = await head(key);
      const bytes = existing?.size ? existing.size : await copyFromUrl(o.url, key, MIME[o.kind] ?? MIME.other);
      outputs.push({ name: o.name, kind: o.kind, key, bytes });
    } catch (e) {
      errors.push(`Could not archive ${o.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (live.report) await put(`${row.jobKey}/output/report.json`, JSON.stringify(live.report, null, 2), "application/json");
  const status = live.status === "succeeded" && errors.length > live.errors.length ? "partial_success" : live.status;
  const release = row.kind === "print" ? evaluateRelease(status, live.report, outputs) : { eligible: false, reasons: [] };
  await d
    .update(schema.indesignJobs)
    .set({
      status,
      outputs,
      report: live.report ?? null,
      error: errors.length ? errors.join("\n") : null,
      finishedAt: new Date(),
      releaseStatus: row.kind === "print" && release.eligible ? "pending" : "none",
    })
    .where(eq(schema.indesignJobs.id, id));
  await audit(d, null, "print", id, `finished:${status}`, row.kind === "print" ? (release.eligible ? "Clean — awaiting editor release" : release.reasons.join(" ")) : undefined);
  return view(await load(id));
}

/** Finalise every running job (cron fallback when nobody has the export page open). */
export async function refreshRunning() {
  const d = await db();
  const rows = await d
    .select({ id: schema.indesignJobs.id })
    .from(schema.indesignJobs)
    .where(and(eq(schema.indesignJobs.orgId, env.orgId), inArray(schema.indesignJobs.status, ["queued", "running", "finalizing"])))
    .limit(20);
  const results: { id: string; status: string }[] = [];
  for (const r of rows) {
    try {
      results.push({ id: r.id, status: (await refresh(r.id)).status });
    } catch (e) {
      results.push({ id: r.id, status: `error: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  return results;
}

export async function listJobs(publicationId: string) {
  const rows = await (await db())
    .select()
    .from(schema.indesignJobs)
    .where(and(eq(schema.indesignJobs.orgId, env.orgId), eq(schema.indesignJobs.publicationId, publicationId)))
    .orderBy(desc(schema.indesignJobs.createdAt))
    .limit(30);
  return Promise.all(rows.map((r) => view(r)));
}

/** Archived file for download (S3 → signed URL; local → streamed by the route). */
export async function outputFile(id: string, name: string) {
  const row = await load(id);
  const o = ((row.outputs as StoredOutput[] | null) ?? []).find((x) => x.name === name);
  if (!o) throw new HttpError(404, "No such file.");
  return { ...o, url: await downloadUrl(o.key, 3600), contentType: MIME[o.kind] ?? MIME.other };
}

async function personName(id: string | null) {
  if (!id) return null;
  const [u] = await (await db()).select({ name: schema.users.name, email: schema.users.email }).from(schema.users).where(eq(schema.users.id, id));
  return u?.name ?? u?.email ?? null;
}

async function view(row: JobRow, live?: JobView): Promise<JobView> {
  const stored = (row.outputs as StoredOutput[] | null) ?? [];
  const outputs: JobOutput[] = stored.map((o) => ({ name: o.name, path: o.key, kind: o.kind, url: `/api/indesign/jobs/${row.id}/files/${encodeURIComponent(o.name)}` }));
  const report = (row.report as BuildReport | null) ?? live?.report;
  const r = row.kind === "print" && TERMINAL.includes(row.status) ? evaluateRelease(row.status, report, stored) : { eligible: false, reasons: [] };
  const release: ReleaseInfo = {
    status: row.releaseStatus as ReleaseInfo["status"],
    eligible: r.eligible,
    reasons: r.reasons,
    by: await personName(row.releasedBy),
    at: row.releasedAt?.toISOString() ?? null,
    note: row.releaseNote,
  };
  const status = (row.status === "finalizing" ? "running" : row.status) as JobView["status"];
  return {
    jobId: row.id,
    status,
    message: status === "running" && row.status === "finalizing" ? "Archiving the files…" : live?.message,
    outputs,
    report: report ?? undefined,
    errors: row.error ? row.error.split("\n") : (live?.errors ?? []),
    kind: row.kind as JobView["kind"],
    gates: (row.gates as GateResult | null) ?? undefined,
    release,
    archived: true,
  };
}
