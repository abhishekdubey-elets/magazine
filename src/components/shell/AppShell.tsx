"use client";

import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Circle,
  CircleDot,
  Compass,
  MonitorSmartphone,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { create } from "zustand";
import { DEMO_USER, DEMO_USER_ROLE } from "@/data/seed";
import { GUIDE_STEPS } from "@/lib/guide";
import { useFontWatcher, useHydrated, usePublication, useQa } from "@/lib/hooks";
import { NAV, navFor } from "@/lib/nav";
import { useStore } from "@/lib/store";
import { Badge, Button, cn, Modal, TipProvider } from "../ui";
import { FixHost } from "../qa/FixHost";
import { toast, Toaster } from "./toast";

/** Routes visited in this browser session (for guide step detection). */
export const useVisited = create<{ visited: string[] }>(() => ({ visited: [] }));

export function AppShell({ children }: { children: ReactNode }) {
  const hydrated = useHydrated();
  const pathname = usePathname();
  useFontWatcher();

  useEffect(() => {
    useVisited.setState((s) => (s.visited.includes(pathname) ? s : { visited: [...s.visited, pathname] }));
  }, [pathname]);

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
      {hydrated && <GuidePanel />}
      {hydrated && <FixHost />}
      <Toaster />
    </TipProvider>
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
        <p className="px-2.5 pb-1.5 text-[11px] font-semibold tracking-wider text-faint uppercase max-lg:hidden">Workspace</p>
        <ul className="space-y-0.5">
          {NAV.map((item, i) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                {i === 3 && <div className="mx-2.5 my-2 border-t border-line" />}
                {i === 8 && <div className="mx-2.5 my-2 border-t border-line" />}
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13.5px] font-medium transition-colors",
                    active ? "bg-brand-50 text-brand" : "text-ink-2 hover:bg-canvas hover:text-ink",
                  )}
                  title={item.label}
                >
                  <Icon className={cn("size-[17px] shrink-0", active ? "text-brand" : "text-muted")} />
                  <span className="truncate max-lg:hidden">{item.label}</span>
                  {item.href === "/qa" && hydrated && <QaCount />}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

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
                useVisited.setState({ visited: [] });
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
  const setGuide = useStore((s) => s.setGuide);
  const guideOpen = useStore((s) => s.guide.open);
  const [q, setQ] = useState("");
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-line bg-white px-5">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[13px]">
        <span className="truncate text-muted max-md:hidden">{hydrated ? `${pub.title} — ${pub.issueLabel}` : "Tech Maha Impact — May 2026"}</span>
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
      <Button
        size="sm"
        variant={guideOpen ? "subtle" : "secondary"}
        onClick={() => setGuide(guideOpen ? { open: false } : { open: true, startedAt: useStore.getState().guide.startedAt ?? new Date().toISOString() })}
      >
        <Compass /> Guided demo
      </Button>
      <div className="flex items-center gap-2.5 border-l border-line pl-4">
        <span className="grid size-8 place-items-center rounded-full bg-[#e8edf8] text-[12px] font-semibold text-brand">SK</span>
        <span className="leading-tight max-xl:hidden">
          <span className="block text-[12.5px] font-semibold text-ink">{DEMO_USER}</span>
          <span className="block text-[11px] text-muted">{DEMO_USER_ROLE}</span>
        </span>
      </div>
    </header>
  );
}

function GuidePanel() {
  const guide = useStore((s) => s.guide);
  const setGuide = useStore((s) => s.setGuide);
  const state = useStore();
  const visited = useVisited((s) => s.visited);
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  if (!guide.open) return null;
  const done = GUIDE_STEPS.map((s) => s.done(state, visited));
  const current = done.findIndex((d) => !d);
  const complete = current === -1;
  return (
    <div className="fixed bottom-4 left-[260px] z-[55] w-[340px] rounded-xl border border-line bg-white shadow-pop max-lg:left-[84px]" role="dialog" aria-label="Guided demo">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <Compass className="size-4 text-brand" />
        <p className="text-[13px] font-semibold text-ink">Guided demo</p>
        <Badge tone={complete ? "ok" : "brand"}>
          {done.filter(Boolean).length}/{GUIDE_STEPS.length}
        </Badge>
        <button className="ml-auto rounded p-1 text-muted hover:bg-canvas" aria-label={collapsed ? "Expand" : "Collapse"} onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
        <button className="rounded p-1 text-muted hover:bg-canvas" aria-label="Close guided demo" onClick={() => setGuide({ open: false })}>
          <X className="size-4" />
        </button>
      </div>
      {!collapsed && (
        <ol className="thin-scroll max-h-[52vh] overflow-y-auto p-2">
          {GUIDE_STEPS.map((s, i) => {
            const active = i === current;
            return (
              <li key={s.title} className={cn("rounded-lg px-2.5 py-2", active && "bg-brand-50")}>
                <div className="flex items-start gap-2.5">
                  {done[i] ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" />
                  ) : active ? (
                    <CircleDot className="mt-0.5 size-4 shrink-0 text-brand" />
                  ) : (
                    <Circle className="mt-0.5 size-4 shrink-0 text-faint" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-[13px] font-medium", done[i] ? "text-muted line-through decoration-faint" : "text-ink")}>
                      {i + 1}. {s.title}
                    </p>
                    {active && (
                      <>
                        <p className="mt-1 text-[12.5px] leading-snug text-ink-2">{s.body}</p>
                        <Button size="sm" variant="primary" className="mt-2" onClick={() => router.push(s.href)}>
                          {s.cta}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
          {complete && (
            <li className="px-2.5 py-3 text-center">
              <p className="text-[13px] font-semibold text-ok">Walkthrough complete</p>
              <Button size="sm" variant="ghost" className="mt-1" onClick={() => setGuide({ startedAt: new Date().toISOString() })}>
                Restart checks
              </Button>
            </li>
          )}
        </ol>
      )}
    </div>
  );
}
