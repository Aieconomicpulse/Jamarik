"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Wordmark from "@/components/Wordmark";
import { Icon } from "@/components/ui";

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
    <header className="sticky top-0 z-50 border-b border-rule bg-bone shadow-sm">
      <div className="max-w-[1400px] mx-auto px-5 lg:px-10 h-14 flex items-center justify-between gap-4">
        <Wordmark small />
        <div className="flex items-center gap-5">
          {generated && (
            <span className="hidden sm:inline eyebrow" title="Date the loaded dataset was built">Dataset {generated}</span>
          )}
          {user && <span className="hidden md:inline eyebrow">{user}</span>}
          <button
            onClick={signOut}
            disabled={busy}
            className="inline-flex items-center gap-2 h-9 px-3 rounded-md text-[12px] uppercase tracking-wide num text-slate1 hover:text-gold hover:bg-gold/5 transition-colors cursor-pointer disabled:opacity-40"
          >
            <Icon name="logout" className="w-4 h-4" />
            {busy ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>
    </header>
  );
}
