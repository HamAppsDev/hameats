import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { FEEDBACK_FORM_URL, SITE_URL } from "@/lib/site";

// The alert email, sent with Amazon SES from HAMEATS_EMAIL_FROM (send-only: replies bounce, so the footer points to
// the feedback form) (a verified address; on AWS the server's role may send
// only from it). Every email has an unsubscribe link, and the List-Unsubscribe headers mail apps use for their own
// "Unsubscribe" button. The link's token is a signature of the address with AUTH_SECRET, so nobody can unsubscribe
// someone else.

const env = (name: string) => process.env[name]?.trim() || "";

/** Whether alert emails can be sent: a From address and the secret that signs unsubscribe links. */
export const emailReady = () => !!env("HAMEATS_EMAIL_FROM") && !!env("AUTH_SECRET");

const sign = (email: string) => createHmac("sha256", env("AUTH_SECRET")).update(`hameats-unsubscribe:${email}`).digest("base64url");

/** Whether `token` is this address's unsubscribe token. */
export function validUnsubscribe(email: string, token: string) {
  if (!env("AUTH_SECRET") || !email || !token) return false;
  const want = Buffer.from(sign(email));
  const got = Buffer.from(token);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** The page that turns this address's alert emails off (it asks first, so link scanners can't unsubscribe anyone). */
export const unsubscribeUrl = (email: string) => `${SITE_URL}/unsubscribe?e=${encodeURIComponent(email)}&t=${sign(email)}`;
/** Where mail apps' one-click "Unsubscribe" posts to (RFC 8058). */
const oneClickUrl = (email: string) => `${SITE_URL}/api/unsubscribe?e=${encodeURIComponent(email)}&t=${sign(email)}`;

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The email: the same title and dish lines as the push notification, a link to the Menu, and how to stop or change it. */
export function alertEmail(to: string, title: string, lines: string[]) {
  const menu = SITE_URL;
  const settings = `${SITE_URL}/#notifications`;
  const unsub = unsubscribeUrl(to);
  const text = [
    `${title}:`,
    "",
    ...lines.map((l) => `- ${l}`),
    "",
    `See the full menu: ${menu}`,
    "",
    `You get this because you turned on email alerts in HamEats. Change the time or turn them off: ${settings}`,
    `Unsubscribe: ${unsub}`,
    "",
    `This is an automatic email, so replies aren't read. To tell us something, use the feedback form: ${FEEDBACK_FORM_URL}`,
  ].join("\n");
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#18181b">
<div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:24px">
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3">${escape(title)}</h1>
<ul style="margin:0 0 20px;padding-left:20px;font-size:16px;line-height:1.5">${lines.map((l) => `<li>${escape(l)}</li>`).join("")}</ul>
<a href="${menu}" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;font-weight:600;padding:10px 16px;border-radius:8px">See the menu</a>
</div>
<p style="max-width:480px;margin:16px auto 0;font-size:12px;line-height:1.5;color:#71717a">You get this because you turned on email alerts in HamEats.
<a href="${settings}" style="color:#71717a">Change the time or turn them off</a> · <a href="${unsub}" style="color:#71717a">Unsubscribe</a><br>
This is an automatic email, so replies aren&#39;t read. To tell us something, use the <a href="${FEEDBACK_FORM_URL}" style="color:#71717a">feedback form</a>.</p>
</body></html>`;
  return { subject: title, text, html };
}

let client: SESv2Client | undefined;
const ses = () => (client ??= new SESv2Client({ region: env("HAMEATS_AWS_REGION") || env("AWS_REGION") }));

/** Sends one alert email. Throws if SES refuses it. */
export async function sendAlertEmail(to: string, title: string, lines: string[]) {
  const mail = alertEmail(to, title, lines);
  await ses().send(
    new SendEmailCommand({
      FromEmailAddress: env("HAMEATS_EMAIL_FROM"),
      Destination: { ToAddresses: [to] },
      Content: {
        Simple: {
          Subject: { Data: mail.subject, Charset: "UTF-8" },
          Body: { Text: { Data: mail.text, Charset: "UTF-8" }, Html: { Data: mail.html, Charset: "UTF-8" } },
          Headers: [
            { Name: "List-Unsubscribe", Value: `<${oneClickUrl(to)}>` },
            { Name: "List-Unsubscribe-Post", Value: "List-Unsubscribe=One-Click" },
          ],
        },
      },
    }),
  );
}
