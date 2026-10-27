"use client";

import { flushSync } from "@/lib/sync/engine";

export type ServerAiAction = "classify" | "summary" | "quotes" | "headlines";

export interface ServerAiResult {
  id: string;
  provider: "anthropic" | "heuristic";
  model: string | null;
  output: unknown;
  rejected: string[];
}

/** Server mode: ask the editorial AI for a proposal (stored with the article on the server). */
export async function proposeOnServer(action: ServerAiAction, articleId: string): Promise<ServerAiResult> {
  await flushSync();
  const res = await fetch("/api/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, articleId }) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `AI request failed (${res.status})`);
  return body as ServerAiResult;
}

/** Record the person's decision on a proposal (audit trail). Best effort. */
export function decideOnServer(id: string | undefined, decision: "accepted" | "rejected", detail?: string) {
  if (!id) return;
  void fetch(`/api/ai/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision, detail }) }).catch(() => {});
}
