"use client";

import { memo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from "react";
import { ink, PX_PER_MM, ptToPx } from "@/lib/design-tokens";
import { fontFamilies } from "@/lib/fonts";
import { findImage, imageSrc } from "@/lib/images";
import type { LayoutContext, ResolvedPage } from "@/lib/layout-engine";
import { resolvePage } from "@/lib/layout-engine";
import { DROP_CAP_LINES } from "@/lib/text-engine";
import type { BodySlice, ImageAsset, ResolvedElement, TextStyle } from "@/lib/types";

export type RenderMode = "edit" | "preview" | "thumb" | "export";

export interface Geometry {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Props {
  r: ResolvedPage;
  ctx: LayoutContext;
  uploads: ImageAsset[];
  mode?: RenderMode;
  /** Visual scale applied by the parent (needed to convert drag deltas). */
  scale?: number;
  guides?: boolean;
  /** Render the bleed area around the trim (export). */
  bleed?: number;
  selectedId?: string | null;
  editingId?: string | null;
  generating?: boolean;
  onSelect?: (id: string | null) => void;
  onStartEdit?: (id: string) => void;
  onCommitText?: (id: string, text: string) => void;
  onGeometry?: (id: string, g: Geometry) => void;
}

const mm = (v: number) => v * PX_PER_MM;

export function textCss(s: TextStyle): CSSProperties {
  return {
    fontFamily: fontFamilies[s.font],
    fontSize: ptToPx(s.size),
    lineHeight: `${ptToPx(s.leading)}px`,
    fontWeight: s.weight,
    fontStyle: s.italic ? "italic" : "normal",
    color: s.color,
    textAlign: s.align,
    letterSpacing: s.tracking ? `${s.tracking / 1000}em` : undefined,
    textTransform: s.uppercase ? "uppercase" : undefined,
  };
}

export const PAGE_W = 205;
export const PAGE_H = 278;

function PageRendererBase({
  r,
  ctx,
  uploads,
  mode = "preview",
  scale = 1,
  guides,
  bleed = 0,
  selectedId,
  editingId,
  generating,
  onSelect,
  onStartEdit,
  onCommitText,
  onGeometry,
}: Props) {
  const { page, template } = r;
  const edit = mode === "edit";
  const [drag, setDrag] = useState<{ id: string; g: Geometry } | null>(null);
  const dragRef = useRef<{ id: string; start: { x: number; y: number }; orig: Geometry; kind: "move" | "resize" } | null>(null);

  const W = mm(ctx.publication.trim.width);
  const H = mm(ctx.publication.trim.height);
  const B = mm(bleed);

  const startDrag = (e: RPointerEvent, el: ResolvedElement, kind: "move" | "resize") => {
    if (!edit || !onGeometry || e.button !== 0) return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { id: el.id, start: { x: e.clientX, y: e.clientY }, orig: { x: el.x, y: el.y, w: el.w, h: el.h }, kind };
  };
  const moveDrag = (e: RPointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = (e.clientX - d.start.x) / (PX_PER_MM * scale);
    const dy = (e.clientY - d.start.y) / (PX_PER_MM * scale);
    if (Math.abs(dx) < 0.4 && Math.abs(dy) < 0.4 && !drag) return;
    const snap = (v: number) => Math.round(v * 2) / 2;
    const g =
      d.kind === "move"
        ? { ...d.orig, x: snap(d.orig.x + dx), y: snap(d.orig.y + dy) }
        : { ...d.orig, w: Math.max(5, snap(d.orig.w + dx)), h: Math.max(3, snap(d.orig.h + dy)) };
    setDrag({ id: d.id, g });
  };
  const endDrag = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (d && drag && onGeometry) onGeometry(d.id, drag.g);
    setDrag(null);
  };

  const bg = template?.background ?? "#ffffff";

  return (
    <div
      className="mag-page"
      style={{ width: W + B * 2, height: H + B * 2, background: bg }}
      onPointerDown={() => edit && onSelect?.(null)}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      data-page-number={page.number}
    >
      <div style={{ position: "absolute", left: B, top: B, width: W, height: H }}>
        {!template && <PlannedPage r={r} />}
        {template &&
          r.elements.map((el) => {
            const g = drag?.id === el.id ? drag.g : el;
            const hiddenEmpty = el.empty && el.frame.optional && mode !== "edit";
            if (hiddenEmpty) return null;
            const selected = selectedId === el.id;
            return (
              <div
                key={el.id}
                data-frame={el.id}
                className="group"
                style={{
                  position: "absolute",
                  left: mm(g.x),
                  top: mm(g.y),
                  width: mm(g.w),
                  height: mm(g.h),
                  zIndex: el.frame.z,
                  cursor: edit ? (selected ? "move" : "pointer") : undefined,
                }}
                onPointerDown={(e) => {
                  if (!edit) return;
                  e.stopPropagation();
                  onSelect?.(el.id);
                  if (selected && editingId !== el.id) startDrag(e, el, "move");
                }}
                onDoubleClick={(e) => {
                  if (!edit || el.kind !== "text") return;
                  e.stopPropagation();
                  onStartEdit?.(el.id);
                }}
              >
                <ElementView el={el} r={r} ctx={ctx} uploads={uploads} mode={mode} />
                {edit && editingId === el.id && el.kind === "text" && (
                  <InlineEditor el={el} onCommit={(t) => onCommitText?.(el.id, t)} />
                )}
                {edit && (
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                      outline: selected ? "1.5px solid #2f6bff" : guides ? "1px solid rgba(47,107,255,0.28)" : undefined,
                      outlineOffset: 0,
                    }}
                  />
                )}
                {edit && !selected && (
                  <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100" style={{ outline: "1px solid rgba(47,107,255,.7)" }} />
                )}
                {edit && selected && (
                  <>
                    <span className="pointer-events-none absolute -top-[18px] left-0 rounded-t bg-[#2f6bff] px-1.5 py-px font-sans text-[10px] font-medium whitespace-nowrap text-white">
                      {el.frame.label}
                    </span>
                    <span
                      role="presentation"
                      onPointerDown={(e) => startDrag(e, el, "resize")}
                      className="absolute -right-[5px] -bottom-[5px] size-[10px] cursor-nwse-resize border border-[#2f6bff] bg-white"
                    />
                  </>
                )}
                {(mode === "edit" || mode === "thumb") && (el.fit ?? 0) > 1.02 && !el.empty && (
                  <span
                    title={el.oversetWords ? `${el.oversetWords} words overset` : "Overset text"}
                    className="pointer-events-none absolute -right-[7px] -bottom-[7px] grid size-[14px] place-items-center border border-[#d4161d] bg-white font-sans text-[12px] leading-none font-bold text-[#d4161d]"
                  >
                    +
                  </span>
                )}
              </div>
            );
          })}
        {template && template.furniture !== "none" && <Furniture r={r} ctx={ctx} folioOnly={template.furniture === "folio"} />}
        {edit && guides && <Guides ctx={ctx} r={r} />}
        {generating && <div className="gen-scan pointer-events-none absolute inset-0 overflow-hidden" />}
      </div>
      {bleed > 0 && edit && <div className="pointer-events-none absolute" style={{ left: B, top: B, width: W, height: H, outline: "1px solid rgba(0,0,0,.3)" }} />}
    </div>
  );
}

