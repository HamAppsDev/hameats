import { HALLS } from "@/lib/halls";
import { ALERT_STEP, mealFor, mealStart } from "@/lib/alertMeals";
import { MEALS, type Meal, type MenuData } from "@/lib/types";
import type { SentMeal, SentToday, User } from "@/lib/users";

// What each alert run should send, worked out from the people, today's menus and the time. Plain functions with no
// sending or database, so they can be checked on made-up data. lib/alerts.ts does the sending.
//
// Each of a person's alert times (up to 3) covers one meal (lib/alertMeals.ts mealFor). When a time comes, they get one
// alert for that meal, listing their favorites on its menu, unless that meal's alert already went out today. Until the
// meal starts, later runs check its menu again; if one of the favorites it named is gone, or another favorite was added,
// they get one short update. At most one alert and one update per meal per day.

/** A dish on today's menu: the hall (slug) and meal it's served at. */
export type DishToday = { dish: string; hall: string; meal: Meal };

/** Hall names as students say them, for the alert text. */
const HALL_NAME: Record<string, string> = { commons: "Soper Commons", mcewen: "McEwen", diner: "Howard Diner", "little-pub": "Little Pub" };
export const hallName = (slug: string) => HALL_NAME[slug] ?? slug;

/** Where tapping an alert takes you: the Menu. */
export const ALERT_URL = "/";

/** How far back a run looks for alert times it may have missed (a late or failed run), in minutes. */
const CATCH_UP = 2 * ALERT_STEP;

/** Dish names compared case-insensitively, since the posted menu sometimes changes a dish's capitalization. */
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Every dish on the menus for `day`, with each hall and meal it's served at (Howard Diner left out). */
export function dishesOn(data: MenuData, day: string): DishToday[] {
  const out: DishToday[] = [];
  const seen = new Set<string>();
  for (const [location, meals] of Object.entries(data.dates[day] ?? {})) {
    const hall = HALLS.find((h) => h.name === location)?.slug;
    if (!hall || hall === "diner") continue;
    for (const [meal, stations] of Object.entries(meals)) {
      if (!(MEALS as readonly string[]).includes(meal)) continue;
      for (const items of Object.values(stations))
        for (const item of items) {
          const dish = item.name.trim();
          const key = `${dish.toLowerCase()}|${hall}|${meal}`;
          if (!dish || seen.has(key)) continue;
          seen.add(key);
          out.push({ dish, hall, meal: meal as Meal });
        }
    }
  }
  return out;
}

/** The person's favorites among `today`'s dishes at `meal`, named the way they saved them, as "dish|hall" keys. */
export function favoritesAt(user: Pick<User, "favorites">, today: DishToday[], meal: Meal): string[] {
  const out = new Set<string>();
  for (const d of today) {
    if (d.meal !== meal) continue;
    const fav = user.favorites.find((f) => same(f, d.dish));
    if (fav) out.add(`${fav}|${d.hall}`);
  }
  return [...out].sort();
}

const split = (key: string) => {
  const i = key.lastIndexOf("|");
  return { dish: key.slice(0, i), hall: key.slice(i + 1) };
};

