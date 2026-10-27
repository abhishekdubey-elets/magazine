import "server-only";
import { and, eq } from "drizzle-orm";
import * as fontkit from "fontkit";
import { env } from "../config";
import { db, schema } from "../db";
import { getBytes, list } from "../storage";

/**
 * The licensed font library InDesign receives with every job (storage
 * `fonts/`). Each file is parsed once (cached by ETag) so print builds can
 * prove, before spending a job, that every family + style the layout uses is
 * really there — InDesign would otherwise silently substitute a default font.
 */

export interface FontFace {
  family: string;
  style: string;
  postscriptName?: string;
  fullName?: string;
  variable?: boolean;
}

export interface FontFile {
  key: string;
  name: string;
  size: number;
  faces: FontFace[];
  error?: string | null;
}

export const FONT_FILE = /\.(otf|ttf|ttc|otc)$/i;

type FkFont = fontkit.Font & { fvar?: { instance?: { nameID: number; name?: Record<string, string> }[] } };

/** Named instances of a variable font (fontkit's `namedVariations` throws on some fonts). */
function instances(font: FkFont): string[] {
  const out: string[] = [];
  for (const i of font.fvar?.instance ?? []) {
    const n = i.name?.en ?? (i.name ? Object.values(i.name)[0] : undefined) ?? (i.nameID === 2 ? font.subfamilyName : undefined);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

function facesOf(font: FkFont): FontFace[] {
  const name = (k: string) => {
    try {
      return font.getName(k, "en") ?? null;
    } catch {
      return null;
    }
  };
  const out: FontFace[] = [];
  const base = { postscriptName: font.postscriptName, fullName: font.fullName };
  // Typographic (preferred) names are what InDesign shows for OpenType families; keep the legacy names too.
  const family = name("preferredFamily") ?? font.familyName;
  const style = name("preferredSubfamily") ?? font.subfamilyName;
  out.push({ family, style, ...base });
  if (font.familyName !== family || font.subfamilyName !== style) out.push({ family: font.familyName, style: font.subfamilyName, ...base });
  for (const instance of instances(font)) out.push({ family, style: instance, variable: true, postscriptName: font.postscriptName });
  return out;
}

export function parseFont(bytes: Uint8Array): FontFace[] {
  const f = fontkit.create(Buffer.from(bytes)) as FkFont | fontkit.FontCollection;
  const fonts = "fonts" in f ? (f.fonts as FkFont[]) : [f as FkFont];
  return fonts.flatMap(facesOf);
}

/** All font files with their faces (parsing new or changed files). */
export async function fontLibrary(): Promise<FontFile[]> {
  const d = await db();
  const files = (await list("fonts/")).filter((f) => FONT_FILE.test(f.key));
  const cached = await d.select().from(schema.fontFiles).where(eq(schema.fontFiles.orgId, env.orgId));
  const byKey = new Map(cached.map((c) => [c.key, c]));
  const out: FontFile[] = [];
  for (const f of files) {
    const c = byKey.get(f.key);
    const name = f.key.split("/").pop() ?? f.key;
    if (c && c.etag === f.etag) {
      out.push({ key: f.key, name, size: f.size, faces: c.faces as FontFace[], error: c.error });
      continue;
    }
    let faces: FontFace[] = [];
    let error: string | null = null;
    try {
      const bytes = await getBytes(f.key);
      if (!bytes) throw new Error("File could not be read.");
      faces = parseFont(bytes);
      if (!faces.length) throw new Error("No fonts found in the file.");
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    const row = { key: f.key, orgId: env.orgId, etag: f.etag, size: f.size, faces, error, parsedAt: new Date() };
    await d.insert(schema.fontFiles).values(row).onConflictDoUpdate({ target: schema.fontFiles.key, set: row });
    out.push({ key: f.key, name, size: f.size, faces, error });
  }
  // Forget files that were removed from storage.
  for (const c of cached) if (!files.some((f) => f.key === c.key)) await d.delete(schema.fontFiles).where(and(eq(schema.fontFiles.key, c.key), eq(schema.fontFiles.orgId, env.orgId)));
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, "");

/** Which requested family/style pairs have no matching licensed face. */
export function missingFaces(requested: { family: string; fontStyle: string }[], library: FontFile[]): string[] {
  const have = new Set<string>();
  for (const f of library) {
    for (const face of f.faces) {
      have.add(`${norm(face.family)}|${norm(face.style)}`);
      // "Regular" is often omitted in full names, so accept "Family" alone for Regular.
      if (face.fullName) have.add(`full|${norm(face.fullName)}`);
    }
  }
  return requested
    .filter((r) => !have.has(`${norm(r.family)}|${norm(r.fontStyle)}`) && !have.has(`full|${norm(`${r.family} ${r.fontStyle}`)}`))
    .map((r) => `${r.family} ${r.fontStyle}`);
}
