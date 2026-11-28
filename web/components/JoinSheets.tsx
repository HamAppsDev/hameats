"use client";

import { useEffect, useState } from "react";
import { LOGIN_REQUESTED, continueAsTestStudent, continueWithGoogle } from "@/lib/login";
import { useMe } from "@/lib/me";
import { LoginScene } from "@/components/LoginScene";
import { track } from "@/lib/analytics";

const link = "font-semibold text-accent underline";

/** A dish starred while logged out waits for the login (lib/favorites.tsx); closing the screen without logging in drops it. */
function dropPending() {
  try {
    sessionStorage.removeItem("favorite-pending");
  } catch {}
}

/**
 * The screen every "Log in" button opens before going to Google, in the style of Hamilton Scheduler's sign-in: a
 * picture of Cici at a dining hall table, one line on what logging in is for, an example alert, and the button.
 */
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
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white pb-[max(1.25rem,env(safe-area-inset-bottom))] text-zinc-700 shadow-xl sm:rounded-3xl dark:bg-surface dark:text-zinc-300"
      >
        <LoginScene className="block w-full border-b-4 border-[#0f366f]" />

        <div className="px-6 pt-5">
          <h2 id="login-sheet-title" className="text-center font-display text-[26px] font-bold leading-tight text-zinc-900 dark:text-zinc-100">
            Get notified when your favorite meal is on the menu
          </h2>

          <ExampleAlert />

          {localMode && (
            <p className="mt-3 text-center text-[13px] font-semibold text-gold-ink">Local test mode: you&apos;ll log in as a made-up test student.</p>
          )}

          <button
            type="button"
            onClick={go}
            disabled={busy}
            autoFocus
            className="mt-5 flex min-h-13 w-full items-center justify-center gap-3 rounded-full border-[3px] border-[#0f366f] bg-white px-5 py-3 text-[17px] font-bold text-zinc-900 shadow-[5px_5px_0_#0f366f] transition active:translate-x-[3px] active:translate-y-[3px] active:shadow-[2px_2px_0_#0f366f] disabled:opacity-60 dark:shadow-[5px_5px_0_#000]"
          >
            {!localMode && <GoogleIcon />}
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
          <p className="mt-2 text-center text-[12px] leading-snug text-muted">
            Hamilton accounts only. By continuing you agree to the{" "}
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
    </div>
  );
}

/** What an alert looks like, shown as a phone notification: the made-up but true-to-life example of a rare favorite. */
function ExampleAlert() {
  return (
    <div aria-label="Example alert" className="mt-4 flex items-start gap-3 rounded-2xl border border-rule bg-background p-3 text-left shadow-sm">
      <svg viewBox="0 0 48 48" aria-hidden className="size-10 shrink-0">
        <rect width="48" height="48" rx="11" fill="#002f86" />
        <path d="M10 24H38A14 14 0 0 1 10 24Z" fill="#f6f1e7" />
        <path d="M20.1 26h1.8a.6.6 0 0 1 .6.6v2.15h3v-2.15a.6.6 0 0 1 .6-.6h1.8a.6.6 0 0 1 .6.6v6.8a.6.6 0 0 1-.6.6h-1.8a.6.6 0 0 1-.6-.6v-2.15h-3v2.15a.6.6 0 0 1-.6.6h-1.8a.6.6 0 0 1-.6-.6v-6.8a.6.6 0 0 1 .6-.6Z" fill="#F0B100" />
        <path d="M18 19c-2-2.5 2-4.5 0-8M24 19c-2-2.5 2-4.5 0-8M30 19c-2-2.5 2-4.5 0-8" fill="none" strokeWidth={3} strokeLinecap="round" stroke="#F0B100" />
      </svg>
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline justify-between text-[12px] text-muted">
          <span className="font-semibold uppercase tracking-wide">HamEats</span>
          <span>now</span>
        </p>
        <p className="text-[15px] font-semibold leading-snug text-zinc-900 dark:text-zinc-100">
          ⭐ The rare Poke Bowl is on at McEwen today!
        </p>
        <p className="text-[13px] text-muted">Lunch · 11 AM–2 PM</p>
      </div>
    </div>
  );
}

/** Google's "G", for the Continue with Google button. */
function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" width="22" height="22" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.9 6.1C12.4 13.7 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
      <path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.6 10.7l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.8-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}