export const PageRenderer = memo(PageRendererBase);

/* ------------------------------------------------------------ elements */

function ElementView({ el, r, ctx, uploads, mode }: { el: ResolvedElement; r: ResolvedPage; ctx: LayoutContext; uploads: ImageAsset[]; mode: RenderMode }) {
  const f = el.frame;
  switch (el.kind) {
    case "shape":
      return <div style={{ position: "absolute", inset: 0, background: el.background ?? el.fill, borderRadius: f.radius ? mm(f.radius) : undefined, opacity: f.opacity }} />;
    case "image":
      return <ImageFrame el={el} uploads={uploads} mode={mode} />;
    case "text":
      if (f.bind === "body") return <BodyFrame el={el} r={r} />;
      if (f.bind === "facts") return <FactsFrame el={el} r={r} />;
      if (f.role === "pullquote" && !el.empty) return <PullQuote el={el} accent={r.accent} />;
      return (
        <div
          className="mag-text"
          style={{
            position: "absolute",
            inset: 0,
            padding: f.inset ? mm(f.inset) : undefined,
            background: el.fill,
            borderRadius: f.radius ? mm(f.radius) : undefined,
            ...textCss(el.style),
          }}
        >
          {el.text || (mode === "edit" ? <span style={{ color: "#a7afbd", fontStyle: "italic", fontWeight: 400 }}>{f.label}</span> : null)}
        </div>
      );
    case "masthead":
      return <Masthead variant={f.variant ?? "logo"} name={ctx.publication.masthead} />;
    case "toc":
      return <Toc variant={f.variant ?? "list"} ctx={ctx} uploads={uploads} />;
    case "stats":
      return <Stats r={r} />;
    case "chart":
      return <Chart spec={f.text ?? ""} accent={r.accent} />;
    default:
      return null;
  }
}

