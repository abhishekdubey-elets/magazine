import "server-only";
import { createHash } from "node:crypto";
import { can, type SessionUser } from "@/lib/roles";
import type { CollectionKey } from "@/lib/sync/collections";

/**
 * Server-side editorial rules applied to every change before it is stored.
 * They protect what reaches the press:
 *  - only editors approve articles and pages, and approval stamps come from the server;
 *  - editing an approved page sends it back to review (what was approved is what prints);
 *  - image metadata (pixel size, colour, original file) is measured by the server, never the app.
 */

type Obj = Record<string, unknown>;
export interface Review {
  data: Obj;
  /** The server changed the item; the app must adopt `data`. */
  rewritten: boolean;
  error?: string;
}

const omit = (o: Obj | null | undefined, keys: string[]) => {
  if (!o) return null;
  const c: Obj = { ...o };
  for (const k of keys) delete c[k];
  return c;
};
// Key order differs between the app and Postgres jsonb, so compare canonical JSON.
const same = (a: unknown, b: unknown) => stable(a) === stable(b);

/** Fields that do not change what is printed. */
const PAGE_META = ["status", "updatedAt", "approvedAt", "approvedBy", "approvedRefs", "generatedAt", "reviewNote"];
const ARTICLE_META = ["status", "updatedAt", "note", "approvedAt", "approvedBy", "tags"];
/** Image fields only the server may set (measured from the original file). */
const ASSET_SERVER_FIELDS = ["src", "width", "height", "vector", "source", "original", "createdAt"];

export function contentChanged(col: CollectionKey, prev: Obj | null, next: Obj): boolean {
  if (!prev) return true;
  const meta = col === "pages" ? PAGE_META : col === "articles" ? ARTICLE_META : ["updatedAt"];
  return !same(omit(prev, meta), omit(next, meta));
}

export function review(col: CollectionKey, user: SessionUser, prev: Obj | null, input: Obj): Review {
  const data: Obj = { ...input };
  let rewritten = false;
  const stamp = new Date().toISOString();

  if (col === "pages" || col === "articles") {
    const approveCap = col === "pages" ? "approve-pages" : "approve-articles";
    const wasApproved = prev?.status === "approved";
    const wantsApproved = data.status === "approved";
    const changed = contentChanged(col, prev, data);

    if (wantsApproved && !wasApproved) {
      if (!can(user.role, approveCap)) return { data, rewritten, error: `Only editors can approve ${col}.` };
      if (col === "pages" && prev && changed) {
        // Approve exactly what the editor has seen: content edits and approval are separate steps.
        return { data, rewritten, error: "The page changed while it was being approved. Review it again." };
      }
      data.approvedAt = stamp;
      data.approvedBy = user.name || user.email;
      delete data.reviewNote;
      rewritten = true;
    } else if (wasApproved && wantsApproved) {
      // Keep the server's approval stamp.
      if (data.approvedAt !== prev.approvedAt || data.approvedBy !== prev.approvedBy || !same(data.approvedRefs, prev.approvedRefs)) rewritten = true;
      data.approvedAt = prev.approvedAt;
      data.approvedBy = prev.approvedBy;
      if (prev.approvedRefs === undefined) delete data.approvedRefs;
      else data.approvedRefs = prev.approvedRefs;
      const reopen = col === "pages" ? changed : changed && !can(user.role, approveCap);
      if (reopen) {
        data.status = "in-review";
        data.reviewNote = `Changed after approval by ${user.name || user.email} — needs approval again.`;
        rewritten = true;
      }
    } else if (wasApproved && !wantsApproved && !can(user.role, approveCap) && !changed) {
      return { data, rewritten, error: `Only editors can withdraw an approval.` };
    }
    if (!wantsApproved && (data.approvedAt || data.approvedBy || data.approvedRefs) && data.status !== "approved") {
      // Approval stamps describe the current approval only.
      delete data.approvedAt;
      delete data.approvedBy;
      delete data.approvedRefs;
      rewritten = true;
    }
  }

  if (col === "uploads") {
    if (!prev) return { data, rewritten, error: "Upload images through the asset service." };
    for (const k of ASSET_SERVER_FIELDS) {
      if (!same(data[k], prev[k])) rewritten = true;
      if (prev[k] === undefined) delete data[k];
      else data[k] = prev[k];
    }
  }

  return { data, rewritten };
}

/** Settings: the per-browser access key never leaves the browser. */
export function cleanSettings(s: Obj): Obj {
  const integration = { ...((s.integration as Obj | undefined) ?? {}) };
  delete integration.accessKey;
  return { ...s, integration };
}

/** JSON with sorted keys, so equal content always hashes the same. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as Obj)
      .filter((k) => (v as Obj)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((v as Obj)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}

/**
 * Fingerprint of what an item contributes to the printed page (metadata such
 * as status or notes excluded). Stored with a page approval and re-checked
 * before print: if the article or template changed, the approval is stale.
 */
export function contentHash(col: "articles" | "templates" | "pages", data: Obj | null | undefined): string | null {
  if (!data) return null;
  const meta = col === "pages" ? PAGE_META : col === "articles" ? ARTICLE_META : ["updatedAt", "status", "duplicatedFrom"];
  return createHash("sha256").update(stable(omit(data, meta))).digest("hex").slice(0, 32);
}
