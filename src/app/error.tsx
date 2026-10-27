"use client";

import { useEffect, useState } from "react";
import { STORAGE_KEY } from "@/lib/store";

/** A new deployment replaced the code this tab was running (old chunks are gone). */
const isStaleBuild = (e: Error) => e.name === "ChunkLoadError" || /Loading (CSS )?chunk|Failed to fetch dynamically imported module/i.test(e.message);

/**
 * Screen-level error boundary: shows what went wrong instead of a blank page,
 * reloads once after a new deployment, and lets demo users clear this browser's data.
 */
export default function ErrorScreen({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    console.error(error);
    try {
      if (isStaleBuild(error) && !sessionStorage.getItem("pf-reloaded")) {
        sessionStorage.setItem("pf-reloaded", "1");
        location.reload();
      }
    } catch {
      /* storage unavailable */
    }
  }, [error]);

  return (
    <div className="mx-auto max-w-[560px] p-8">
      <div className="rounded-xl border border-line bg-white p-6 shadow-card">
        <h1 className="text-[17px] font-semibold text-ink">This screen could not be shown</h1>
        <p className="mt-2 text-[13px] text-ink-2">
          {isStaleBuild(error) ? "PressFlow was updated while this tab was open. Reload to get the new version." : "Something in the data on this screen did not load as expected. Your other screens still work."}
        </p>
        <pre className="mt-3 max-h-40 overflow-auto rounded-md bg-canvas p-3 text-[11.5px] whitespace-pre-wrap text-ink-2">
          {error.message || String(error)}
          {error.digest ? `\n(ref ${error.digest})` : ""}
        </pre>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="h-9 rounded-md bg-brand px-3.5 text-[13px] font-medium text-white" onClick={() => location.reload()}>
            Reload
          </button>
          <button className="h-9 rounded-md border border-line px-3.5 text-[13px] font-medium text-ink" onClick={() => reset()}>
            Try again
          </button>
          {!confirm ? (
            <button className="h-9 rounded-md px-3.5 text-[13px] text-muted hover:text-ink" onClick={() => setConfirm(true)}>
              Reset demo data in this browser…
            </button>
          ) : (
            <button
              className="h-9 rounded-md bg-err px-3.5 text-[13px] font-medium text-white"
              onClick={() => {
                try {
                  localStorage.removeItem(STORAGE_KEY);
                } catch {
                  /* ignore */
                }
                location.href = "/";
              }}
            >
              Confirm: clear this browser&apos;s demo data
            </button>
          )}
        </div>
        <p className="mt-3 text-[11.5px] text-muted">Resetting only affects the browser demo (data saved in this browser). Team workspaces on the server are not touched.</p>
      </div>
    </div>
  );
}
