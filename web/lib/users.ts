import "server-only";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { localMode } from "@/lib/localMode";
import { DEFAULT_ALERT_MINUTE, cleanAlertMinutes, validAlertMinute } from "@/lib/alertMeals";
import type { Meal } from "@/lib/types";

// Everything HamEats saves lives in one DynamoDB table, one item per person who has logged in:
//
//   email      the partition key: their lowercased Hamilton email (lib/auth.ts). Never shown in full.
//   favorites  the dishes they saved, in the order they saved them
//   notify     whether the daily alert about their favorites goes to their phones (push)
//   push       while notify is on: the push address of each phone that allowed notifications. Without it a phone
//              can't be reached. Turning notifications off erases it.
//   emailAlerts whether the daily alert also goes to their Hamilton email (the partition key)
//   alertMinutes when the alerts go out: 1-3 times, minutes after midnight on campus (Eastern), multiples of 15. Each
//              covers one meal (lib/alertMeals.ts). Older items have a single alertMinute instead, read as the only time;
//              alertMinute is still written (the first time) so an older version of the app reads them right.
//   sent       today's alerts only, overwritten each day: { day, meals: { Lunch: { dishes, updated } } }. `dishes` are
//              the favorites that alert named ("Poke Bowl|mcewen"), so a later run can tell if the menu changed, and
//              `updated` says the one correction for that meal has gone out. sentRev counts writes to it, so two runs
//              can't both claim the same send.
//   lastAlert  from older versions: the date the last whole-day alert went out. If it's today, today counts as sent.
//   createdAt  when they first logged in
//
// Settings: HAMEATS_DYNAMODB_TABLE, and HAMEATS_AWS_REGION (or AWS_REGION, which AWS sets on its own servers). Running on
// AWS, the server's role grants access to the table, so no key is needed. Anywhere else (Vercel, a laptop), also set
// HAMEATS_AWS_ACCESS_KEY_ID and HAMEATS_AWS_SECRET_ACCESS_KEY. Vercel keeps the plain AWS_* names for itself, hence the
// prefix. See .env.local.example and infra/aws/README.md.

export type PushAddress = { endpoint: string; p256dh: string; auth: string };
export type User = {
  email: string;
  favorites: string[];
  notify: boolean;
  push: PushAddress[];
  emailAlerts: boolean;
  alertMinutes: number[];
  sent: SentToday | null;
  sentRev: number;
  lastAlert: string;
  createdAt: string;
};

/** One meal's alert today: the favorites it named, as "dish|hall", and whether its one correction has gone out. */
export type SentMeal = { dishes: string[]; updated: boolean };
export type SentToday = { day: string; meals: Partial<Record<Meal, SentMeal>> };

const readSent = (v: unknown): SentToday | null => {
  const s = v as SentToday | undefined;
  return s && typeof s.day === "string" && s.meals && typeof s.meals === "object" ? s : null;
};

/** Most favorites one person can keep. */
export const MAX_FAVORITES = 300;
/** Most phones one person can get notifications on. The oldest is dropped past this. */
const MAX_PHONES = 5;

const env = (name: string) => process.env[name]?.trim() || "";

const region = () => env("HAMEATS_AWS_REGION") || env("AWS_REGION");

/**
 * Whether favorites and notifications work: the table is set up, or local test mode keeps everyone in memory instead
 * (lib/localMode.ts). Otherwise they're switched off and the rest of the app runs as before.
 */
export const storeEnabled = () => !!(region() && env("HAMEATS_DYNAMODB_TABLE")) || localMode();

/**
 * Local test mode's stand-in for the table: one item per email, kept in the dev server's memory (on globalThis, so it
 * survives hot reloads) and gone when the server restarts.
 */
const memory = () => ((globalThis as { hameatsLocalUsers?: Map<string, Record<string, unknown>> }).hameatsLocalUsers ??= new Map());

let client: DynamoDBDocumentClient | undefined;
const db = () =>
  (client ??= DynamoDBDocumentClient.from(
    new DynamoDBClient({
      region: region(),
      // A key when one is given; otherwise the AWS SDK finds the server's role by itself.
      ...(env("HAMEATS_AWS_ACCESS_KEY_ID") && env("HAMEATS_AWS_SECRET_ACCESS_KEY")
        ? { credentials: { accessKeyId: env("HAMEATS_AWS_ACCESS_KEY_ID"), secretAccessKey: env("HAMEATS_AWS_SECRET_ACCESS_KEY") } }
        : {}),
      // Lets tests point at a local DynamoDB. Unset in production.
      ...(env("HAMEATS_DYNAMODB_ENDPOINT") ? { endpoint: env("HAMEATS_DYNAMODB_ENDPOINT") } : {}),
    }),
    { marshallOptions: { removeUndefinedValues: true } },
  ));
