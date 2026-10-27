"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { ROLES, ROLE_LABEL, type Role } from "@/lib/roles";
import type { ServerSetup } from "@/lib/sync/collections";

export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}

function Login() {
  const q = useSearchParams();
  const next = q.get("next") ?? "/";
  const [setup, setSetup] = useState<ServerSetup | null>(null);
  const [error, setError] = useState<string | null>(q.get("error"));
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("admin");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/session", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { setup: ServerSetup; user: unknown }) => {
        if (j.setup.mode === "demo" || j.user) location.replace(next);
        else setSetup(j.setup);
      })
      .catch(() => setError("The server is not reachable."));
  }, [next]);

  return (
    <div className="grid min-h-screen place-items-center bg-canvas p-6">
      <div className="w-full max-w-[400px] rounded-xl border border-line bg-white p-7 shadow-card">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-lg bg-[#13203d] text-white">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 4h9a5 5 0 0 1 0 10H9v6H5z" />
              <path d="M9 9h5" strokeOpacity=".55" />
            </svg>
          </span>
          <div className="leading-tight">
            <p className="text-[15px] font-semibold text-ink">PressFlow AI</p>
            <p className="text-[11.5px] text-muted">Elets Technomedia</p>
          </div>
        </div>
        <h1 className="mt-6 text-[18px] font-semibold text-ink">Sign in</h1>
        <p className="mt-1 text-[13px] text-ink-2">Use your company Google Workspace account{setup?.auth.allowedDomains.length ? ` (${setup.auth.allowedDomains.map((d) => "@" + d).join(", ")})` : ""}.</p>

        {error && (
          <p role="alert" className="mt-4 rounded-md bg-err-50 px-3 py-2 text-[12.5px] text-err">
            {error}
          </p>
        )}
        {setup && setup.missing.length > 0 && (
          <p className="mt-4 rounded-md bg-warn-50 px-3 py-2 text-[12.5px] text-warn">Server setup incomplete: {setup.missing.join(", ")}.</p>
        )}

        {setup?.auth.google && (
          <a
            href={`/api/auth/google?next=${encodeURIComponent(next)}`}
            className="mt-5 flex h-10 w-full items-center justify-center gap-2.5 rounded-md border border-line bg-white text-[13.5px] font-medium text-ink hover:bg-canvas"
          >
            <svg viewBox="0 0 48 48" className="size-[18px]" aria-hidden>
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
              <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
            </svg>
            Continue with Google
          </a>
        )}

        {setup?.auth.devLogin && (
          <form
            className="mt-5 space-y-2.5 rounded-lg border border-dashed border-line p-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
              try {
                const r = await fetch("/api/auth/dev", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, role }) });
                const j = await r.json();
                if (!r.ok) throw new Error(j.error ?? "Sign-in failed");
                location.replace(next);
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
                setBusy(false);
              }
            }}
          >
            <p className="text-[11.5px] font-semibold tracking-wide text-muted uppercase">Local development sign-in</p>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@elets.in"
              aria-label="Email"
              className="h-9 w-full rounded-md border border-line px-3 text-[13px] focus:border-brand focus:outline-none"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              aria-label="Role"
              className="h-9 w-full rounded-md border border-line bg-white px-2 text-[13px]"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
            <Button type="submit" className="w-full" loading={busy}>
              Sign in (development)
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
