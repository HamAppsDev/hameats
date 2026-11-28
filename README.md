# HamEats

Hamilton College's dining hall menus and hours in one place, at [hameats.app](https://www.hameats.app).

The home screen shows every hall's menu for the chosen day and meal on one page: a row of days (the next week of menus) and Breakfast / Lunch / Dinner tabs on top, each hall with its open/closed status and hours, and its stations below. It opens on the meal that's being served now, or the next one. Tapping a hall opens its own page (`#commons`, `#mcewen`, …) with its full week of hours; tapping a food opens its page with a star to save it to your Favorites and a Google search link. HamEats doesn't show allergen or ingredient information; the app tells people to ask dining staff. `/hours` lists every hall's hours on one page.

Covers Soper Commons, McEwen, Howard Diner and Little Pub. It installs as an app (PWA) and works offline: the service worker (`web/app/sw.js/route.ts`) caches the app and the last menus. Every deploy gets its own build ID (the git commit), so installed apps pick up new deploys on their own: opening or returning to the app reloads into the new version, and while it's in use an Update bar appears (`web/components/AppUpdater.tsx`).

The app has three tabs: **Menu** (the halls), **Cafe** and **Profile** (Favorites and notification settings, for people logged in with Google).

Hall hours live in `web/lib/hours.ts`; update them there when the dining schedule changes.

The Cafe tab covers Euphoria, FoJo North and FoJo South. They don't post daily menus, so their menus are typed into `web/lib/cafes.ts` (their hours are in `hours.ts` with the halls'). FoJo shows "Menu coming soon" until its menu is added.

## 1. Menus

`web/app/page.tsx` loads the next 7 days of menus on the server (`web/lib/menuSource.ts`) and builds them into the page. Next.js rebuilds the page when that data expires (hourly during meals, and not until the next meal begins in between). If a refresh fails, the last good page keeps being served. `web/public/dining_menu.json` is only the starting data for a deploy that can't reach the menus.

The menu API's address is at the top of `web/lib/menuSource.ts`.

Howard Diner publishes a PDF menu instead. Its items are transcribed in `web/lib/standingMenus.ts` (the PDF is in `web/public/menus/`); update that file when the Diner posts a new menu. One-off dishes go in `web/lib/specials.ts`.

If a hall's menu is missing on the live site, open `/api/menu/status?key=<STATUS_KEY>` (`STATUS_KEY` is in AWS Parameter Store at `/hameats/STATUS_KEY`; without it the route always 404s): it lists every menu request with its item count or error.

## 2. Run the app

```sh
cd web
npm install
cp .env.local.example .env.local   # optional: every setting in it can stay empty
npm run dev                        # http://localhost:3000
```

With an empty `.env.local` the menus, hours and Cafe tab all work; logging in, favorites, notifications and analytics stay off until their settings are filled in. `npm run lint` runs ESLint.

## 3. AWS (hosting, favorites, the daily alerts)

HamEats runs on AWS: the Next.js server on Lambda behind CloudFront, favorites in DynamoDB, the daily alerts on EventBridge Scheduler (every 15 minutes) and Amazon SES (alert emails), all inside AWS's always-free allowances. Every push to `main` that touches `web/` builds and deploys it (`.github/workflows/deploy-aws.yml`). The setup, from scratch, is in **[infra/aws/README.md](infra/aws/README.md)**; everything AWS creates is in `infra/aws/hameats.yaml`.

People who log in can save favorite dishes and get a daily alert about them, by push notification and/or email, at a time they pick (any 15 minutes of the day, campus time). That is the only thing saved, all in one DynamoDB table with one item per person (`web/lib/users.ts`): their email, their favorites, which alerts are on, their alert time, the date of their last alert, and (only while push is on) the push address of each phone that allowed them. Alert emails need `HAMEATS_EMAIL_FROM` (set by the stack once its `EmailAlerts` parameter is true, after SES has verified hameats.app) and `AUTH_SECRET`, which signs their unsubscribe links.

For local development against the real table, set `HAMEATS_DYNAMODB_TABLE`, `HAMEATS_AWS_REGION`, `HAMEATS_AWS_ACCESS_KEY_ID` and `HAMEATS_AWS_SECRET_ACCESS_KEY` in `web/.env.local` (see `web/.env.local.example`). Without them, favorites and notifications are switched off and the rest of the app works as usual.

To delete someone's account when they ask, delete their item (their email) from the table in the DynamoDB console.