function ImageFrame({ el, uploads, mode }: { el: ResolvedElement; uploads: ImageAsset[]; mode: RenderMode }) {
  const asset = findImage(el.imageId, uploads);
  const src = imageSrc(asset);
  if (!src) {
    const required = !el.frame.optional;
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: mode === "edit" ? "#eef0f4" : "#f1f2f5",
          border: required ? "1px dashed #d9a3a5" : "1px dashed #c3c9d4",
          display: "grid",
          placeItems: "center",
          overflow: "hidden",
        }}
      >
        <svg width="100%" height="100%" style={{ position: "absolute", inset: 0 }} preserveAspectRatio="none" viewBox="0 0 100 100" aria-hidden>
          <line x1="0" y1="0" x2="100" y2="100" stroke="#cfd4dd" strokeWidth="0.4" vectorEffect="non-scaling-stroke" />
          <line x1="100" y1="0" x2="0" y2="100" stroke="#cfd4dd" strokeWidth="0.4" vectorEffect="non-scaling-stroke" />
        </svg>
        <span style={{ position: "relative", fontFamily: fontFamilies.sans, fontSize: 11, fontWeight: 600, color: required ? "#b4373d" : "#8b93a3", background: "rgba(255,255,255,.85)", padding: "2px 6px", borderRadius: 3 }}>
          {required ? "Image missing" : "Optional image"}
        </span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={asset?.alt ?? ""}
      draggable={false}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: el.imageFit,
        objectPosition: `${el.focusX}% ${el.focusY}%`,
        background: el.imageFit === "contain" ? "#f1f2f5" : undefined,
        userSelect: "none",
      }}
    />
  );
}

function BodyFrame({ el, r }: { el: ResolvedElement; r: ResolvedPage }) {
  const s = el.style;
  const slices = el.slices ?? [];
  return (
    <div
      className="mag-body"
      style={{
        position: "absolute",
        inset: 0,
        columnCount: el.columns > 1 ? el.columns : undefined,
        columnGap: mm(el.gutter),
        ...textCss(s),
      }}
    >
      {slices.map((sl, i) => (
        <Para key={i} sl={sl} base={s} accent={r.accent} isInterview={r.article?.contentType === "interview"} />
      ))}
    </div>
  );
}

