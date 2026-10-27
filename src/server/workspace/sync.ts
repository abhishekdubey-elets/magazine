import "server-only";
import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import { can, type SessionUser } from "@/lib/roles";
import {
  COLLECTIONS,
  COLLECTION_KEYS,
  MAX_ITEM_BYTES,
  type Change,
  type ChangeResult,
  type CollectionKey,
  type Row,
  type Snapshot,
} from "@/lib/sync/collections";
import { audit } from "../audit";
import { env } from "../config";
import { db, schema, type DB } from "../db";
import { cleanSettings, contentChanged, contentHash, review } from "./rules";

type Obj = Record<string, unknown>;
type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

// All entity tables share the same columns; `articles` has every optional extra column.
export const tableOf = (col: CollectionKey) => schema.ENTITY_TABLES[COLLECTIONS[col].table] as typeof schema.articles;

/* ------------------------------------------------------------ snapshot */

export async function snapshot(): Promise<Snapshot> {
  const d = await db();
  const cursor = new Date().toISOString();
  const collections = {} as Snapshot["collections"];
  let total = 0;
  for (const col of COLLECTION_KEYS) {
    const t = tableOf(col);
    const { limit } = COLLECTIONS[col];
    const where = and(eq(t.orgId, env.orgId), eq(t.deleted, false));
    const rows = limit
      ? (await d.select().from(t).where(where).orderBy(desc(t.seq)).limit(limit)).reverse()
      : await d.select().from(t).where(where).orderBy(asc(t.seq));
    total += rows.length;
    collections[col] = rows.map((r) => ({ col, id: r.id, version: r.version, data: r.data, updatedBy: r.updatedBy }));
  }
  const [org] = await d.select().from(schema.orgs).where(eq(schema.orgs.id, env.orgId)).limit(1);
  const settings: Row | null = org?.settings ? { col: "settings", id: "settings", version: org.settingsVersion, data: org.settings } : null;
  return { collections, settings, cursor, empty: total === 0 && !settings };
}

/** Rows changed since `since` (ISO time). Overlaps by a few seconds; the app ignores versions it has. */
export async function changesSince(since: string) {
  const d = await db();
  const cursor = new Date().toISOString();
  const from = new Date(new Date(since).getTime() - 5000);
  if (Number.isNaN(from.getTime())) throw new Error("Invalid cursor");
  const rows: Row[] = [];
  for (const col of COLLECTION_KEYS) {
    const t = tableOf(col);
    const res = await d
      .select()
      .from(t)
      .where(and(eq(t.orgId, env.orgId), gt(t.updatedAt, from)))
      .orderBy(asc(t.seq))
      .limit(500);
    for (const r of res) rows.push({ col, id: r.id, version: r.version, data: r.deleted ? null : r.data, deleted: r.deleted, updatedBy: r.updatedBy });
  }
  const [org] = await d.select().from(schema.orgs).where(and(eq(schema.orgs.id, env.orgId), gt(schema.orgs.updatedAt, from))).limit(1);
  if (org?.settings) rows.push({ col: "settings", id: "settings", version: org.settingsVersion, data: org.settings });
  return { rows, cursor };
}

/* --------------------------------------------------------------- push */

const fail = (c: Change, reason: "conflict" | "forbidden" | "invalid", message: string, server: Row | null): ChangeResult => ({
  col: c.col,
  id: c.id,
  ok: false,
  reason,
  message,
  server,
});

const label = (col: CollectionKey, data: Obj | null) => String(data?.title ?? data?.name ?? data?.fileName ?? data?.message ?? "").slice(0, 80);

function extraColumns(col: CollectionKey, data: Obj) {
  if (col === "pages") return { publicationId: (data.publicationId as string) ?? null };
  if (col === "articles") return { publicationId: (data.publicationId as string) ?? null, status: (data.status as string) ?? null };
  if (col === "exportJobs") return { publicationId: (data.publicationId as string) ?? null };
  return {};
}

export async function applyChanges(user: SessionUser, changes: Change[]): Promise<ChangeResult[]> {
  const d = await db();
  const out: ChangeResult[] = [];
  for (const c of changes) {
    try {
      out.push(c.col === "settings" ? await applySettings(d, user, c) : await applyOne(d, user, c));
    } catch (e) {
      console.error("sync change failed", c.col, c.id, e);
      out.push(fail(c, "invalid", e instanceof Error ? e.message : "Could not save.", null));
    }
  }
  return out;
}

