"use client";

import { useEffect, useState } from "react";
import { LOGIN_REQUESTED, continueAsTestStudent, continueWithGoogle } from "@/lib/login";
import { useMe } from "@/lib/me";
import { track } from "@/lib/analytics";

const link = "font-semibold text-accent underline";

/** A dish starred while logged out waits for the login (lib/favorites.tsx); closing the screen without logging in drops it. */
function dropPending() {
  try {
    sessionStorage.removeItem("favorite-pending");
  } catch {}
}

/** The screen every "Log in" button opens before going to Google: what logging in is for and what HamEats keeps. */
export function LoginSheet() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { localMode } = useMe();

  useEffect(() => {
    const onRequest = () => {
      track("login_sheet_shown");
      setOpen(true);
    };
    window.addEventListener(LOGIN_REQUESTED, onRequest);
    return () => window.removeEventListener(LOGIN_REQUESTED, onRequest);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && (dropPending(), setOpen(false));
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy]);

  if (!open) return null;

  const close = () => {
    dropPending();
    setOpen(false);
  };

  const go = () => {
    setBusy(true);
    track("login_continue");
    void (localMode ? continueAsTestStudent() : continueWithGoogle());
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center sm:p-6" onClick={() => !busy && close()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-sheet-title"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-zinc-700 shadow-xl sm:rounded-2xl dark:bg-surface dark:text-zinc-300"
      >
        <h2 id="login-sheet-title" className="font-display text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Log in with your Hamilton account
        </h2>
        <p className="mt-1 text-[15px]">Save your favorite dishes and get an alert the morning one is on the menu.</p>
        {localMode && (
          <p className="mt-3 rounded-lg border border-gold bg-gold/15 px-3 py-2 text-[14px] leading-snug text-zinc-900 dark:text-zinc-100">
            <strong>Local test mode.</strong> You&apos;ll log in as a made-up test student, without Google. Favorites and
            settings are only kept until the dev server restarts.
          </p>
        )}

        <ul className="mt-4 space-y-2.5 text-[15px] leading-snug">
          <li className="flex gap-2.5">
            <span aria-hidden>⭐</span>
            <span>
              <strong className="text-zinc-900 dark:text-zinc-100">Your favorites are private.</strong> They&apos;re saved to your account so
              they follow you to any device, and only you can see them.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span aria-hidden>🔒</span>
            <span>
              <strong className="text-zinc-900 dark:text-zinc-100">We keep very little.</strong> Your Hamilton email address (to know it&apos;s you),
              your favorites and whether notifications are on. Never your name.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span aria-hidden>🗑️</span>
            <span>
              <strong className="text-zinc-900 dark:text-zinc-100">You&apos;re in control.</strong> Remove a favorite or turn notifications off
              anytime from the Favorites tab, or email me to delete your account.
            </span>
          </li>
        </ul>

        <button
          type="button"
          onClick={go}
          disabled={busy}
          autoFocus
          className="mt-6 min-h-12 w-full rounded-full bg-accent-fill px-5 text-base font-semibold text-on-accent disabled:opacity-60"
        >
          {localMode ? (busy ? "Logging in…" : "Continue as test student") : busy ? "Opening Google…" : "Continue with Google"}
        </button>
        <button
          type="button"
          onClick={close}
          disabled={busy}
          className="mt-2 min-h-11 w-full rounded-full text-base font-medium text-zinc-600 hover:bg-zinc-200/60 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          Not now
        </button>
        <p className="mt-3 text-center text-[13px] leading-snug text-muted">
          Only @hamilton.edu accounts. By continuing you agree to the{" "}
          <a href="/terms" className={link}>
            Terms
          </a>{" "}
          and{" "}
          <a href="/privacy" className={link}>
            Privacy Policy
          </a>
          .
        </p>
      </div>
    </div>
  );
}