function Para({ sl, base, accent, isInterview }: { sl: BodySlice; base: TextStyle; accent: string; isInterview: boolean }) {
  const mb = sl.split ? 0 : ptToPx(sl.kind === "q" || sl.kind === "h" ? 3 : base.spaceAfter ?? 0);
  if (sl.kind === "h") {
    return (
      <p style={{ fontWeight: 700, fontSize: ptToPx(base.size + 2), lineHeight: `${ptToPx(base.leading + 2)}px`, color: accent, textAlign: "left", marginBottom: mb, marginTop: sl.continued ? 0 : ptToPx(base.leading * 0.5), breakAfter: "avoid" }}>
        {sl.text}
      </p>
    );
  }
  if (sl.kind === "q") {
    return (
      <p className={sl.split ? "split" : undefined} style={{ fontWeight: 700, color: isInterview ? accent : base.color, textAlign: base.align === "justify" ? "left" : base.align, marginBottom: mb }}>
        {sl.text}
      </p>
    );
  }
  if (sl.dropCap) {
    const size = base.leading * DROP_CAP_LINES * 0.95;
    return (
      <p className={sl.split ? "split" : undefined} style={{ marginBottom: mb }}>
        <span
          className="dropcap"
          style={{ fontSize: ptToPx(size), lineHeight: `${ptToPx(base.leading * DROP_CAP_LINES)}px`, height: ptToPx(base.leading * DROP_CAP_LINES), color: accent, marginRight: mm(1.2), marginTop: -ptToPx(base.leading * 0.12) }}
        >
          {sl.text[0]}
        </span>
        {sl.text.slice(1)}
      </p>
    );
  }
  return (
    <p className={sl.split ? "split" : undefined} style={{ marginBottom: mb }}>
      {sl.text}
    </p>
  );
}

function PullQuote({ el, accent }: { el: ResolvedElement; accent: string }) {
  const serif = el.style.font === "serif";
  return (
    <div className="mag-text" style={{ position: "absolute", inset: 0, ...textCss(el.style), paddingTop: serif ? 0 : mm(3), borderTop: serif ? undefined : `${mm(0.8)}px solid ${accent}` }}>
      {serif ? `“${el.text.replace(/^[“"]|[”"]$/g, "")}”` : `“${el.text.replace(/^[“"]|[”"]$/g, "")}”`}
    </div>
  );
}

function FactsFrame({ el, r }: { el: ResolvedElement; r: ResolvedPage }) {
  const facts = r.article?.facts ?? [];
  if (!facts.length) return null;
  const s = el.style;
  return (
    <div style={{ position: "absolute", inset: 0, background: el.fill, padding: el.frame.inset ? mm(el.frame.inset) : 0, overflow: "hidden" }}>
      {el.frame.inset ? (
        <div style={{ ...textCss({ ...s, size: 7, leading: 9, weight: 700, uppercase: true, tracking: 80, color: r.accent }), marginBottom: mm(2.5) }}>Key facts</div>
      ) : null}
      {facts.map((f, i) => (
        <div key={i} style={{ marginBottom: mm(2), paddingBottom: mm(1.6), borderBottom: i < facts.length - 1 ? `0.5px solid ${ink.rule}` : undefined }}>
          <div style={{ fontFamily: fontFamilies.display, fontSize: ptToPx(21), lineHeight: `${ptToPx(20)}px`, color: r.accent, letterSpacing: "0.01em" }}>{f.value}</div>
          <div style={{ ...textCss({ ...s, size: 7.4, leading: 9.4 }), marginTop: mm(0.8) }}>{f.label}</div>
        </div>
      ))}
    </div>
  );
}

function InlineEditor({ el, onCommit }: { el: ResolvedElement; onCommit: (t: string) => void }) {
  const [v, setV] = useState(el.text);
  return (
    <textarea
      autoFocus
      aria-label={`Edit ${el.frame.label}`}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={() => onCommit(v)}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCommit(el.text);
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onCommit(v);
      }}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 5,
        resize: "none",
        background: "rgba(255,255,255,.96)",
        outline: "2px solid #2f6bff",
        padding: el.frame.inset ? mm(el.frame.inset) : 0,
        ...textCss({ ...el.style, color: el.style.color === "#ffffff" ? ink.navy : el.style.color }),
      }}
    />
  );
}

/* ----------------------------------------------------------- furniture */

