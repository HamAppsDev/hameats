import type { MealMenu, MenuData, MenuItem } from "./types";

// Fetches the dining halls' posted menus on the server.

const BASE_API = "https://hamiltoncollege.api.nutrislice.com";
const TIME_ZONE = "America/New_York";

const LOCATIONS: Record<string, string> = {
  "soper-commons": "Soper Commons",
  mcewen: "McEwen Dining Hall",
  "howard-diner": "Howard Diner",
  "little-pub": "Little Pub",
};
const MEALS = ["breakfast", "lunch", "dinner"];

type ApiMenuItem = {
  is_station_header?: boolean;
  is_section_title?: boolean;
  text?: string;
  food?: {
    name?: string;
    description?: string | null;
    ingredients?: string | null;
    serving_size_info?: { serving_size_amount?: string | number | null; serving_size_unit?: string | null } | null;
    rounded_nutrition_info?: Record<string, number | null | undefined> | null;
    icons?: { food_icons?: { name?: string }[] };
  } | null;
};

type ApiWeek = { days?: { date?: string; menu_items?: ApiMenuItem[] }[] };
type ApiSchool = { slug: string; active_menu_types?: { slug: string }[] };

async function getJson<T>(url: string, revalidate: number): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" }, next: { revalidate } });
  if (!res.ok) throw new Error(`GET ${url}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** "YYYY-MM-DD" for today on campus, regardless of the server's time zone. */
function hamiltonToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date());
}

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday. */
const weekday = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();

/** Sunday that starts the menu week containing `iso`. */
const sundayOf = (iso: string) => addDays(iso, -weekday(iso));

/**
 * Locations that serve the same menu every week but only have it posted for past weeks
 * (Little Pub), and how far back to look for their latest posted week.
 */
const REPEATS_WEEKLY = new Set(["little-pub"]);
const LOOKBACK_WEEKS = 8;

/**
 * Per-day corrections to the station the posted menu files an item under. Each entry moves the named items out of
 * `from` and into `to` for that date, location and meal.
 */
const STATION_MOVES = [
  {
    date: "2026-10-03",
    location: "Soper Commons",
    meal: "Dinner",
    from: "Fresh Stock",
    to: "Inspired Eats",
    items: ["Basmati Rice Pilaf", "Chipotle Brown Sugar Chicken"],
  },
];

function applyStationMoves(stations: MealMenu, date: string, location: string, meal: string) {
  for (const m of STATION_MOVES) {
    if (m.date !== date || m.location !== location || m.meal !== meal) continue;
    const moved = (stations[m.from] ?? []).filter((x) => m.items.includes(x.name));
    if (!moved.length) continue;
    stations[m.from] = stations[m.from].filter((x) => !m.items.includes(x.name));
    if (!stations[m.from].length) delete stations[m.from];
    const dest = (stations[m.to] ??= []);
    dest.push(...moved.filter((x) => !dest.some((d) => d.name === x.name)));
  }
}

/**
 * Per-day swaps for a dish the hall changed after the menu was posted. The new dish keeps the old one's place in
 * its station but none of its recipe: no calories, nutrition, ingredients, serving size or diet tags, since those
 * belong to the dish that was replaced. `match` finds the old dish by name.
 */
const ITEM_SWAPS = [
  {
    date: "2026-10-07",
    location: "McEwen Dining Hall",
    meal: "Dinner",
    match: (name: string) => /chicken/i.test(name) && /sticky honey/i.test(name),
    name: "Salmon with Sticky Honey",
  },
];

function applyItemSwaps(stations: MealMenu, date: string, location: string, meal: string) {
  for (const swap of ITEM_SWAPS) {
    if (swap.date !== date || swap.location !== location || swap.meal !== meal) continue;
    for (const items of Object.values(stations)) {
      const i = items.findIndex((x) => swap.match(x.name));
      if (i >= 0) items[i] = { name: swap.name, calories: null, tags: [] };
    }
  }
}

/**
 * Per-day additions for a dish the hall is serving that the posted menu left off. The dish goes first in its station
 * (the main dish leads) with no calories or diet tags, since nothing is known about it beyond its name.
 */
const ITEM_ADDS = [
  {
    date: "2026-10-22",
    location: "Soper Commons",
    meal: "Dinner",
    station: "Spoon & Fork",
    name: "Barbecued Shredded Chicken",
  },
];

function applyItemAdds(stations: MealMenu, date: string, location: string, meal: string) {
  for (const add of ITEM_ADDS) {
    if (add.date !== date || add.location !== location || add.meal !== meal) continue;
    const items = (stations[add.station] ??= []);
    if (!items.some((x) => x.name.toLowerCase() === add.name.toLowerCase()))
      items.unshift({ name: add.name, calories: null, tags: [] });
  }
}

/**
 * Menus corrected from the signs at the serving line, for a day when the posted menu was missing or wrong. Each entry
 * replaces the whole station, in the order of the sign. A dish that the posted menu also lists under the same name keeps its
 * nutrition and ingredients; the diet and allergen tags come from the sign.
 */
const STATION_REPLACEMENTS: {
  date: string;
  location: string;
  meal: string;
  stations: Record<string, { name: string; tags: string[] }[]>;
}[] = [
  {
    date: "2026-10-12",
    location: "Soper Commons",
    meal: "Dinner",
    stations: {
      V2: [
        { name: "White Bean And Lentil Burger", tags: ["Wheat", "Dairy", "Egg", "Soy", "Vegetarian"] },
        { name: "Baked Potato", tags: ["Vegetarian", "Vegan", "Gluten Friendly"] },
        { name: "Steamed Cauliflower", tags: ["Vegetarian", "Vegan", "Gluten Friendly"] },
      ],
      "Spoon & Fork": [
        { name: "Greek Style Turkey Meatloaf", tags: ["Wheat", "Dairy", "Egg", "Soy"] },
        { name: "Smashed Potatoes", tags: ["Vegetarian", "Vegan", "Gluten Friendly"] },
        { name: "Maple and Soy Glazed Tofu", tags: ["Soy", "Vegetarian", "Vegan", "Gluten Friendly"] },
        { name: "Roasted Italian Melody", tags: ["Vegetarian", "Vegan", "Gluten Friendly"] },
      ],
    },
  },
];

function applyStationReplacements(stations: MealMenu, date: string, location: string, meal: string) {
  for (const rep of STATION_REPLACEMENTS) {
    if (rep.date !== date || rep.location !== location || rep.meal !== meal) continue;
    const known = new Map(Object.values(stations).flat().map((x) => [x.name.toLowerCase(), x]));
    for (const [station, items] of Object.entries(rep.stations)) {
      stations[station] = items.map((it) => ({
        ...(known.get(it.name.toLowerCase()) ?? { calories: null }),
        name: it.name,
        tags: it.tags,
      }));
    }
  }
}

/** All the per-day corrections above, in order. */
export function applyMenuCorrections(stations: MealMenu, date: string, location: string, meal: string) {
  applyStationMoves(stations, date, location, meal);
  applyItemSwaps(stations, date, location, meal);
  applyItemAdds(stations, date, location, meal);
  applyStationReplacements(stations, date, location, meal);
}

/** Walk ordered menu items; station headers start a new group. */
function parseDay(items: ApiMenuItem[]): MealMenu {
  const stations: MealMenu = {};
  let current = "General";
  for (const it of items) {
    if (it.is_station_header || it.is_section_title) {
      const name = (it.text ?? "").trim();
      if (name) current = name;
      continue;
    }
    const name = (it.food?.name ?? "").trim();
    if (!name) continue;
    const bucket = (stations[current] ??= []);
    if (bucket.some((x) => x.name === name)) continue;
    // Only the name and diet/allergen tags are kept. Nutrition, ingredients and descriptions aren't shown anywhere.
    const item: MenuItem = {
      name,
      calories: null,
      tags: (it.food?.icons?.food_icons ?? []).map((i) => i.name).filter((n): n is string => !!n),
    };
    bucket.push(item);
  }
  return Object.fromEntries(Object.entries(stations).filter(([, v]) => v.length));
}

/** Every active menu type per location (e.g. "lunch", "pub-menu"), from the schools list. */
async function activeMenuTypes(revalidate: number): Promise<Record<string, string[]>> {
  try {
    const schools = await getJson<ApiSchool[]>(`${BASE_API}/menu/api/schools/?format=json`, revalidate);
    return Object.fromEntries(
      schools.filter((s) => s.slug in LOCATIONS).map((s) => [s.slug, (s.active_menu_types ?? []).map((m) => m.slug)]),
    );
  } catch {
    return {};
  }
}

/** Which meal tab a menu type belongs on; null if it can't be placed. */
function mealForType(type: string): "Breakfast" | "Lunch" | "Dinner" | null {
  if (/breakfast/.test(type)) return "Breakfast";
  if (/brunch|lunch/.test(type)) return "Lunch";
  if (/dinner|pub|late|night/.test(type)) return "Dinner";
  return null;
}

/** One line per request, for /api/menu/status. */
export type FetchLog = { location: string; menuType: string; week: string; ok: boolean; items: number; error?: string };

export function countItems(data: MenuData) {
  let n = 0;
  for (const day of Object.values(data.dates))
    for (const loc of Object.values(day))
      for (const meal of Object.values(loc)) for (const items of Object.values(meal)) n += items.length;
  return n;
}

/** Fetch the next `days` days of menus for every hall, from the posted menus. */
export async function fetchMenus(days = 7, revalidate = 3600, log?: FetchLog[]): Promise<MenuData> {
  const start = hamiltonToday();
  const dates = Array.from({ length: days }, (_, i) => addDays(start, i));
  const result: MenuData["dates"] = Object.fromEntries(
    dates.map((d) => [d, Object.fromEntries(Object.values(LOCATIONS).map((name) => [name, {}]))]),
  );
  const typesByLoc = await activeMenuTypes(revalidate);

  // Each weeks response covers a Sunday–Saturday week; fetch each (location, menu type, week) once.
  const cache = new Map<string, Promise<ApiWeek | null>>();
  const fetchWeek = (slug: string, display: string, menuType: string, date: string) => {
    const key = `${slug}/${menuType}/${sundayOf(date)}`;
    if (!cache.has(key)) {
      cache.set(
        key,
        (async () => {
          // Full weeks endpoint (not the digest), in the form .../2026/9/23; JSON comes back via the Accept header.
          const [y, m, d] = date.split("-").map(Number);
          const url = `${BASE_API}/menu/api/weeks/school/${slug}/menu-type/${menuType}/${y}/${m}/${d}`;
          try {
            const week = await getJson<ApiWeek>(url, revalidate);
            const items = (week.days ?? []).reduce(
              (n, dd) => n + (dd.menu_items ?? []).filter((x) => x.food?.name).length,
              0,
            );
            log?.push({ location: display, menuType, week: sundayOf(date), ok: true, items });
            return week;
          } catch (e) {
            console.error(`menu fetch failed: ${display} / ${menuType} / ${date}:`, e);
            log?.push({ location: display, menuType, week: sundayOf(date), ok: false, items: 0, error: String(e) });
            return null;
          }
        })(),
      );
    }
    return cache.get(key)!;
  };

  // Always try breakfast/lunch/dinner, plus whatever else a location lists (Little Pub may use its own names).
  const typesFor = (slug: string, display: string) =>
    [...new Set([...MEALS, ...(typesByLoc[slug] ?? [])])].flatMap((menuType) => {
      const meal = mealForType(menuType);
      if (!meal)
        log?.push({ location: display, menuType, week: "-", ok: false, items: 0, error: "no matching meal tab" });
      return meal ? [{ menuType, meal }] : [];
    });

  /** Stations for one location/meal on `sourceDate`, written onto `targetDate`. */
  const fill = async (
    slug: string,
    display: string,
    menuType: string,
    meal: string,
    sourceDate: string,
    targetDate: string,
  ) => {
    const week = await fetchWeek(slug, display, menuType, sourceDate);
    const stations = parseDay(week?.days?.find((d) => d.date === sourceDate)?.menu_items ?? []);
    applyMenuCorrections(stations, targetDate, display, meal);
    if (!Object.keys(stations).length) return false;
    // Two menu types can land on the same tab (e.g. "lunch" and "lunch-buffet"): merge their stations.
    result[targetDate][display][meal] = { ...result[targetDate][display][meal], ...stations };
    return true;
  };

  await Promise.all(
    Object.entries(LOCATIONS).flatMap(([slug, display]) =>
      typesFor(slug, display).flatMap(({ menuType, meal }) =>
        dates.map((date) => fill(slug, display, menuType, meal, date, date)),
      ),
    ),
  );

  // Weekly-repeating locations: their latest posted week is the menu every week. Any day/meal in the window
  // without a posted menu gets the same weekday from that week (Monday's menu on every Monday).
  await Promise.all(
    Object.entries(LOCATIONS)
      .filter(([slug]) => REPEATS_WEEKLY.has(slug))
      .map(async ([slug, display]) => {
        const types = typesFor(slug, display);
        const posted = new Set(dates.flatMap((d) => Object.keys(result[d][display]).map((meal) => `${d}/${meal}`)));
        for (let back = 1; back <= LOOKBACK_WEEKS; back++) {
          const templateSunday = sundayOf(addDays(dates[0], -7 * back));
          const weeks = await Promise.all(
            types.map(({ menuType }) => fetchWeek(slug, display, menuType, templateSunday)),
          );
          if (!weeks.some((w) => w?.days?.some((d) => (d.menu_items ?? []).some((x) => x.food?.name)))) continue;
          await Promise.all(
            types.flatMap(({ menuType, meal }) =>
              dates
                .filter((d) => !posted.has(`${d}/${meal}`))
                .map((d) => fill(slug, display, menuType, meal, addDays(templateSunday, weekday(d)), d)),
            ),
          );
          return;
        }
      }),
  );

  return {
    generated_at: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    source: "menu",
    mode: "live",
    dates: result,
  };
}
