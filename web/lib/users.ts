import "server-only";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { localMode } from "@/lib/localMode";

// Everything HamEats saves lives in one DynamoDB table, one item per person who has logged in:
//
//   email      the partition key: their lowercased Hamilton email (lib/auth.ts). Never shown in full.
//   favorites  the dishes they saved, in the order they saved them
//   notify     whether the daily alert about their favorites goes to their phones (push)
//   push       while notify is on: the push address of each phone that allowed notifications. Without it a phone
//              can't be reached. Turning notifications off erases it.
//   emailAlerts whether the daily alert also goes to their Hamilton email (the partition key)
//   alertMinute when the daily alert goes out: minutes after midnight on campus (Eastern), a multiple of 15. Unset = 8 AM.
//   lastAlert  the campus date ("YYYY-MM-DD") the last alert was sent, so nobody gets two in a day
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
  alertMinute: number;
  lastAlert: string;
  createdAt: string;
};

/** When the daily alert goes out unless the person picks another time: 8 AM on campus. */
export const DEFAULT_ALERT_MINUTE = 8 * 60;
/** Alert times are picked in steps of this many minutes (the scheduler runs this often). */
export const ALERT_STEP = 15;
export const validAlertMinute = (m: unknown): m is number => Number.isInteger(m) && (m as number) >= 0 && (m as number) < 24 * 60 && (m as number) % ALERT_STEP === 0;

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
  alertMinute: validAlertMinute(item?.alertMinute) ? item.alertMinute : DEFAULT_ALERT_MINUTE,
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
async function update(email: string, change: (u: User) => Partial<Omit<User, "email" | "createdAt" | "lastAlert">> | null): Promise<User> {
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
            "SET favorites = :f, notify = :n, push = :p, emailAlerts = :e, alertMinute = :m, createdAt = if_not_exists(createdAt, :c), version = :v1",
          ConditionExpression: Item ? "version = :v0 OR attribute_not_exists(version)" : "attribute_not_exists(email)",
          ExpressionAttributeValues: {
            ":f": next.favorites,
            ":n": next.notify,
            ":p": next.push,
            ":e": next.emailAlerts,
            ":m": next.alertMinute,
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

/** Sets when the daily alert goes out (minutes after midnight on campus). */
export async function setAlertMinute(email: string, minute: number) {
  if (!validAlertMinute(minute)) throw new Error("bad alert time");
  await update(email, (u) => (u.alertMinute === minute ? null : { alertMinute: minute }));
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
 * Notes that today's alert went to this person. Only lastAlert is written, so it can't undo a change they make
 * at the same moment.
 */
export async function markAlerted(email: string, day: string) {
  const item = localMode() ? memory().get(email) : undefined;
  if (item) item.lastAlert = day;
  if (localMode()) return;
  await db().send(
    new UpdateCommand({
      TableName: table(),
      Key: { email },
      UpdateExpression: "SET lastAlert = :d",
      ConditionExpression: "attribute_exists(email)",
      ExpressionAttributeValues: { ":d": day },
    }),
  );
}

/** Whether this person gets alerts at all: push with at least one phone, or email. */
export const wantsAlerts = (u: User) => (u.notify && u.push.length > 0) || u.emailAlerts;

/**
 * Everyone with push (and at least one phone) or email alerts on. The whole table is read (it's tiny: a few KB); past
 * a few thousand people, an index on alertMinute would be cheaper.
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
