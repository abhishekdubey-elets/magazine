"use client";

import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useEffect } from "react";
import { create } from "zustand";
import { storageEvents } from "@/lib/store";
import { cn } from "../ui";

type ToastTone = "success" | "error" | "warning" | "info";
interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
}

const useToasts = create<{ toasts: Toast[] }>(() => ({ toasts: [] }));
let n = 0;

export function toast(tone: ToastTone, title: string, description?: string) {
  const id = ++n;
  useToasts.setState((s) => ({ toasts: [...s.toasts.slice(-3), { id, tone, title, description }] }));
  setTimeout(() => useToasts.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), tone === "error" ? 7000 : 4200);
}

const icons = { success: CheckCircle2, error: XCircle, warning: AlertTriangle, info: Info };
const colors = { success: "text-ok", error: "text-err", warning: "text-warn", info: "text-brand" };

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  useEffect(() => {
    const onErr = () => toast("error", "Couldn't save demo state", "Browser storage is full or unavailable. Remove large uploaded images or reset demo data.");
    storageEvents.addEventListener("error", onErr);
    return () => storageEvents.removeEventListener("error", onErr);
  }, []);
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[70] flex w-[360px] flex-col gap-2" aria-live="polite">
      {toasts.map((t) => {
        const Icon = icons[t.tone];
        return (
          <div key={t.id} className="pointer-events-auto flex items-start gap-3 rounded-lg border border-line bg-white p-3 shadow-pop">
            <Icon className={cn("mt-0.5 size-4 shrink-0", colors[t.tone])} />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-ink">{t.title}</p>
              {t.description && <p className="mt-0.5 text-[12.5px] text-muted">{t.description}</p>}
            </div>
            <button aria-label="Dismiss" className="text-faint hover:text-ink" onClick={() => useToasts.setState((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) }))}>
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
