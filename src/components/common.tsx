"use client";

import { ImagePlus, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { fileToAsset, imageSrc, sampleImageAssets } from "@/lib/images";
import { useStore } from "@/lib/store";
import type { ApprovalStatus, ImageAsset, ImageSubject, PageStatus, Severity } from "@/lib/types";
import { toast } from "./shell/toast";
import { Badge, Button, cn, Modal, Segmented, type Tone } from "./ui";

export const PAGE_STATUS: Record<PageStatus, { label: string; tone: Tone }> = {
  planned: { label: "Planned", tone: "neutral" },
  draft: { label: "Draft", tone: "warn" },
  "in-review": { label: "In review", tone: "brand" },
  approved: { label: "Approved", tone: "ok" },
};

export const APPROVAL: Record<ApprovalStatus, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  "in-review": { label: "In review", tone: "brand" },
  "needs-changes": { label: "Needs changes", tone: "warn" },
  approved: { label: "Approved", tone: "ok" },
};

export const SEVERITY: Record<Severity, { label: string; tone: Tone }> = {
  error: { label: "Error", tone: "err" },
  warning: { label: "Warning", tone: "warn" },
  info: { label: "Info", tone: "info" },
  passed: { label: "Passed", tone: "ok" },
};

export function PageStatusBadge({ status }: { status: PageStatus }) {
  return (
    <Badge tone={PAGE_STATUS[status].tone} dot>
      {PAGE_STATUS[status].label}
    </Badge>
  );
}

export function ApprovalBadge({ status }: { status: ApprovalStatus }) {
  return <Badge tone={APPROVAL[status].tone}>{APPROVAL[status].label}</Badge>;
}

export const fmtDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
export const fmtDateTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
export const fmtBytes = (n?: number) =>
  n === undefined ? "—" : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n > 1e3 ? `${Math.round(n / 1e3)} KB` : `${n} B`;

export function useAllImages(): ImageAsset[] {
  const uploads = useStore((s) => s.uploads);
  return useMemo(() => [...uploads, ...sampleImageAssets], [uploads]);
}

/** Upload button that stores the image locally and returns its asset id. */
export function UploadButton({ onUploaded, label = "Upload image", variant = "secondary" as const }: { onUploaded: (id: string) => void; label?: string; variant?: "secondary" | "primary" | "ghost" }) {
  const input = useRef<HTMLInputElement>(null);
  const addUpload = useStore((s) => s.addUpload);
  const compress = useStore((s) => s.settings.images.compressUploads);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label="Choose image file"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true);
          try {
            const asset = await fileToAsset(file, compress);
            addUpload(asset);
            onUploaded(asset.id);
            toast("success", "Image added to library", `${asset.name} · ${asset.width}×${asset.height}px`);
          } catch (err) {
            toast("error", "Upload failed", err instanceof Error ? err.message : String(err));
          } finally {
            setBusy(false);
          }
        }}
      />
      <Button variant={variant} size="sm" loading={busy} onClick={() => input.current?.click()}>
        {!busy && <Upload />} {label}
      </Button>
    </>
  );
}

type Filter = "all" | ImageSubject | "upload";

export function ImagePicker({
  open,
  onOpenChange,
  onPick,
  current,
  title = "Choose an image",
  preferred,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPick: (id: string) => void;
  current?: string | null;
  title?: string;
  preferred?: ImageSubject;
}) {
  const images = useAllImages();
  const [filter, setFilter] = useState<Filter>(preferred ?? "all");
  const shown = images.filter((i) => filter === "all" || (filter === "upload" ? i.source === "upload" : i.subject === filter));
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Sample artwork is generated locally for the demo. Uploads are stored in this browser only."
      width="max-w-3xl"
      footer={
        <>
          <span className="mr-auto text-[12px] text-muted">{shown.length} images</span>
          <UploadButton
            onUploaded={(id) => {
              onPick(id);
              onOpenChange(false);
            }}
          />
        </>
      }
    >
      <Segmented<Filter>
        size="sm"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "All" },
          { value: "portrait", label: "Portraits" },
          { value: "scene", label: "Scenes" },
          { value: "abstract", label: "Abstract" },
          { value: "event", label: "Events" },
          { value: "advertisement", label: "Ads" },
          { value: "upload", label: "Uploads" },
        ]}
      />
      {shown.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-line p-8 text-center text-[13px] text-muted">
          <ImagePlus className="mx-auto mb-2 size-5" /> No images in this category yet.
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-4 gap-3 max-sm:grid-cols-2">
          {shown.map((img) => (
            <button
              key={img.id}
              onClick={() => {
                onPick(img.id);
                onOpenChange(false);
              }}
              className={cn(
                "group overflow-hidden rounded-lg border bg-canvas text-left transition hover:border-brand hover:shadow-card",
                current === img.id ? "border-brand ring-2 ring-brand-100" : "border-line",
              )}
            >
              <div className="aspect-[4/3] overflow-hidden bg-[#eef0f4]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageSrc(img)} alt={img.alt} className="size-full object-cover transition group-hover:scale-[1.03]" />
              </div>
              <div className="px-2 py-1.5">
                <p className="truncate text-[12px] font-medium text-ink">{img.name}</p>
                <p className="text-[11px] text-muted">
                  {img.vector ? "Vector sample" : `${img.width}×${img.height}px`} · {img.subject}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

export function Stat({ label, value, sub, tone, icon }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "err" | "warn" | "ok" | "brand"; icon?: React.ReactNode }) {
  const color = { err: "text-err", warn: "text-warn", ok: "text-ok", brand: "text-brand" }[tone ?? "brand"];
  return (
    <div className="rounded-xl border border-line bg-white p-4 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-[12.5px] font-medium text-muted">{label}</p>
        {icon && <span className={cn("[&_svg]:size-4", color)}>{icon}</span>}
      </div>
      <p className="mt-2 text-[26px] leading-none font-semibold tracking-tight text-ink tabular-nums">{value}</p>
      {sub && <p className="mt-2 text-[12px] text-muted">{sub}</p>}
    </div>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; eyebrow?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5">{eyebrow}</div>}
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[13.5px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
export { EmptyState } from "./ui";
