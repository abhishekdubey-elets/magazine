#!/usr/bin/env node
/**
 * Minimal stand-in for the OpenAI chat-completions endpoint, for exercising
 * the AI recognition pass without a key or network. It reads the page numbers
 * and block lists from the request and answers with a plausible, schema-valid
 * recognition: the first display-sized block is the headline, a following
 * mid-size block the deck, the largest-numbered page becomes an "interview"
 * so the disagreement path is visible.
 *
 *   node scripts/openai-mock.mjs 3999
 *   OPENAI_API_KEY=test OPENAI_BASE_URL=http://localhost:3999/v1 npx next dev
 */
import http from "node:http";

const port = Number(process.argv[2] ?? 3999);

http
  .createServer((req, res) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      if (!req.url.endsWith("/chat/completions")) {
        res.writeHead(404).end();
        return;
      }
      const body = JSON.parse(data || "{}");
      const user = body.messages?.find((m) => m.role === "user");
      const texts = (user?.content ?? []).filter((c) => c.type === "text").map((c) => c.text);
      const images = (user?.content ?? []).filter((c) => c.type === "image_url").length;
      const pages = [];
      for (const t of texts) {
        const m = /^Page (\d+)\. Rules guessed: ([a-z-]+)/.exec(t);
        if (!m) continue;
        const number = Number(m[1]);
        const rules = m[2];
        const blocks = [...t.matchAll(/^(\d+): ".*?" ([\d.]+)pt/gm)].map((b) => ({ i: Number(b[1]), size: Number(b[2]) }));
        const big = blocks.filter((b) => b.size >= 18).sort((a, b) => b.size - a.size);
        const roles = [];
        if (big[0]) roles.push({ i: big[0].i, role: "headline" });
        const deck = blocks.find((b) => b.size > 10 && b.size < 18 && b.i !== big[0]?.i);
        if (deck) roles.push({ i: deck.i, role: "deck" });
        const cap = blocks.find((b) => b.size < 8.5);
        if (cap) roles.push({ i: cap.i, role: "caption" });
        const last = Math.max(...texts.map((x) => Number(/^Page (\d+)/.exec(x)?.[1] ?? 0)));
        const flip = number === last && rules === "article";
        pages.push({ number, type: flip ? "interview" : rules, confidence: flip ? 0.82 : 0.9, section: number % 2 ? "Digital Governance" : "", reasons: [flip ? "Question-and-answer rhythm in the columns" : "Layout matches the rules' reading", `${images} page images received in this batch`], blocks: roles });
      }
      const payload = { model: "gpt-4o-mock", choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ pages }) } }], usage: { prompt_tokens: 1000 + images * 85, completion_tokens: 40 * pages.length } };
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(payload));
      console.log(`answered ${pages.length} pages (${images} images)`);
    });
  })
  .listen(port, () => console.log(`OpenAI mock listening on http://localhost:${port}/v1`));
