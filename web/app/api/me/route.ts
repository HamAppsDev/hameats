import { getUser } from "@/lib/users";
import { currentUser, reply, storeEnabled, unavailable } from "@/lib/apiGuard";
import { localMode } from "@/lib/localMode";

export const dynamic = "force-dynamic";

/** Whether someone is signed in, the key for push notifications, and whether this is local test mode (lib/localMode.ts). The first time someone signed in is seen, their record is created. */
export async function GET() {
  if (!storeEnabled()) return unavailable();
  const features = { pushKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null, localMode: localMode() };
  const user = await currentUser();
  if (!user) return reply({ signedIn: false, ...features });
  try {
    await getUser(user.id);
    return reply({ signedIn: true, ...features });
  } catch (e) {
    console.error("me GET failed:", e);
    return unavailable();
  }
}