const table = () => env("HAMEATS_DYNAMODB_TABLE");

const toUser = (email: string, item: Record<string, unknown> | undefined): User => ({
  email,
  favorites: Array.isArray(item?.favorites) ? (item.favorites as string[]) : [],
  notify: item?.notify === true,
  push: Array.isArray(item?.push) ? (item.push as PushAddress[]) : [],
  emailAlerts: item?.emailAlerts === true,
  alertMinutes:
    cleanAlertMinutes(item?.alertMinutes) ?? [validAlertMinute(item?.alertMinute) ? (item.alertMinute as number) : DEFAULT_ALERT_MINUTE],
  sent: readSent(item?.sent),
  sentRev: typeof item?.sentRev === "number" ? item.sentRev : 0,
  lastAlert: typeof item?.lastAlert === "string" ? item.lastAlert : "",
  createdAt: typeof item?.createdAt === "string" ? item.createdAt : new Date().toISOString(),
});

/** The person's record, created the first time they're seen. */
export async function getUser(email: string): Promise<User> {
  if (localMode()) {
    if (!memory().has(email)) memory().set(email, { email, createdAt: new Date().toISOString(), favorites: [], notify: false, push: [] });
    return toUser(email, memory().get(email));
  }
  const { Item } = await db().send(new GetCommand({ TableName: table(), Key: { email }, ConsistentRead: true }));
  if (Item) return toUser(email, Item);
  // First visit: create it, unless another request just did.
  const { Attributes } = await db().send(
    new UpdateCommand({
      TableName: table(),
      Key: { email },
      UpdateExpression: "SET createdAt = if_not_exists(createdAt, :now), favorites = if_not_exists(favorites, :none), notify = if_not_exists(notify, :off), push = if_not_exists(push, :none)",
      ExpressionAttributeValues: { ":now": new Date().toISOString(), ":none": [], ":off": false },
      ReturnValues: "ALL_NEW",
    }),
  );
  return toUser(email, Attributes);
}

/**
 * Changes the person's record: reads it, applies `change`, and writes back only if nobody else changed it in between
 * (two phones tapping at once), trying again if they did. `change` returns the fields to save, or null to save nothing.
 */
async function update(
  email: string,
  change: (u: User) => Partial<Omit<User, "email" | "createdAt" | "lastAlert" | "sent" | "sentRev">> | null,
): Promise<User> {
  if (localMode()) {
    const user = toUser(email, memory().get(email));
    const fields = change(user);
    if (!fields) return user;
    const next = { ...user, ...fields };
    memory().set(email, { ...memory().get(email), ...next });
    return next;
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const { Item } = await db().send(new GetCommand({ TableName: table(), Key: { email }, ConsistentRead: true }));
    const user = toUser(email, Item);
    const fields = change(user);
    if (!fields) return user;
    const version = typeof Item?.version === "number" ? Item.version : 0;
    const next = { ...user, ...fields };
    try {
      await db().send(
        new UpdateCommand({
          TableName: table(),
          Key: { email },
          UpdateExpression:
            "SET favorites = :f, notify = :n, push = :p, emailAlerts = :e, alertMinutes = :ms, alertMinute = :m, createdAt = if_not_exists(createdAt, :c), version = :v1",
          ConditionExpression: Item ? "version = :v0 OR attribute_not_exists(version)" : "attribute_not_exists(email)",
          ExpressionAttributeValues: {
            ":f": next.favorites,
            ":n": next.notify,
            ":p": next.push,
            ":e": next.emailAlerts,
            ":ms": next.alertMinutes,
            ":m": next.alertMinutes[0],
            ":c": user.createdAt,
            ":v1": version + 1,
            ...(Item ? { ":v0": version } : {}),
          },
        }),
      );
      return next;
    } catch (e) {
      if ((e as { name?: string }).name !== "ConditionalCheckFailedException") throw e;
    }
  }
  throw new Error("too many changes at once");
}

/** Dish names compared case-insensitively, since the posted menu sometimes changes a dish's capitalization. */
export const sameDish = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// ---- Favorites

