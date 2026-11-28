import "server-only";
import webpush from "web-push";
import { HALLS } from "@/lib/halls";
import { MEALS, type MenuData } from "@/lib/types";
import { emailReady, sendAlertEmail } from "@/lib/email";
import { ALERT_STEP, forgetPhone, markAlerted, sameDish, type User } from "@/lib/users";

// The daily alert: for everyone who turned alerts on, at the time they picked, their favorites that are on today's
// menu, each with its dining hall and meal, as one push notification to their phones and/or one email. Only the date
// it was sent is saved. Howard Diner dishes are left out: the Diner serves them every day.

export type DishToday = { dish: string; hall: string; meal: string };

/** Hall names as students say them, for the notification text. */
const HALL_NAME: Record<string, string> = { commons: "Soper Commons", mcewen: "McEwen", diner: "Howard Diner", "little-pub": "Little Pub" };
export const hallName = (slug: string) => HALL_NAME[slug] ?? slug;

const mealRank = (meal: string) => ((MEALS as readonly string[]).indexOf(meal) + 4) % 4; // Unknown meals go last.

/** Where tapping the notification takes you: the Menu. */
export const ALERT_URL = "/";

/** Every dish on the menus for `day`, with each hall and meal it's served at (Howard Diner left out), in meal order. */
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
          out.push({ dish, hall, meal });
        }
    }
  }
  return out.sort((a, b) => mealRank(a.meal) - mealRank(b.meal) || a.dish.localeCompare(b.dish) || a.hall.localeCompare(b.hall));
}

/** The person's favorites among today's dishes, named the way they saved them. */
export function favoritesToday(user: Pick<User, "favorites">, today: DishToday[]): DishToday[] {
  const out: DishToday[] = [];
  for (const d of today) {
    const fav = user.favorites.find((f) => sameDish(f, d.dish));
    if (fav) out.push({ ...d, dish: fav });
  }
  return out;
}

/** "a", "a and b", "a, b and c". */
const and = (words: string[]) => (words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`);

/**
 * One line per dish, naming every hall and meal it's served at: "Chicken Riggies at McEwen for dinner",
 * "Pizza at Soper Commons and McEwen for lunch", "Pancakes at Soper Commons for breakfast, McEwen for lunch".
 */
export function dishLines(dishes: DishToday[]) {
  const byDish = new Map<string, Map<string, Set<string>>>();
  for (const d of dishes) {
    const meals = byDish.get(d.dish) ?? new Map<string, Set<string>>();
    meals.set(d.meal, (meals.get(d.meal) ?? new Set()).add(hallName(d.hall)));
    byDish.set(d.dish, meals);
  }
  return [...byDish].map(([dish, meals]) => {
    // Meals in order; neighbouring meals at the same halls are named together ("for lunch and dinner").
    const parts: { halls: string; meals: string[] }[] = [];
    for (const meal of [...meals.keys()].sort((a, b) => mealRank(a) - mealRank(b))) {
      const halls = and([...meals.get(meal)!].sort());
      const last = parts[parts.length - 1];
      if (last?.halls === halls) last.meals.push(meal.toLowerCase());
      else parts.push({ halls, meals: [meal.toLowerCase()] });
    }
    return `${dish} at ${parts.map((p) => `${p.halls} for ${and(p.meals)}`).join(", ")}`;
  });
}

/** Lines shown on the phone's notification before "and N more". */
const PUSH_LINES = 4;

/** The notification: the title, every dish with its hall and meal, and where tapping it goes. */
export function alertText(dishes: DishToday[]) {
  const lines = dishLines(dishes);
  const title = lines.length === 1 ? `${dishes[0].dish} is on today` : `${lines.length} of your favorites are on today`;
  const shown = lines.length > PUSH_LINES ? [...lines.slice(0, PUSH_LINES - 1), `and ${lines.length - PUSH_LINES + 1} more`] : lines;
  return { title, body: lines.join("\n"), pushBody: shown.join("\n"), url: ALERT_URL };
}

type PushSender = (sub: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string) => Promise<void>;
type EmailSender = (to: string, title: string, lines: string[]) => Promise<void>;

/** How far back a run looks for alert times it may have missed (a late or failed run), in minutes. */
const CATCH_UP = 2 * ALERT_STEP;

/** The test login (lib/auth.ts) has no mailbox; emailing it would bounce. */
const mailable = (email: string) => !email.endsWith("@hameats.app");

/**
 * Who is due an alert at `minutes` (campus time) on `day`: their alert time has come within the last CATCH_UP minutes,
 * and they haven't had one today. Times later than now wait for a later run.
 */
export const dueNow = (users: User[], day: string, minutes: number) =>
  users.filter((u) => u.lastAlert !== day && u.alertMinute <= minutes && u.alertMinute > minutes - CATCH_UP);

/**
 * Sends today's alerts to `people` (from dueNow): a push notification to each of their phones (when push is set up:
 * VAPID keys) and an email (when SES is set up and they turned email on). Phones that no longer accept notifications
 * (404 or 410) are forgotten. Everyone reached is marked for today, so later runs skip them.
 */
export async function sendAlerts(
  data: MenuData,
  day: string,
  people: User[],
  push: PushSender | null = pushReady() ? defaultPushSender() : null,
  email: EmailSender | null = emailReady() ? sendAlertEmail : null,
) {
  const today = dishesOn(data, day);
  const result = { due: people.length, withFavorites: 0, pushed: 0, emailed: 0, removed: 0, failed: 0 };
  if (!today.length) return result;
  for (const user of people) {
    const dishes = favoritesToday(user, today);
    if (!dishes.length) continue;
    result.withFavorites++;
    const text = alertText(dishes);
    let reached = false;
    if (push && user.notify) {
      const payload = JSON.stringify({ title: text.title, body: text.pushBody, url: text.url, tag: `menu-${day}` });
      let delivered = false;
      for (const p of user.push) {
        try {
          await push({ endpoint: p.endpoint, keys: { p256dh: p.p256dh, auth: p.auth } }, payload);
          delivered = true;
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await forgetPhone(user.email, p.endpoint);
            result.removed++;
          } else {
            result.failed++;
            console.error("push failed:", status, (e as Error).message);
          }
        }
      }
      if (delivered) result.pushed++;
      reached ||= delivered;
    }
    if (email && user.emailAlerts && mailable(user.email)) {
      try {
        await email(user.email, text.title, dishLines(dishes));
        result.emailed++;
        reached = true;
      } catch (e) {
        result.failed++;
        console.error("email failed:", (e as { name?: string }).name, (e as Error).message);
      }
    }
    if (reached) await markAlerted(user.email, day);
  }
  return result;
}

export const pushReady = () => !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY;

function defaultPushSender(): PushSender {
  webpush.setVapidDetails("mailto:bntaylor@hamilton.edu", process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  return async (sub, payload) => {
    await webpush.sendNotification(sub, payload, { TTL: 6 * 3600, urgency: "normal" });
  };
}
