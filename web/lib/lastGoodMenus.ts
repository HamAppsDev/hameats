import type { MenuData } from "./types";

// The last menus this server copy fetched successfully, for the home page to fall back on if the menu API fails.
let lastGood: MenuData | null = null;

export const rememberMenus = (data: MenuData) => {
  lastGood = data;
};

export const lastGoodMenus = () => lastGood;
