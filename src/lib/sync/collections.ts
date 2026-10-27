import type { Capability } from "../roles";

/**
 * Workspace collections synchronised between the app and the server.
 * Keys are the store's array names; `table` is the database table.
 */
export const COLLECTIONS = {
  publications: { table: "publications", cap: "edit-publications", newestFirst: true, log: false, limit: 0 },
  pages: { table: "pages", cap: "edit-pages", newestFirst: false, log: false, limit: 0 },
  articles: { table: "articles", cap: "edit-articles", newestFirst: true, log: false, limit: 0 },
  templates: { table: "templates", cap: "edit-templates", newestFirst: false, log: false, limit: 0 },
  uploads: { table: "assets", cap: "upload-assets", newestFirst: true, log: false, limit: 0 },
  references: { table: "referenceProfiles", cap: "edit-references", newestFirst: true, log: false, limit: 10 },
  // Logs: append/update only; the app keeps the newest few, older ones stay on the server.
  activity: { table: "activity", cap: "record-work", newestFirst: true, log: true, limit: 80 },
  exportJobs: { table: "exportJobs", cap: "record-work", newestFirst: true, log: true, limit: 40 },
  qaRuns: { table: "qaRuns", cap: "record-work", newestFirst: true, log: true, limit: 20 },
} as const satisfies Record<string, { table: string; cap: Capability; newestFirst: boolean; log: boolean; limit: number }>;

export type CollectionKey = keyof typeof COLLECTIONS;
export const COLLECTION_KEYS = Object.keys(COLLECTIONS) as CollectionKey[];
export const isCollection = (c: unknown): c is CollectionKey => typeof c === "string" && c in COLLECTIONS;

/** One item sent by the app. `base` is the version the edit started from (0 = new). */
export interface Change {
  col: CollectionKey | "settings";
  id: string;
  base: number;
  data?: unknown;
  deleted?: boolean;
}

export interface Row {
  col: CollectionKey | "settings";
  id: string;
  version: number;
  data: unknown;
  deleted?: boolean;
  updatedBy?: string | null;
}

export type ChangeResult =
  | { col: Change["col"]; id: string; ok: true; version: number; /** The server adjusted the item (e.g. approval stamps); adopt it. */ data?: unknown }
  | { col: Change["col"]; id: string; ok: false; reason: "conflict" | "forbidden" | "invalid"; message: string; server: Row | null };

export interface Snapshot {
  collections: Record<CollectionKey, Row[]>;
  settings: Row | null;
  cursor: string;
  empty: boolean;
}

/** Per-request size cap (Vercel limits request bodies to 4.5 MB). */
export const MAX_PUSH_BYTES = 3_500_000;
export const MAX_ITEM_BYTES = 3_000_000;

/** What the backend is configured for (no secrets). Returned by GET /api/session. */
export interface ServerSetup {
  mode: "demo" | "server";
  database: boolean;
  auth: { secret: boolean; google: boolean; devLogin: boolean; allowedDomains: string[] };
  storage: { driver: string; ready: boolean };
  ai: { provider: string | null };
  missing: string[];
}
