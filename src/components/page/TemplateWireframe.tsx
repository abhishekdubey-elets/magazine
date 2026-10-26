import type { FrameSpec, Template } from "@/lib/types";

const COLORS: Record<string, { fill: string; stroke: string }> = {
  image: { fill: "#dbe4f6", stroke: "#9fb3dc" },
  headline: { fill: "#1d2b4f", stroke: "#1d2b4f" },
  body: { fill: "#eef0f4", stroke: "#cdd2db" },
  pullquote: { fill: "#fde7d3", stroke: "#f0b47c" },
  shape: { fill: "#eceff3", stroke: "#eceff3" },
  meta: { fill: "#c9cfda", stroke: "#c9cfda" },
  data: { fill: "#e2f2e8", stroke: "#9fd0b2" },
};

function look(f: FrameSpec) {
  if (f.kind === "image") return COLORS.image;
  if (f.kind === "shape") return { fill: f.fill && !f.fill.startsWith("accent") ? f.fill : "#eceff3", stroke: "transparent" };
  if (f.kind === "stats" || f.kind === "chart" || f.kind === "toc" || f.bind === "facts") return COLORS.data;
  if (f.role === "headline" || f.kind === "masthead") return COLORS.headline;
  if (f.role === "pullquote") return COLORS.pullquote;
  if (f.bind === "body") return COLORS.body;
  return COLORS.meta;
}

/** Schematic of a template's frame geometry (used in pickers and the library). */
export function TemplateWireframe({ template, className }: { template: Template; className?: string }) {
  const { width: TW, height: TH } = template.trim ?? { width: 205, height: 278 };
  return (
    <svg viewBox={`0 0 ${TW} ${TH}`} className={className} role="img" aria-label={`${template.name} wireframe`} style={{ background: template.background ?? "#fff" }}>
      {template.frames.map((f) => {
        const c = look(f);
        const x = Math.max(f.x, 0);
        const y = Math.max(f.y, 0);
        const w = Math.min(f.x + f.w, TW) - x;
        const h = Math.min(f.y + f.h, TH) - y;
        if (f.bind === "body") {
          const cols = f.columns ?? 1;
          const g = 5;
          const cw = (w - g * (cols - 1)) / cols;
          return (
            <g key={f.id}>
              {Array.from({ length: cols }).map((_, i) => (
                <g key={i}>
                  {Array.from({ length: Math.max(1, Math.floor(h / 7)) }).map((__, j) => (
                    <rect key={j} x={x + i * (cw + g)} y={y + j * 7 + 1} width={j % 6 === 5 ? cw * 0.6 : cw} height={3} fill="#d5dae2" />
                  ))}
                </g>
              ))}
            </g>
          );
        }
        if (f.kind === "shape" && f.background) {
          return <rect key={f.id} x={x} y={y} width={w} height={Math.max(h, 0.6)} fill="#1d2b4f" opacity={0.18} />;
        }
        return <rect key={f.id} x={x} y={y} width={w} height={Math.max(h, 0.6)} fill={c.fill} stroke={c.stroke} strokeWidth={0.6} rx={f.kind === "image" ? 0 : 0.5} opacity={f.role === "headline" ? 0.9 : 1} />;
      })}
      {template.furniture === "full" && <rect x={15} y={11} width={TW - 30} height={0.6} fill="#9aa1ae" />}
      {template.furniture !== "none" && <rect x={15} y={TH - 12} width={20} height={4} fill="#9aa1ae" />}
    </svg>
  );
}
