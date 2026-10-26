"use client";

import { CheckCircle2, CircleSlash, Plug, ServerCog, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/common";
import { toast } from "@/components/shell/toast";
import { Badge, Button, Card, CardHeader, Field, Input, Select, Switch, cn } from "@/components/ui";
import { ink, paragraphStyles } from "@/lib/design-tokens";
import { fontDisplayNames, fontFamilies } from "@/lib/fonts";
import { useStore } from "@/lib/store";
import { DEFAULT_FONT_FAMILIES } from "@/lib/indesign/build-manifest";
import type { ExportFormat, FontRole, Settings } from "@/lib/types";
import { fetchReadiness, integrationState, PDF_PRESETS, testServer, type ServerReadiness } from "@/services/indesign";

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
  const integ = settings.integration;
  const setInteg = (patch: Partial<Settings["integration"]>) => update({ integration: { ...integ, ...patch } });
  const [server, setServer] = useState<ServerReadiness | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [testing, setTesting] = useState(false);
  const [checks, setChecks] = useState<{ name: string; ok: boolean; detail: string }[] | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const state = integrationState(settings, server);

  useEffect(() => {
    void fetchReadiness().then((r) => {
      setServer(r);
      setLoaded(true);
    });
  }, []);

  const rows: [string, boolean | undefined, string][] = [
    ["Adobe credentials", server?.adobe, "ADOBE_CLIENT_ID · ADOBE_CLIENT_SECRET (OAuth Server-to-Server, InDesign API)"],
    ["S3 input storage", server?.storage, "S3_BUCKET · S3_REGION · S3_ACCESS_KEY_ID · S3_SECRET_ACCESS_KEY"],
    ["Access key", server?.apiKey, "PRESSFLOW_API_KEY — protects the paid InDesign routes"],
  ];

  return (
    <Card id="indesign">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <ServerCog className="size-4 text-muted" /> Adobe InDesign integration
          </span>
        }
        description="Print-ready output is produced by Adobe InDesign in the cloud (InDesign API): real paragraph styles, InDesign composition, Adobe preflight and PDF/X export."
        actions={<Badge tone={state.usable ? "ok" : "neutral"} dot>{state.usable ? "Ready" : integ.mode === "adobe-indesign-api" ? "Needs setup" : "Browser demo mode"}</Badge>}
      />
      <div className="space-y-5 p-5">
        <Field label="Output engine" htmlFor="s-mode">
          <Select id="s-mode" value={integ.mode === "adobe-indesign-api" ? "adobe-indesign-api" : "browser-demo"} onChange={(e) => setInteg({ mode: e.target.value as Settings["integration"]["mode"] })}>
            <option value="browser-demo">Browser only (proofs, no InDesign)</option>
            <option value="adobe-indesign-api">Adobe InDesign API (cloud) — print PDF/X, INDD, IDML</option>
          </Select>
        </Field>

        <div>
          <p className="mb-2 text-[12.5px] font-medium text-ink-2">Server configuration {loaded ? "" : "(checking…)"}</p>
          <ul className="grid gap-2 sm:grid-cols-3">
            {rows.map(([label, ok, detail]) => (
              <li key={label} className="rounded-lg border border-line p-3">
                <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
                  {ok ? <CheckCircle2 className="size-4 text-ok" /> : <CircleSlash className="size-4 text-faint" />} {label}
                </p>
                <p className="mt-1 text-[11.5px] text-muted">{detail}</p>
              </li>
            ))}
          </ul>
          {server && !server.ready && <p className="mt-2 text-[12px] text-warn">Missing on the server: {server.missing.join(", ")}. Add them in Vercel → Settings → Environment Variables and redeploy.</p>}
          {!server && loaded && <p className="mt-2 text-[12px] text-err">Could not reach /api/indesign/status.</p>}
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field label="PressFlow access key" htmlFor="s-key" hint="The PRESSFLOW_API_KEY value. Kept in this browser only and sent with InDesign requests.">
            <Input id="s-key" type="password" autoComplete="off" value={integ.accessKey ?? ""} onChange={(e) => setInteg({ accessKey: e.target.value })} />
          </Field>
          <Button
            disabled={!server?.ready || !integ.accessKey}
            loading={testing}
            onClick={async () => {
              setTesting(true);
              setTestError(null);
              setChecks(null);
              try {
                const r = await testServer(integ.accessKey ?? "");
                setChecks(r.checks);
                toast(r.ok ? "success" : "warning", r.ok ? "InDesign API connected" : "Some checks failed", r.checks.filter((c) => !c.ok).map((c) => c.name).join(", ") || undefined);
              } catch (e) {
                setTestError(e instanceof Error ? e.message : String(e));
              } finally {
                setTesting(false);
              }
            }}
          >
            {!testing && <Plug />} Test connection
          </Button>
        </div>
        {testError && (
          <p className="flex items-center gap-2 rounded-md bg-err-50 px-3 py-2 text-[12.5px] text-err">
            <XCircle className="size-4" /> {testError}
          </p>
        )}
        {checks && (
          <ul className="space-y-1.5">
            {checks.map((c) => (
              <li key={c.name} className={cn("flex items-start gap-2 rounded-md px-3 py-2 text-[12.5px]", c.ok ? "bg-ok-50 text-ok" : "bg-err-50 text-err")}>
                {c.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <XCircle className="mt-0.5 size-4 shrink-0" />}
                <span>
                  <b>{c.name}:</b> {c.detail}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="PDF export preset" htmlFor="s-preset" hint="Bleed and crop marks are always added.">
            <Select id="s-preset" value={integ.pdfPreset ?? PDF_PRESETS[0]} onChange={(e) => setInteg({ pdfPreset: e.target.value })}>
              {PDF_PRESETS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </Select>
          </Field>
          <Field label="Page preview resolution" htmlFor="s-jpeg">
            <Select id="s-jpeg" value={integ.jpegResolution ?? 72} onChange={(e) => setInteg({ jpegResolution: Number(e.target.value) })}>
              <option value={72}>72 ppi (screen)</option>
              <option value={150}>150 ppi</option>
              <option value={300}>300 ppi (print check)</option>
            </Select>
          </Field>
          <Field label="Preflight profile" htmlFor="s-preflight" hint="An InDesign preflight profile name.">
            <Input id="s-preflight" value={integ.preflightProfile ?? "[Basic]"} onChange={(e) => setInteg({ preflightProfile: e.target.value })} />
          </Field>
        </div>

        <div>
          <p className="text-[12.5px] font-medium text-ink-2">Fonts in InDesign</p>
          <p className="mt-0.5 text-[12px] text-muted">
            Family name InDesign uses for each type role. Upload the matching licensed OTF/TTF files to the bucket&apos;s <code className="rounded bg-canvas px-1">pressflow/fonts/</code> folder — they travel with every job. Missing fonts are reported after each build.
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-5">
            {(Object.keys(DEFAULT_FONT_FAMILIES) as FontRole[]).map((role) => (
              <Field key={role} label={ROLE_LABEL[role]} htmlFor={`s-font-${role}`}>
                <Input
                  id={`s-font-${role}`}
                  placeholder={DEFAULT_FONT_FAMILIES[role]}
                  value={integ.fontFamilies?.[role] ?? ""}
                  onChange={(e) => setInteg({ fontFamilies: { ...integ.fontFamilies, [role]: e.target.value } })}
                />
              </Field>
            ))}
          </div>
        </div>

        <div className="rounded-lg bg-canvas p-4 text-[12.5px] text-ink-2">
          <p className="font-semibold text-ink">One-time setup</p>
          <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-muted">
            <li>Adobe Developer Console: create a project, add <b>InDesign API</b> (Firefly Services) with OAuth Server-to-Server credentials.</li>
            <li>AWS: create an S3 bucket and an IAM user with read/write access to it.</li>
            <li>Vercel → Environment Variables: the Adobe and S3 values above, plus a long random <code className="rounded bg-white px-1">PRESSFLOW_API_KEY</code>. Redeploy.</li>
            <li>Upload your licensed fonts to <code className="rounded bg-white px-1">pressflow/fonts/</code> in the bucket.</li>
            <li>Enter the access key here and click <b>Test connection</b>. The build script registers itself with Adobe on the first job.</li>
          </ol>
        </div>
      </div>
    </Card>
  );
}

const ROLE_LABEL: Record<FontRole, string> = { body: "Body", headline: "Headlines", display: "Display", serif: "Serif", sans: "Interface sans" };
