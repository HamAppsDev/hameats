"use client";

import { useEffect, useRef } from "react";
import { useMe } from "@/lib/me";
import { signInWithGoogle } from "@/lib/login";
import { track } from "@/lib/analytics";
import { StarIcon } from "@/components/FavoriteButton";
import { FavoritesPanel } from "@/components/profile/FavoritesPanel";
import { NotificationsPanel } from "@/components/profile/NotificationsPanel";

const Bell = ({ className = "size-5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);

/**
 * The Favorites tab (inside the code and analytics it's still the "profile" section, so older data lines up): the saved
 * dishes, then Alerts, the time and the switches for push and email alerts about them. One page, no sub-tabs, so the
 * dishes you'll be alerted about are right above the alert settings. `notifications` (the #notifications address, where
 * tapping an alert or an email's settings link goes) scrolls down to Alerts. Logging out is in the header's account
 * button.
 */
export function ProfileTab({ notifications = false }: { notifications?: boolean }) {
  const me = useMe();
  const alertsRef = useRef<HTMLElement>(null);
  const signedIn = me.status === "in";

  useEffect(() => {
    if (notifications && signedIn) alertsRef.current?.scrollIntoView({ block: "start" });
  }, [notifications, signedIn]);

  if (me.status === "loading") return <p className="py-16 text-center text-muted">Loading…</p>;
  if (me.status === "off")
    return <p className="px-4 py-16 text-center text-muted">Favorites and alerts aren&apos;t available right now. Please try again later.</p>;
  if (me.status === "out") return <SignedOut />;

  return (
    <main className="mx-auto w-full max-w-2xl space-y-8 px-4 pb-12 pt-5">
      <section aria-labelledby="favorites-title" className="space-y-3">
        <h2 id="favorites-title" className="flex items-center gap-2 font-display text-2xl font-bold">
          <StarIcon filled className="size-6 text-gold-ink dark:text-gold" />
          Favorites
        </h2>
        <FavoritesPanel />
      </section>

      <section ref={alertsRef} aria-labelledby="alerts-title" className="scroll-mt-36 space-y-3">
        <h2 id="alerts-title" className="flex items-center gap-2 font-display text-2xl font-bold">
          <Bell className="size-6 text-accent" />
          Alerts
        </h2>
        <NotificationsPanel />
      </section>
    </main>
  );
}

/** Logged out: one card saying what Favorites are for, and a way to log in. */
function SignedOut() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-12 pt-5">
      <section className="rounded-[10px] border border-rule bg-surface p-6 text-center shadow-[0_8px_20px_-14px] shadow-black/20">
        <StarIcon filled={false} className="mx-auto size-10 text-gold-ink dark:text-gold" />
        <h2 className="mt-2 font-display text-2xl font-bold">Save your favorite dishes</h2>
        <p className="mx-auto mt-1.5 max-w-sm text-[15px] text-muted">
          Log in with your Hamilton account to save dishes and get an alert when they&apos;re on the menu.
        </p>
        <button
          type="button"
          onClick={() => {
            track("login_clicked", { source: "profile" });
            signInWithGoogle();
          }}
          className="mt-5 min-h-12 w-full max-w-xs rounded-full bg-accent-fill px-5 text-base font-semibold text-on-accent"
        >
          Log in
        </button>
      </section>
    </main>
  );
}
