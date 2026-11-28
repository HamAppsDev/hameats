import { validUnsubscribe } from "@/lib/email";
import { setEmailAlerts, storeEnabled } from "@/lib/users";

export const dynamic = "force-dynamic";

/**
 * POST ?e=<email>&t=<token>: turns that address's alert emails off. Mail apps post here for their own "Unsubscribe"
 * button (List-Unsubscribe-Post, RFC 8058), and the /unsubscribe page's button does too. The token (lib/email.ts) is
 * the only check: there's no login, and the post comes from a mail provider, not this site.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const email = url.searchParams.get("e")?.trim().toLowerCase() ?? "";
  const token = url.searchParams.get("t") ?? "";
  if (!validUnsubscribe(email, token)) return new Response("invalid link", { status: 400 });
  if (!storeEnabled()) return new Response("unavailable", { status: 503 });
  try {
    await setEmailAlerts(email, false);
  } catch (e) {
    console.error("unsubscribe failed:", e);
    return new Response("unavailable", { status: 503 });
  }
  const form = await request.formData().catch(() => null);
  // The page's button: back to the page, which now says it's done. A mail app just needs the 200.
  if (form?.get("from") === "page") return new Response(null, { status: 303, headers: { Location: "/unsubscribe?done=1" } });
  return new Response("unsubscribed", { status: 200 });
}
