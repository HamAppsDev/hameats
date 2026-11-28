import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { createHash, timingSafeEqual } from "node:crypto";
import { LOGIN_DOMAIN } from "@/lib/site";
import { LOCAL_AUTH_SECRET, LOCAL_TEST_EMAIL, localMode } from "@/lib/localMode";

declare module "next-auth" {
  interface Session {
    user: { id?: string } & DefaultSession["user"];
  }
}

/**
 * Whether a Google profile is a verified account in the Hamilton Workspace. Google puts the Workspace domain in the
 * "hd" claim of a login, and only the domain's own accounts can carry it, so unlike checking the email's ending it
 * can't be got around with a look-alike address or a personal account that merely uses a hamilton.edu email.
 * Other schools' Workspace domains listed in EXTRA_LOGIN_DOMAINS (comma-separated, e.g. "stanford.edu") are let in
 * the same way; unset or empty, only Hamilton is.
 */
export function isHamiltonAccount(profile: { hd?: unknown; email?: unknown; email_verified?: unknown } | undefined) {
  const allowed = [
    LOGIN_DOMAIN,
    ...(process.env.EXTRA_LOGIN_DOMAINS ?? "")
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),
  ];
  if (typeof profile?.hd !== "string") return false;
  const hd = profile.hd.toLowerCase();
  return (
    allowed.includes(hd) &&
    profile.email_verified === true &&
    typeof profile.email === "string" &&
    profile.email.toLowerCase().endsWith(`@${hd}`)
  );
}

/**
 * The id every vote and review is stored under: the person's (lowercased) email address. It has to be the email
 * because Auth.js gives each login a brand-new random user id when there is no database adapter (that id is
 * token.sub), so anything keyed on it belongs to one login rather than to a person, and logging out and back in
 * would start over with a new id.
 */
export function userIdFor(token: { email?: string | null }): string | undefined {
  return token.email?.trim().toLowerCase() || undefined;
}

/** The one account the private test link logs in as. Not a real mailbox. */
const TEST_EMAIL = "test@hameats.app";

/** The secret in the private test link (TEST_LOGIN_SECRET in Parameter Store, /hameats/TEST_LOGIN_SECRET). Unset or shorter than 24 characters: the test login is off. */
const testLoginSecret = () => {
  const secret = process.env.TEST_LOGIN_SECRET ?? "";
  return secret.length >= 24 ? secret : null;
};

/** Whether `key` is the test secret. Compared as hashes, in constant time, so the check leaks nothing about the secret. */
export function matchesTestSecret(key: unknown) {
  const secret = testLoginSecret();
  if (!secret || typeof key !== "string") return false;
  const digest = (v: string) => createHash("sha256").update(v).digest();
  return timingSafeEqual(digest(key), digest(secret));
}

/**
 * Sign-in with Google, nothing else, and only for Hamilton accounts. The one exception is the private test link
 * (/t/<TEST_LOGIN_SECRET>, see app/t/[key]/route.ts), which exists only while that secret is set. The session lives in a signed cookie (no
 * accounts table): the database keeps a person's email address (as their id), never their name.
 * Reads AUTH_SECRET, AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET from the environment.
 *
 * In local test mode (lib/localMode.ts: `npm run dev` with no database) there's one more way in, the "local" login,
 * which signs in as a made-up test student without Google, and the cookies are signed with a public stand-in secret
 * when AUTH_SECRET isn't set. Neither exists in production.
 */
export const { handlers, auth, signIn } = NextAuth({
  ...(localMode() && !process.env.AUTH_SECRET ? { secret: LOCAL_AUTH_SECRET } : {}),
  // hd only makes Google offer Hamilton accounts first; the check that actually keeps others out is in signIn below.
  providers: [
    Google({ authorization: { params: { hd: LOGIN_DOMAIN, prompt: "select_account" } } }),
    ...(testLoginSecret()
      ? [
          Credentials({
            id: "test",
            credentials: { key: { type: "password" } },
            authorize: (credentials) =>
              matchesTestSecret(credentials?.key) ? { id: TEST_EMAIL, name: "Test Account", email: TEST_EMAIL } : null,
          }),
        ]
      : []),
    ...(localMode()
      ? [
          Credentials({
            id: "local",
            credentials: {},
            authorize: () => ({ id: LOCAL_TEST_EMAIL, name: "Test Student", email: LOCAL_TEST_EMAIL }),
          }),
        ]
      : []),
  ],
  // A failed login (for example a non-Hamilton account) lands here instead of on Auth.js's own error page.
  pages: { error: "/login-error" },
  session: { strategy: "jwt" },
  trustHost: true,
  callbacks: {
    signIn: ({ account, profile }) =>
      account?.provider === "local"
        ? localMode()
        : account?.provider === "test"
          ? testLoginSecret() !== null
          : isHamiltonAccount(profile),
    session({ session, token }) {
      const id = userIdFor(token);
      if (id) session.user.id = id;
      return session;
    },
  },
});

