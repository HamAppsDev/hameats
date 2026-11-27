import saved from "@/public/dining_menu.json";
import { lastGoodMenus, rememberMenus } from "@/lib/lastGoodMenus";
import { countItems, fetchMenus } from "@/lib/menuSource";
import type { MenuData } from "@/lib/types";
import { HomeClient } from "./HomeClient";

// The page is made fresh, with the menus inside it, each time the server is asked for it. That happens rarely:
// CloudFront keeps one copy for everyone (the page has nothing personal in it; sign-in and favorites load
// afterwards in the browser) and only asks again after the scheduled menu refreshes clear it, at the times in
// infra/aws/hameats.yaml (MenuRefreshHourly / MenuRefreshQuarters). The Lambda handler marks this page cacheable
// for CloudFront (web/lambda/index.mjs).
export const dynamic = "force-dynamic";

export default async function Home() {
  const live = await fetchMenus(7, 0).catch((e) => {
    console.error("menu fetch failed:", e);
    return null;
  });
  if (live && countItems(live) > 0) {
    rememberMenus(live);
    return <HomeClient initialMenu={live} />;
  }

  // The menu API is down or returned nothing: the last good menus, else the saved file (whose age sends the
  // app to fetch fresh menus). The scheduled refresh checks the page works before clearing CloudFront's copy,
  // so the copy students see is normally left alone when this happens.
  const lastGood = lastGoodMenus();
  console.error("menu API returned no items; using", lastGood ? "the last good menus" : "the saved file");
  return <HomeClient initialMenu={lastGood ?? (saved as MenuData)} />;
}
