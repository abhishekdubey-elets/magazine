import { afterEach, describe, expect, it } from "vitest";
import { sampleArticles } from "@/data/articles";

/** Provider order (OpenAI first, Anthropic fallback, rules otherwise) and OpenAI structured-output parsing with a mocked fetch. */
const env = { ...process.env };
afterEach(() => {
  for (const k of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "AI_PROVIDER"]) {
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
});

describe("editorial AI providers", () => {
  it("tries OpenAI first, then Anthropic, and pins a provider on request", async () => {
    const { providerOrder } = await import("@/server/ai/editorial");
    expect(providerOrder({})).toEqual([]);
    expect(providerOrder({ ANTHROPIC_API_KEY: "a" })).toEqual(["anthropic"]);
    expect(providerOrder({ OPENAI_API_KEY: "o" })).toEqual(["openai"]);
    expect(providerOrder({ OPENAI_API_KEY: "o", ANTHROPIC_API_KEY: "a" })).toEqual(["openai", "anthropic"]);
    expect(providerOrder({ OPENAI_API_KEY: "o", ANTHROPIC_API_KEY: "a", AI_PROVIDER: "anthropic" })).toEqual(["anthropic"]);
    expect(providerOrder({ ANTHROPIC_API_KEY: "a", AI_PROVIDER: "openai" })).toEqual([]);
  });

  it("falls back to the built-in rules without any key", async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const { runEditorialAi } = await import("@/server/ai/editorial");
    const r = await runEditorialAi("quotes", sampleArticles[1]);
    expect(r.provider).toBe("heuristic");
    expect(Array.isArray((r.output as { quotes: string[] }).quotes)).toBe(true);
  });

  it("sends a strict JSON schema to OpenAI and validates the answer", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const { askOpenAI } = await import("@/server/ai/editorial");
    const article = sampleArticles[1];
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      calls.push({ url: String(url), body });
      return new Response(JSON.stringify({ model: "gpt-4o-2024-08-06", choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ summary: "A short standfirst about the article." }) } }], usage: { prompt_tokens: 900, completion_tokens: 20 } }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const r = await askOpenAI("summary", article, fetchFn);
    expect(calls[0].url).toBe("https://api.openai.com/v1/chat/completions");
    const fmt = calls[0].body.response_format as { type: string; json_schema: { strict: boolean; schema: { additionalProperties: boolean; required: string[] } } };
    expect(fmt.type).toBe("json_schema");
    expect(fmt.json_schema.strict).toBe(true);
    expect(fmt.json_schema.schema.additionalProperties).toBe(false);
    expect(fmt.json_schema.schema.required).toEqual(["summary"]);
    expect((calls[0].body.messages as { content: string }[])[1].content).toContain(article.body.slice(0, 40));
    expect(r.parsed).toEqual({ summary: "A short standfirst about the article." });
    expect(r.model).toBe("gpt-4o-2024-08-06");
    expect(r.usage).toEqual({ input_tokens: 900, output_tokens: 20 });

    // Malformed or refused answers are errors, never silently accepted.
    const bad = (async () => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "{\"nope\": 1}" } }] }), { status: 200 })) as typeof fetch;
    await expect(askOpenAI("summary", article, bad)).rejects.toThrow(/did not match/);
    const refused = (async () => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { refusal: "no" } }] }), { status: 200 })) as typeof fetch;
    await expect(askOpenAI("summary", article, refused)).rejects.toThrow(/declined/);
    const http = (async () => new Response(JSON.stringify({ error: { message: "Incorrect API key" } }), { status: 401 })) as typeof fetch;
    await expect(askOpenAI("summary", article, http)).rejects.toThrow(/OpenAI: Incorrect API key/);
  });
});
