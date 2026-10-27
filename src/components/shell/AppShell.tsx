"use client";

import {
  ChevronRight,
  Cloud,
  CloudOff,
  LoaderCircle,
  LogOut,
  MonitorSmartphone,
  RotateCcw,
  Search,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { DEMO_USER, DEMO_USER_ROLE } from "@/data/seed";
import { useFontWatcher, useHydrated, usePublication, useQa } from "@/lib/hooks";
import { NAV, NAV_GROUPS, navFor } from "@/lib/nav";
import { useStore } from "@/lib/store";
import { ROLE_LABEL } from "@/lib/roles";
import { bootWorkspace, seedWorkspace, signOut, useWorkspace } from "@/lib/sync/engine";
import { Button, cn, Modal, TipProvider } from "../ui";
import { useInDesignPolling } from "../export/InDesignPanel";
import { FixHost } from "../qa/FixHost";
import { toast, Toaster } from "./toast";

export function AppShell({ children }: { children: ReactNode }) {
  const hydrated = useHydrated();
  const status = useWorkspace((s) => s.status);
  const pathname = usePathname();
  useFontWatcher();
  useInDesignPolling();

  useEffect(() => {
    if (pathname !== "/login") void bootWorkspace();
  }, [pathname]);

  // Conflicts and rejected edits from the sync engine.
  useEffect(() => {
    let last = 0;
    return useWorkspace.subscribe((s) => {
      for (const n of s.notices) if (n.id > last) toast(n.tone === "error" ? "error" : n.tone === "warning" ? "warning" : "info", n.title, n.description);
      last = s.notices.at(-1)?.id ?? last;
    });
  }, []);

  if (pathname === "/login") {
    return (
      <TipProvider>
        {children}
        <Toaster />
      </TipProvider>
    );
  }
  if (status === "empty" || status === "error") return <WorkspaceGate />;

  if (pathname.startsWith("/proof")) {
    return (
      <TipProvider>
        {hydrated ? children : null}
        <Toaster />
      </TipProvider>
    );
  }

  return (
    <TipProvider>
      <div className="flex h-screen min-h-0 overflow-hidden">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="thin-scroll relative min-h-0 flex-1 overflow-y-auto">{hydrated ? children : <LoadingSkeleton />}</main>
        </div>
      </div>
      {hydrated && <FixHost />}
      <Toaster />
    </TipProvider>
  );
}

/** Server mode: first run (empty workspace) or a load error. */
function WorkspaceGate() {
  const { status, user, error } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const admin = user?.role === "admin";
  return (
    <div className="grid min-h-screen place-items-center bg-canvas p-6">
      <div className="w-full max-w-[460px] rounded-xl border border-line bg-white p-6 shadow-card">
        {status === "error" ? (
          <>
            <h1 className="text-[17px] font-semibold text-ink">Could not load the workspace</h1>
            <p className="mt-2 text-[13px] text-ink-2">{error}</p>
            <Button className="mt-4" onClick={() => location.reload()}>
              Try again
            </Button>
          </>
        ) : (
          <>
            <h1 className="text-[17px] font-semibold text-ink">Set up the PressFlow workspace</h1>
            <p className="mt-2 text-[13px] text-ink-2">
              {admin
                ? "The server database is empty. Start with the sample issue and the built-in templates; you can then build your own issues from them or from a reference magazine in the Design Studio."
                : "The server database is empty. An admin needs to set it up first."}
            </p>
            {err && <p className="mt-3 rounded-md bg-err-50 px-3 py-2 text-[12.5px] text-err">{err}</p>}
            {admin && (
              <Button
                className="mt-4"
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  setErr(null);
                  try {
                    await seedWorkspace();
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : String(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Set up with the sample issue
              </Button>
            )}
          </>
        )}
        <p className="mt-5 border-t border-line pt-3 text-[12px] text-muted">
          Signed in as {user?.email ?? "-"} ·{" "}
          <button className="underline" onClick={() => void signOut()}>
            Sign out
          </button>
        </p>
      </div>
    </div>
  );
}

function SyncStatus() {
  const { sync, org } = useWorkspace();
  const bad = sync.state === "offline" || sync.state === "error";
  const Icon = sync.state === "saving" ? LoaderCircle : bad ? CloudOff : Cloud;
  const label =
    sync.state === "saving"
      ? "Saving…"
      : sync.state === "offline"
        ? "Offline — edits are saved when you reconnect"
        : sync.state === "error"
          ? `Not saved: ${sync.message ?? "server error"}`
          : "All changes saved";
  return (
    <div className="flex items-center gap-2 rounded-md bg-canvas px-2.5 py-2" role="status" aria-live="polite">
      <Icon className={cn("size-4 shrink-0", sync.state === "saving" && "animate-spin", bad ? "text-err" : "text-muted")} />
      <div className="min-w-0 text-[11.5px] leading-tight">
        <p className="truncate font-semibold text-ink-2">{org?.name ?? "Team workspace"}</p>
        <p className={cn("truncate", bad ? "text-err" : "text-muted")} title={label}>
          {label}
        </p>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4 p-8" aria-busy="true" aria-label="Loading workspace">
      <div className="skeleton h-8 w-72 rounded" />
      <div className="grid grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-28 rounded-xl" />
        ))}
      </div>
      <div className="skeleton h-80 rounded-xl" />
    </div>
  );
}

