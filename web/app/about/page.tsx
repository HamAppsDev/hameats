import type { Metadata } from "next";
import Link from "next/link";
import { Cici } from "@/components/Cici";
import { SiteFooter } from "@/components/SiteFooter";
import { HAMAPPS_URL, SCHEDULER_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "About",
  description: "Why HamEats exists and who makes it: every dining hall menu in one place.",
  alternates: { canonical: "/about" },
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
      {children}
    </section>
  );
}

export default function AboutPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-background text-zinc-900 dark:text-zinc-100">
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-8 px-4 py-6 text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
        <Link href="/" className="inline-block font-medium text-blue-600 hover:underline dark:text-blue-400">
          ← Home
        </Link>

        <div className="flex items-center justify-between gap-4">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            About Ham<span className="text-gold">Eats</span>
          </h1>
          <Cici className="h-24 w-28" />
        </div>

        <Section title="Summary">
          <p>
            HamEats is a web app that puts every Hamilton dining hall menu in one place, so you can see what Commons,
            McEwen, the Diner and the Little Pub are serving without clicking around.
          </p>
          <p>
            HamEats only shows the names of the dishes being served. It does not show allergen, ingredient, or
            nutritional information. If you have an allergy or dietary restriction, please ask the dining hall staff.
          </p>
        </Section>

        <Section title="Motivation">
          <p>
            Hi! I&apos;m Brandon Taylor &apos;28, the creator of HamEats! I got tired of the dining menu app glitching
            out, loading forever, and having to tap 10 different times to see all the available dishes. So I decided to
            build a site that pulls everything I wanted into a single convenient page.
          </p>
        </Section>

        <Section title="Design Decisions">
          <p>I built HamEats with Next.js, React, TypeScript and Tailwind CSS, hosted on Amazon Web Services.</p>
        </Section>

        <Section title="More from HamApps">
          <p>
            HamEats is part of{" "}
            <a href={HAMAPPS_URL} className="font-medium text-blue-600 hover:underline dark:text-blue-400">
              HamApps
            </a>
            , a student-run club at Hamilton College building free apps for students. That&apos;s Cici up top, the
            HamApps mascot, with a bowl of HamEats. Planning next semester? Check out{" "}
            <a href={SCHEDULER_URL} className="font-medium text-blue-600 hover:underline dark:text-blue-400">
              Hamilton Scheduler
            </a>{" "}
            to search courses and build your class schedule.
          </p>
        </Section>

        <Section title="Credits">
          <p>
            Brandon Taylor &apos;28
            <br />
            Created September 23, 2026
          </p>
        </Section>

        <section className="space-y-3">
          <p className="font-bold text-zinc-900 dark:text-zinc-100">
            Thanks for using HamEats! Here&apos;s what students have said:
          </p>
          <p>
            &quot;Dude HamEats was transformational… that&apos;s all I can say&quot;
            <br />
            Suki &apos;27
          </p>
          <p>
            &quot;This app has a very user-friendly interface, which is much better than the one Craveable has&quot;
            <br />
            Maung &apos;28
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
