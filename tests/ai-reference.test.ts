import { afterEach, describe, expect, it } from "vitest";
import { AI_ADOPT_CONFIDENCE, batchRequests, buildRecognitionRequest, mergeRecognition, rebuildSections, type RecognitionResult } from "@/lib/reference/recognize";
import { makeProfile } from "./helpers/fixtures";

/**
 * AI recognition pass: the request carries measured blocks and page images,
 * answers are merged as labelled second opinions (adopted only when
 * confident), editors' corrections survive, and measurements never change.
 */
const env = { ...process.env };
afterEach(() => {
  for (const k of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "AI_PROVIDER"]) {
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
});

const jpeg = (n: number) => `data:image/jpeg;base64,${Buffer.from(`page-${n}`).toString("base64")}`;

describe("recognition request", () => {
  it("sends measured blocks (as % of the trim) with the rules' guess, in batches", () => {
    const profile = makeProfile();
    const images = Object.fromEntries(profile.pages.map((p) => [p.number, jpeg(p.number)]));
    const req = buildRecognitionRequest(profile, images);
    expect(req.pages.length).toBe(profile.pages.length);
    const p = req.pages.find((x) => x.blocks.length > 0)!;
    expect(p.rules.type).toBe(profile.pages.find((x) => x.number === p.number)!.detectedType);
    for (const b of p.blocks) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x).toBeLessThanOrEqual(100);
      expect(b.text.length).toBeLessThanOrEqual(90);
    }
    const batches = batchRequests(req, 4);
    expect(batches.flatMap((b) => b.pages.map((x) => x.number))).toEqual(req.pages.map((x) => x.number));
    expect(Math.max(...batches.map((b) => b.pages.length))).toBeLessThanOrEqual(4);
    // Pages without an image are skipped rather than sent empty.
    expect(buildRecognitionRequest(profile, {}).pages).toEqual([]);
  });
});

describe("merging AI answers", () => {
  it("adopts confident types, keeps the rules' type below the threshold, flags disagreements and labels block roles", () => {
    const profile = makeProfile();
    const [a, b, c] = profile.pages.filter((p) => p.blocks.length > 0);
    const other = (t: string) => (t === "article" ? "interview" : "article");
    const result: RecognitionResult = {
      provider: "openai",
      model: "gpt-4o-2024-08-06",
      usage: { input_tokens: 1200, output_tokens: 300 },
      pages: [
        { number: a.number, type: other(a.detectedType) as never, confidence: 0.9, section: "Digital Governance", reasons: ["Q&A layout", "Portrait with name"], blocks: [{ i: 0, role: "headline" }, { i: 1, role: "deck" }] },
        { number: b.number, type: other(b.detectedType) as never, confidence: AI_ADOPT_CONFIDENCE - 0.1, section: "", reasons: ["Unsure"], blocks: [] },
        { number: c.number, type: c.detectedType, confidence: 0.8, section: "", reasons: ["Agrees"], blocks: [{ i: 0, role: "caption" }] },
      ],
    };
    const merged = mergeRecognition(profile, [result], "2026-10-27T10:00:00.000Z");

    const ma = merged.pages.find((p) => p.number === a.number)!;
    expect(ma.type).toBe(other(a.detectedType));
    expect(ma.detectedType).toBe(a.detectedType); // the rules' answer is kept for the record
    expect(ma.ai).toMatchObject({ disagrees: true, adopted: true, confidence: 0.9, section: "Digital Governance" });
    expect(ma.blocks[0].role).toBe("headline");
    expect(ma.blocks[1].role).toBe("deck");
    expect(ma.runningHead).toBe(a.runningHead ?? "Digital Governance");

    const mb = merged.pages.find((p) => p.number === b.number)!;
    expect(mb.type).toBe(b.detectedType);
    expect(mb.ai?.adopted).toBe(false);
    expect(mb.ai?.disagrees).toBe(true);

    const mc = merged.pages.find((p) => p.number === c.number)!;
    expect(mc.ai?.disagrees).toBe(false);
    expect(mc.blocks[0].role).toBe("caption");

    expect(merged.ai).toMatchObject({ provider: "openai", model: "gpt-4o-2024-08-06", pages: 3, disagreements: [a.number, b.number].sort((x, y) => x - y), usage: { input_tokens: 1200, output_tokens: 300 } });

    // Measurements are untouched.
    expect(merged.trim).toEqual(profile.trim);
    expect(merged.margins).toEqual(profile.margins);
    expect(merged.body).toEqual(profile.body);
    for (const p of merged.pages) {
      const o = profile.pages.find((x) => x.number === p.number)!;
      const strip = (bs: typeof p.blocks) => bs.map((b) => ({ ...b, role: undefined }));
      expect(strip(p.blocks)).toEqual(strip(o.blocks));
      expect(p.images).toEqual(o.images);
    }
    // Sections include AI-read names where no running head was measured.
    expect(rebuildSections(merged.pages).some((s) => s.pages.includes(a.number))).toBe(true);
  });

  it("never overrides a page type an editor corrected by hand", () => {
    const profile = makeProfile();
    const target = profile.pages.find((p) => p.blocks.length > 0)!;
    const edited = { ...profile, pages: profile.pages.map((p) => (p.number === target.number ? { ...p, type: "other" as const } : p)) };
    const merged = mergeRecognition(edited, [{ provider: "openai", model: "m", pages: [{ number: target.number, type: "interview", confidence: 0.99, section: "", reasons: [], blocks: [] }] }]);
    const m = merged.pages.find((p) => p.number === target.number)!;
    expect(m.type).toBe("other");
    expect(m.ai?.adopted).toBe(false);
    expect(m.ai?.type).toBe("interview");
  });
});

