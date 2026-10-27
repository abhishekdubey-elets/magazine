"use client";

import { usePublication } from "@/lib/hooks";
import { ImagePlus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { CONTENT_TYPE_LABELS } from "@/lib/ai";
import { imageSrc } from "@/lib/images";
import { newId, useStore } from "@/lib/store";
import { useCan } from "@/lib/sync/engine";
import { countWords } from "@/lib/text-engine";
import type { ApprovalStatus, Article, ContentType } from "@/lib/types";
import { ImagePicker, UploadButton, useAllImages } from "../common";
import { toast } from "../shell/toast";
import { Button, Field, Input, Modal, Select, Textarea } from "../ui";

const blank = (pubId: string): Article => ({
  id: "",
  title: "",
  subtitle: "",
  body: "",
  contentType: "feature",
  sectionId: "sec-digital",
  author: { name: "", designation: "", organisation: "" },
  pullQuotes: [],
  captions: [],
  imageIds: [],
  status: "draft",
  tags: [],
  publicationId: pubId,
  createdAt: "",
  updatedAt: "",
});

export function ContentEditor({ open, onOpenChange, article, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; article?: Article; onSaved?: (id: string) => void }) {
  const pubId = useStore((s) => s.activePublicationId);
  const sections = usePublication().sections;
  const [a, setA] = useState<Article>(() => (article ? structuredClone(article) : blank(pubId)));
  const [picker, setPicker] = useState(false);
  const [tags, setTags] = useState(a.tags.join(", "));
  const images = useAllImages();
  const canApprove = useCan("approve-articles");
  const set = (patch: Partial<Article>) => setA((x) => ({ ...x, ...patch }));
  const setAuthor = (patch: Partial<Article["author"]>) => setA((x) => ({ ...x, author: { ...x.author, ...patch } }));
  const words = countWords(a.body);
  const valid = a.title.trim() && a.body.trim() && a.author.name.trim();

  const save = () => {
    const s = useStore.getState();
    const now = new Date().toISOString();
    const clean: Article = {
      ...a,
      title: a.title.trim(),
      subtitle: a.subtitle?.trim() || undefined,
      summary: a.summary?.trim() || undefined,
      interviewer: a.interviewer?.trim() || undefined,
      tags: tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
      captions: a.imageIds.map((_, i) => a.captions[i] ?? ""),
    };
    if (article) {
      s.updateArticle(article.id, clean);
      s.log({ kind: "content", message: `Content updated: “${clean.title}”`, articleId: article.id });
      toast("success", "Changes saved", clean.title);
      onSaved?.(article.id);
    } else {
      const id = newId("art");
      s.addArticle({ ...clean, id, createdAt: now, updatedAt: now });
      s.log({ kind: "content", message: `New content added: “${clean.title}” (${CONTENT_TYPE_LABELS[clean.contentType]})`, articleId: id });
      toast("success", "Content added to library", clean.title);
      onSaved?.(id);
    }
    onOpenChange(false);
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      width="max-w-3xl"
      title={article ? "Edit content" : "Add content"}
      description="Paste approved copy and metadata. Use a blank line between paragraphs; interviews use “Q:” and “A:” prefixes; “## ” marks a sub-heading."
      footer={
        <>
          <span className="mr-auto text-[12px] text-muted">{words} words · saved to this browser</span>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!valid} onClick={save}>
            {article ? "Save changes" : "Add to library"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-6 gap-3">
        <Field label="Title *" htmlFor="ce-title" className="col-span-6">
          <Input id="ce-title" value={a.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Building Digital Trust at Scale" />
        </Field>
        <Field label="Subtitle / deck" htmlFor="ce-sub" className="col-span-6">
          <Input id="ce-sub" value={a.subtitle ?? ""} onChange={(e) => set({ subtitle: e.target.value })} />
        </Field>
        <Field label="Content type" htmlFor="ce-type" className="col-span-2">
          <Select id="ce-type" value={a.contentType} onChange={(e) => set({ contentType: e.target.value as ContentType })}>
            {(Object.keys(CONTENT_TYPE_LABELS) as ContentType[]).map((t) => (
              <option key={t} value={t}>
                {CONTENT_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Section" htmlFor="ce-sec" className="col-span-2">
          <Select id="ce-sec" value={a.sectionId} onChange={(e) => set({ sectionId: e.target.value })}>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Approval" htmlFor="ce-status" className="col-span-2">
          <Select id="ce-status" value={a.status} onChange={(e) => set({ status: e.target.value as ApprovalStatus })}>
            <option value="draft">Draft</option>
            <option value="in-review">In review</option>
            <option value="needs-changes">Needs changes</option>
            <option value="approved" disabled={!canApprove && a.status !== "approved"}>
              Approved{canApprove ? "" : " (editors only)"}
            </option>
          </Select>
        </Field>
        <Field label={a.contentType === "interview" ? "Interviewee *" : "Author *"} htmlFor="ce-author" className="col-span-2">
          <Input id="ce-author" value={a.author.name} onChange={(e) => setAuthor({ name: e.target.value })} />
        </Field>
        <Field label="Designation" htmlFor="ce-des" className="col-span-2">
          <Input id="ce-des" value={a.author.designation ?? ""} onChange={(e) => setAuthor({ designation: e.target.value })} />
        </Field>
        <Field label="Organisation" htmlFor="ce-org" className="col-span-2">
          <Input id="ce-org" value={a.author.organisation ?? ""} onChange={(e) => setAuthor({ organisation: e.target.value })} />
        </Field>
        {a.contentType === "interview" && (
          <Field label="Interviewer" htmlFor="ce-int" className="col-span-3">
            <Input id="ce-int" value={a.interviewer ?? ""} placeholder="e.g. Rose Jaiswal, Elets News Network" onChange={(e) => set({ interviewer: e.target.value })} />
          </Field>
        )}
        <Field label="Tags" htmlFor="ce-tags" className={a.contentType === "interview" ? "col-span-3" : "col-span-6"} hint="Comma separated">
          <Input id="ce-tags" value={tags} onChange={(e) => setTags(e.target.value)} />
        </Field>
        <Field label="Article text *" htmlFor="ce-body" className="col-span-6">
          <Textarea id="ce-body" rows={10} value={a.body} onChange={(e) => set({ body: e.target.value })} placeholder="Paste the approved article text here…" className="text-[13px]" />
        </Field>
        <Field label="Summary / standfirst" htmlFor="ce-sum" className="col-span-6" hint="Optional — AI Content Preparation can propose one.">
          <Textarea id="ce-sum" rows={2} value={a.summary ?? ""} onChange={(e) => set({ summary: e.target.value })} />
        </Field>
        <div className="col-span-6">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12.5px] font-medium text-ink-2">Images & captions</span>
            <div className="flex gap-2">
              <UploadButton label="Upload" onUploaded={(id) => set({ imageIds: [...a.imageIds, id], captions: [...a.captions, ""] })} />
              <Button size="sm" onClick={() => setPicker(true)}>
                <ImagePlus /> Sample image
              </Button>
            </div>
          </div>
          {a.imageIds.length === 0 ? (
            <p className="rounded-md border border-dashed border-line px-3 py-4 text-center text-[12.5px] text-muted">No images attached. Layouts that need a photo will be flagged in QA.</p>
          ) : (
            <ul className="space-y-2">
              {a.imageIds.map((id, i) => {
                const img = images.find((x) => x.id === id);
                return (
                  <li key={`${id}-${i}`} className="flex items-center gap-3 rounded-md border border-line p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imageSrc(img)} alt="" className="h-12 w-16 shrink-0 rounded object-cover" />
                    <Input
                      aria-label={`Caption ${i + 1}`}
                      placeholder="Caption"
                      value={a.captions[i] ?? ""}
                      onChange={(e) => {
                        const captions = [...a.captions];
                        captions[i] = e.target.value;
                        set({ captions });
                      }}
                    />
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Remove image"
                      onClick={() => set({ imageIds: a.imageIds.filter((_, j) => j !== i), captions: a.captions.filter((_, j) => j !== i) })}
                    >
                      <X />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {article && (
          <div className="col-span-6 border-t border-line pt-3">
            <DeleteArticle id={article.id} title={article.title} onDone={() => onOpenChange(false)} />
          </div>
        )}
      </div>
      <ImagePicker open={picker} onOpenChange={setPicker} onPick={(id) => set({ imageIds: [...a.imageIds, id], captions: [...a.captions, ""] })} />
    </Modal>
  );
}

function DeleteArticle({ id, title, onDone }: { id: string; title: string; onDone: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const allPages = useStore((s) => s.pages);
  const placed = allPages.filter((p) => p.articleId === id).map((p) => p.number);
  return confirm ? (
    <div className="flex items-center gap-2 rounded-md bg-err-50 px-3 py-2 text-[12.5px] text-err">
      Remove “{title}”{placed.length ? ` — pages ${placed.join(", ")} will revert to planned` : ""}?
      <Button
        size="sm"
        variant="danger"
        className="ml-auto"
        onClick={() => {
          useStore.getState().deleteArticle(id);
          toast("success", "Content removed", title);
          onDone();
        }}
      >
        Remove
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
        Keep
      </Button>
    </div>
  ) : (
    <Button size="sm" variant="ghost" className="text-err" onClick={() => setConfirm(true)}>
      <Trash2 /> Remove from library
    </Button>
  );
}