/** Saves dishes as favorites (ones already saved are left alone). Null when that would go past MAX_FAVORITES. */
export async function addFavorites(email: string, dishes: string[]): Promise<string[] | null> {
  let full = false;
  const user = await update(email, (u) => {
    const added = dishes.filter((d, i) => !u.favorites.some((f) => sameDish(f, d)) && dishes.findIndex((x) => sameDish(x, d)) === i);
    if (!added.length) return null;
    if (u.favorites.length + added.length > MAX_FAVORITES) {
      full = true;
      return null;
    }
    return { favorites: [...u.favorites, ...added] };
  });
  return full ? null : user.favorites;
}

export async function removeFavorite(email: string, dish: string): Promise<string[]> {
  const user = await update(email, (u) => (u.favorites.some((f) => sameDish(f, dish)) ? { favorites: u.favorites.filter((f) => !sameDish(f, dish)) } : null));
  return user.favorites;
}

// ---- Notifications

/** Turns push alerts on for this phone (its push address), or off everywhere (every push address is erased). */
export async function setNotify(email: string, on: true, phone: PushAddress): Promise<void>;
export async function setNotify(email: string, on: false): Promise<void>;
export async function setNotify(email: string, on: boolean, phone?: PushAddress) {
  await update(email, (u) =>
    on && phone
      ? { notify: true, push: [...u.push.filter((p) => p.endpoint !== phone.endpoint), phone].slice(-MAX_PHONES) }
      : { notify: false, push: [] },
  );
}

/** Turns the alert email on or off. */
export async function setEmailAlerts(email: string, on: boolean) {
  await update(email, (u) => (u.emailAlerts === on ? null : { emailAlerts: on }));
}

/** Sets when the alerts go out: 1-3 times (minutes after midnight on campus), cleaned by cleanAlertMinutes. */
export async function setAlertMinutes(email: string, minutes: number[]) {
  const times = cleanAlertMinutes(minutes);
  if (!times) throw new Error("bad alert times");
  await update(email, (u) => (u.alertMinutes.join() === times.join() ? null : { alertMinutes: times }));
}

/** A phone that no longer accepts notifications (its push service said 404 or 410). Off when it was their last one. */
export async function forgetPhone(email: string, endpoint: string) {
  await update(email, (u) => {
    if (!u.push.some((p) => p.endpoint === endpoint)) return null;
    const push = u.push.filter((p) => p.endpoint !== endpoint);
    return { push, notify: push.length > 0 && u.notify };
  });
}

/**
 * Records today's alerts for this person (`next`, which replaces yesterday's), but only if nobody else recorded something
 * since `user` was read (sentRev unchanged). Called just BEFORE an alert or correction is sent, so a run that's retried, or
 * two runs at once, can't send it twice: the second one finds sentRev changed and gets false. Only sent and sentRev are
 * written, so it can't undo a settings change made at the same moment.
 */
export async function claimSent(user: User, next: SentToday): Promise<boolean> {
  if (localMode()) {
    const item = memory().get(user.email);
    if (!item || (typeof item.sentRev === "number" ? item.sentRev : 0) !== user.sentRev) return false;
    Object.assign(item, { sent: next, sentRev: user.sentRev + 1 });
    return true;
  }
  try {
    await db().send(
      new UpdateCommand({
        TableName: table(),
        Key: { email: user.email },
        UpdateExpression: "SET sent = :s, sentRev = :r1",
        ConditionExpression: "attribute_exists(email) AND (sentRev = :r0 OR attribute_not_exists(sentRev))",
        ExpressionAttributeValues: { ":s": next, ":r0": user.sentRev, ":r1": user.sentRev + 1 },
      }),
    );
    return true;
  } catch (e) {
    if ((e as { name?: string }).name === "ConditionalCheckFailedException") return false;
    throw e;
  }
}

/** Whether this person gets alerts at all: push with at least one phone, or email. */
export const wantsAlerts = (u: User) => (u.notify && u.push.length > 0) || u.emailAlerts;

/**
 * Everyone with push (and at least one phone) or email alerts on. The whole table is read (it's tiny: a few KB); past
 * a few thousand people, an index would be cheaper.
 */
export async function usersToNotify(): Promise<User[]> {
  if (localMode()) return [...memory().entries()].map(([email, item]) => toUser(email, item)).filter(wantsAlerts);
  const users: User[] = [];
  let start: Record<string, unknown> | undefined;
  do {
    const page = await db().send(
      new ScanCommand({
        TableName: table(),
        FilterExpression: "(notify = :on AND size(push) > :zero) OR emailAlerts = :on",
        ExpressionAttributeValues: { ":on": true, ":zero": 0 },
        ExclusiveStartKey: start,
      }),
    );
    for (const item of page.Items ?? []) users.push(toUser(item.email as string, item));
    start = page.LastEvaluatedKey;
  } while (start);
  return users;
}
