"use client";

import { useEffect, useState } from "react";
import { useMe } from "@/lib/me";
import { disablePush, enablePush, pushPermission, pushSupport } from "@/lib/push";
import { api } from "@/lib/api";
import { track } from "@/lib/analytics";
import { addDays, campusNow } from "@/lib/hours";
import { MAX_ALERT_TIMES, mealFor, mealStart } from "@/lib/alertMeals";
import { MEALS } from "@/lib/types";
import { TimeWheelSheet } from "@/components/profile/TimeWheelSheet";

/** An on/off switch for one way of getting the alert. */
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

/** 480 -> "8:00 AM". */
export const timeLabel = (m: number) => `${((Math.floor(m / 60) + 11) % 12) + 1}:${String(m % 60).padStart(2, "0")} ${m < 720 ? "AM" : "PM"}`;

const card = "flex items-start gap-4 rounded-[10px] border border-rule bg-surface px-4 py-3 shadow-[0_8px_20px_-14px] shadow-black/20";

type Settings = { notify: boolean; email: boolean; times: number[]; emailAvailable: boolean };

/** Times offered by "Add time": shortly before breakfast, lunch and dinner. The first one not already picked is used. */
const SUGGESTED = [7 * 60 + 15, 10 * 60 + 45, 16 * 60 + 45];

/**
 * The meal an alert at this time covers ("Lunch"), or null after the last meal. Worked out for the next day the halls
 * serve all three meals (a regular weekday), so a break or a weekend with brunch doesn't change what the label says.
 */
function mealToday(minute: number) {
  const today = campusNow().iso;
  const day = [0, 1, 2, 3, 4, 5, 6, 7].map((n) => addDays(today, n)).find((d) => MEALS.every((m) => mealStart(d, m) !== null)) ?? today;
  return mealFor(day, minute);
}

/**
 * The Alerts on the Favorites tab: up to 3 alert times, each picked on a clock wheel (15-minute steps, campus time) and
 * each covering one meal (shown beside it), and two switches for how they come: Push (a notification on this phone) and
 * Email (to their Hamilton address). An alert (lib/alertPlan.ts) only comes when a favorite is on that meal's menu.
 */
