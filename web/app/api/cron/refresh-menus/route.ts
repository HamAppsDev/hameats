import { timingSafeEqual } from "node:crypto";
import { countItems, fetchMenus } from "@/lib/menuSource";

export const dynamic = "force-dynamic";

/** Same check as the daily alerts: only the Lambda handler, invoked by EventBridge Scheduler, knows CRON_SECRET. */
function fromScheduler(request: Request) {
  const secret = process.env.CRON_SECRET;
  const got = request.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  return !!secret && secret.length >= 16 && got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

/**
 * The scheduled menu refresh (times in infra/aws/hameats.yaml). Fetches the menus fresh and says how many dishes came
 * back. The Lambda handler (web/lambda/index.mjs) clears CloudFront's copy of the home page only when `items` > 0, so a
 * menu API outage leaves the last good page up instead of replacing it.
 */
export async function GET(request: Request) {
  if (!fromScheduler(request)) return new Response("unauthorized", { status: 401 });
  try {
    const items = countItems(await fetchMenus(7, 0));
    return Response.json({ items });
  } catch (e) {
    console.error("menu refresh: fetch failed:", e);
    return Response.json({ items: 0, error: String(e) }, { status: 502 });
  }
}
