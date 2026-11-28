import { HALLS } from "@/lib/halls";
import { dayHours } from "@/lib/hours";
import { MEALS, type Meal } from "@/lib/types";

// Which meal an alert covers. Shared by the server (lib/alerts.ts, which sends them) and the settings screen
// (components/profile/NotificationsPanel.tsx, which shows "10:45 AM -> Lunch"). Plain data, no server code.

/** Most alert times one person can have. */
export const MAX_ALERT_TIMES = 3;
/** Alert times are picked in steps of this many minutes (the scheduler runs this often). */
export const ALERT_STEP = 15;
/** The alert time for anyone who never picked one: 8 AM, as it has always been (it covers lunch). */
export const DEFAULT_ALERT_MINUTE = 8 * 60;

/** An alert set this long after a meal first opens still covers that meal (an 11:30 alert is about lunch). */
const STILL_THIS_MEAL = 60;

export const validAlertMinute = (m: unknown): m is number =>
  Number.isInteger(m) && (m as number) >= 0 && (m as number) < 24 * 60 && (m as number) % ALERT_STEP === 0;

/** 1-3 valid times, deduped and in order, or null. */
export function cleanAlertMinutes(v: unknown): number[] | null {
  if (!Array.isArray(v) || !v.every(validAlertMinute)) return null;
  const times = [...new Set(v as number[])].sort((a, b) => a - b);
  return times.length >= 1 && times.length <= MAX_ALERT_TIMES ? times : null;
}

/** Halls the alerts look at: all but Howard Diner, which serves the same dishes every day. */
const ALERT_HALLS = HALLS.filter((h) => h.slug !== "diner");

/** When `meal` first opens at any hall on `day` (minutes after midnight), or null when no hall serves it that day. */
export function mealStart(day: string, meal: Meal): number | null {
  const opens = ALERT_HALLS.flatMap((h) => dayHours(h.hours, day).filter((p) => p.meal === meal).map((p) => p.open));
  return opens.length ? Math.min(...opens) : null;
}

/**
 * The meal an alert at `minute` on `day` covers: the first meal that hasn't started yet, or started less than an hour ago
 * (so 10:45 AM covers lunch and 11:30 AM still does). Meals no hall serves that day are skipped. Null after the last one.
 */
export function mealFor(day: string, minute: number): Meal | null {
  for (const meal of MEALS) {
    const start = mealStart(day, meal);
    if (start !== null && minute < start + STILL_THIS_MEAL) return meal;
  }
  return null;
}
