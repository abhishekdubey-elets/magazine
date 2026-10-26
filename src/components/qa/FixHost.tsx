"use client";

import { Sparkles, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { create } from "zustand";
import { proposeTrim, suggestCaption, type TrimProposal } from "@/lib/ai";
import { storyBody, storyPages } from "@/lib/layout-engine";
import { routes } from "@/lib/nav";
import { useStore } from "@/lib/store";
import type { QAFix, QAIssue } from "@/lib/types";
import { ImagePicker } from "../common";
import { toast } from "../shell/toast";
import { Button, Field, Input, Modal, SimLabel, Textarea } from "../ui";

interface Pending {
  issue: QAIssue;
  fix: QAFix;
}

const useFix = create<{ pending: Pending | null }>(() => ({ pending: null }));

export const FIX_LABELS: Record<QAFix["type"], string> = {
  "assign-image": "Place image",
  "add-designation": "Add designation",
  "add-author": "Add author",
  "add-caption": "Add caption",
  "switch-template": "Switch template",
  "suggest-trim": "Review suggested trim",
  "add-continuation": "Add continuation page",
  "reset-style": "Reset to house style",
  "reset-geometry": "Snap back to template",
  "approve-page": "Approve page",
  "generate-layout": "Generate layout",
  "fill-frame": "Fill frame",
};

/** Execute a QA fix: simple ones apply immediately, others open a dialog. */
export function useRunFix() {
  const router = useRouter();
  return (issue: QAIssue, fix: QAFix) => {
    const s = useStore.getState();
    const page = s.pages.find((p) => p.id === issue.pageId);
    if (!page) return;
    switch (fix.type) {
      case "switch-template": {
        s.applyTemplate(page.id, fix.templateId);
        const t = s.templates.find((x) => x.id === fix.templateId);
        s.log({ kind: "qa", message: `Page ${page.number}: switched to ${t?.name} to resolve overflow`, pageId: page.id, tone: "success" });
        toast("success", `Template switched on page ${page.number}`, t?.name);
        return;
      }
      case "reset-style": {
        const o = { ...page.frameOverrides[fix.frameId] };
        delete o.style;
        s.updatePage(page.id, { frameOverrides: { ...page.frameOverrides, [fix.frameId]: o } });
        toast("success", "Paragraph style restored", `Page ${page.number}`);
        return;
      }
      case "reset-geometry": {
        const o = { ...page.frameOverrides[fix.frameId] };
        delete o.x;
        delete o.y;
        delete o.w;
        delete o.h;
        s.updatePage(page.id, { frameOverrides: { ...page.frameOverrides, [fix.frameId]: o } });
        toast("success", "Frame snapped back to the template grid", `Page ${page.number}`);
        return;
      }
      case "fill-frame":
        s.setFrameOverride(page.id, fix.frameId, { imageFit: "cover" });
        toast("success", "Image set to fill frame", `Page ${page.number}`);
        return;
      case "add-continuation": {
        const id = s.insertContinuation(fix.afterPageId);
        s.log({ kind: "layout", message: `Continuation page ${page.number + 1} added for “${page.title}” — later pages renumbered`, pageId: id, tone: "success" });
        toast("success", `Page ${page.number + 1} added`, "The story now threads onto a continuation page. Later pages were renumbered; cover lines may need updating.");
        if (id) router.push(routes.studio(id));
        return;
      }
      case "approve-page":
        s.setPageStatus(page.id, "approved");
        s.log({ kind: "qa", message: `Page ${page.number} approved`, pageId: page.id, tone: "success" });
        toast("success", `Page ${page.number} approved`);
        return;
      case "generate-layout":
        router.push(`${routes.studio(page.id)}&generate=1`);
        return;
      default:
        useFix.setState({ pending: { issue, fix } });
    }
  };
}

export function FixHost() {
  const pending = useFix((s) => s.pending);
  const close = () => useFix.setState({ pending: null });
  if (!pending) return null;
  const { fix, issue } = pending;
  if (fix.type === "assign-image") return <AssignImage issue={issue} bind={fix.bind} onClose={close} />;
  if (fix.type === "add-designation" || fix.type === "add-author") return <AuthorDialog articleId={fix.articleId} pageNumber={issue.pageNumber} onClose={close} />;
  if (fix.type === "add-caption") return <CaptionDialog articleId={fix.articleId} index={fix.index} onClose={close} />;
  if (fix.type === "suggest-trim") return <TrimDialog articleId={fix.articleId} issue={issue} onClose={close} />;
  return null;
}

function AssignImage({ issue, bind, onClose }: { issue: QAIssue; bind: string; onClose: () => void }) {
  const page = useStore((s) => s.pages.find((p) => p.id === issue.pageId));
  const article = useStore((s) => s.articles.find((a) => a.id === page?.articleId));
  return (
    <ImagePicker
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Place image — page ${issue.pageNumber}`}
      preferred={article?.contentType === "interview" || article?.contentType === "leadership-message" ? "portrait" : undefined}
      onPick={(id) => {
        const s = useStore.getState();
        if (!page) return;
        const idx = Number(bind.split(".")[1] ?? 0);
        if (article && !article.imageIds[idx]) {
          const imageIds = [...article.imageIds];
          imageIds[idx] = id;
          const captions = [...article.captions];
          captions[idx] = captions[idx] || (idx === 0 && (article.contentType === "interview" || article.contentType === "leadership-message") ? [article.author.name, article.author.designation].filter(Boolean).join(", ") : "");
          s.updateArticle(article.id, { imageIds, captions });
          s.setImageOverride(page.id, bind, undefined);
        } else {
          s.setImageOverride(page.id, bind, id);
        }
        s.log({ kind: "qa", message: `Missing image resolved on page ${page.number}`, pageId: page.id, tone: "success" });
        toast("success", `Image placed on page ${page.number}`, "Re-run QA to confirm.");
        onClose();
      }}
    />
  );
}

function AuthorDialog({ articleId, pageNumber, onClose }: { articleId: string; pageNumber: number; onClose: () => void }) {
  const article = useStore((s) => s.articles.find((a) => a.id === articleId));
  const [name, setName] = useState(article?.author.name ?? "");
  const [designation, setDesignation] = useState(article?.author.designation ?? "");
  const [org, setOrg] = useState(article?.author.organisation ?? "");
  if (!article) return null;
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title="Complete author details"
      description={`Updates “${article.title}” in the Content Library and every page that uses it.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!name.trim() || !designation.trim()}
            onClick={() => {
              const s = useStore.getState();
              s.updateArticle(article.id, { author: { ...article.author, name: name.trim(), designation: designation.trim(), organisation: org.trim() || undefined } });
              s.log({ kind: "content", message: `Author designation added for ${name.trim()} (page ${pageNumber})`, articleId: article.id, tone: "success" });
              toast("success", "Author details saved");
              onClose();
            }}
          >
            Save details
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Name" htmlFor="fx-name">
          <Input id="fx-name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Designation" htmlFor="fx-des" hint="Required for bylines and name bands.">
          <Input id="fx-des" autoFocus value={designation} placeholder="e.g. Senior Correspondent" onChange={(e) => setDesignation(e.target.value)} />
        </Field>
        <Field label="Organisation" htmlFor="fx-org">
          <Input id="fx-org" value={org} onChange={(e) => setOrg(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function CaptionDialog({ articleId, index, onClose }: { articleId: string; index: number; onClose: () => void }) {
  const article = useStore((s) => s.articles.find((a) => a.id === articleId));
  const [text, setText] = useState(article?.captions[index] ?? "");
  const suggestion = article ? suggestCaption(article, index) : "";
  if (!article) return null;
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title="Add image caption"
      description={`Caption ${index + 1} for “${article.title}”.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!text.trim()}
            onClick={() => {
              const captions = [...article.captions];
              captions[index] = text.trim();
              useStore.getState().updateArticle(article.id, { captions });
              useStore.getState().log({ kind: "content", message: `Caption added to “${article.title}”`, articleId: article.id, tone: "success" });
              toast("success", "Caption saved");
              onClose();
            }}
          >
            Save caption
          </Button>
        </>
      }
    >
      <div className="mb-3 rounded-lg border border-[#ddd6f8] bg-ai-50 p-3">
        <div className="mb-1.5 flex items-center gap-2">
          <Sparkles className="size-3.5 text-ai" />
          <span className="text-[12px] font-semibold text-ai">Suggested caption</span>
          <SimLabel className="ml-auto">Demo-generated</SimLabel>
        </div>
        <p className="text-[13px] text-ink-2">{suggestion}</p>
        <Button size="sm" variant="ghost" className="mt-2 text-ai" onClick={() => setText(suggestion)}>
          Use suggestion
        </Button>
      </div>
      <Field label="Caption" htmlFor="fx-cap">
        <Textarea id="fx-cap" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
    </Modal>
  );
}

function TrimDialog({ articleId, issue, onClose }: { articleId: string; issue: QAIssue; onClose: () => void }) {
  const article = useStore((s) => s.articles.find((a) => a.id === articleId));
  const pages = useStore((s) => s.pages);
  const overset = Number(issue.description.match(/About (\d+) words/)?.[1] ?? 80);
  const [proposal] = useState<TrimProposal | null>(() => (article ? proposeTrim(storyBody(pages, article), Math.ceil(overset * 1.1)) : null));
  if (!article || !proposal) return null;
  const first = storyPages(pages, article.id)[0];
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      width="max-w-2xl"
      title="Suggested trim for editorial review"
      description="Sentences proposed for removal are listed below. Nothing changes unless you accept, and the original copy stays in the Content Library."
      footer={
        <>
          <span className="mr-auto text-[12px] text-muted">
            {proposal.wordsBefore} → {proposal.wordsAfter} words ({proposal.wordsBefore - proposal.wordsAfter} cut, {overset} overset)
          </span>
          <Button variant="ghost" onClick={onClose}>
            Reject
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              if (!first) return;
              useStore.getState().setContentOverride(first.id, "body", proposal.text);
              useStore.getState().log({ kind: "qa", message: `Editor accepted a ${proposal.wordsBefore - proposal.wordsAfter}-word trim for “${article.title}” (page override)`, pageId: first.id, tone: "warning" });
              toast("success", "Trim applied as a page override", "Revert any time from the Properties panel in Layout Studio.");
              onClose();
            }}
          >
            <Wand2 /> Accept trim on page
          </Button>
        </>
      }
    >
      <div className="mb-3 flex items-center gap-2">
        <SimLabel>Demo-generated suggestion</SimLabel>
        <span className="text-[12px] text-muted">Lowest-information sentences, excluding questions, sub-heads and paragraph openers.</span>
      </div>
      <ol className="space-y-2">
        {proposal.removed.map((s, i) => (
          <li key={i} className="rounded-md border border-[#f5cdcf] bg-err-50/60 px-3 py-2 text-[13px] text-ink-2 line-through decoration-err/60">
            {s}
          </li>
        ))}
      </ol>
      {proposal.removed.length === 0 && <p className="text-[13px] text-muted">No safe cuts found — consider a continuation page or a roomier template.</p>}
    </Modal>
  );
}