function Furniture({ r, ctx, folioOnly }: { r: ResolvedPage; ctx: LayoutContext; folioOnly: boolean }) {
  const { isLeft, page, accent } = r;
  const pub = ctx.publication;
  const label = r.section?.id === "sec-front" ? "" : r.section?.name ?? "";
  const { width: W, height: H } = pub.trim;
  const small: CSSProperties = { fontFamily: fontFamilies.body, fontSize: ptToPx(6), lineHeight: 1, color: "#3a4253", whiteSpace: "nowrap" };
  return (
    <>
      {!folioOnly && label && (
        <>
          <div style={{ position: "absolute", top: mm(-5), [isLeft ? "left" : "right"]: mm(-5), width: mm(13), height: mm(20), background: accent }} />
          <div style={{ position: "absolute", top: mm(10.5), left: mm(15), width: mm(W - 30), display: "flex", alignItems: "center", gap: mm(3), flexDirection: isLeft ? "row" : "row-reverse" }}>
            <span style={{ ...textCssRun(7, 400), letterSpacing: "0.04em", textTransform: "uppercase", color: "#3a4253", whiteSpace: "nowrap" }}>{label}</span>
            <span style={{ flex: 1, height: 0.5, background: "#9aa1ae" }} />
          </div>
        </>
      )}
      {/* Folio */}
      <div style={{ position: "absolute", top: mm(H - 13), left: 0, width: mm(W), height: mm(13) }}>
        <div style={{ position: "absolute", top: mm(1), [isLeft ? "left" : "right"]: mm(-5), width: mm(17), height: mm(17), background: "#33363d", color: "#fff", display: "grid", placeItems: "center" }}>
          <span style={{ fontFamily: fontFamilies.body, fontWeight: 700, fontSize: ptToPx(11), color: accent === ink.navy ? ink.orange : "#f6b44c", marginTop: -mm(3) }}>{isLeft ? ">" : "<"}</span>
        </div>
        <div style={{ position: "absolute", top: mm(2.2), [isLeft ? "left" : "right"]: mm(15), display: "flex", alignItems: "center", gap: mm(2.2), flexDirection: isLeft ? "row" : "row-reverse" }}>
          <span style={{ fontFamily: fontFamilies.body, fontWeight: 700, fontSize: ptToPx(11), color: "#1f2633" }}>{page.number}</span>
          <span style={{ width: 0.6, height: mm(5), background: "#9aa1ae" }} />
          <span style={{ ...small, textTransform: "uppercase" }}>{pub.issueLabel}</span>
        </div>
        <div style={{ position: "absolute", top: mm(3.4), left: isLeft ? mm(W * 0.34) : mm(30), ...small }}>
          {isLeft ? (
            <>
              <span style={{ color: "#c2410c" }}>[ {pub.website} ]</span>&nbsp; {pub.tagline}
            </>
          ) : (
            <>Connect with us on &nbsp;@eletsonline &nbsp;·&nbsp; @egovonline &nbsp;·&nbsp; Elets Governance &nbsp;·&nbsp; eletsvideos</>
          )}
        </div>
      </div>
    </>
  );
}

const textCssRun = (size: number, weight: number): CSSProperties => ({ fontFamily: fontFamilies.body, fontSize: ptToPx(size), fontWeight: weight, lineHeight: 1 });

function Guides({ ctx, r }: { ctx: LayoutContext; r: ResolvedPage }) {
  const p = { ...ctx.settings.page, ...ctx.publication.grid, ...ctx.publication.trim, bleed: ctx.publication.bleed };
  const cols = p.columns;
  const liveW = p.width - p.marginInside - p.marginOutside;
  const colW = (liveW - p.gutter * (cols - 1)) / cols;
  const left = r.isLeft ? p.marginOutside : p.marginInside;
  return (
    <div className="pointer-events-none absolute inset-0" style={{ zIndex: 40 }}>
      <div style={{ position: "absolute", left: mm(left), top: mm(p.marginTop), width: mm(liveW), height: mm(p.height - p.marginTop - p.marginBottom), outline: "1px solid rgba(214,52,166,.55)" }} />
      {Array.from({ length: cols }).map((_, i) => (
        <div key={i} style={{ position: "absolute", left: mm(left + i * (colW + p.gutter)), top: mm(p.marginTop), width: mm(colW), height: mm(p.height - p.marginTop - p.marginBottom), background: "rgba(80,140,255,.06)", borderLeft: "1px solid rgba(80,140,255,.35)", borderRight: "1px solid rgba(80,140,255,.35)" }} />
      ))}
      <div style={{ position: "absolute", left: -mm(p.bleed), top: -mm(p.bleed), width: mm(p.width + p.bleed * 2), height: mm(p.height + p.bleed * 2), outline: "1px dashed rgba(230,40,40,.6)" }} />
    </div>
  );
}

