"use client";

import { track } from "@/lib/analytics";

export type Section = "menu" | "cafe" | "profile";

/**
 * Which part of the app the address shows: #cafe or #profile, the Favorites tab (still "profile" inside the code and
 * analytics). #notifications opens Favorites scrolled to its Alerts, which is where tapping an alert goes. Older addresses still land somewhere sensible: #feed and #updates
 * (the tab's old names) are the Cafe tab,
 * #favorites and #me are the Favorites tab. Anything else, including no hash, is the Menu. The dining halls' own pages
 * (#commons) are handled before this.
 */
export function sectionFor(hash: string): { section: Section; notifications: boolean } {
  if (hash === "cafe" || hash === "feed" || hash === "updates") return { section: "cafe", notifications: false };
  if (hash === "profile" || hash === "favorites" || hash === "me") return { section: "profile", notifications: false };
  if (hash === "notifications") return { section: "profile", notifications: true };
  return { section: "menu", notifications: false };
}

/** Moves to a section, adding a history entry so the phone's back gesture returns to the last one. */
export function goToSection(section: Section | "notifications") {
  const url = section === "menu" ? window.location.pathname + window.location.search : `#${section}`;
  history.pushState({ section }, "", url);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
  window.scrollTo({ top: 0 });
}

const TABS: [Section, string][] = [
  ["menu", "Menu"],
  ["cafe", "Cafe"],
  ["profile", "Favorites"],
];

/** Menu / Cafe / Favorites, in the blue header band under the title. */
export function SectionTabs({ active }: { active: Section }) {
  return (
    <div role="tablist" aria-label="Sections" className="mx-auto flex max-w-2xl">
      {TABS.map(([section, label]) => (
        <button
          key={section}
          role="tab"
          aria-selected={section === active}
          onClick={() => {
            if (section === active) return window.scrollTo({ top: 0, behavior: "smooth" });
            track("section_opened", { section });
            goToSection(section);
          }}
          className={`relative flex min-h-11 flex-1 items-center justify-center gap-1.5 text-[17px] font-bold ${
            section === active
              ? "text-band-ink after:absolute after:inset-x-[30%] after:bottom-0 after:h-[3px] after:rounded-t after:bg-gold"
              : "text-band-ink/70 hover:text-band-ink"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
