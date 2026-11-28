"use client";

import { useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { useMe } from "@/lib/me";
import { useFavorites } from "@/lib/favorites";
import { signInWithGoogle } from "@/lib/login";
import { track } from "@/lib/analytics";
import { StarIcon } from "@/components/FavoriteButton";
import { goToSection } from "@/components/SectionTabs";
import { FavoritesPanel } from "@/components/profile/FavoritesPanel";
import { NotificationsPanel } from "@/components/profile/NotificationsPanel";

const Bell = ({ className = "size-5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);

type Panel = "favorites" | "notifications";

/**
 * The Profile tab: who's logged in, then two panels, Favorites (a card per saved dish) and Notifications (the alert time, and
 * switches for push and email alerts about them). `notifications` opens on Notifications (the #notifications address, where tapping an
 * alert goes).
 */
export function ProfileTab({ notifications = false }: { notifications?: boolean }) {
  const me = useMe();
  const { favorites, status } = useFavorites();
  // The panel follows the address (#profile or #notifications), so Back, a reload and a tapped alert all land right.
  const panel: Panel = notifications ? "notifications" : "favorites";

  if (me.status === "loading") return <p className="py-16 text-center text-muted">Loading…</p>;
  if (me.status === "off")
    return <p className="px-4 py-16 text-center text-muted">Favorites and alerts aren&apos;t available right now. Please try again later.</p>;
  if (me.status === "out") return <SignedOut />;

  const choose = (p: Panel) => {
    if (p === panel) return;
    track("profile_panel_opened", { panel: p });
    goToSection(p === "notifications" ? "notifications" : "profile");
  };

  return (
    <main className="mx-auto w-full max-w-2xl pb-12">
      <Hero saved={status === "ready" ? favorites.length : null} />

      <div className="px-4 pt-5">
        <div role="tablist" aria-label="Profile" className="grid grid-cols-2 gap-1 rounded-xl border border-rule bg-surface p-1">
          {(
            [
              ["favorites", "Favorites", <StarIcon key="i" filled={panel === "favorites"} className="size-[18px]" />],
              ["notifications", "Notifications", <Bell key="i" className="size-[18px]" />],
            ] as const
          ).map(([id, label, icon]) => (
            <button
              key={id}
              role="tab"
              aria-selected={panel === id}
              onClick={() => choose(id)}
              className={`flex min-h-11 items-center justify-center gap-2 rounded-lg text-[15.5px] font-semibold transition ${
                panel === id ? "bg-accent-fill text-on-accent shadow-sm" : "text-muted hover:text-foreground"
              }`}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-5">{panel === "favorites" ? <FavoritesPanel /> : <NotificationsPanel />}</div>
    </main>
  );
}

/**
 * The top of the Profile: the start of the person's Hamilton email (the part before the @, never the whole address or
 * their name), with its first letter as their picture.
 */
function Hero({ saved }: { saved: number | null }) {
  const { data: session } = useSession();
  const handle = (session?.user?.email ?? "").split("@")[0];
  const initial = handle[0]?.toUpperCase() ?? "";
  const [busy, setBusy] = useState(false);

  return (
    <section className="bg-band bg-[linear-gradient(to_bottom,transparent_25%,rgb(0_0_0/0.35))] px-4 pb-5 pt-5 text-band-ink">
      <div className="flex items-center gap-4">
        <span aria-hidden className="flex size-[72px] shrink-0 items-center justify-center rounded-full bg-gold font-display text-4xl font-bold text-zinc-950 ring-4 ring-band-ink/20">
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-[26px] font-bold leading-tight">{handle || "Your profile"}</h2>
          {saved !== null && (
            <p className="mt-1 flex items-center gap-1.5 text-[14px] font-semibold">
              <StarIcon filled className="size-4 text-gold" />
              {saved} {saved === 1 ? "favorite" : "favorites"}
            </p>
          )}
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            track("logout_confirmed", { source: "profile" });
            await signOut({ redirect: false }).catch(() => {});
            setBusy(false);
          }}
          className="shrink-0 self-start rounded-full border border-band-ink/40 px-4 py-1.5 text-[14px] font-semibold hover:bg-band-ink/10 disabled:opacity-60"
        >
          {busy ? "Logging out…" : "Log out"}
        </button>
      </div>
    </section>
  );
}

/** Logged out: what the Profile is for, and a way to log in. */
function SignedOut() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-12 pt-5">
      <section className="rounded-[10px] border border-rule bg-surface p-6 text-center shadow-[0_8px_20px_-14px] shadow-black/20">
        <StarIcon filled={false} className="mx-auto size-10 text-gold-ink dark:text-gold" />
        <h2 className="mt-2 font-display text-2xl font-bold">Save your favorite dishes</h2>
        <p className="mx-auto mt-1.5 max-w-sm text-[15px] text-muted">
          Log in with your Hamilton account to save the dishes you love and get a notification or email, at the time you pick,
          the day one is on the menu.
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
      <ul className="mt-6 space-y-3 px-1 text-[15px]">
        <li className="flex gap-3">
          <StarIcon filled className="mt-0.5 size-5 shrink-0 text-gold-ink dark:text-gold" />
          <span>
            <strong>Favorites</strong> <span className="text-muted">follow you to any phone or computer you log in on.</span>
          </span>
        </li>
        <li className="flex gap-3">
          <Bell className="mt-0.5 size-5 shrink-0 text-accent" />
          <span>
            <strong>Notifications</strong> <span className="text-muted">by push or email, at the time you pick, tell you which favorites are on that day, where, and for which meal.</span>
          </span>
        </li>
      </ul>
    </main>
  );
}
