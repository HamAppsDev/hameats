"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useMe } from "@/lib/me";
import { disablePush, enablePush, pushPermission, pushSupport } from "@/lib/push";
import { api } from "@/lib/api";
import { track } from "@/lib/analytics";

/** How the alert reaches someone. */
type Mode = "off" | "push" | "email" | "both";
const MODES: { mode: Mode; label: string }[] = [
  { mode: "off", label: "Off" },
  { mode: "push", label: "Push" },
  { mode: "email", label: "Email" },
  { mode: "both", label: "Push + Email" },
];
const wantsPush = (m: Mode) => m === "push" || m === "both";
const wantsEmail = (m: Mode) => m === "email" || m === "both";

/** What a phone said about notifications, in words someone can act on. */
const BLOCKED =
  "Notifications are blocked for HamEats. To allow them, open your phone's Settings, find HamEats (or your browser), and turn on Notifications. Then try again.";

/** Alert times, every 15 minutes of the day, as minutes after midnight on campus. */
const TIMES = Array.from({ length: 96 }, (_, i) => i * 15);

/** 480 -> "8:00 AM". */
export const timeLabel = (m: number) => `${((Math.floor(m / 60) + 11) % 12) + 1}:${String(m % 60).padStart(2, "0")} ${m < 720 ? "AM" : "PM"}`;

const card = "flex items-start gap-4 rounded-[10px] border border-rule bg-surface px-4 py-3 shadow-[0_8px_20px_-14px] shadow-black/20";

type Settings = { notify: boolean; email: boolean; time: number; emailAvailable: boolean };

/**
 * The Notifications on your Profile: when the daily alert goes out (any time of day, in 15-minute steps, campus time),
 * and how it comes: Off, Push (a notification on this phone), Email (to their Hamilton address) or Push + Email. The alert
 * (lib/alerts.ts) only comes on days a favorite is on the menu.
 */
