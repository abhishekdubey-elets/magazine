import { describe, expect, it } from "vitest";
import { AnalysisError, analyzeReference } from "@/lib/reference/analyze";
import { fromText, importDocument, ImportError } from "@/lib/reference/content-import";
import { countWords, parseBody } from "@/lib/text-engine";

describe("reference upload validation", () => {
  it("rejects files that are not PDFs before any parsing", async () => {
    const file = new File([new TextEncoder().encode("This is not a PDF at all")], "notes.pdf", { type: "application/pdf" });
    await expect(analyzeReference(file, { maxPages: 24, onProgress: () => undefined })).rejects.toBeInstanceOf(AnalysisError);
    await expect(analyzeReference(file, { maxPages: 24, onProgress: () => undefined })).rejects.toThrow(/doesn.t look like a PDF/);
  });

  it("honours cancellation", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const file = new File([new TextEncoder().encode("%PDF-1.7\n%fake")], "ref.pdf", { type: "application/pdf" });
    await expect(analyzeReference(file, { maxPages: 24, onProgress: () => undefined, signal: ctrl.signal })).rejects.toThrow(/cancelled/);
  });
});

describe("content import", () => {
  const md = `# Telemedicine kiosks open in 40 blocks
A quiet revolution in primary care

The first forty kiosks went live on Monday, connecting village health workers to doctors in district hospitals.

## How it works

Patients book a slot with the ASHA worker, who starts the video consultation on a tablet.

Q: Who pays for the consultation?

A: The state does, under the existing primary-care budget, officials said.
`;

  it("keeps the source text intact: title, deck, paragraphs, sub-heads and Q&A markers", () => {
    const { article, info } = fromText(md, "kiosks.md", "sec-front");
    expect(article.title).toBe("Telemedicine kiosks open in 40 blocks");
    expect(article.subtitle).toBe("A quiet revolution in primary care");
    const paras = parseBody(article.body);
    expect(paras.map((p) => p.kind)).toEqual(["p", "h", "p", "q", "a"]);
    expect(paras[1].words.join(" ")).toBe("How it works");
    expect(countWords(article.body)).toBe(countWords(md.split("\n").slice(3).join("\n")));
    expect(article.body).toContain("officials said.");
    expect(article.status).toBe("draft");
    expect(article.author.name).toBe("");
    expect(info.needs).toContain("Author name and designation");
    expect(article.note).toMatch(/needs editorial preparation/);
    expect(article.imageIds).toEqual([]);
  });

  it("refuses unsupported and empty documents with an explanation", async () => {
    await expect(importDocument(new File([""], "story.docx"), "sec-front")).rejects.toBeInstanceOf(ImportError);
    await expect(importDocument(new File([""], "story.docx"), "sec-front")).rejects.toThrow(/Word documents are not supported/);
    await expect(importDocument(new File(["x".repeat(10)], "data.bin", { type: "application/octet-stream" }), "sec-front")).rejects.toThrow(/Unsupported file type/);
    expect(() => fromText("Only a title", "t.txt", "sec-front")).toThrow(/no readable text/);
  });
});
