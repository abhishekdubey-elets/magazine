"use client";

import { Check, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { useState } from "react";
import { CONTENT_TYPE_LABELS, classify, pullQuotes, suggestHeadlines, summarize, type Classification } from "@/lib/ai";
import { isServerMode } from "@/lib/sync/engine";
import { countWords } from "@/lib/text-engine";
import type { Article, ContentType } from "@/lib/types";
import { decideOnServer, proposeOnServer, type ServerAiAction } from "@/services/ai";
import { toast } from "../shell/toast";
import { Badge, Button, cn, Textarea } from "../ui";

type Action = ServerAiAction;

interface Proposal {
  action: Action;
  provider: "openai" | "anthropic" | "heuristic";
  model: string | null;
  /** Server-stored proposal id (server mode), for the accept/reject record. */
  id?: string;
  classify?: Classification;
  summary?: string;
  quotes?: string[];
  headlines?: { text: string; style: string }[];
  rejected?: string[];
}

const LABEL: Record<Action, string> = { classify: "Classify", summary: "Summary / standfirst", quotes: "Pull quotes", headlines: "Headlines" };
const MIN_WORDS = 40;

/**
 * Optional AI assistant inside the content editor. Proposals never change the
 * article until the editor applies them (and even then only the draft in the
 * dialog, until it is saved). In server mode a saved article is sent to the
 * configured provider (OpenAI by default, Anthropic as fallback) and every
 * decision is recorded; otherwise the built-in rules answer, labelled as such.
 */
export function AiAssist({ draft, saved, onApply }: { draft: Article; saved: boolean; onApply: (patch: Partial<Article>, what: string) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Action | null>(null);
  const [proposals, setProposals] = useState<Partial<Record<Action, Proposal>>>({});
  const [summaryDraft, setSummaryDraft] = useState("");
  const [quoteSel, setQuoteSel] = useState<Set<number>>(new Set());
  const words = countWords(draft.body);
  const server = isServerMode() && saved;
  const tooShort = words < MIN_WORDS;

  const run = async (action: Action) => {
    setBusy(action);
    try {
      let p: Proposal;
      if (server) {
        const r = await proposeOnServer(action, draft.id);
        const o = r.output as Record<string, unknown>;
        p = { action, provider: r.provider, model: r.model, id: r.id, rejected: r.rejected };
        if (action === "classify") p.classify = o as unknown as Classification;
        if (action === "summary") p.summary = String(o.summary ?? "");
        if (action === "quotes") p.quotes = (o.quotes as string[]) ?? [];
        if (action === "headlines") p.headlines = (o.headlines as { text: string; style: string }[]) ?? [];
        if (r.rejected.length) toast("info", `${r.rejected.length} suggestion${r.rejected.length > 1 ? "s" : ""} dropped`, r.rejected[0]);
      } else {
        p = { action, provider: "heuristic", model: null };
        if (action === "classify") p.classify = classify(draft);
        if (action === "summary") p.summary = summarize(draft);
        if (action === "quotes") p.quotes = pullQuotes(draft);
        if (action === "headlines") p.headlines = suggestHeadlines(draft);
      }
      if (p.summary !== undefined) setSummaryDraft(p.summary);
      if (p.quotes) setQuoteSel(new Set(p.quotes.map((_, i) => i)));
      setProposals((x) => ({ ...x, [action]: p }));
    } catch (e) {
      toast("error", "AI suggestion failed", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const dismiss = (action: Action) => {
    decideOnServer(proposals[action]?.id, "rejected");
    setProposals((x) => ({ ...x, [action]: undefined }));
  };
  const accept = (action: Action, patch: Partial<Article>, what: string) => {
    decideOnServer(proposals[action]?.id, "accepted", what);
    onApply(patch, what);
    setProposals((x) => ({ ...x, [action]: undefined }));
  };
  const source = (p: Proposal) => (p.provider === "heuristic" ? "Rule-based suggestion" : `${p.provider === "openai" ? "OpenAI" : "Claude"}${p.model ? ` · ${p.model}` : ""}`);

  return (
    <div className="col-span-6 rounded-lg border border-[#ddd6f8] bg-ai-50/40">
      <button type="button" className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[12.5px] font-semibold text-ink" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Sparkles className="size-4 text-ai" /> AI assistant <span className="font-normal text-muted">(optional)</span>
        <span className="ml-auto text-[11.5px] font-normal text-muted">{server ? "OpenAI / Claude via the server" : isServerMode() ? "Save first for the server AI; rules meanwhile" : "Rule-based in demo mode"}</span>
        {open ? <ChevronUp className="size-4 text-muted" /> : <ChevronDown className="size-4 text-muted" />}
      </button>
      {open && (
        <div className="space-y-3 border-t border-[#ddd6f8] px-3 py-3">
          <p className="text-[12px] text-ink-2">Suggestions are proposals: nothing changes until you apply it here and save. Pull quotes must be the article&apos;s own words. {tooShort ? `Add at least ${MIN_WORDS} words of article text to use them.` : ""}</p>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(LABEL) as Action[]).map((action) => (
              <Button key={action} size="sm" variant="ai" disabled={tooShort || !!busy} loading={busy === action} onClick={() => void run(action)}>
                {busy !== action && <Sparkles />} {LABEL[action]}
              </Button>
            ))}
          </div>

          {proposals.classify?.classify && (
            <Proposal title="Suggested type" source={source(proposals.classify)} onReject={() => dismiss("classify")}>
              <p className="text-[13px] text-ink">
                {CONTENT_TYPE_LABELS[proposals.classify.classify.type as ContentType]} <span className="text-muted">· {Math.round(proposals.classify.classify.confidence * 100)}% confidence</span>
              </p>
              <ul className="mt-1 text-[11.5px] text-muted">
                {proposals.classify.classify.reasons.slice(0, 3).map((r) => (
                  <li key={r}>• {r}</li>
                ))}
              </ul>
              <Button size="sm" variant="ai" className="mt-2" disabled={proposals.classify.classify.type === draft.contentType} onClick={() => accept("classify", { contentType: proposals.classify!.classify!.type as ContentType }, "Classification")}>
                <Check /> Apply type
              </Button>
            </Proposal>
          )}

          {proposals.summary && (
            <Proposal title="Proposed summary" source={source(proposals.summary)} onReject={() => dismiss("summary")}>
              <Textarea rows={3} value={summaryDraft} onChange={(e) => setSummaryDraft(e.target.value)} className="text-[12.5px]" aria-label="Proposed summary" />
              <p className="mt-1 text-[11px] text-muted">{countWords(summaryDraft)} words · edit before applying</p>
              <Button size="sm" variant="ai" className="mt-2" disabled={!summaryDraft.trim()} onClick={() => accept("summary", { summary: summaryDraft.trim() }, "Summary")}>
                <Check /> Use as summary
              </Button>
            </Proposal>
          )}

          {proposals.quotes?.quotes && (
            <Proposal title="Pull quote candidates" source={source(proposals.quotes)} onReject={() => dismiss("quotes")}>
              {proposals.quotes.quotes.length === 0 && <p className="text-[12px] text-muted">No quotable sentence found.</p>}
              <ul className="space-y-1.5">
                {proposals.quotes.quotes.map((q, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12.5px] text-ink">
                    <input type="checkbox" className="mt-1" checked={quoteSel.has(i)} onChange={() => setQuoteSel((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })} aria-label={`Select quote ${i + 1}`} />
                    <span>“{q}”</span>
                  </li>
                ))}
              </ul>
              <Button size="sm" variant="ai" className="mt-2" disabled={!quoteSel.size} onClick={() => accept("quotes", { pullQuotes: [...draft.pullQuotes, ...proposals.quotes!.quotes!.filter((_, i) => quoteSel.has(i))].slice(0, 4) }, `${quoteSel.size} pull quote${quoteSel.size > 1 ? "s" : ""}`)}>
                <Check /> Add selected
              </Button>
            </Proposal>
          )}

          {proposals.headlines?.headlines && (
            <Proposal title="Headline alternatives" source={source(proposals.headlines)} onReject={() => dismiss("headlines")}>
              <ul className="space-y-1.5">
                {proposals.headlines.headlines.map((h, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2 text-[12.5px]">
                    <Badge tone="ai">{h.style}</Badge>
                    <span className="min-w-0 flex-1 text-ink">{h.text}</span>
                    <button type="button" className="text-[11.5px] font-medium text-ai hover:underline" onClick={() => accept("headlines", { title: h.text }, "Headline")}>
                      Use as title
                    </button>
                    <button type="button" className="text-[11.5px] font-medium text-ai hover:underline" onClick={() => accept("headlines", { subtitle: h.text }, "Deck")}>
                      Use as deck
                    </button>
                  </li>
                ))}
              </ul>
            </Proposal>
          )}
        </div>
      )}
    </div>
  );
}

function Proposal({ title, source, onReject, children }: { title: string; source: string; onReject: () => void; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-md border border-line bg-white p-3")}>
      <div className="mb-1.5 flex items-center gap-2">
        <p className="text-[12.5px] font-semibold text-ink">{title}</p>
        <span className="text-[11px] text-muted">{source}</span>
        <button type="button" className="ml-auto text-[11.5px] text-muted hover:text-ink" onClick={onReject}>
          Dismiss
        </button>
      </div>
      {children}
    </div>
  );
}
