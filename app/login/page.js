"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Wordmark from "@/components/Wordmark";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Sign-in failed.");
      }
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-[400px] fade-in">
        <div className="mb-8">
          <Wordmark />
          <p className="mt-4 text-[13px] text-slate1 leading-relaxed">
            Trade-mirror forensics for Lebanese customs. Restricted access — sign in
            with the credentials issued to you.
          </p>
        </div>

        <form onSubmit={onSubmit} className="rounded-xl border border-rule bg-bone shadow-card p-7 space-y-5">
          <div>
            <label htmlFor="username" className="eyebrow block mb-2">
              Username
            </label>
            <input
              id="username"
              name="username"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full h-11 rounded-md bg-bone border border-rule text-ink text-[14px] px-3 num transition-colors hover:border-slate2 focus:outline-none focus:border-gold focus:ring-2 focus:ring-gold/25"
            />
          </div>

          <div>
            <label htmlFor="password" className="eyebrow block mb-2">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-11 rounded-md bg-bone border border-rule text-ink text-[14px] px-3 num transition-colors hover:border-slate2 focus:outline-none focus:border-gold focus:ring-2 focus:ring-gold/25"
            />
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-md border border-burgundy/40 bg-burgundy/5 px-3 py-2.5 text-[13px] text-burgundy"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy || !username || !password}
            className="w-full h-11 rounded-md bg-gold text-white text-[12.5px] uppercase tracking-wide num hover:bg-gold2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            {busy ? "Signing in…" : "Enter the portal"}
          </button>
        </form>

        <p className="mt-6 text-[11px] text-slate2 leading-relaxed">
          Sessions last 12 hours. Restricted distribution — the figures inside are
          risk indicators for investigation, not findings.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
