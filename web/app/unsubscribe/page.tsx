import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Unsubscribe",
  robots: { index: false },
};

/**
 * Where the unsubscribe link in an alert email lands. Opening it changes nothing: Hamilton's mail filters open every
 * link in an email to check it, so unsubscribing waits for the button (which posts to /api/unsubscribe).
 */
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { e = "", t = "", done } = await searchParams;
  const action = `/api/unsubscribe?e=${encodeURIComponent(e)}&t=${encodeURIComponent(t)}`;
  return (
    <div className="flex min-h-full flex-1 flex-col bg-background text-zinc-900 dark:text-zinc-100">
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-6 text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
        <Link href="/" className="inline-block font-medium text-blue-600 hover:underline dark:text-blue-400">
          ← Home
        </Link>
        {done ? (
          <>
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">You&apos;re unsubscribed</h1>
            <p>HamEats won&apos;t email you about your favorites anymore. Push notifications on your phone, if you have them on, aren&apos;t changed.</p>
            <p>
              Changed your mind? Turn emails back on in the{" "}
              <Link href="/#notifications" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
                Favorites tab, under Alerts
              </Link>
              .
            </p>
          </>
        ) : e && t ? (
          <>
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Stop alert emails?</h1>
            <p>
              HamEats will stop emailing <strong className="text-zinc-900 dark:text-zinc-100">{e.split("@")[0]}</strong> about favorites on the
              menu.
            </p>
            <form method="post" action={action}>
              <input type="hidden" name="from" value="page" />
              <button type="submit" className="rounded-lg bg-zinc-900 px-4 py-2.5 font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
                Unsubscribe
              </button>
            </form>
            <p className="text-sm text-muted">
              To change the time instead, go to the{" "}
              <Link href="/#notifications" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
                Favorites tab, under Alerts
              </Link>
              .
            </p>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">This link doesn&apos;t work</h1>
            <p>
              Turn alert emails off in the{" "}
              <Link href="/#notifications" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
                Favorites tab, under Alerts
              </Link>
              .
            </p>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