/* --------------------------------------------------- composite frames */

function Masthead({ variant, name }: { variant: string; name: string }) {
  const sans = fontFamilies.sans;
  if (variant === "partners") {
    const col = (label: string, main: React.ReactNode, align: "left" | "center" | "right") => (
      <div style={{ textAlign: align, flex: 1 }}>
        <div style={{ fontFamily: sans, fontSize: ptToPx(5.5), color: "#5b6475", marginBottom: mm(1.2) }}>{label}</div>
        {main}
      </div>
    );
    return (
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-start" }}>
        {col("Organised by", <EletsMark size={13} />, "left")}
        {col(
          "An Initiative By",
          <div style={{ fontFamily: sans, fontSize: ptToPx(6.2), lineHeight: 1.25, color: ink.navy, fontWeight: 700 }}>
            DEPARTMENT OF INFORMATION TECHNOLOGY
            <div style={{ fontWeight: 400, color: "#5b6475" }}>State IT Corporation (sample)</div>
          </div>,
          "center",
        )}
        {col("Strategic Partner", <EGovBadge h={mm(5.5)} />, "right")}
      </div>
    );
  }
  if (variant === "badge") return <div style={{ position: "absolute", inset: 0, display: "flex", justifyContent: "flex-end", alignItems: "center" }}><EGovBadge h={mm(11)} /></div>;
  const light = variant === "light";
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div style={{ fontFamily: sans, fontWeight: 800, fontSize: ptToPx(light ? 34 : 44), letterSpacing: "-0.02em", lineHeight: 1 }}>
        {name === "TechMahaImpact" ? (
          <>
            <span style={{ color: light ? "#fff" : ink.navy }}>Tech</span>
            <span style={{ color: ink.orange }}>Maha</span>
            <span style={{ color: light ? "#fff" : ink.blue }}>ImpacT</span>
          </>
        ) : (
          <span style={{ color: light ? "#fff" : ink.navy }}>{name}</span>
        )}
      </div>
    </div>
  );
}

function EletsMark({ size }: { size: number }) {
  return (
    <span style={{ fontFamily: fontFamilies.sans, fontWeight: 800, fontSize: ptToPx(size), color: "#141b2b", letterSpacing: "-0.03em" }}>
      <span style={{ color: "#d4161d" }}>e</span>lets
    </span>
  );
}

function EGovBadge({ h }: { h: number }) {
  return (
    <span style={{ display: "inline-flex", height: h, alignItems: "stretch", fontFamily: fontFamilies.sans, fontWeight: 800, fontSize: h * 0.72, lineHeight: `${h}px` }}>
      <span style={{ background: "#d4161d", color: "#fff", padding: `0 ${h * 0.18}px` }}>e</span>
      <span style={{ background: "#141b2b", color: "#fff", padding: `0 ${h * 0.22}px` }}>gov</span>
    </span>
  );
}

interface TocEntry {
  number: number;
  title: string;
  section: string;
  color: string;
  name?: string;
  role?: string;
  imageId?: string;
  type: string;
}

function tocEntries(ctx: LayoutContext): TocEntry[] {
  const seen = new Set<string>();
  const out: TocEntry[] = [];
  for (const p of [...ctx.pages].sort((a, b) => a.number - b.number)) {
    if (!p.articleId || seen.has(p.articleId) || p.publicationId !== ctx.publication.id) continue;
    if (["cover", "contents", "advertisement", "closing", "editors-note"].includes(p.pageType)) continue;
    const a = ctx.articles[p.articleId];
    if (!a) continue;
    seen.add(p.articleId);
    const sec = ctx.publication.sections.find((s) => s.id === (p.sectionId ?? a.sectionId));
    out.push({
      number: p.number,
      title: a.title === "Message" ? `Message — ${a.author.name}` : a.title,
      section: sec?.name ?? "",
      color: sec?.color ?? ink.blue,
      name: a.author.name,
      role: [a.author.designation, a.author.organisation].filter(Boolean).join(", "),
      imageId: a.imageIds[0],
      type: a.contentType,
    });
  }
  return out;
}

