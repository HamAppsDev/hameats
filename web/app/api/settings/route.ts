import { getUser, setAlertMinutes, setEmailAlerts, setNotify } from "@/lib/users";
import { cleanAlertMinutes, validAlertMinute } from "@/lib/alertMeals";
import { currentUser, noStore, reply, storeEnabled, unavailable, writer } from "@/lib/apiGuard";
import { emailReady } from "@/lib/email";

export const dynamic = "force-dynamic";

/**
 * { notify, email, times, time, emailAvailable }: whether the signed-in person's alerts go to their phones (push) and
 * their email, when they go out (1-3 times, minutes after midnight on campus; `time` is the first, for older versions of
 * the app), and whether email alerts are set up on the server.
 */
export async function GET() {
  if (!storeEnabled()) return unavailable();
  const user = await currentUser();
  if (!user) return Response.json({ error: "login required" }, { status: 401, headers: noStore });
  try {
    const u = await getUser(user.id);
    return reply({ notify: u.notify, email: u.emailAlerts, times: u.alertMinutes, time: u.alertMinutes[0], emailAvailable: emailReady() });
  } catch (e) {
    console.error("settings GET failed:", e);
    return unavailable();
  }
}

const isText = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;

/**
 * One change at a time:
 *   { notify: true, push: { endpoint, keys: { p256dh, auth } } }  push on, for this phone (the push address its browser
 *                                                                 gave when the person allowed notifications)
 *   { notify: false }                                             push off; every push address is erased
 *   { email: true | false }                                       the alert email on or off
 *   { times: [0-1425, ...] }                                      when the alerts go out: 1-3 times, minutes after
 *                                                                 midnight on campus, in steps of 15 (sorted, repeats
 *                                                                 dropped)
 *   { time: 0-1425 }                                              older versions of the app: one time, same as
 *                                                                 { times: [time] }
 */
export async function PUT(request: Request) {
  const user = await writer(request);
  if (user instanceof Response) return user;
  const b = await request.json().catch(() => null);
  try {
    if (typeof b?.email === "boolean") {
      if (b.email && !emailReady()) return reply({ error: "email alerts aren't set up yet" }, 503);
      await setEmailAlerts(user.id, b.email);
      return reply({ email: b.email });
    }
    if (b && ("times" in b || "time" in b)) {
      const times = "times" in b ? cleanAlertMinutes(b.times) : validAlertMinute(b.time) ? [b.time] : null;
      if (!times) return reply({ error: "bad request" }, 400);
      await setAlertMinutes(user.id, times);
      return reply({ times });
    }
    if (b?.notify === false) {
      await setNotify(user.id, false);
      return reply({ notify: false });
    }
    const p = b?.push;
    const ok =
      b?.notify === true && isText(p?.endpoint, 1000) && /^https:\/\//.test(p.endpoint) && isText(p?.keys?.p256dh, 200) && isText(p?.keys?.auth, 100);
    if (!ok) return reply({ error: "bad request" }, 400);
    await setNotify(user.id, true, { endpoint: p.endpoint, p256dh: p.keys.p256dh, auth: p.keys.auth });
    return reply({ notify: true });
  } catch (e) {
    console.error("settings PUT failed:", e);
    return unavailable();
  }
}
