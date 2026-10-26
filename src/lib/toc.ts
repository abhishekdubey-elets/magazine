import { ink } from "./design-tokens";
import type { LayoutContext } from "./layout-engine";

/** Contents entries derived from the page plan (shared by the page renderer and InDesign export). */
export interface TocEntry {
  number: number;
  title: string;
  section: string;
  color: string;
  name?: string;
  role?: string;
  imageId?: string;
  type: string;
}

export function tocEntries(ctx: LayoutContext): TocEntry[] {
  const seen = new Set<string>();
  const out: TocEntry[] = [];
  for (const p of [...ctx.pages].sort((a, b) => a.number - b.number)) {
    if (!p.articleId || seen.has(p.articleId) || p.publicationId !== ctx.publication.id) continue;
    if (["cover", "contents", "advertisement", "closing", "editors-note"].includes(p.pageType)) continue;
    const a = ctx.articles[p.articleId];
    if (!a) continue;
    seen.add(p.articleId);
    const sec = ctx.publication.sections.find((s) => s.id === (p.sectionId ?? a.sectionId));
    out.push({
      number: p.number,
      title: a.title === "Message" ? `Message — ${a.author.name}` : a.title,
      section: sec?.name ?? "",
      color: sec?.color ?? ink.blue,
      name: a.author.name,
      role: [a.author.designation, a.author.organisation].filter(Boolean).join(", "),
      imageId: a.imageIds[0],
      type: a.contentType,
    });
  }
  return out;
}

