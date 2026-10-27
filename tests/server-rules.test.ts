import { beforeAll, describe, expect, it } from "vitest";
import { can, ROLES, type Role, type SessionUser } from "@/lib/roles";

/**
 * Server-side rules with an in-memory PGlite database: role matrix, approval
 * stamps and re-review after edits, content fingerprints, workspace
 * isolation, and the print gates (including the issue-plan gate).
 */

process.env.DATABASE_URL = "pglite://memory";
process.env.AUTH_SECRET = "test-secret-0123456789abcdefghijklmnopqrstuvwxyz";
process.env.PRESSFLOW_ORG_ID = "elets";
process.env.STORAGE_DRIVER = "local";
process.env.STORAGE_DIR = "D:/tmp/pf-test-storage";

const user = (role: Role, id = `u-${role}`): SessionUser => ({ id, email: `${id}@elets.in`, name: id, role });

describe("roles", () => {
  it("only editors approve and release; only designers edit templates; viewers change nothing", () => {
    expect(can("editor", "approve-pages")).toBe(true);
    expect(can("designer", "approve-pages")).toBe(false);
    expect(can("contributor", "approve-articles")).toBe(false);
    expect(can("editor", "release-print")).toBe(true);
    expect(can("designer", "release-print")).toBe(false);
    expect(can("designer", "edit-templates")).toBe(true);
    expect(can("editor", "edit-templates")).toBe(false);
    for (const cap of ["edit-articles", "edit-pages", "edit-templates", "build-indesign", "manage-team"] as const) expect(can("viewer", cap)).toBe(false);
    expect(can("admin", "manage-team")).toBe(true);
    expect(ROLES).toHaveLength(5);
  });
});

describe("editorial rules", () => {
  let rules: typeof import("@/server/workspace/rules");
  beforeAll(async () => {
    rules = await import("@/server/workspace/rules");
  });

  it("stamps approvals on the server and sends edited approved pages back to review", () => {
    const page = { id: "p1", title: "A", status: "draft", contentOverrides: {}, frameOverrides: {}, imageOverrides: {}, templateId: "t", articleId: "a" };
    const forged = rules.review("pages", user("editor"), page, { ...page, status: "approved", approvedBy: "forged", approvedAt: "1999" });
    expect(forged.error).toBeUndefined();
    expect(forged.data.approvedBy).toBe("u-editor");
    expect(forged.data.approvedAt).not.toBe("1999");
    const byDesigner = rules.review("pages", user("designer"), page, { ...page, status: "approved" });
    expect(byDesigner.error).toMatch(/Only editors/);
    const approved = { ...page, ...forged.data };
    const edited = rules.review("pages", user("designer"), approved, { ...approved, contentOverrides: { title: "changed" } });
    expect(edited.data.status).toBe("in-review");
    expect(edited.data.reviewNote).toMatch(/needs approval again/);
    expect(edited.rewritten).toBe(true);
  });

  it("fingerprints content independently of key order and ignores workflow metadata", () => {
    const a = { id: "x", title: "T", body: "B", status: "draft", updatedAt: "1" };
    const b = { updatedAt: "2", status: "approved", body: "B", title: "T", id: "x" };
    expect(rules.contentHash("articles", a)).toBe(rules.contentHash("articles", b));
    expect(rules.contentHash("articles", { ...a, body: "C" })).not.toBe(rules.contentHash("articles", a));
    expect(rules.contentHash("pages", null)).toBeNull();
  });

  it("never lets the app set measured image fields", () => {
    const prev = { id: "img", width: 4000, height: 3000, original: { key: "k", sha256: "s" }, alt: "old" };
    const r = rules.review("uploads", user("contributor"), prev, { ...prev, width: 10, original: undefined, alt: "new" });
    expect(r.data.width).toBe(4000);
    expect(r.data.original).toEqual(prev.original);
    expect(r.data.alt).toBe("new");
  });
});