export function NotificationsPanel() {
  const me = useMe();
  const { data: session } = useSession();
  const address = session?.user?.email ?? "";
  const [settings, setSettings] = useState<Settings | null>(null);
  const on = settings?.notify ?? null;
  const setOn = (notify: boolean) => setSettings((s) => s && { ...s, notify });
  const [failed, setFailed] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(
        (b: Partial<Settings>) =>
          !cancelled &&
          setSettings({
            notify: b.notify === true,
            email: b.email === true,
            time: typeof b.time === "number" ? b.time : 480,
            emailAvailable: b.emailAvailable === true,
          }),
      )
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  // Turning push on asks the phone for permission. It has to happen straight from the tap, so nothing waits first.
  // Resolves to whether push ended up the way it was asked to be.
  const setPush = async (next: boolean): Promise<boolean> => {
    track("alerts_toggled", { on: next });
    if (!next) {
      try {
        await api("/api/settings", "PUT", { notify: false });
        await disablePush();
        setOn(false);
        return true;
      } catch (e) {
        setNote((e as Error).message);
        return false;
      }
    }
    const support = pushSupport();
    const refuse = (message: string) => (setNote(message), false);
    if (support === "needs-home-screen")
      return refuse("On iPhone, push notifications only work from the Home Screen. In Safari, tap Share, then Add to Home Screen. Open HamEats from there and pick Push again.");
    if (support === "unsupported") return refuse("This browser can't show push notifications.");
    if (!me.pushKey) return refuse("Push notifications aren't switched on for HamEats yet.");
    if (pushPermission() === "denied") return refuse(BLOCKED);
    const phone = await enablePush(me.pushKey);
    track("push_permission", { result: phone.result });
    if (phone.result !== "on")
      return refuse(
        phone.result === "denied"
          ? BLOCKED
          : phone.result === "dismissed"
            ? "Notifications weren't allowed, so push stays off."
            : "Couldn't turn on push notifications. Please try again.",
      );
    try {
      await api("/api/settings", "PUT", { notify: true, push: phone.push });
      setOn(true);
      return true;
    } catch (e) {
      return refuse((e as Error).message);
    }
  };

  // A tap on Off / Push / Email / Push + Email. Push goes first, straight from the tap (see setPush).
  const choose = async (mode: Mode) => {
    if (!settings || busy) return;
    setNote("");
    setBusy(true);
    track("alert_mode_chosen", { mode });
    if (wantsPush(mode) !== settings.notify) await setPush(wantsPush(mode));
    if (settings.emailAvailable && wantsEmail(mode) !== settings.email) await change("email", wantsEmail(mode), false);
    setBusy(false);
  };

  // Saved straight away; put back if the save fails.
  const change = async (field: "email" | "time", value: boolean | number, clearNote = true) => {
    if (!settings) return;
    if (clearNote) setNote("");
    // Functional updates: a Push + Email tap changes push just before this, so `settings` here may be out of date.
    const before = settings[field];
    setSettings((s) => s && { ...s, [field]: value });
    if (field === "time") track("alert_time_changed", { minute: value });
    try {
      await api("/api/settings", "PUT", { [field]: value });
    } catch (e) {
      setSettings((s) => s && { ...s, [field]: before });
      setNote((e as Error).message);
    }
  };

  if (!settings || on === null) return <p className="py-6 text-center text-muted">{failed ? "Couldn't load your settings. Check your connection and try again." : "Loading…"}</p>;

  const anyOn = on || settings.email;
  const mode: Mode = on && settings.email ? "both" : on ? "push" : settings.email ? "email" : "off";
  const modes = settings.emailAvailable ? MODES : MODES.filter((m) => !wantsEmail(m.mode));
  return (
    <section className="space-y-3">
      <div className={card}>
        <div className="min-w-0 flex-1">
          <label htmlFor="alert-time" className="text-[16.5px] font-semibold leading-snug">
            Alert time
          </label>
          <p className="mt-0.5 text-[13px] leading-snug text-muted">
            {anyOn ? "Every day at this time" : "Once you pick how below, alerts come at this time"}, if one of your favorites is on that day&apos;s menu.
            Campus time.
          </p>
        </div>
        <select
          id="alert-time"
          value={settings.time}
          onChange={(e) => void change("time", Number(e.target.value))}
          className="shrink-0 rounded-lg border border-rule bg-background px-2.5 py-1.5 text-[15px] font-medium"
        >
          {TIMES.map((m) => (
            <option key={m} value={m}>
              {timeLabel(m)}
            </option>
          ))}
        </select>
      </div>
      <div className="rounded-[10px] border border-rule bg-surface px-4 py-3 shadow-[0_8px_20px_-14px] shadow-black/20">
        <p id="alert-mode" className="text-[16.5px] font-semibold leading-snug">
          How you get it
        </p>
        <div role="radiogroup" aria-labelledby="alert-mode" className="mt-2.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {modes.map(({ mode: m, label }) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              disabled={busy}
              onClick={() => void choose(m)}
              className={`rounded-lg border px-3 py-2 text-[14.5px] font-semibold transition-colors disabled:cursor-not-allowed ${
                mode === m ? "border-transparent bg-accent-fill text-white" : "border-rule bg-background text-zinc-700 dark:text-zinc-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {wantsPush(mode) && (
          <p className="mt-2.5 text-[13px] leading-snug text-muted">
            Push is a notification on this phone. On iPhone it only works once HamEats is on your Home Screen.
          </p>
        )}
        {wantsEmail(mode) && (
          <p className="mt-2.5 text-[13px] leading-snug text-muted">
            Emails go to{" "}
            <span className="font-medium text-zinc-700 dark:text-zinc-300">{address.endsWith("@hamilton.edu") ? address : "your @hamilton.edu address"}</span> from{" "}
            <span className="font-medium text-zinc-700 dark:text-zinc-300">notifications@hameats.app</span>.{" "}
            <strong className="font-semibold text-zinc-800 dark:text-zinc-200">Check your spam folder!</strong> If one lands there, mark it as Not
            spam so the next ones reach your inbox.
          </p>
        )}
      </div>
      {note && (
        <p role="status" className="px-1 text-[13px] text-zinc-700 dark:text-zinc-300">
          {note}
        </p>
      )}
    </section>
  );
}
