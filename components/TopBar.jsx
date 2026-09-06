"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Wordmark from "@/components/Wordmark";

export default function TopBar({ user, generated }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-rule">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-4 flex items-center justify-between gap-4">
        <Wordmark small />
        <div className="flex items-center gap-5">
          {generated && (
            <span className="hidden sm:inline eyebrow">Dataset {generated}</span>
          )}
          {user && <span className="hidden md:inline eyebrow">{user}</span>}
          <button
            onClick={signOut}
            disabled={busy}
            className="text-[12px] uppercase tracking-wide num text-slate1 hover:text-gold transition-colors disabled:opacity-40"
          >
            {busy ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>
    </header>
  );
}