export function NotificationsPanel() {
  const me = useMe();
  const [settings, setSettings] = useState<Settings | null>(null);
  const on = settings?.notify ?? null;
  const setOn = (notify: boolean) => setSettings((s) => s && { ...s, notify });
  const [failed, setFailed] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  // Which time's wheel is open: its index, the next new one (times.length), or null when closed.
  const [editing, setEditing] = useState<number | null>(null);

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
            times: Array.isArray(b.times) && b.times.length ? b.times : [typeof (b as { time?: unknown }).time === "number" ? (b as { time: number }).time : 480],
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
      return refuse("On iPhone, push notifications only work from the Home Screen. In Safari, tap Share, then Add to Home Screen. Open HamEats from there and turn on Push again.");
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

  // The Push switch. Turning it on asks the phone for permission, straight from the tap (see setPush).
  const togglePush = async (next: boolean) => {
    if (busy) return;
    setNote("");
    setBusy(true);
    await setPush(next);
    setBusy(false);
  };

  // Saved straight away; put back if the save fails.
  const change = async (field: "email" | "times", value: boolean | number[]) => {
    if (!settings) return;
    setNote("");
    const before = settings[field];
    setSettings((s) => s && { ...s, [field]: value });
    track(field === "email" ? "email_alerts_toggled" : "alert_times_changed", field === "email" ? { on: value } : { times: value });
    try {
      await api("/api/settings", "PUT", { [field]: value });
    } catch (e) {
      setSettings((s) => s && { ...s, [field]: before });
      setNote((e as Error).message);
    }
  };

  if (!settings || on === null) return <p className="py-6 text-center text-muted">{failed ? "Couldn't load your settings. Check your connection and try again." : "Loading…"}</p>;

  const anyOn = on || settings.email;
  const times = settings.times;
  // A picked time replaces the one being edited (or is added); repeats are dropped, and the list stays in order.
  const saveTime = (minute: number) => {
    const next = [...new Set(editing !== null && editing < times.length ? times.map((t, i) => (i === editing ? minute : t)) : [...times, minute])].sort((a, b) => a - b);
    setEditing(null);
    if (next.join() !== times.join()) void change("times", next);
  };
  const describe = (minute: number) => {
    const meal = mealToday(minute);
    return meal ? `This alert will cover ${meal.toLowerCase()}.` : "No meal is left after this time today, so this alert won't go out.";
  };
  return (
    <section className="space-y-3">
      <div className="rounded-[10px] border border-rule bg-surface shadow-[0_8px_20px_-14px] shadow-black/20">
        <ul aria-label="Alert times" className="divide-y divide-rule">
          {times.map((t, i) => {
            const meal = mealToday(t);
            return (
              <li key={t} className="flex items-center gap-3 px-4 py-2.5">
                <button
                  type="button"
                  onClick={() => setEditing(i)}
                  aria-label={`Alert time ${timeLabel(t)}, change`}
                  className="shrink-0 rounded-lg border border-rule bg-background px-3 py-1.5 text-[16.5px] font-semibold tabular-nums"
                >
                  {timeLabel(t)}
                </button>
                <span className="min-w-0 flex-1 text-[14px] text-muted">
                  → <span className="font-semibold text-accent">{meal ?? "No meal left"}</span>
                </span>
                {times.length > 1 && (
                  <button
                    type="button"
                    onClick={() => void change("times", times.filter((_, j) => j !== i))}
                    aria-label={`Remove the ${timeLabel(t)} alert`}
                    className="flex size-10 shrink-0 items-center justify-center rounded-full text-xl text-zinc-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-800"
                  >
                    ✕
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          disabled={times.length >= MAX_ALERT_TIMES}
          onClick={() => saveTime(SUGGESTED.find((m) => !times.includes(m)) ?? 12 * 60)}
          className="flex min-h-11 w-full items-center gap-2 border-t border-rule px-4 text-[15px] font-semibold text-accent disabled:text-zinc-400"
        >
          + Add time{times.length >= MAX_ALERT_TIMES && <span className="font-normal"> (3 max)</span>}
        </button>
        <p className="px-4 pb-3 text-[13px] leading-snug text-muted">
          {anyOn ? "Each alert covers just that meal" : "Once you turn on an alert below, each time covers just that meal"}, checked right when it&apos;s sent, and
          only comes if a favorite is on. Pick a time shortly before the meal for the freshest menu. Campus time.
        </p>
      </div>
      <div className={card}>
        <div className="min-w-0 flex-1">
          <p className="text-[16.5px] font-semibold leading-snug">Push notifications</p>
          <p className="mt-0.5 text-[13px] leading-snug text-muted">
            A notification on this phone. On iPhone it only works once HamEats is on your Home Screen.
          </p>
        </div>
        <Switch on={on} onChange={(next) => void togglePush(next)} label="Push notifications" disabled={busy} />
      </div>
      {settings.emailAvailable && (
        <div className={card}>
          <div className="min-w-0 flex-1">
            <p className="text-[16.5px] font-semibold leading-snug">Email</p>
            <p className="mt-0.5 text-[13px] leading-snug text-muted">
              Sent to your <span className="font-medium text-zinc-700 dark:text-zinc-300">@hamilton.edu</span> email. Not seeing it? Check spam.
            </p>
          </div>
          <Switch on={settings.email} onChange={(next) => void change("email", next)} label="Email alerts" disabled={busy} />
        </div>
      )}
      {note && (
        <p role="status" className="px-1 text-[13px] text-zinc-700 dark:text-zinc-300">
          {note}
        </p>
      )}
      {editing !== null && (
        <TimeWheelSheet minute={times[editing] ?? times[0]} onDone={saveTime} onCancel={() => setEditing(null)} describe={describe} />
      )}
    </section>
  );
}
