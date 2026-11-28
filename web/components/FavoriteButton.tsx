"use client";

import { useFavorites } from "@/lib/favorites";
import { useMe } from "@/lib/me";

export function StarIcon({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round">
      <path d="M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.8L12 16.9l-5.25 2.75 1-5.8L3.5 9.7l5.9-.9L12 3.5z" />
    </svg>
  );
}

/**
 * Star a dish to save it to your Favorites. Logged out, tapping it asks you to log in first. `size="lg"` is the labeled
 * button on a food's page. Hidden when favorites aren't available (no database connected).
 */
export function FavoriteButton({ dish, source, size = "sm" }: { dish: string; source: string; size?: "sm" | "lg" }) {
  const { status } = useMe();
  const { isFavorite, toggle, error } = useFavorites();
  if (status === "off") return null;
  const on = isFavorite(dish);
  if (size === "lg")
    return (
      <div className="space-y-1">
      <button
        type="button"
        onClick={() => toggle(dish, source)}
        aria-pressed={on}
        className={`flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-[15px] font-semibold transition ${
          on
            ? "border-gold bg-gold text-zinc-950"
            : "border-zinc-300 text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-zinc-500"
        }`}
      >
        <StarIcon filled={on} className="size-5" />
        {on ? "Saved to Favorites" : status === "out" ? "Log in to save to Favorites" : "Save to Favorites"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      </div>
    );
  return (
    <button
      type="button"
      onClick={() => toggle(dish, source)}
      aria-pressed={on}
      aria-label={on ? `Remove ${dish} from Favorites` : `Save ${dish} to Favorites`}
      className={`flex size-11 shrink-0 items-center justify-center rounded-full transition hover:bg-zinc-200/60 dark:hover:bg-zinc-800 ${
        on ? "text-gold-ink dark:text-gold" : "text-zinc-400"
      }`}
    >
      <StarIcon filled={on} className="size-6" />
    </button>
  );
}
