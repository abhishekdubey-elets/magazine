"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { sections as defaultSections } from "@/data/seed";
import { routes } from "@/lib/nav";
import { newId, useStore } from "@/lib/store";
import type { Page, Publication } from "@/lib/types";
import { toast } from "../shell/toast";
import { Button, Field, Input, Modal, Select } from "../ui";

const COLORS = ["#2453c4", "#c2410c", "#127a45", "#6b3fa0", "#0f766e"];

export function NewPublicationDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [title, setTitle] = useState("Tech Maha Impact");
  const [issue, setIssue] = useState("June 2026");
  const [date, setDate] = useState("2026-06-25");
  const [pages, setPages] = useState(16);
  const [masthead, setMasthead] = useState("TechMahaImpact");
  const valid = title.trim() && issue.trim() && pages >= 4 && pages <= 120 && pages % 2 === 0;

  const create = () => {
    const id = newId("pub");
    const now = new Date().toISOString();
    const plan: Page[] = Array.from({ length: pages }, (_, i) => {
      const n = i + 1;
      const kind = n === 1 ? "cover" : n === 3 ? "contents" : n === pages ? "closing" : "article";
      const templateId = n === 1 ? "tpl-cover" : n === 3 ? "tpl-contents" : undefined;
      return {
        id: `${id}-p${n}`,
        publicationId: id,
        number: n,
        pageType: kind,
        title: n === 1 ? "Front cover" : n === 3 ? "Contents" : n === pages ? "Back cover" : `Page ${n}`,
        sectionId: n <= 3 || n === pages ? "sec-front" : undefined,
        templateId,
        status: templateId ? "draft" : "planned",
        contentOverrides: {},
        imageOverrides: {},
        frameOverrides: {},
        updatedAt: now,
      } satisfies Page;
    });
    const pub: Publication = {
      id,
      title: title.trim(),
      masthead: masthead.trim() || title.replace(/\s+/g, ""),
      issueLabel: issue.trim(),
      issueDate: date,
      stage: "planning",
      description: "New issue created in PressFlow.",
      website: "egov.eletsonline.com",
      tagline: "The ultimate resource for Governance Innovations",
      sections: defaultSections,
      pageIds: plan.map((p) => p.id),
      trim: { width: 205, height: 278 },
      bleed: 5,
      updatedAt: now,
      updatedBy: "Shyam Kishore",
      coverColor: COLORS[Math.floor(Math.random() * COLORS.length)],
    };
    useStore.setState((s) => ({ publications: [pub, ...s.publications], pages: [...s.pages, ...plan], activePublicationId: id }));
    useStore.getState().log({ kind: "system", message: `Publication created: ${pub.title} — ${pub.issueLabel} (${pages} pages)` });
    toast("success", "Publication created", `${pub.title} — ${pub.issueLabel} is now the active issue.`);
    onOpenChange(false);
    router.push(routes.publication(id));
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Start a new publication"
      description="Creates an issue with a cover, contents page and planned pages. Assign content and generate layouts from the workspace."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!valid} onClick={create}>
            Create publication
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Publication" htmlFor="np-title" className="col-span-2">
          <Input id="np-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Masthead wordmark" htmlFor="np-mast" className="col-span-2">
          <Input id="np-mast" value={masthead} onChange={(e) => setMasthead(e.target.value)} />
        </Field>
        <Field label="Issue label" htmlFor="np-issue">
          <Input id="np-issue" value={issue} onChange={(e) => setIssue(e.target.value)} />
        </Field>
        <Field label="Print date" htmlFor="np-date">
          <Input id="np-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Page count" htmlFor="np-pages" hint="Even number, 4–120.">
          <Input id="np-pages" type="number" min={4} max={120} step={2} value={pages} onChange={(e) => setPages(Number(e.target.value))} />
        </Field>
        <Field label="Format" htmlFor="np-format">
          <Select id="np-format" defaultValue="tmi">
            <option value="tmi">205 × 278 mm · 5 mm bleed (house)</option>
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