function Toc({ variant, ctx, uploads }: { variant: string; ctx: LayoutContext; uploads: ImageAsset[] }) {
  const entries = tocEntries(ctx);
  const body = fontFamilies.body;
  if (variant === "feature") {
    const e = entries.find((x) => x.section === "Cover Story") ?? entries[0];
    if (!e) return null;
    return (
      <div style={{ position: "absolute", inset: 0, background: "#fff", padding: `${mm(2.5)}px ${mm(4)}px`, borderLeft: `${mm(1.2)}px solid ${ink.orange}` }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: mm(2.5) }}>
          <span style={{ fontFamily: fontFamilies.headline, fontWeight: 800, fontSize: ptToPx(18), color: ink.navy, lineHeight: 1 }}>{String(e.number).padStart(2, "0")}</span>
          <span style={{ fontFamily: fontFamilies.body, fontWeight: 700, fontSize: ptToPx(6.5), letterSpacing: "0.08em", textTransform: "uppercase", color: "#5b6475" }}>Cover story</span>
        </div>
        <div style={{ fontFamily: fontFamilies.headline, fontWeight: 700, fontSize: ptToPx(10.5), lineHeight: `${ptToPx(12.5)}px`, color: ink.orange, marginTop: mm(1) }}>{e.title}</div>
      </div>
    );
  }
  if (variant === "people") {
    const people = entries.filter((e) => (e.type === "interview" || e.type === "leadership-message") && e.imageId).slice(0, 4);
    return (
      <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: mm(5) }}>
        {people.map((p) => {
          const src = imageSrc(findImage(p.imageId, uploads));
          return (
            <div key={p.number}>
              <div style={{ height: mm(32), background: "#eef0f4", overflow: "hidden" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {src && <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 20%" }} />}
              </div>
              <div style={{ fontFamily: body, fontWeight: 700, fontSize: ptToPx(11), color: p.color, marginTop: mm(1.5) }}>{p.number}</div>
              <div style={{ fontFamily: body, fontWeight: 700, fontSize: ptToPx(7), lineHeight: 1.25, color: "#1f2633" }}>{p.name}</div>
              <div style={{ fontFamily: body, fontSize: ptToPx(6.2), lineHeight: 1.25, color: "#5b6475" }}>{p.role}</div>
            </div>
          );
        })}
      </div>
    );
  }
  const list = entries.filter((e) => !(e.type === "leadership-message") && e.section !== "Cover Story");
  return (
    <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", alignContent: "start", columnGap: mm(5), rowGap: mm(2.6), borderTop: `${mm(0.5)}px solid ${ink.navy}`, paddingTop: mm(3), overflow: "hidden" }}>
      {list.slice(0, 12).map((e) => (
        <div key={e.number} style={{ display: "flex", gap: mm(2.5), alignItems: "baseline" }}>
          <span style={{ fontFamily: fontFamilies.headline, fontWeight: 800, fontSize: ptToPx(13), color: e.color, minWidth: mm(7) }}>{String(e.number).padStart(2, "0")}</span>
          <span>
            <span style={{ display: "block", fontFamily: body, fontSize: ptToPx(5.8), letterSpacing: "0.06em", textTransform: "uppercase", color: "#5b6475" }}>{e.section}</span>
            <span style={{ fontFamily: body, fontSize: ptToPx(8), lineHeight: 1.25, color: "#1f2633", fontWeight: 500 }}>{e.title}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function Stats({ r }: { r: ResolvedPage }) {
  const facts = r.article?.facts ?? [];
  if (!facts.length) {
    return <div style={{ position: "absolute", inset: 0, border: "1px dashed #c3c9d4", display: "grid", placeItems: "center", fontFamily: fontFamilies.sans, fontSize: 11, color: "#8b93a3" }}>Key facts required</div>;
  }
  const tones = [ink.navy, r.accent, ink.orange, ink.green, ink.blue, "#6b3fa0"];
  return (
    <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gridAutoRows: "1fr", gap: mm(4) }}>
      {facts.slice(0, 6).map((f, i) => (
        <div key={i} style={{ background: i % 2 === 0 ? "#f4f6fa" : "#fff", border: `0.5px solid ${ink.rule}`, borderTop: `${mm(1.2)}px solid ${tones[i % tones.length]}`, padding: `${mm(4)}px ${mm(4)}px`, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ fontFamily: fontFamilies.display, fontSize: ptToPx(36), lineHeight: 0.95, color: tones[i % tones.length], letterSpacing: "0.01em" }}>{f.value}</div>
          <div style={{ fontFamily: fontFamilies.body, fontSize: ptToPx(8), lineHeight: 1.3, color: "#1f2633", fontWeight: 500 }}>{f.label}</div>
        </div>
      ))}
    </div>
  );
}

function Chart({ spec, accent }: { spec: string; accent: string }) {
  const [title, data] = spec.split("|");
  const rows = (data ?? "").split(",").map((d) => {
    const [k, v] = d.split(":");
    return { k, v: Number(v) || 0 };
  });
  const max = Math.max(1, ...rows.map((r) => r.v));
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ fontFamily: fontFamilies.body, fontSize: ptToPx(7.5), fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#1f2633", marginBottom: mm(3) }}>{title}</div>
      <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: mm(3), borderBottom: "0.75px solid #1f2633", paddingBottom: 0 }}>
        {rows.map((r, i) => (
          <div key={r.k} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
            <div style={{ fontFamily: fontFamilies.headline, fontWeight: 700, fontSize: ptToPx(8.5), color: "#1f2633", marginBottom: mm(1) }}>{r.v}</div>
            <div style={{ width: "100%", height: `${(r.v / max) * 78}%`, background: i === rows.length - 1 ? ink.orange : accent, opacity: i === rows.length - 1 ? 1 : 0.55 + (i / rows.length) * 0.45 }} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: mm(3), marginTop: mm(1.2) }}>
        {rows.map((r) => (
          <div key={r.k} style={{ flex: 1, textAlign: "center", fontFamily: fontFamilies.body, fontSize: ptToPx(7), color: "#5b6475" }}>{r.k}</div>
        ))}
      </div>
    </div>
  );
}

function PlannedPage({ r }: { r: ResolvedPage }) {
  return (
    <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(135deg, #fafbfc 0 10px, #f3f5f8 10px 20px)", display: "grid", placeItems: "center" }}>
      <div style={{ textAlign: "center", fontFamily: fontFamilies.sans, color: "#6b7385", maxWidth: 420 }}>
        <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#98a0ae" }}>Page {r.page.number}</div>
        <div style={{ fontSize: 26, fontWeight: 700, color: "#3b4456", marginTop: 8 }}>{r.article ? r.article.title : "Unassigned page"}</div>
        <div style={{ fontSize: 15, marginTop: 10 }}>{r.article ? "Content assigned · layout not generated" : "No content assigned"}</div>
      </div>
    </div>
  );
}

/* --------------------------------------------------- convenience wrapper */

/** Scaled, non-interactive page preview (thumbnails, galleries). */
export function PageThumb({ ctx, pageId, uploads, width, mode = "thumb" }: { ctx: LayoutContext; pageId: string; uploads: ImageAsset[]; width: number; mode?: RenderMode }) {
  const page = ctx.pages.find((p) => p.id === pageId);
  if (!page) return null;
  const r = resolvePage(ctx, page);
  const W = mm(ctx.publication.trim.width);
  const H = mm(ctx.publication.trim.height);
  const s = width / W;
  return (
    <div style={{ width, height: H * s, overflow: "hidden", position: "relative" }} aria-label={`Page ${page.number} preview`}>
      <div style={{ transform: `scale(${s})`, transformOrigin: "0 0", width: W, height: H, pointerEvents: "none" }}>
        <PageRenderer r={r} ctx={ctx} uploads={uploads} mode={mode} />
      </div>
    </div>
  );
}