describe("server recognition (OpenAI vision, mocked)", () => {
  it("sends page images and blocks with a strict schema and validates the answer", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    delete process.env.ANTHROPIC_API_KEY;
    const { askOpenAIVision, recognizeReference, validateRequest } = await import("@/server/ai/reference");
    const profile = makeProfile();
    const images = Object.fromEntries(profile.pages.map((p) => [p.number, jpeg(p.number)]));
    const req = batchRequests(buildRecognitionRequest(profile, images), 3)[0];
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const answer = { pages: req.pages.map((p) => ({ number: p.number, type: "article", confidence: 0.7, section: "", reasons: ["Columns of text"], blocks: p.blocks.length ? [{ i: 0, role: "headline" }] : [] })) };
    const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      calls.push({ url: String(url), body });
      return new Response(JSON.stringify({ model: "gpt-4o-2024-08-06", choices: [{ finish_reason: "stop", message: { content: JSON.stringify(answer) } }], usage: { prompt_tokens: 2000, completion_tokens: 150 } }), { status: 200 });
    }) as typeof fetch;

    const raw = await askOpenAIVision(req, fetchFn);
    expect(calls[0].url).toBe("https://api.openai.com/v1/chat/completions");
    const fmt = calls[0].body.response_format as { type: string; json_schema: { strict: boolean; schema: { required: string[] } } };
    expect(fmt.json_schema.strict).toBe(true);
    expect(fmt.json_schema.schema.required).toEqual(["pages"]);
    const user = (calls[0].body.messages as { role: string; content: { type: string; image_url?: { url: string } }[] }[])[1];
    expect(user.content.filter((c) => c.type === "image_url").length).toBe(req.pages.length);
    expect(user.content.filter((c) => c.type === "image_url").map((c) => c.image_url!.url)).toEqual(req.pages.map((p) => p.image));
    expect(raw.parsed.pages.length).toBe(req.pages.length);

    const result = await recognizeReference(req, fetchFn);
    expect(result.provider).toBe("openai");
    expect(result.pages.map((p) => p.number)).toEqual(req.pages.map((p) => p.number));
    expect(result.usage).toEqual({ input_tokens: 2000, output_tokens: 150 });

    // Shape errors and refusals never become results.
    const bad = (async () => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "{\"pages\": [{\"number\": 1}]}" } }] }), { status: 200 })) as typeof fetch;
    await expect(askOpenAIVision(req, bad)).rejects.toThrow(/did not match/);

    // Request validation: caps and shapes.
    expect(() => validateRequest({ pages: [] })).toThrow(/No pages/);
    expect(() => validateRequest({ ...req, pages: [{ ...req.pages[0], image: "data:image/png;base64,xx" }] })).toThrow(/JPEG/);
    expect(validateRequest(req).pages.length).toBe(req.pages.length);
  });

  it("refuses without a provider key", async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const { recognizeReference } = await import("@/server/ai/reference");
    await expect(recognizeReference({ title: "x", pageCount: 1, bodySize: 9, pages: [] })).rejects.toThrow(/No AI provider/);
  });
});
