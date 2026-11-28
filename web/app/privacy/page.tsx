import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What information HamEats collects and how it is used.",
  alternates: { canonical: "/privacy" },
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
      {children}
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-background text-zinc-900 dark:text-zinc-100">
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-8 px-4 py-6 text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
        <Link href="/" className="inline-block font-medium text-blue-600 hover:underline dark:text-blue-400">
          ← Home
        </Link>

        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Privacy Policy</h1>
          <p className="text-sm italic">Last updated: November 28, 2026</p>
        </div>

        <p>
          HamEats (&quot;the app,&quot; &quot;the site&quot;) shows Hamilton College dining hall menus and hours. It&apos;s
          an independent student project run by Brandon Taylor &apos;28 and isn&apos;t affiliated with or endorsed by
          Hamilton College. This page explains what information HamEats collects and what it does with it.
        </p>
        <p>
          HamEats only shows the names of the dishes being served. It does not show allergen, ingredient, or
          nutritional information. If you have an allergy or dietary restriction, please ask the dining hall staff.
        </p>
        <p>
          <strong className="text-zinc-900 dark:text-zinc-100">The short version:</strong> You can use HamEats without
          an account. Logging in is only for Hamilton students and staff, using your @hamilton.edu Google account, and only
          lets you save favorite dishes and get alerts about them. If you log in, HamEats saves your Hamilton email address,
          your favorites and whether notifications are on. It doesn&apos;t save your name, and nothing you save is shown to anyone else.
          You can ask me for a copy of your data, or to delete your account, anytime. HamEats also collects anonymous usage
          statistics so I can improve the app.
        </p>

        <Section title="What I collect">
          <p>
            <strong className="text-zinc-900 dark:text-zinc-100">Usage analytics (everyone).</strong> I use PostHog, an analytics
            service, to understand how the app is used. When you visit, it records things like:
          </p>
          <ul className="list-disc space-y-1 pl-6">
            <li>Which pages you view and when you leave them</li>
            <li>
              Actions you take in the app, such as opening a dish, choosing a dining hall, day, or layout, switching
              dark mode, tapping Log in, or saving a favorite
            </li>
            <li>
              Your device and browser type, screen size, and approximate location (such as city or region) based on
              your IP address
            </li>
          </ul>
          <p>
            PostHog also stores a random identifier in your browser to tell visitors apart. It is not connected to your
            name, your email, or your Google login. Analytics requests are routed through hameats.app itself.
          </p>
          <p>
            <strong className="text-zinc-900 dark:text-zinc-100">Logging in with Google (only if you choose to).</strong> By
            logging in with your Hamilton Google account, you agree to share your email address with HamEats. Google also
            sends your name, but HamEats doesn&apos;t save it or show it.
          </p>
          <p>
            <strong className="text-zinc-900 dark:text-zinc-100">Your favorites (only if you log in).</strong> The dishes you
            save as favorites. Only you can see them.
          </p>
          <p>
            <strong className="text-zinc-900 dark:text-zinc-100">Notifications (only if you turn them on).</strong> HamEats
            saves which ones are on (push, email or both), the time you picked, and the date the last one was sent, so you
            never get two in a day. For push, it also saves the address your phone or browser gives for sending them, which
            is the only way a notification can reach your phone; turning push off erases that address. Email alerts go to
            your Hamilton email address, which HamEats already has from your login. The notifications and emails themselves
            aren&apos;t saved.
          </p>
          <p>
            <strong className="text-zinc-900 dark:text-zinc-100">From earlier versions.</strong> HamEats used to have a Feed with
            reviews, posts, comments and votes. That&apos;s gone, and everything from it has been deleted. The only thing carried over is your favorites and whether notifications were on.
          </p>
          <p>
            <strong className="text-zinc-900 dark:text-zinc-100">Hosting data.</strong> HamEats is hosted on Amazon Web
            Services (CloudFront and Lambda), which, like most hosts, processes technical data such as IP addresses and request logs to deliver the site
            and keep it secure.
          </p>
        </Section>

        <Section title="What I don&apos;t collect">
          <p>HamEats does not collect passwords, phone numbers, home addresses, or payment information.</p>
        </Section>

        <Section title="Information stored on your device">
          <p>HamEats saves a few things in your browser so the app works the way you expect:</p>
          <ul className="list-disc space-y-1 pl-6">
            <li>Your light or dark mode choice</li>
            <li>Your home page layout choice</li>
            <li>A copy of the most recent menus, so the app loads fast and works offline</li>
            <li>A sign-in cookie, only if you log in</li>
          </ul>
          <p>These stay on your device. You can clear them anytime through your browser settings.</p>
        </Section>

        <Section title="How I use it">
          <p>
            I use this information only to run and improve HamEats: fixing bugs, seeing which features students actually use,
            showing your favorites, sending the notifications you ask for, and keeping the site working. I don&apos;t sell your
            information, and I don&apos;t use it for advertising.
          </p>
        </Section>

        <Section title="Who I share it with">
          <p>
            Only the services that run HamEats: PostHog (analytics), Amazon Web Services (hosting; DynamoDB,
            the database that stores favorites and notification settings; and Amazon SES, which sends alert emails) and Google (log in and feedback forms). They process data on my behalf under their
            own privacy policies. I don&apos;t share it with anyone else, except if the law requires it.
          </p>
        </Section>

        <Section title="How long I keep it">
          <p>
            Analytics data is kept for as long as it&apos;s useful for improving the app and is used in aggregate. Favorites
            are kept until you remove them. Feedback submissions are kept as long as they&apos;re useful for improving the app.
            You can ask me to delete anything you&apos;ve sent me.
          </p>
          <p>
            Deleting your account (email me to ask) deletes everything HamEats keeps about you: your email address, your
            favorites, and your notification settings and push addresses.
          </p>
        </Section>

        <Section title="Your choices">
          <ul className="list-disc space-y-1 pl-6">
            <li>Block analytics by using a tracking blocker, or by clearing your browser data.</li>
            <li>Log out at any time, and remove any favorite.</li>
            <li>Turn push or email notifications on or off, or change their time, on the Favorites tab, under Alerts. Every alert email also has an unsubscribe link.</li>
            <li>Ask me for a copy of everything HamEats keeps about you.</li>
            <li>Ask me to delete your account and everything you&apos;ve saved.</li>
            <li>Ask me to delete any feedback you&apos;ve submitted.</li>
            <li>Ask me any question about this policy.</li>
          </ul>
        </Section>

        <Section title="Children">
          <p>
            HamEats is intended for the Hamilton College community and isn&apos;t directed at children under 13.
          </p>
        </Section>

        <Section title="Changes">
          <p>If I change this policy, I&apos;ll update the date at the top.</p>
        </Section>

        <Section title="Contact">
          <p>
            Brandon Taylor,{" "}
            <a
              href="mailto:bntaylor@hamilton.edu"
              className="font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              bntaylor@hamilton.edu
            </a>
          </p>
        </Section>
      </main>

      <SiteFooter />
    </div>
  );
}
