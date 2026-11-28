import "server-only";
import webpush from "web-push";
import { emailReady, sendAlertEmail } from "@/lib/email";
import { ALERT_URL, type PersonPlan } from "@/lib/alertPlan";
import { localMode } from "@/lib/localMode";
import { claimSent, forgetPhone } from "@/lib/users";

// Sending the alerts that lib/alertPlan.ts works out: for each person, today's record is saved first (claimSent, so a
// retried run can't send twice), then each message goes out as one push notification to each of their phones and/or one
// email. A meal's alert and its correction share a notification tag, so on a phone the correction replaces the alert.

/** In local test mode nothing is really sent: each message is printed in the dev server's log instead. */
const localSender = (channel: string): ((to: string, title: string, lines: string[]) => Promise<void>) => async (to, title, lines) => {
  console.log(`[local test mode] ${channel} to ${to}: ${title}\n  ${lines.join("\n  ")}`);
};

type PushSender = (sub: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string) => Promise<void>;
type EmailSender = (to: string, title: string, lines: string[]) => Promise<void>;

/** The test login (lib/auth.ts) and local test mode's student have no mailbox; emailing them would bounce. */
const mailable = (email: string) => !email.endsWith("@hameats.app") && !email.endsWith("@example.com");

/** Lines shown on the phone's notification before "and N more". */
const PUSH_LINES = 4;

export type RunResult = { people: number; alerts: number; updates: number; pushed: number; emailed: number; removed: number; failed: number; skipped: number };

/**
 * Carries out `plans` (from lib/alertPlan.ts plan). One push or email failing is counted in `failed` and the rest go on;
 * only an error that stops the whole run is thrown.
 */
export async function sendPlans(
  plans: PersonPlan[],
  push: PushSender | null = pushReady() ? defaultPushSender() : null,
  email: EmailSender | null = localMode() ? localSender("email") : emailReady() ? sendAlertEmail : null,
): Promise<RunResult> {
  const result: RunResult = { people: 0, alerts: 0, updates: 0, pushed: 0, emailed: 0, removed: 0, failed: 0, skipped: 0 };
  for (const { user, sent, messages } of plans) {
    // Recorded before anything is sent: if another run got there first, this one sends nothing.
    if (!(await claimSent(user, sent))) {
      result.skipped++;
      continue;
    }
    if (!messages.length) continue;
    result.people++;
    for (const m of messages) {
      result[m.kind === "alert" ? "alerts" : "updates"]++;
      const tag = `menu-${sent.day}-${m.meal.toLowerCase()}`;
      if (user.notify && localMode()) await localSender("push")(user.email, m.text.title, m.text.lines);
      else if (push && user.notify) {
        const shown = m.text.lines.length > PUSH_LINES ? [...m.text.lines.slice(0, PUSH_LINES - 1), `and ${m.text.lines.length - PUSH_LINES + 1} more`] : m.text.lines;
        const payload = JSON.stringify({ title: m.text.title, body: shown.join("\n"), url: ALERT_URL, tag });
        let delivered = false;
        for (const p of user.push) {
          try {
            await push({ endpoint: p.endpoint, keys: { p256dh: p.p256dh, auth: p.auth } }, payload);
            delivered = true;
          } catch (e) {
            const status = (e as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) {
              await forgetPhone(user.email, p.endpoint);
              result.removed++;
            } else {
              result.failed++;
              console.error("push failed:", status, (e as Error).message);
            }
          }
        }
        if (delivered) result.pushed++;
      }
      if (email && user.emailAlerts && (localMode() || mailable(user.email))) {
        try {
          await email(user.email, m.text.title, m.text.lines);
          result.emailed++;
        } catch (e) {
          result.failed++;
          console.error("email failed:", (e as { name?: string }).name, (e as Error).message);
        }
      }
    }
  }
  return result;
}

export const pushReady = () => !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY;

function defaultPushSender(): PushSender {
  webpush.setVapidDetails("mailto:bntaylor@hamilton.edu", process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  return async (sub, payload) => {
    await webpush.sendNotification(sub, payload, { TTL: 6 * 3600, urgency: "normal" });
  };
}