describe("workspace isolation and print gates (PGlite)", () => {
  let sync: typeof import("@/server/workspace/sync");
  let gates: typeof import("@/server/print/gates");
  let dbm: typeof import("@/server/db");

  beforeAll(async () => {
    dbm = await import("@/server/db");
    sync = await import("@/server/workspace/sync");
    gates = await import("@/server/print/gates");
    const now = new Date().toISOString();
    const admin = user("admin");
    await sync.seed(admin, {
      collections: {
        publications: [{ id: "pub-1", title: "T", pageIds: ["pg-1", "pg-2"], plan: { status: "draft", unresolved: ["Not enough pages"] } }],
        templates: [{ id: "tpl-1", name: "Feature", frames: [], updatedAt: now }],
        articles: [{ id: "art-1", title: "Story", body: "One paragraph.\n\nTwo.", status: "approved", author: { name: "R" }, pullQuotes: [], captions: [], imageIds: [], tags: [], createdAt: now, updatedAt: now }],
        pages: [
          { id: "pg-1", publicationId: "pub-1", number: 1, pageType: "article", title: "P1", templateId: "tpl-1", articleId: "art-1", status: "draft", contentOverrides: {}, imageOverrides: {}, frameOverrides: {}, updatedAt: now },
          { id: "pg-2", publicationId: "pub-1", number: 2, pageType: "article", title: "P2", templateId: "tpl-1", articleId: "art-1", status: "draft", contentOverrides: {}, imageOverrides: {}, frameOverrides: {}, updatedAt: now },
        ],
      },
      settings: { brand: {} },
    });
    // A row from another organisation must never be visible.
    const d = await dbm.db();
    await d.insert(dbm.schema.pages).values({ id: "pg-other", orgId: "other-org", data: { id: "pg-other", title: "Other org page" }, version: 1 });
  });

  it("keeps other organisations' rows out of the workspace", async () => {
    const snap = await sync.snapshot();
    expect(snap.collections.pages.map((r) => r.id).sort()).toEqual(["pg-1", "pg-2"]);
    const res = await sync.applyChanges(user("editor"), [{ col: "pages", id: "pg-other", base: 1, data: { id: "pg-other", title: "hijack" } }]);
    expect(res[0].ok).toBe(false);
    expect((res[0] as { reason: string }).reason).toBe("conflict"); // version 1 is unknown in this org
  });

  it("refuses a print build until pages are approved, the plan is approved and fonts exist; documents builds only warn", async () => {
    const manifest = {
      schema: "pressflow.indesign-manifest/2",
      document: { name: "t", widthPt: 581, heightPt: 788, bleedPt: 8.5, facingPages: true },
      fonts: [{ family: "Roboto", fontStyle: "Regular" }],
      paragraphStyles: {},
      pages: [
        { number: 1, side: "right", pageId: "pg-1", title: "P1", items: [{ type: "text", id: "t1", label: "Body", bounds: [0, 0, 100, 100], columns: 1, gutter: 0, inset: [0, 0, 0, 0] }] },
        { number: 2, side: "left", pageId: "pg-2", title: "P2", items: [] },
      ],
      stories: [],
      links: [],
    } as unknown as import("@/lib/indesign/manifest-types").InDesignManifestV2;
    const print = await gates.runGates(manifest, { kind: "print", pdfPreset: "[Press Quality]" });
    const by = Object.fromEntries(print.checks.map((c) => [c.id, c]));
    expect(print.ok).toBe(false);
    expect(by["plan-approved"].status).toBe("block");
    expect(by["pages-approved"].status).toBe("block");
    expect(by["no-blank-pages"].status).toBe("block");
    expect(by.fonts.status).toBe("block");
    expect(by.bleed.status).toBe("pass");
    expect(by["pdf-standard"].status).toBe("warn");
    const docs = await gates.runGates(manifest, { kind: "documents" });
    expect(docs.checks.filter((c) => c.status === "block").map((c) => c.id)).toEqual(["fonts"]); // no font library at all is always a block
    expect(docs.checks.find((c) => c.id === "pages-approved")!.status).toBe("warn");
  });

  it("passes the plan gate once an editor approved the plan and generation left no conflicts", async () => {
    const editor = user("editor");
    const snap = await sync.snapshot();
    const pub = snap.collections.publications[0];
    const res = await sync.applyChanges(editor, [{ col: "publications", id: "pub-1", base: pub.version, data: { ...(pub.data as object), plan: { status: "generated", approvedBy: "u-editor", unresolved: [] } } }]);
    expect(res[0].ok).toBe(true);
    const manifest = { schema: "pressflow.indesign-manifest/2", document: { name: "t", widthPt: 581, heightPt: 788, bleedPt: 8.5, facingPages: true }, fonts: [], paragraphStyles: {}, pages: [{ number: 1, side: "right", pageId: "pg-1", title: "P1", items: [{ type: "text", id: "t1", label: "Body", bounds: [0, 0, 100, 100], columns: 1, gutter: 0, inset: [0, 0, 0, 0] }] }], stories: [], links: [] } as unknown as import("@/lib/indesign/manifest-types").InDesignManifestV2;
    const r = await gates.runGates(manifest, { kind: "print" });
    expect(r.checks.find((c) => c.id === "plan-approved")!.status).toBe("pass");
  });

  it("invalidates an approval when the article changes after sign-off", async () => {
    const editor = user("editor");
    const writer = user("contributor");
    let snap = await sync.snapshot();
    const pg = snap.collections.pages.find((r) => r.id === "pg-1")!;
    const ap = await sync.applyChanges(editor, [{ col: "pages", id: "pg-1", base: pg.version, data: { ...(pg.data as object), status: "approved" } }]);
    expect(ap[0].ok).toBe(true);
    const art = snap.collections.articles[0];
    await sync.applyChanges(writer, [{ col: "articles", id: "art-1", base: art.version, data: { ...(art.data as object), body: "Rewritten after approval." } }]);
    snap = await sync.snapshot();
    const manifest = { schema: "pressflow.indesign-manifest/2", document: { name: "t", widthPt: 581, heightPt: 788, bleedPt: 8.5, facingPages: true }, fonts: [], paragraphStyles: {}, pages: [{ number: 1, side: "right", pageId: "pg-1", title: "P1", items: [{ type: "text", id: "t1", label: "Body", bounds: [0, 0, 100, 100], columns: 1, gutter: 0, inset: [0, 0, 0, 0] }] }], stories: [], links: [] } as unknown as import("@/lib/indesign/manifest-types").InDesignManifestV2;
    const r = await gates.runGates(manifest, { kind: "print" });
    const fresh = r.checks.find((c) => c.id === "approval-fresh")!;
    expect(fresh.status).toBe("block");
    expect(fresh.items?.[0]).toMatch(/article “Story” changed after approval/);
  });
});
