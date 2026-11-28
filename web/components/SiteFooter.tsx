"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Cici } from "@/components/Cici";
import { FEEDBACK_FORM_URL, HAMAPPS_URL, SCHEDULER_URL } from "@/lib/site";

const FEEDBACK_NAME = "Brandon Taylor";
const FEEDBACK_EMAIL = "bntaylor@hamilton.edu";
/** Hamilton's own dining site, for anything this app doesn't cover. */
const OFFICIAL_DINING_URL = "https://www.hamilton.edu/dining";

/** The feedback form, plus who to email, shown as a small centered window over the page. */
function FeedbackDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm space-y-3 rounded-xl bg-white p-6 text-center text-base text-zinc-700 shadow-xl dark:bg-surface dark:text-zinc-300"
      >
        <h2 id="feedback-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Feedback
        </h2>
        <p>Questions, bugs, or ideas? Let us know:</p>
        <a
          href={FEEDBACK_FORM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full rounded-lg bg-blue-600 py-2.5 font-semibold text-white active:bg-blue-700 dark:bg-blue-500 dark:active:bg-blue-600"
        >
          Share feedback
        </a>
        <div className="pt-1">
          <p className="text-sm">Or email</p>
          <p className="font-semibold text-zinc-900 dark:text-zinc-100">{FEEDBACK_NAME}</p>
          <a
            href={`mailto:${FEEDBACK_EMAIL}`}
            className="font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            {FEEDBACK_EMAIL}
          </a>
        </div>
        <button
          onClick={onClose}
          className="mt-2 w-full rounded-lg bg-zinc-100 py-2.5 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
        >
          Close
        </button>
      </div>
    </div>
  );
}

/** The footer shown at the bottom of every page. */
export function SiteFooter() {
  const [homeScreenOpen, setHomeScreenOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const instructionsRef = useRef<HTMLDivElement>(null);

  // Opening the instructions scrolls just far enough to show them (no scroll if they already fit).
  useEffect(() => {
    if (!homeScreenOpen) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    instructionsRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
  }, [homeScreenOpen]);

  return (
    <footer className="mx-auto w-full max-w-2xl space-y-2 px-4 py-6 text-xs text-zinc-500">
      {/* Deliberately oversized: getting the app onto the home screen is the main thing we want people to do. */}
      <div className="py-4">
        <button
          onClick={() => setHomeScreenOpen((o) => !o)}
          aria-expanded={homeScreenOpen}
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-accent-fill px-6 py-6 text-2xl font-bold text-on-accent shadow-md active:brightness-110"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden className="size-9 shrink-0">
            <rect x="6" y="2" width="12" height="20" rx="2.5" />
            <path strokeLinecap="round" d="M12 8v6M9 11h6" />
          </svg>
          Add to Home Screen
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden
            className={`size-7 shrink-0 transition ${homeScreenOpen ? "rotate-90" : ""}`}
          >
            <path
              fillRule="evenodd"
              d="M7.2 5.2a.75.75 0 0 1 1.06 0l4.27 4.27a.75.75 0 0 1 0 1.06l-4.27 4.27a.75.75 0 0 1-1.06-1.06L10.94 10 7.2 6.26a.75.75 0 0 1 0-1.06Z"
              clipRule="evenodd"
            />
          </svg>
        </button>
        {homeScreenOpen && (
          <div
            ref={instructionsRef}
            className="mt-4 scroll-mb-4 space-y-4 rounded-xl border border-zinc-200 bg-white p-5 text-base text-zinc-700 dark:border-zinc-800 dark:bg-surface dark:text-zinc-300"
          >
            <div>
              <p className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">iPhone (Safari)</p>
              <ol className="list-decimal space-y-1 pl-6">
                <li>Tap the three dots (•••) in the bottom-right corner.</li>
                <li>Tap &quot;Share.&quot;</li>
                <li>Tap &quot;View More.&quot;</li>
                <li>Tap &quot;Add to Home Screen.&quot;</li>
                <li>Tap &quot;Add.&quot;</li>
              </ol>
            </div>
            <div>
              <p className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">iPhone (Chrome)</p>
              <ol className="list-decimal space-y-1 pl-6">
                <li>Tap the Share button on the right side of the address bar.</li>
                <li>Tap &quot;View More.&quot;</li>
                <li>Scroll down a little and tap &quot;Add to Home Screen.&quot;</li>
                <li>Tap &quot;Add.&quot;</li>
              </ol>
            </div>
            <div>
              <p className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">Android (Chrome)</p>
              <ol className="list-decimal space-y-1 pl-6">
                <li>
                  Open the{" "}
                  <Link href="/" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
                    homepage
                  </Link>{" "}
                  in Chrome.
                </li>
                <li>Tap the menu (three dots) in the top-right corner.</li>
                <li>Tap &quot;Add to Home screen&quot; (or &quot;Install app&quot;).</li>
                <li>Tap &quot;Add&quot; to confirm.</li>
              </ol>
            </div>
          </div>
        )}
      </div>

      <hr className="border-zinc-200 dark:border-zinc-800" />

      <div className="grid grid-cols-3 items-center pt-1 text-center text-sm text-zinc-900 sm:text-base dark:text-zinc-100">
        <Link href="/about" prefetch={false} className="font-medium hover:underline">
          About
        </Link>
        <button onClick={() => setFeedbackOpen(true)} className="font-medium hover:underline">
          Feedback
        </button>
        <a
          href={OFFICIAL_DINING_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium hover:underline"
        >
          Information
        </a>
      </div>

      <div className="flex justify-center gap-6 text-center text-sm text-zinc-900 dark:text-zinc-100">
        <Link href="/terms" prefetch={false} className="font-medium hover:underline">
          Terms
        </Link>
        <Link href="/privacy" prefetch={false} className="font-medium hover:underline">
          Privacy
        </Link>
      </div>

      {/* Plain text in the page from the first byte, so search engines see what the site is without running the app. */}
      <p className="pt-3 text-center">
        HamEats: Hamilton College dining menus and hours for Soper Commons, McEwen, the Diner and the Little Pub.
      </p>
      <p className="text-center">A student project, not affiliated with Hamilton College.</p>
      <p className="flex flex-wrap items-center justify-center gap-x-1 text-center">
        <Cici className="mr-0.5 h-6 w-7" />
        Made by{" "}
        <a href={HAMAPPS_URL} className="font-medium text-zinc-700 hover:underline dark:text-zinc-300">
          HamApps
        </a>{" "}
        · Also try{" "}
        <a href={SCHEDULER_URL} className="font-medium text-zinc-700 hover:underline dark:text-zinc-300">
          Hamilton Scheduler
        </a>
      </p>
      <p className="text-center">For allergen and ingredient information, please ask dining staff.</p>

      {feedbackOpen && <FeedbackDialog onClose={() => setFeedbackOpen(false)} />}
    </footer>
  );
}
