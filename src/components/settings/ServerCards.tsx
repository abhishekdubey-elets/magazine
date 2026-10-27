"use client";

import { CheckCircle2, CircleSlash, FileType2, ShieldCheck, Trash2, Upload, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fmtBytes, fmtDateTime } from "@/components/common";
import { toast } from "@/components/shell/toast";
import { Badge, Button, Card, CardHeader, cn, Select } from "@/components/ui";
import { useLayoutContext } from "@/lib/hooks";
import { ROLE_HELP, ROLE_LABEL, ROLES, type Role } from "@/lib/roles";
import { useStore } from "@/lib/store";
import { useCan, useWorkspace } from "@/lib/sync/engine";
import { makeManifest } from "@/services/indesign";

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  return body as T;
}

/* ------------------------------------------------------------------ team */

interface Person {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  role: Role;
  disabled: boolean;
  lastLoginAt: string | null;
}

interface AuditEntry {
  id: number;
  userEmail: string | null;
  entity: string;
  entityId: string;
  action: string;
  summary: string | null;
  at: string;
}

export function TeamCard() {
  const me = useWorkspace((s) => s.user);
  const admin = useCan("manage-team");
  const [people, setPeople] = useState<Person[] | null>(null);
  const [pinned, setPinned] = useState<string[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const t = await json<{ people: Person[]; adminEmails: string[] }>(await fetch("/api/team", { cache: "no-store" }));
      setPeople(t.people);
      setPinned(t.adminEmails);
      const a = await json<{ entries: AuditEntry[] }>(await fetch("/api/audit?limit=30", { cache: "no-store" }));
      setAudit(a.entries);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => void load(), [load]);

  const patch = async (p: Person, body: { role?: Role; disabled?: boolean }) => {
    try {
      await json(await fetch(`/api/team/${p.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
      toast("success", body.role ? `${p.name ?? p.email} is now ${ROLE_LABEL[body.role]}` : body.disabled ? `${p.email} suspended` : `${p.email} restored`);
      void load();
    } catch (e) {
      toast("error", "Not changed", e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Card id="team">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Users className="size-4 text-muted" /> Team & roles
          </span>
        }
        description="People appear here after their first Google Workspace sign-in. Roles are enforced by the server."
      />
      <div className="space-y-5 p-5">
        {error && <p className="rounded-md bg-err-50 px-3 py-2 text-[12.5px] text-err">{error}</p>}
        <ul className="grid gap-2 sm:grid-cols-5">
          {ROLES.map((r) => (
            <li key={r} className="rounded-lg border border-line p-2.5">
              <p className="text-[12.5px] font-semibold text-ink">{ROLE_LABEL[r]}</p>
              <p className="mt-0.5 text-[11.5px] leading-snug text-muted">{ROLE_HELP[r]}</p>
            </li>
          ))}
        </ul>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[11.5px] text-muted uppercase">
                <th className="py-2 font-semibold">Person</th>
                <th className="py-2 font-semibold">Role</th>
                <th className="py-2 font-semibold">Last sign-in</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {(people ?? []).map((p) => {
                const self = p.id === me?.id;
                const locked = !admin || self || pinned.includes(p.email);
                return (
                  <tr key={p.id} className={cn("border-b border-line/70", p.disabled && "opacity-55")}>
                    <td className="py-2 pr-3">
                      <p className="font-medium text-ink">
                        {p.name ?? p.email} {self && <span className="text-[11.5px] text-muted">(you)</span>}
                      </p>
                      <p className="text-[12px] text-muted">{p.email}</p>
                    </td>
                    <td className="py-2 pr-3">
                      <Select aria-label={`Role of ${p.email}`} value={p.role} disabled={locked || p.disabled} onChange={(e) => void patch(p, { role: e.target.value as Role })} className="h-8 w-[150px] text-[12.5px]">
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </Select>
                      {pinned.includes(p.email) && <p className="mt-0.5 text-[11px] text-muted">Admin via ADMIN_EMAILS</p>}
                    </td>
                    <td className="py-2 pr-3 text-[12px] text-muted">{p.lastLoginAt ? fmtDateTime(p.lastLoginAt) : "—"}</td>
                    <td className="py-2 text-right">
                      {!locked && (
                        <Button size="sm" variant="ghost" onClick={() => void patch(p, { disabled: !p.disabled })}>
                          {p.disabled ? "Restore" : "Suspend"}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {people === null && !error && <p className="py-3 text-[12.5px] text-muted">Loading…</p>}
        </div>
        {audit.length > 0 && (
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-2">
              <ShieldCheck className="size-4 text-muted" /> Audit trail (latest 30)
            </p>
            <ul className="thin-scroll max-h-[260px] space-y-1 overflow-y-auto rounded-lg border border-line p-2.5 text-[12px]">
              {audit.map((a) => (
                <li key={a.id} className="flex gap-2">
                  <span className="w-[128px] shrink-0 text-muted">{fmtDateTime(a.at)}</span>
                  <span className="min-w-0 text-ink-2">
                    <span className="font-medium text-ink">{a.userEmail ?? "system"}</span> · {a.action} {a.entity}
                    {a.summary ? ` — ${a.summary}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

/* ----------------------------------------------------------------- fonts */

interface FontFile {
  key: string;
  name: string;
  size: number;
  faces: { family: string; style: string; postscriptName?: string; fullName?: string; variable?: boolean }[];
  error?: string | null;
}

const norm = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, "");

export function FontsCard() {
  const canManage = useCan("manage-fonts");
  const [files, setFiles] = useState<FontFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const ctx = useLayoutContext();
  const uploads = useStore((s) => s.uploads);
  const settings = useStore((s) => s.settings);

  const load = useCallback(async () => {
    try {
      setFiles((await json<{ files: FontFile[] }>(await fetch("/api/fonts", { cache: "no-store" }))).files);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => void load(), [load]);

  // The family + style pairs the current issue will ask InDesign for.
  const required = useMemo(() => {
    try {
      return makeManifest(ctx, uploads, ctx.pages.map((p) => p.number), settings).fonts;
    } catch {
      return [];
    }
  }, [ctx, uploads, settings]);
  const have = useMemo(() => {
    const s = new Set<string>();
    for (const f of files ?? []) for (const face of f.faces) s.add(`${norm(face.family)}|${norm(face.style)}`);
    return s;
  }, [files]);
  const missing = required.filter((r) => !have.has(`${norm(r.family)}|${norm(r.fontStyle)}`));

  const upload = async (list: FileList) => {
    for (const file of Array.from(list)) {
      setBusy(file.name);
      try {
        const { upload } = await json<{ upload: { url: string; method: string; headers: Record<string, string> } }>(
          await fetch("/api/fonts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: file.name, size: file.size }) }),
        );
        const put = await fetch(upload.url, { method: upload.method, headers: upload.headers, body: file });
        if (!put.ok) throw new Error(`Storage refused ${file.name} (${put.status})`);
      } catch (e) {
        toast("error", `Could not upload ${file.name}`, e instanceof Error ? e.message : String(e));
      }
    }
    setBusy(null);
    await load();
  };

  return (
    <Card id="fonts">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <FileType2 className="size-4 text-muted" /> Licensed fonts for InDesign
          </span>
        }
        description="Every job sends these files to Adobe InDesign. Print builds are refused if a style the layout uses is missing — InDesign never substitutes."
        actions={<Badge tone={files && !missing.length && files.length ? "ok" : "warn"} dot>{files ? (missing.length ? `${missing.length} missing` : files.length ? "Complete" : "No fonts") : "…"}</Badge>}
      />
      <div className="space-y-5 p-5">
        {error && <p className="rounded-md bg-err-50 px-3 py-2 text-[12.5px] text-err">{error}</p>}
        <div>
          <p className="mb-2 text-[12.5px] font-medium text-ink-2">Styles used by “{ctx.publication.title}”</p>
          <ul className="flex flex-wrap gap-1.5">
            {required.map((r) => {
              const ok = have.has(`${norm(r.family)}|${norm(r.fontStyle)}`);
              return (
                <li key={`${r.family}|${r.fontStyle}`} className={cn("flex items-center gap-1 rounded-md border px-2 py-1 text-[12px]", ok ? "border-ok/30 bg-ok-50 text-ink" : "border-err/30 bg-err-50 text-err")}>
                  {ok ? <CheckCircle2 className="size-3.5 text-ok" /> : <CircleSlash className="size-3.5" />} {r.family} {r.fontStyle}
                </li>
              );
            })}
          </ul>
          {missing.length > 0 && <p className="mt-2 text-[12px] text-ink-2">Upload the licensed OTF/TTF files for the missing styles, or map the roles to fonts you have under InDesign integration → font families.</p>}
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[12.5px] font-medium text-ink-2">Font files {files ? `(${files.length})` : ""}</p>
            {canManage && (
              <>
                <input ref={input} type="file" multiple accept=".otf,.ttf,.ttc,.otc" className="hidden" aria-label="Choose font files" onChange={(e) => e.target.files && void upload(e.target.files).finally(() => (e.target.value = ""))} />
                <Button size="sm" variant="secondary" loading={!!busy} onClick={() => input.current?.click()}>
                  {!busy && <Upload />} {busy ? `Uploading ${busy}…` : "Upload fonts"}
                </Button>
              </>
            )}
          </div>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {(files ?? []).map((f) => (
              <li key={f.key} className="flex items-start gap-3 px-3 py-2 text-[12.5px]">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">
                    {f.name} <span className="font-normal text-muted">· {fmtBytes(f.size)}</span>
                  </p>
                  {f.error ? (
                    <p className="text-err">{f.error}</p>
                  ) : (
                    <p className="text-muted">{[...new Set(f.faces.map((x) => `${x.family} ${x.style}${x.variable ? " (variable)" : ""}`))].join(" · ")}</p>
                  )}
                </div>
                {canManage && (
                  <button
                    className="rounded p-1 text-muted hover:bg-canvas hover:text-err"
                    aria-label={`Remove ${f.name}`}
                    onClick={async () => {
                      if (!confirm(`Remove ${f.name}? Builds that use it will be blocked.`)) return;
                      try {
                        await json(await fetch(`/api/fonts?name=${encodeURIComponent(f.name)}`, { method: "DELETE" }));
                        await load();
                      } catch (e) {
                        toast("error", "Not removed", e instanceof Error ? e.message : String(e));
                      }
                    }}
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </li>
            ))}
            {files?.length === 0 && <li className="px-3 py-3 text-[12.5px] text-muted">No font files yet.</li>}
          </ul>
        </div>
      </div>
    </Card>
  );
}
