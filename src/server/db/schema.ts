import { sql } from "drizzle-orm";
import { bigserial, boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, type PgColumnBuilderBase } from "drizzle-orm/pg-core";

/**
 * PressFlow database schema (PostgreSQL).
 *
 * Workspace entities (publications, pages, articles…) store the full client
 * object in `data` plus the columns needed for queries, permissions and
 * optimistic concurrency (`version`). Deletes are soft so other editors'
 * sessions learn about them on their next pull.
 */

const now = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

function entity<N extends string, X extends Record<string, PgColumnBuilderBase> = Record<never, never>>(name: N, extra?: X) {
  return pgTable(
    name,
    {
      id: text("id").notNull(),
      orgId: text("org_id").notNull(),
      /** Insertion order (collections are shown in creation order or newest first). */
      seq: bigserial("seq", { mode: "number" }).notNull(),
      data: jsonb("data").notNull(),
      version: integer("version").notNull().default(1),
      deleted: boolean("deleted").notNull().default(false),
      updatedAt: now(),
      updatedBy: text("updated_by"),
      ...(extra ?? ({} as X)),
    },
    (t) => [primaryKey({ columns: [t.orgId, t.id] }), index(`${name}_org_updated_idx`).on(t.orgId, t.updatedAt)],
  );
}

export const orgs = pgTable("orgs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** Workspace settings (brand, typography, page grid, export, InDesign). */
  settings: jsonb("settings"),
  settingsVersion: integer("settings_version").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: now(),
});

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    email: text("email").notNull(),
    name: text("name"),
    picture: text("picture"),
    /** admin | editor | designer | contributor | viewer */
    role: text("role").notNull().default("contributor"),
    disabled: boolean("disabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

export const publications = entity("publications");
export const pages = entity("pages", { publicationId: text("publication_id") });
export const articles = entity("articles", { publicationId: text("publication_id"), status: text("status") });
export const templates = entity("templates");
export const assets = entity("assets");
export const exportJobs = entity("export_jobs", { publicationId: text("publication_id") });
export const activity = entity("activity");
export const qaRuns = entity("qa_runs");
export const referenceProfiles = entity("reference_profiles");

export const articleVersions = pgTable(
  "article_versions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orgId: text("org_id").notNull(),
    articleId: text("article_id").notNull(),
    version: integer("version").notNull(),
    data: jsonb("data").notNull(),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("article_versions_article_idx").on(t.articleId, t.version)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orgId: text("org_id").notNull(),
    userId: text("user_id"),
    userEmail: text("user_email"),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action").notNull(),
    summary: text("summary"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_org_at_idx").on(t.orgId, t.at)],
);

/** Adobe InDesign builds, their quality gates and print-release decisions. */
export const indesignJobs = pgTable(
  "indesign_jobs",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    publicationId: text("publication_id").notNull(),
    /** "print" = release candidate (gated); "documents" = working INDD/IDML build. */
    kind: text("kind").notNull(),
    adobeJobId: text("adobe_job_id"),
    jobKey: text("job_key").notNull(),
    /** queued | running | succeeded | partial_success | failed */
    status: text("status").notNull().default("queued"),
    /** none | pending | released | rejected */
    releaseStatus: text("release_status").notNull().default("none"),
    pages: jsonb("pages").notNull(),
    gates: jsonb("gates"),
    report: jsonb("report"),
    outputs: jsonb("outputs"),
    error: text("error"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    releasedBy: text("released_by"),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    releaseNote: text("release_note"),
  },
  (t) => [index("indesign_jobs_pub_idx").on(t.publicationId, t.createdAt), index("indesign_jobs_status_idx").on(t.status)],
);

export const aiSuggestions = pgTable(
  "ai_suggestions",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    articleId: text("article_id").notNull(),
    action: text("action").notNull(),
    provider: text("provider").notNull(),
    model: text("model"),
    output: jsonb("output").notNull(),
    /** proposed | accepted | rejected */
    status: text("status").notNull().default("proposed"),
    usage: jsonb("usage"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    decidedBy: text("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [index("ai_article_idx").on(t.articleId, t.createdAt)],
);

/** Parsed names of the licensed font files in storage (what InDesign will see). */
export const fontFiles = pgTable("font_files", {
  key: text("key").primaryKey(),
  orgId: text("org_id").notNull(),
  etag: text("etag"),
  size: integer("size"),
  faces: jsonb("faces").notNull().default(sql`'[]'::jsonb`),
  error: text("error"),
  parsedAt: timestamp("parsed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ENTITY_TABLES = {
  publications,
  pages,
  articles,
  templates,
  assets,
  exportJobs,
  activity,
  qaRuns,
  referenceProfiles,
} as const;

export type EntityName = keyof typeof ENTITY_TABLES;