async function applyOne(d: DB, user: SessionUser, c: Change): Promise<ChangeResult> {
  const col = c.col as CollectionKey;
  const meta = COLLECTIONS[col];
  if (!meta) return fail(c, "invalid", "Unknown collection.", null);
  if (typeof c.id !== "string" || !/^[\w.:-]{1,120}$/.test(c.id)) return fail(c, "invalid", "Invalid id.", null);
  const t = tableOf(col);

  return d.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(t)
      .where(and(eq(t.orgId, env.orgId), eq(t.id, c.id)))
      .for("update");
    const server: Row | null = row ? { col, id: row.id, version: row.version, data: row.deleted ? null : row.data, deleted: row.deleted } : null;
    const prev = row && !row.deleted ? (row.data as Obj) : null;

    if (!can(user.role, meta.cap)) {
      // Contributors may still log their own work on pages they cannot edit, etc.: logs use record-work.
      return fail(c, "forbidden", `Your role (${user.role}) cannot change ${col}.`, server);
    }
    if ((row?.version ?? 0) !== c.base && !(row?.deleted && c.base === 0)) {
      return fail(c, "conflict", `Someone else changed this ${col.replace(/s$/, "")} first.`, server);
    }

    /* delete */
    if (c.deleted) {
      if (meta.log) return { col, id: c.id, ok: true as const, version: row?.version ?? 0 };
      if (!row || row.deleted) return { col, id: c.id, ok: true as const, version: row?.version ?? 0 };
      if (col === "pages" && prev?.status === "approved" && !can(user.role, "approve-pages")) {
        return fail(c, "forbidden", "Only editors can delete an approved page.", server);
      }
      const version = row.version + 1;
      await tx
        .update(t)
        .set({ deleted: true, version, updatedAt: new Date(), updatedBy: user.id })
        .where(and(eq(t.orgId, env.orgId), eq(t.id, c.id)));
      await audit(tx, user, col, c.id, "delete", label(col, prev));
      return { col, id: c.id, ok: true as const, version };
    }

    /* create / update */
    if (!c.data || typeof c.data !== "object" || Array.isArray(c.data)) return fail(c, "invalid", "Missing data.", server);
    const input = c.data as Obj;
    if (input.id !== c.id) return fail(c, "invalid", "Item id does not match.", server);
    const size = JSON.stringify(input).length;
    if (size > MAX_ITEM_BYTES) return fail(c, "invalid", `This item is too large to save (${Math.round(size / 1e6)} MB).`, server);
    if (col === "templates" && !can(user.role, "edit-templates")) return fail(c, "forbidden", "Only designers can change templates.", server);

    const r = review(col, user, prev, input);
    if (r.error) return fail(c, "forbidden", r.error, server);
    if (col === "pages" && r.data.status === "approved" && prev?.status !== "approved") {
      // Record exactly what was approved: the page, its article and its template.
      r.data.approvedRefs = await approvalRefs(tx, r.data);
    }
    const version = (row?.version ?? 0) + 1;
    const values = { data: r.data, version, deleted: false, updatedAt: new Date(), updatedBy: user.id, ...extraColumns(col, r.data) };
    if (row) await tx.update(t).set(values).where(and(eq(t.orgId, env.orgId), eq(t.id, c.id)));
    else await tx.insert(t).values({ id: c.id, orgId: env.orgId, ...values });

    if (col === "articles" && contentChanged(col, prev, r.data)) await recordArticleVersion(tx, user, c.id, version, r.data);
    await auditChange(tx, user, col, c.id, prev, r.data, !row || !!row.deleted);
    return { col, id: c.id, ok: true as const, version, ...(r.rewritten ? { data: r.data } : {}) };
  });
}

async function entity(tx: Tx, col: "articles" | "templates", id: unknown): Promise<Obj | null> {
  if (typeof id !== "string") return null;
  const t = tableOf(col);
  const [row] = await tx
    .select()
    .from(t)
    .where(and(eq(t.orgId, env.orgId), eq(t.id, id)))
    .limit(1);
  return row && !row.deleted ? (row.data as Obj) : null;
}

export async function approvalRefs(tx: Tx | DB, page: Obj) {
  return {
    page: contentHash("pages", page),
    article: contentHash("articles", await entity(tx as Tx, "articles", page.articleId)),
    template: contentHash("templates", await entity(tx as Tx, "templates", page.templateId)),
  };
}