function Sidebar() {
  const pathname = usePathname();
  const hydrated = useHydrated();
  const [confirmReset, setConfirmReset] = useState(false);
  const resetDemo = useStore((s) => s.resetDemo);
  const router = useRouter();
  const serverMode = useWorkspace((s) => s.setup?.mode === "server");
  return (
    <aside className="flex w-[244px] shrink-0 flex-col border-r border-line bg-white max-lg:w-[68px]">
      <Link href="/" className="flex h-14 items-center gap-2.5 border-b border-line px-4">
        <span className="grid size-8 place-items-center rounded-lg bg-[#13203d] text-white">
          <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 4h9a5 5 0 0 1 0 10H9v6H5z" />
            <path d="M9 9h5" strokeOpacity=".55" />
          </svg>
        </span>
        <span className="leading-tight max-lg:hidden">
          <span className="block text-[14.5px] font-semibold tracking-tight text-ink">PressFlow AI</span>
          <span className="block text-[11px] text-muted">by Elets Technomedia</span>
        </span>
      </Link>

      <nav className="thin-scroll flex-1 overflow-y-auto px-2.5 py-3" aria-label="Main">
        {NAV_GROUPS.map((g) => (
          <div key={g.id} className={cn(g.id !== "overview" && "mt-3")}>
            {g.label && <p className="px-2.5 pb-1 text-[10.5px] font-semibold tracking-wider text-faint uppercase max-lg:hidden">{g.label}</p>}
            <ul className="space-y-0.5">
              {NAV.filter((n) => n.group === g.id).map((item) => {
                const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13.5px] font-medium transition-colors",
                        active ? "bg-brand-50 text-brand" : "text-ink-2 hover:bg-canvas hover:text-ink",
                      )}
                      title={item.description}
                    >
                      <Icon className={cn("size-[17px] shrink-0", active ? "text-brand" : "text-muted")} />
                      <span className="truncate max-lg:hidden">{item.label}</span>
                      {item.href === "/qa" && hydrated && <QaCount />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {serverMode ? (
        <div className="border-t border-line p-3 max-lg:hidden">
          <SyncStatus />
        </div>
      ) : (
      <div className="space-y-2 border-t border-line p-3 max-lg:hidden">
        <div className="flex items-center gap-2 rounded-md bg-canvas px-2.5 py-2">
          <MonitorSmartphone className="size-4 text-muted" />
          <div className="min-w-0 text-[11.5px] leading-tight">
            <p className="font-semibold text-ink-2">Browser demo mode</p>
            <p className="text-muted">InDesign service not connected</p>
          </div>
        </div>
        <button
          onClick={() => setConfirmReset(true)}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[12.5px] text-muted hover:bg-canvas hover:text-ink"
        >
          <RotateCcw className="size-3.5" /> Reset demo data
        </button>
      </div>
      )}
      <Modal
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset demo data?"
        description="Restores the sample publication, articles, templates and settings. Your uploads, edits and export history in this browser will be cleared."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                resetDemo();
                setConfirmReset(false);
                router.push("/");
                toast("success", "Demo data restored", "Tech Maha Impact — May 2026 is back to its starting state.");
              }}
            >
              <RotateCcw /> Reset
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-ink-2">This only affects data stored in this browser (localStorage).</p>
      </Modal>
    </aside>
  );
}

function QaCount() {
  const { summary } = useQa();
  if (!summary.errors && !summary.warnings) return null;
  return (
    <span className={cn("ml-auto rounded-full px-1.5 text-[11px] font-semibold max-lg:hidden", summary.errors ? "bg-err-50 text-err" : "bg-warn-50 text-warn")}>
      {summary.errors + summary.warnings}
    </span>
  );
}

function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const hydrated = useHydrated();
  const pub = usePublication();
  const nav = navFor(pathname);
  const user = useWorkspace((s) => s.user);
  const [q, setQ] = useState("");
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-line bg-white px-5">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[13px]">
        <span className="truncate text-muted max-md:hidden">{hydrated && pub ? `${pub.title} — ${pub.issueLabel}` : "Loading…"}</span>
        <ChevronRight className="size-3.5 shrink-0 text-faint max-md:hidden" />
        <span className="truncate font-semibold text-ink">{nav?.label ?? "Workspace"}</span>
      </nav>
      <form
        className="relative ml-auto w-full max-w-[300px] max-md:hidden"
        onSubmit={(e) => {
          e.preventDefault();
          router.push(`/content?q=${encodeURIComponent(q)}`);
        }}
      >
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-faint" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search content…"
          aria-label="Search content library"
          className="h-8 w-full rounded-md border border-line bg-canvas pr-3 pl-8 text-[13px] placeholder:text-faint focus:border-brand focus:bg-white focus:outline-none"
        />
      </form>
      <div className="flex items-center gap-2.5 border-l border-line pl-4">
        {user?.picture ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.picture} alt="" referrerPolicy="no-referrer" className="size-8 rounded-full" />
        ) : (
          <span className="grid size-8 place-items-center rounded-full bg-[#e8edf8] text-[12px] font-semibold text-brand">{initials(user?.name ?? DEMO_USER)}</span>
        )}
        <span className="leading-tight max-xl:hidden">
          <span className="block text-[12.5px] font-semibold text-ink">{user?.name ?? DEMO_USER}</span>
          <span className="block text-[11px] text-muted">{user ? ROLE_LABEL[user.role] : DEMO_USER_ROLE}</span>
        </span>
        {user && (
          <button className="rounded p-1.5 text-muted hover:bg-canvas hover:text-ink" aria-label="Sign out" title="Sign out" onClick={() => void signOut()}>
            <LogOut className="size-4" />
          </button>
        )}
      </div>
    </header>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
