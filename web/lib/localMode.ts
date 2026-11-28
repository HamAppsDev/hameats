/**
 * Local test mode: lets anyone clone HamEats and try every feature (logging in, favorites, alert settings) with
 * `npm run dev` and no accounts, keys or secrets of any kind.
 *
 * It's on only when BOTH are true:
 *   - the app runs under `npm run dev` (NODE_ENV is "development"; `next build`, `next start` and the deployed
 *     server always run as "production", and the build drops this code path entirely), and
 *   - no database is set up (HAMEATS_DYNAMODB_TABLE is empty).
 *
 * While it's on, people and their favorites are kept in the dev server's memory (lib/users.ts) and gone when it
 * restarts, and "Log in" signs in as a made-up test student instead of going to Google (lib/auth.ts).
 */
export const localMode = () => process.env.NODE_ENV === "development" && !process.env.HAMEATS_DYNAMODB_TABLE?.trim();

/** The made-up account local test mode logs in as. example.com is reserved for examples, so it's nobody's address. */
export const LOCAL_TEST_EMAIL = "test.student@example.com";

/**
 * Signs local test mode's login cookies when no AUTH_SECRET is set. Public on purpose: it only ever protects fake logins
 * on someone's own computer, and it's never used in production (see localMode).
 */
export const LOCAL_AUTH_SECRET = "hameats-local-test-mode-only-not-a-real-secret";
