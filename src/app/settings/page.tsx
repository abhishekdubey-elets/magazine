"use client";

import { CheckCircle2, CircleSlash, Plug, ServerCog, XCircle } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/common";
import { toast } from "@/components/shell/toast";
import { Badge, Button, Card, CardHeader, Field, Input, Select, Switch, cn } from "@/components/ui";
import { ink, paragraphStyles } from "@/lib/design-tokens";
import { fontDisplayNames, fontFamilies } from "@/lib/fonts";
import { useStore } from "@/lib/store";
import type { ExportFormat, Settings } from "@/lib/types";
import { integrationStatus, testConnection } from "@/services/indesign";

const SECTIONS = [
  ["brand", "Brand identity"],
  ["typography", "Typography"],
  ["page", "Page & grid"],
  ["styles", "Paragraph styles"],
  ["images", "Image handling"],
  ["export", "Export defaults"],
  ["indesign", "InDesign integration"],
] as const;

export default function SettingsPage() {
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  const [active, setActive] = useState<(typeof SECTIONS)[number][0]>("brand");
  const set = <K extends keyof Settings>(k: K, patch: Partial<Settings[K]>) => update({ [k]: { ...settings[k], ...patch } } as Partial<Settings>);

  return (
    <div className="mx-auto max-w-[1200px] space-y-5 p-6 lg:p-8">
      <PageHeader title="Settings" description="House rules applied to every generated page. Changes save automatically and re-flow open pages." />
      <div className="grid gap-5 md:grid-cols-[220px_1fr]">
        <nav aria-label="Settings sections" className="space-y-0.5 md:sticky md:top-5 md:self-start">
          {SECTIONS.map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              onClick={() => setActive(id)}
              className={cn("block rounded-md px-3 py-2 text-[13px] font-medium", active === id ? "bg-brand-50 text-brand" : "text-ink-2 hover:bg-white")}
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="min-w-0 space-y-5">
          <Card id="brand">
            <CardHeader title="Brand identity" description="Colours used by the application and default page accents." />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Organisation" htmlFor="s-org" className="sm:col-span-2">
                <Input id="s-org" value={settings.brand.organisation} onChange={(e) => set("brand", { organisation: e.target.value })} />
              </Field>
              {(["primary", "accent", "ink", "paper"] as const).map((k) => (
                <Field key={k} label={k[0].toUpperCase() + k.slice(1)} htmlFor={`s-${k}`}>
                  <div className="flex items-center gap-2">
                    <input id={`s-${k}`} type="color" value={settings.brand[k]} onChange={(e) => set("brand", { [k]: e.target.value })} className="h-9 w-12 cursor-pointer rounded border border-line" />
                    <Input aria-label={`${k} hex`} value={settings.brand[k]} onChange={(e) => set("brand", { [k]: e.target.value })} className="font-mono text-[12.5px]" />
                  </div>
                </Field>
              ))}
              <div className="flex items-center gap-3 rounded-lg border border-line p-3 sm:col-span-2">
                <span className="text-[26px] font-extrabold tracking-tight" style={{ fontFamily: fontFamilies.sans }}>
                  <span style={{ color: ink.navy }}>Tech</span>
                  <span style={{ color: settings.brand.accent }}>Maha</span>
                  <span style={{ color: settings.brand.primary }}>ImpacT</span>
                </span>
                <span className="text-[12px] text-muted">Masthead preview</span>
              </div>
            </div>
          </Card>

          <Card id="typography">
            <CardHeader title="Typography" description="Editorial typefaces are self-hosted web fonts in this demo; production would map them to licensed InDesign fonts." />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Headline font" htmlFor="s-hf">
                <Select id="s-hf" value={settings.typography.headlineFont} onChange={(e) => set("typography", { headlineFont: e.target.value })}>
                  {Object.values(fontDisplayNames).map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Body font" htmlFor="s-bf">
                <Select id="s-bf" value={settings.typography.bodyFont} onChange={(e) => set("typography", { bodyFont: e.target.value })}>
                  {Object.values(fontDisplayNames).map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Base body size (pt)" htmlFor="s-bs" hint="House style from the reference print file: 9 pt on 12 pt leading.">
                <Input id="s-bs" type="number" step={0.1} value={settings.typography.baseBodySize} onChange={(e) => set("typography", { baseBodySize: Number(e.target.value) })} />
              </Field>
              <Field label="Base leading (pt)" htmlFor="s-bl">
                <Input id="s-bl" type="number" step={0.1} value={settings.typography.baseLeading} onChange={(e) => set("typography", { baseLeading: Number(e.target.value) })} />
              </Field>
            </div>
          </Card>

          <Card id="page">
            <CardHeader title="Page dimensions, margins & gutters" description="Trim 205 × 278 mm with 5 mm bleed, matching the Tech Maha Impact print file." />
            <div className="grid gap-4 p-5 sm:grid-cols-3">
              {(
                [
                  ["width", "Trim width", "mm"],
                  ["height", "Trim height", "mm"],
                  ["bleed", "Bleed", "mm"],
                  ["marginTop", "Top margin", "mm"],
                  ["marginBottom", "Bottom margin", "mm"],
                  ["marginInside", "Inside margin", "mm"],
                  ["marginOutside", "Outside margin", "mm"],
                  ["gutter", "Column gutter", "mm"],
                  ["columns", "Base columns", ""],
                ] as const
              ).map(([k, label, unit]) => (
                <Field key={k} label={`${label}${unit ? ` (${unit})` : ""}`} htmlFor={`s-${k}`}>
                  <Input id={`s-${k}`} type="number" step={k === "columns" ? 1 : 0.5} value={settings.page[k]} disabled={k === "width" || k === "height"} onChange={(e) => set("page", { [k]: Number(e.target.value) })} />
                </Field>
              ))}
              <p className="text-[12px] text-muted sm:col-span-3">Trim size is fixed per publication. Gutter changes re-flow every threaded body frame; margins drive guides and the margin QA check.</p>
            </div>
          </Card>

          <Card id="styles">
            <CardHeader title="Default paragraph & character styles" description="Each style maps to an InDesign paragraph style name in the handoff manifest." />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-[12.5px]">
                <thead className="border-b border-line text-muted">
                  <tr>
                    <th className="px-5 py-2 font-medium">InDesign style</th>
                    <th className="px-3 py-2 font-medium">Font</th>
                    <th className="px-3 py-2 font-medium">Size / leading</th>
                    <th className="px-3 py-2 font-medium">Align</th>
                    <th className="px-3 py-2 font-medium">Sample</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {Object.values(paragraphStyles).map((p) => (
                    <tr key={p.id}>
                      <td className="px-5 py-2 font-medium text-ink">{p.indesignName}</td>
                      <td className="px-3 py-2 text-ink-2">
                        {fontDisplayNames[p.font]} {p.weight}
                        {p.italic ? " Italic" : ""}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-ink-2">
                        {p.size}/{p.leading} pt
                      </td>
                      <td className="px-3 py-2 text-ink-2">{p.align}</td>
                      <td className="max-w-[220px] truncate px-3 py-2" style={{ fontFamily: fontFamilies[p.font], fontWeight: p.weight, fontStyle: p.italic ? "italic" : undefined, textTransform: p.uppercase ? "uppercase" : undefined, fontSize: Math.min(20, Math.max(11, p.size * 0.9)), color: p.color === "accent" ? ink.blue : p.color }}>
                        Digital governance
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card id="images">
            <CardHeader title="Image handling" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Minimum effective resolution (ppi)" htmlFor="s-ppi" hint="Placed images below this are flagged by QA.">
                <Input id="s-ppi" type="number" step={10} value={settings.images.minEffectivePpi} onChange={(e) => set("images", { minEffectivePpi: Number(e.target.value) })} />
              </Field>
              <Field label="Default fitting" htmlFor="s-fit">
                <Select id="s-fit" value={settings.images.defaultFit} onChange={(e) => set("images", { defaultFit: e.target.value as "cover" | "contain" })}>
                  <option value="cover">Fill frame proportionally</option>
                  <option value="contain">Fit content proportionally</option>
                </Select>
              </Field>
              <div className="flex items-start gap-3 sm:col-span-2">
                <Switch checked={settings.images.compressUploads} onCheckedChange={(v) => set("images", { compressUploads: v })} label="Downscale uploads" />
                <div>
                  <p className="text-[13px] font-medium text-ink">Downscale large uploads for browser storage</p>
                  <p className="text-[12px] text-muted">Keeps localStorage under its quota (max 1800 px). Disable to test resolution warnings with originals.</p>
                </div>
              </div>
            </div>
          </Card>

          <Card id="export">
            <CardHeader title="Export defaults" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Default format" htmlFor="s-ef">
                <Select id="s-ef" value={settings.exportDefaults.format} onChange={(e) => set("exportDefaults", { format: e.target.value as ExportFormat })}>
                  <option value="pdf-proof">PDF preview (proof)</option>
                  <option value="pdf-web">Web PDF</option>
                  <option value="png-pages">Page preview images</option>
                  <option value="json-package">Structured content package</option>
                  <option value="indesign-handoff">InDesign handoff package</option>
                </Select>
              </Field>
              <Field label="Default quality" htmlFor="s-eq">
                <Select id="s-eq" value={settings.exportDefaults.quality} onChange={(e) => set("exportDefaults", { quality: e.target.value as Settings["exportDefaults"]["quality"] })}>
                  <option value="draft">Draft</option>
                  <option value="standard">Standard</option>
                  <option value="high">High</option>
                </Select>
              </Field>
              <label className="flex items-center gap-3">
                <Switch checked={settings.exportDefaults.bleed} onCheckedChange={(v) => set("exportDefaults", { bleed: v })} label="Bleed by default" />
                <span className="text-[13px] text-ink">Include bleed by default</span>
              </label>
              <label className="flex items-center gap-3">
                <Switch checked={settings.exportDefaults.cropMarks} onCheckedChange={(v) => set("exportDefaults", { cropMarks: v })} label="Crop marks by default" />
                <span className="text-[13px] text-ink">Crop marks by default</span>
              </label>
            </div>
          </Card>

          <IntegrationCard />
        </div>
      </div>
    </div>
  );
}

function IntegrationCard() {
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  const status = integrationStatus(settings);
  const [endpoint, setEndpoint] = useState(settings.integration.endpoint);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  return (
    <Card id="indesign">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <ServerCog className="size-4 text-muted" /> Adobe InDesign integration
          </span>
        }
        description="Service boundary prepared for InDesign Server, a UXP plugin, or Adobe's InDesign APIs. Nothing is connected in this demo."
        actions={<Badge tone="neutral" dot>{status.label}</Badge>}
      />
      <div className="space-y-4 p-5">
        <ul className="grid gap-2 sm:grid-cols-3">
          {[
            ["Browser demo mode", true, "Layout, QA and exports run locally"],
            ["InDesign service", false, "Not connected"],
            ["Native .indd / PDF/X generation", false, "Unavailable until a service is configured and verified"],
          ].map(([label, ok, detail]) => (
            <li key={String(label)} className="rounded-lg border border-line p-3">
              <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
                {ok ? <CheckCircle2 className="size-4 text-ok" /> : <CircleSlash className="size-4 text-faint" />} {label}
              </p>
              <p className="mt-1 text-[12px] text-muted">{detail}</p>
            </li>
          ))}
        </ul>
        <div className="grid gap-3 sm:grid-cols-[200px_1fr_auto] sm:items-end">
          <Field label="Integration type" htmlFor="s-mode">
            <Select id="s-mode" value={settings.integration.mode} onChange={(e) => update({ integration: { ...settings.integration, mode: e.target.value as Settings["integration"]["mode"] } })}>
              <option value="browser-demo">Browser demo (no service)</option>
              <option value="indesign-server">InDesign Server</option>
              <option value="uxp-plugin">UXP plugin bridge</option>
            </Select>
          </Field>
          <Field label="Service endpoint" htmlFor="s-endpoint">
            <Input id="s-endpoint" placeholder="https://indesign.internal.example/api" value={endpoint} disabled={settings.integration.mode === "browser-demo"} onChange={(e) => setEndpoint(e.target.value)} />
          </Field>
          <Button
            disabled={settings.integration.mode === "browser-demo" || !endpoint.trim()}
            loading={testing}
            onClick={async () => {
              update({ integration: { ...settings.integration, endpoint: endpoint.trim() } });
              setTesting(true);
              const r = await testConnection(endpoint.trim());
              setResult(r);
              setTesting(false);
              toast(r.ok ? "info" : "error", r.ok ? "Endpoint reachable" : "Connection failed", r.message);
            }}
          >
            {!testing && <Plug />} Test connection
          </Button>
        </div>
        {result && (
          <p className={cn("flex items-center gap-2 rounded-md px-3 py-2 text-[12.5px]", result.ok ? "bg-info-50 text-info" : "bg-err-50 text-err")}>
            {result.ok ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />} {result.message}
          </p>
        )}
        <div className="rounded-lg bg-canvas p-4 text-[12.5px] text-ink-2">
          <p className="font-semibold text-ink">What the integration would do</p>
          <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-muted">
            <li>Receive the handoff manifest (document setup, paragraph styles, frames in points, story threading, image links).</li>
            <li>Build pages from InDesign master spreads and apply paragraph styles instead of local formatting.</li>
            <li>Run an InDesign preflight profile and return findings to the QA screen.</li>
            <li>Export PDF/X-1a / PDF/X-4 and packaged .indd/IDML for designers to finish.</li>
          </ol>
          <p className="mt-2 text-muted">Contract: <code className="rounded bg-white px-1">src/services/indesign.ts</code> → <code className="rounded bg-white px-1">InDesignService</code>.</p>
        </div>
      </div>
    </Card>
  );
}
