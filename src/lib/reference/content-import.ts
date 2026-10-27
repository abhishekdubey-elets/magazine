"use client";

import { classify } from "../ai";
import type { Article, ContentType } from "../types";

/**
 * Turns uploaded editorial documents into Content Library articles that still
 * need editorial preparation. Plain text and Markdown are parsed directly;
 * PDFs are read with pdf.js (text layer only). Nothing is summarised or
 * rewritten: the body is the document's text, the title its first line.
 * Word/.docx files are not supported (no extractor is bundled).
 */

export class ImportError extends Error {}

const MAX_BYTES = 25 * 1024 * 1024;

export interface ImportedContent {
  title: string;
  body: string;
  contentType: ContentType;
  confidence: number;
  source: string;
  /** What the importer could not determine — the editor fills these in. */
  needs: string[];
}

export async function importDocument(file: File, sectionId: string): Promise<{ article: Article; info: ImportedContent }> {
  if (file.size > MAX_BYTES) throw new ImportError(`${file.name} is larger than 25 MB.`);
  const name = file.name.toLowerCase();
  let text: string;
  if (/\.(txt|md|markdown)$/.test(name) || file.type.startsWith("text/")) text = await file.text();
  else if (/\.pdf$/.test(name) || file.type === "application/pdf") text = await pdfText(file);
  else if (/\.docx?$/.test(name)) throw new ImportError("Word documents are not supported yet — save the article as plain text (.txt) or Markdown (.md), or paste it into the content editor.");
  else throw new ImportError(`Unsupported file type: ${file.name}. Upload .txt, .md or a text PDF.`);
  return fromText(text, file.name, sectionId);
}

/** Markdown-ish text → article: first heading/line is the title, "## " sub-heads kept, Q:/A: kept. */
export function fromText(raw: string, source: string, sectionId: string): { article: Article; info: ImportedContent } {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  let title = "";
  let subtitle = "";
  const body: string[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) body.push(para.join(" ").replace(/\s+/g, " ").trim());
    para = [];
  };
  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      flush();
      continue;
    }
    if (!title && /^#\s+/.test(t)) {
      title = t.replace(/^#\s+/, "");
      continue;
    }
    if (!title) {
      title = t.replace(/^#+\s*/, "");
      continue;
    }
    if (!subtitle && !body.length && !para.length && /^(##?#?\s+|\*)/.test(t) === false && t.length < 160 && /[a-z]/.test(t) && !/[.!?]$/.test(t) && lines.indexOf(line) < 4) {
      subtitle = t;
      continue;
    }
    if (/^##\s+/.test(t)) {
      flush();
      body.push(`## ${t.replace(/^##\s+/, "")}`);
      continue;
    }
    if (/^(Q|A):\s/.test(t)) {
      flush();
      para.push(t);
      continue;
    }
    para.push(t);
  }
  flush();
  const bodyText = body.join("\n\n").trim();
  if (!title || !bodyText) throw new ImportError(`${source} has no readable text.`);
  const cls = classify({ title, body: bodyText, author: { name: "" } });
  const needs = ["Author name and designation", "Images and captions"];
  if (!subtitle) needs.push("Deck / subtitle");
  const id = `art-imp-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();
  const article: Article = {
    id,
    title: title.slice(0, 200),
    subtitle: subtitle || undefined,
    body: bodyText,
    contentType: cls.type,
    sectionId,
    author: { name: "" },
    pullQuotes: [],
    captions: [],
    imageIds: [],
    status: "draft",
    tags: [],
    createdAt: now,
    updatedAt: now,
    note: `Imported from ${source} — needs editorial preparation (${needs.join(", ").toLowerCase()}). Classified as ${cls.type} (${Math.round(cls.confidence * 100)}% confidence).`,
  };
  return { article, info: { title: article.title, body: bodyText, contentType: cls.type, confidence: cls.confidence, source, needs } };
}

async function pdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const data = new Uint8Array(await file.arrayBuffer());
  let doc;
  try {
    doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  } catch (e) {
    const name = (e as { name?: string })?.name;
    if (name === "PasswordException") throw new ImportError("This PDF is password-protected.");
    throw new ImportError("The PDF could not be opened.");
  }
  try {
    const out: string[] = [];
    for (let n = 1; n <= Math.min(doc.numPages, 40); n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      let line = "";
      let lastY: number | undefined;
      for (const it of content.items) {
        if (!("str" in it)) continue;
        const y = (it.transform as number[])[5];
        if (lastY !== undefined && Math.abs(y - lastY) > 2) {
          out.push(line.trim());
          line = "";
          if (Math.abs(y - lastY) > 18) out.push("");
        }
        line += it.str + (it.hasEOL ? "" : " ");
        lastY = y;
      }
      out.push(line.trim(), "");
      page.cleanup();
    }
    const text = out.join("\n");
    if (text.replace(/\s+/g, "").length < 40) throw new ImportError("The PDF has no text layer (scanned). OCR is not available — paste the text instead.");
    return text;
  } finally {
    void doc.destroy();
  }
}
