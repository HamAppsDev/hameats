"use client";

import { useFavorites } from "@/lib/favorites";
import { FavoriteButton } from "@/components/FavoriteButton";

/** The saved dishes on the Favorites tab: one card per dish, with its name and the star to remove it. */
export function FavoritesPanel() {
  const { favorites, status } = useFavorites();

  if (status !== "ready")
    return (
      <p className="py-12 text-center text-muted">
        {status === "error" ? "Couldn't load your favorites. Check your connection and try again." : "Loading…"}
      </p>
    );

  if (favorites.length === 0)
    return (
      <p className="rounded-[10px] border border-rule bg-surface p-5 text-center text-[15px] text-muted">
        No favorites yet. Tap a dish on the Menu and choose Save to Favorites.
      </p>
    );

  return (
    <ul className="space-y-2.5">
      {favorites.map((dish) => (
        <li key={dish} className="flex items-center gap-2 rounded-[10px] border border-rule bg-surface py-1.5 pl-4 pr-1.5 shadow-[0_8px_20px_-14px] shadow-black/20">
          <span className="min-w-0 flex-1 text-[17px] font-semibold leading-snug">{dish}</span>
          <FavoriteButton dish={dish} source="profile" />
        </li>
      ))}
    </ul>
  );
}