/** "a", "a and b", "a, b and c". */
const and = (words: string[]) => (words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`);

/** One line per dish with every hall it's at: "Poke Bowl at McEwen", "Pizza at Soper Commons and McEwen". */
function dishLines(keys: string[]) {
  const byDish = new Map<string, string[]>();
  for (const k of keys) {
    const { dish, hall } = split(k);
    byDish.set(dish, [...(byDish.get(dish) ?? []), hallName(hall)]);
  }
  return [...byDish].map(([dish, halls]) => `${dish} at ${and(halls.sort())}`);
}

export type AlertText = { title: string; lines: string[] };

/** A meal's alert: "Lunch: Poke Bowl is on" or "Lunch: 3 of your favorites are on", one line per dish. */
export function alertText(meal: Meal, keys: string[]): AlertText {
  const lines = dishLines(keys);
  const dishes = new Set(keys.map((k) => split(k).dish));
  const title = dishes.size === 1 ? `${meal}: ${[...dishes][0]} is on` : `${meal}: ${dishes.size} of your favorites are on`;
  return { title, lines };
}

/** A meal's correction: what's off the menu now, what was added, and what's still on. */
export function updateText(meal: Meal, before: string[], now: string[]): AlertText {
  const gone = before.filter((k) => !now.includes(k));
  const added = now.filter((k) => !before.includes(k));
  const still = now.filter((k) => before.includes(k));
  const lines = [
    ...gone.map((k) => `${split(k).dish} is off the menu at ${hallName(split(k).hall)}.`),
    ...added.map((k) => `${split(k).dish} is now on at ${hallName(split(k).hall)}.`),
    ...(still.length ? [`Still on: ${dishLines(still).join("; ")}.`] : []),
  ];
  return { title: `${meal} update`, lines };
}

/** One message: a meal's alert, or that meal's correction. */
export type Message = { meal: Meal; kind: "alert" | "update"; text: AlertText };
/**
 * One person's part of a run: the record of today's alerts to save first (claimSent), then the messages to send. The
 * messages can be empty when only the record changes (a meal was checked and none of their favorites are on).
 */
export type PersonPlan = { user: User; sent: SentToday; messages: Message[] };

/**
 * Today's record for this person, counting an older version's whole-day alert (lastAlert = today, with nothing recorded
 * yet) as every meal sent, so nobody gets a second alert on the day this version goes live.
 */
function todays(user: User, day: string): { record: SentToday; legacy: boolean } {
  if (user.sent?.day === day) return { record: user.sent, legacy: false };
  return { record: { day, meals: {} }, legacy: user.lastAlert === day };
}

/** The meals whose alert time has just come for this person (within CATCH_UP minutes), in order, without repeats. */
export function mealsDue(user: User, day: string, minutes: number, force = false): Meal[] {
  const times = force ? [minutes] : user.alertMinutes.filter((m) => m <= minutes && m > minutes - CATCH_UP);
  return [...new Set(times.map((m) => mealFor(day, m)).filter((m): m is Meal => m !== null))];
}

/** Whether a run at `minutes` needs today's menus at all: someone is due, or a correction may be needed. */
export function needsMenus(users: User[], day: string, minutes: number, force = false) {
  return users.some((u) => {
    const { record, legacy } = todays(u, day);
    if (legacy) return false;
    if (mealsDue(u, day, minutes, force).some((m) => !record.meals[m])) return true;
    return Object.entries(record.meals).some(([meal, s]) => pendingUpdate(s, day, meal as Meal, minutes));
  });
}

/** A meal's correction can still go out: its alert went, its update hasn't, and the meal hasn't started yet. */
function pendingUpdate(s: SentMeal | undefined, day: string, meal: Meal, minutes: number) {
  const start = mealStart(day, meal);
  return !!s && !s.updated && start !== null && minutes < start;
}

/**
 * Everything to send in a run at `minutes` (campus time) on `day`. A meal with no dishes on today's menus at all (not
 * posted yet, or a menu outage) is left alone: no alert, and no correction claiming every favorite is gone. The same
 * goes for one hall: favorites at a hall whose menu for that meal is missing right now count as unchanged.
 * `force` sends each person the alert for the meal at the current time, whatever their times are (for testing).
 */
export function plan(users: User[], data: MenuData, day: string, minutes: number, force = false): PersonPlan[] {
  const today = dishesOn(data, day);
  const posted = new Set(today.map((d) => d.meal));
  // Which halls have each meal's menu up right now ("Lunch|mcewen"): a correction only compares those, so one hall's
  // menu going missing for a while doesn't report its dishes as "off the menu".
  const postedAt = new Set(today.map((d) => `${d.meal}|${d.hall}`));
  const plans: PersonPlan[] = [];
  for (const user of users) {
    const { record, legacy } = todays(user, day);
    if (legacy) continue;
    const meals = { ...record.meals };
    const messages: Message[] = [];
    for (const meal of mealsDue(user, day, minutes, force)) {
      if (meals[meal] || !posted.has(meal)) continue;
      const keys = favoritesAt(user, today, meal);
      // Recorded even when none of their favorites are on, so a second time for the same meal doesn't check again.
      meals[meal] = { dishes: keys, updated: false };
      if (keys.length) messages.push({ meal, kind: "alert", text: alertText(meal, keys) });
    }
    for (const meal of MEALS) {
      const s = record.meals[meal];
      if (!s?.dishes.length || !pendingUpdate(s, day, meal, minutes) || !posted.has(meal)) continue;
      const missing = s.dishes.filter((k) => !postedAt.has(`${meal}|${split(k).hall}`));
      const now = [...new Set([...favoritesAt(user, today, meal), ...missing])].sort();
      if (now.join() === s.dishes.join()) continue;
      meals[meal] = { dishes: now, updated: true };
      messages.push({ meal, kind: "update", text: updateText(meal, s.dishes, now) });
    }
    if (JSON.stringify(meals) !== JSON.stringify(record.meals)) plans.push({ user, sent: { day, meals }, messages });
  }
  return plans;
}
