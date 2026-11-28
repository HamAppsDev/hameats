import { timingSafeEqual } from "node:crypto";
import { sendPlans } from "@/lib/alerts";
import { needsMenus, plan } from "@/lib/alertPlan";
import { localMode } from "@/lib/localMode";
import { storeEnabled, usersToNotify } from "@/lib/users";
import { campusNow } from "@/lib/hours";
import { fetchMenus } from "@/lib/menuSource";
import { withMirroredMenus } from "@/lib/mirroredMenus";
import { withSpecials } from "@/lib/specials";
import { withStandingMenus } from "@/lib/standingMenus";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The scheduler sends "Authorization: Bearer <CRON_SECRET>": on AWS, the Lambda handler (web/lambda/index.mjs) does,
 * when EventBridge Scheduler invokes it (infra/aws/hameats.yaml). Nothing else may start the alerts.
 */
function fromScheduler(request: Request) {
  // Local test mode (lib/localMode.ts) has no scheduler: anyone running `npm run dev` can start a run by hand.
  if (localMode()) return true;
  const secret = process.env.CRON_SECRET;
  const got = request.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  return !!secret && secret.length >= 16 && got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

/**
 * The alerts (lib/alertPlan.ts). EventBridge Scheduler runs this every 15 minutes, campus time; each run sends the meal
 * alerts whose time has just come and any corrections, then answers 200 with the counts, even when a single push or
 * email failed (those are in `failed`). Only a run that fails as a whole answers 500, which sets off the alarm. The menus
 * are only fetched when someone is due or a correction may be needed. ?force=1 sends everyone the alert for the meal at
 * the current time, whatever their times, for testing. In local test mode, ?at=HH:MM and ?day=YYYY-MM-DD run as if it
 * were that time and day (within the week of menus).
 */
export async function GET(request: Request) {
  if (!fromScheduler(request)) return new Response("unauthorized", { status: 401 });
  if (!storeEnabled()) return Response.json({ skipped: "favorites table not set up" });
  const params = new URL(request.url).searchParams;
  const now = campusNow();
  const at = localMode() ? /^(\d{1,2}):(\d{2})$/.exec(params.get("at") ?? "") : null;
  const minutes = at ? Number(at[1]) * 60 + Number(at[2]) : now.minutes;
  const day = (localMode() && /^\d{4}-\d{2}-\d{2}$/.exec(params.get("day") ?? "")?.[0]) || now.iso;
  const force = params.get("force") === "1";
  try {
    const everyone = await usersToNotify();
    if (!needsMenus(everyone, day, minutes, force)) return Response.json({ due: 0 });
    const menus = withSpecials(withMirroredMenus(withStandingMenus(await fetchMenus(day === now.iso ? 1 : 7, 0))));
    const result = await sendPlans(plan(everyone, menus, day, minutes, force));
    // Not "alerts:": the failure alarm matches that prefix (web/lambda/index.mjs logs "alerts: <status> ..." for each run).
    console.log("alert run:", JSON.stringify(result));
    return Response.json(result);
  } catch (e) {
    console.error("alerts failed:", e);
    return new Response("failed", { status: 500 });
  }
}
