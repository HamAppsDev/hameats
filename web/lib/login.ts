"use client";

import { signIn } from "next-auth/react";

/** Asked for by every "Log in" button: opens the screen that says what logging in means (components/JoinSheets.tsx). */
export const LOGIN_REQUESTED = "hameats:login-requested";

/** What every "Log in" button calls. First a screen says what logging in is for and what's kept, then Google. */
export const signInWithGoogle = () => void window.dispatchEvent(new Event(LOGIN_REQUESTED));

/** Goes to Google's login, from the Continue button on that screen. */
export const continueWithGoogle = () => signIn("google", { callbackUrl: window.location.href });

/** Local test mode only (lib/localMode.ts): signs in as the made-up test student, no Google. */
export const continueAsTestStudent = () => signIn("local", { callbackUrl: window.location.href });
