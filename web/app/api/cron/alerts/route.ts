import { timingSafeEqual } from "node:crypto";
import { dueNow, sendAlerts } from "@/lib/alerts";
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
  const secret = process.env.CRON_SECRET;
  const got = request.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  return !!secret && secret.length >= 16 && got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

/**
 * The daily alerts, each at the time its person picked. EventBridge Scheduler runs this every 15 minutes, campus time;
 * each run sends to the people whose time has just come (lib/alerts.ts dueNow). The menus are only fetched when
 * someone is due. ?force=1 sends to everyone with alerts on who hasn't had one today, whatever their time, for testing.
 */
export async function GET(request: Request) {
  if (!fromScheduler(request)) return new Response("unauthorized", { status: 401 });
  if (!storeEnabled()) return Response.json({ skipped: "favorites table not set up" });
  const now = campusNow();
  const force = new URL(request.url).searchParams.get("force") === "1";
  try {
    const everyone = await usersToNotify();
    const due = force ? everyone.filter((u) => u.lastAlert !== now.iso) : dueNow(everyone, now.iso, now.minutes);
    if (!due.length) return Response.json({ due: 0 });
    const menus = await fetchMenus(1, 0);
    const result = await sendAlerts(withSpecials(withMirroredMenus(withStandingMenus(menus))), now.iso, due);
    console.log("alerts:", JSON.stringify(result));
    return Response.json(result);
  } catch (e) {
    console.error("alerts failed:", e);
    return new Response("failed", { status: 500 });
  }
}