async function auditChange(tx: Tx, user: SessionUser, col: CollectionKey, id: string, prev: Obj | null, next: Obj, created: boolean) {
  if (COLLECTIONS[col].log) return;
  if (created) return audit(tx, user, col, id, "create", label(col, next));
  if (prev?.status !== next.status && next.status) {
    const reopened = prev?.status === "approved" && next.status === "in-review" && typeof next.reviewNote === "string";
    return audit(tx, user, col, id, reopened ? "reopen" : `status:${next.status}`, label(col, next));
  }
  if (col === "templates" || col === "publications") return audit(tx, user, col, id, "update", label(col, next));
}

/** Article history: one snapshot per person per 10-minute editing session. */
async function recordArticleVersion(tx: Tx, user: SessionUser, articleId: string, version: number, data: Obj) {
  const v = schema.articleVersions;
  const [last] = await tx
    .select()
    .from(v)
    .where(and(eq(v.orgId, env.orgId), eq(v.articleId, articleId)))
    .orderBy(desc(v.id))
    .limit(1);
  if (last && last.createdBy === user.id && Date.now() - new Date(last.createdAt).getTime() < 10 * 60_000) {
    await tx.update(v).set({ data, version }).where(eq(v.id, last.id));
  } else {
    await tx.insert(v).values({ orgId: env.orgId, articleId, version, data, createdBy: user.id });
  }
}

async function applySettings(d: DB, user: SessionUser, c: Change): Promise<ChangeResult> {
  return d.transaction(async (tx) => {
    await tx.insert(schema.orgs).values({ id: env.orgId, name: env.orgName }).onConflictDoNothing();
    const [org] = await tx.select().from(schema.orgs).where(eq(schema.orgs.id, env.orgId)).for("update");
    const server: Row | null = org?.settings ? { col: "settings", id: "settings", version: org.settingsVersion, data: org.settings } : null;
    if (!can(user.role, "edit-settings")) return fail(c, "forbidden", "Only admins and designers can change workspace settings.", server);
    if ((org?.settingsVersion ?? 0) !== c.base) return fail(c, "conflict", "Settings were changed by someone else first.", server);
    if (!c.data || typeof c.data !== "object") return fail(c, "invalid", "Missing settings.", server);
    const data = cleanSettings(c.data as Obj);
    const version = (org?.settingsVersion ?? 0) + 1;
    await tx.update(schema.orgs).set({ settings: data, settingsVersion: version, updatedAt: new Date() }).where(eq(schema.orgs.id, env.orgId));
    await audit(tx, user, "settings", env.orgId, "update", "Workspace settings");
    return { col: "settings" as const, id: "settings", ok: true as const, version };
  });
}

/* --------------------------------------------------------------- seed */

/** First run: fill an empty workspace (admin only; refuses if anything exists). */
export async function seed(user: SessionUser, input: { collections: Partial<Record<CollectionKey, Obj[]>>; settings: Obj }) {
  const d = await db();
  return d.transaction(async (tx) => {
    await tx.insert(schema.orgs).values({ id: env.orgId, name: env.orgName }).onConflictDoNothing();
    const [org] = await tx.select().from(schema.orgs).where(eq(schema.orgs.id, env.orgId)).for("update");
    for (const col of COLLECTION_KEYS) {
      const t = tableOf(col);
      const [{ n }] = await tx.select({ n: sql<number>`count(*)` }).from(t).where(eq(t.orgId, env.orgId));
      if (Number(n) > 0 || org?.settings) throw new Error("The workspace already has content.");
    }
    let count = 0;
    for (const col of COLLECTION_KEYS) {
      const items = (input.collections[col] ?? []).filter((x) => x && typeof x.id === "string");
      // Stored in creation order; newest-first lists are reversed.
      const ordered = COLLECTIONS[col].newestFirst ? [...items].reverse() : items;
      const t = tableOf(col);
      for (const data of ordered) {
        await tx.insert(t).values({ id: data.id as string, orgId: env.orgId, data, version: 1, updatedBy: user.id, ...extraColumns(col, data) });
        count++;
      }
    }
    await tx.update(schema.orgs).set({ settings: cleanSettings(input.settings), settingsVersion: 1, updatedAt: new Date() }).where(eq(schema.orgs.id, env.orgId));
    await audit(tx, user, "workspace", env.orgId, "seed", `${count} items`);
    return { count };
  });
}
