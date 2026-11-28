"use client";

import { useEffect, useState } from "react";
import { useMe } from "@/lib/me";
import { disablePush, enablePush, pushPermission, pushSupport } from "@/lib/push";
import { api } from "@/lib/api";
import { track } from "@/lib/analytics";

function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (on: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed ${on ? "bg-accent-fill" : "bg-zinc-300 dark:bg-zinc-700"}`}
    >
      <span aria-hidden className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

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
 * and two switches for how: push notifications on this phone, and an email to their Hamilton address. The alert
 * (lib/alerts.ts) only comes on days a favorite is on the menu.
 */
export function NotificationsPanel() {
  const me = useMe();
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

  // Turning it on asks the phone for permission. It has to happen straight from the tap, so nothing waits first.
  const toggle = async (next: boolean) => {
    setNote("");
    track("alerts_toggled", { on: next });
    if (!next) {
      setBusy(true);
      try {
        await api("/api/settings", "PUT", { notify: false });
        await disablePush();
        setOn(false);
      } catch (e) {
        setNote((e as Error).message);
      }
      return setBusy(false);
    }
    const support = pushSupport();
    if (support === "needs-home-screen")
      return setNote("On iPhone, notifications only work from the Home Screen. In Safari, tap Share, then Add to Home Screen. Open HamEats from there and turn this on.");
    if (support === "unsupported") return setNote("This browser can't show notifications.");
    if (!me.pushKey) return setNote("Notifications aren't switched on for HamEats yet.");
    if (pushPermission() === "denied") return setNote(BLOCKED);
    setBusy(true);
    const phone = await enablePush(me.pushKey);
    track("push_permission", { result: phone.result });
    if (phone.result === "on") {
      try {
        await api("/api/settings", "PUT", { notify: true, push: phone.push });
        setOn(true);
      } catch (e) {
        setNote((e as Error).message);
      }
    } else
      setNote(
        phone.result === "denied"
          ? BLOCKED
          : phone.result === "dismissed"
            ? "Notifications weren't allowed, so they stay off."
            : "Couldn't turn on notifications. Please try again.",
      );
    setBusy(false);
  };

  // Saved straight away; put back if the save fails.
  const change = async (field: "email" | "time", value: boolean | number) => {
    if (!settings) return;
    setNote("");
    const before = settings;
    setSettings({ ...settings, [field]: value });
    track(field === "email" ? "email_alerts_toggled" : "alert_time_changed", field === "email" ? { on: value } : { minute: value });
    try {
      await api("/api/settings", "PUT", { [field]: value });
    } catch (e) {
      setSettings(before);
      setNote((e as Error).message);
    }
  };

  if (!settings || on === null) return <p className="py-6 text-center text-muted">{failed ? "Couldn't load your settings. Check your connection and try again." : "Loading…"}</p>;

  const anyOn = on || settings.email;
  return (
    <section className="space-y-3">
      <div className={card}>
        <div className="min-w-0 flex-1">
          <label htmlFor="alert-time" className="text-[16.5px] font-semibold leading-snug">
            Alert time
          </label>
          <p className="mt-0.5 text-[13px] leading-snug text-muted">
            {anyOn ? "Every day at this time" : "Once you turn on an alert below, it comes at this time"}, if one of your favorites is on that day&apos;s menu.
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
      <div className={card}>
        <div className="min-w-0 flex-1">
          <p className="text-[16.5px] font-semibold leading-snug">Push notifications</p>
          <p className="mt-0.5 text-[13px] leading-snug text-muted">
            A notification on this phone. On iPhone this only works once HamEats is on your Home Screen.
          </p>
        </div>
        <Switch on={on} onChange={(next) => void toggle(next)} label="Push notifications" disabled={busy} />
      </div>
      {settings.emailAvailable && (
        <div className={card}>
          <div className="min-w-0 flex-1">
            <p className="text-[16.5px] font-semibold leading-snug">Email</p>
            <p className="mt-0.5 text-[13px] leading-snug text-muted">An email to your Hamilton address. Works on any phone or computer.</p>
          </div>
          <Switch on={settings.email} onChange={(next) => void change("email", next)} label="Email alerts" />
        </div>
      )}
      {note && (
        <p role="status" className="px-1 text-[13px] text-zinc-700 dark:text-zinc-300">
          {note}
        </p>
      )}
    </section>
  );
}
