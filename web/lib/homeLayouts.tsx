import type { ComponentType, ReactNode } from "react";
import { useCallback, useSyncExternalStore } from "react";
import type { CampusTime } from "@/lib/hours";
import type { MenuData } from "@/lib/types";
import { NetNutritionHomeLayout } from "@/components/home/NetNutritionHomeLayout";

export type HomeLayoutProps = {
  data: MenuData;
  now: CampusTime;
  /** The Menu / Cafe / Favorites tabs, shown in the header band under the title. */
  tabs?: ReactNode;
};

// Extend this union as new home layouts are registered below.
export type HomeLayoutId = "net-nutrition";

type HomeLayoutEntry = {
  /** Shown in the gallery. Kept neutral (Layout A, B) so the name doesn't sway the choice. */
  label: string;
  /** Sent to analytics as the layout's name. Never change it: renaming would split the data. */
  analyticsName: string;
  description: string;
  Component: ComponentType<HomeLayoutProps>;
  /** Kept registered but left out of the gallery and not restored from storage. */
  hidden?: boolean;
};

export const HOME_LAYOUTS: Record<HomeLayoutId, HomeLayoutEntry> = {
  // Listed in gallery order.
  "net-nutrition": {
    label: "Layout A",
    analyticsName: "Continental",
    description: "Every dining hall's menu on one page.",
    Component: NetNutritionHomeLayout,
  },
};

/** What new visitors land on, until they pick a layout themselves. */
export const DEFAULT_HOME_LAYOUT: HomeLayoutId = "net-nutrition";

const STORAGE_KEY = "home-layout";

function isHomeLayoutId(value: string | null): value is HomeLayoutId {
  return !!value && value in HOME_LAYOUTS && !HOME_LAYOUTS[value as HomeLayoutId].hidden;
}

// localStorage's own "storage" event only fires in OTHER tabs/windows, so we
// dispatch this one ourselves to notify same-tab subscribers (e.g. the
// switcher and the layout renderer, which each call useHomeLayoutId()).
const LOCAL_CHANGE_EVENT = "home-layout-change";

function readStoredLayoutId(): HomeLayoutId {
  const stored = localStorage.getItem(STORAGE_KEY);
  return isHomeLayoutId(stored) ? stored : DEFAULT_HOME_LAYOUT;
}

/** Whether this visitor has picked a layout themselves, rather than being on the default. */
export function hasChosenLayout(): boolean {
  try {
    return isHomeLayoutId(localStorage.getItem(STORAGE_KEY));
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(LOCAL_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(LOCAL_CHANGE_EVENT, onChange);
  };
}

export function useHomeLayoutId(): [HomeLayoutId, (id: HomeLayoutId) => void] {
  const id = useSyncExternalStore(subscribe, readStoredLayoutId, () => DEFAULT_HOME_LAYOUT);

  const set = useCallback((next: HomeLayoutId) => {
    localStorage.setItem(STORAGE_KEY, next);
    window.dispatchEvent(new Event(LOCAL_CHANGE_EVENT));
  }, []);

  return [id, set];
}
