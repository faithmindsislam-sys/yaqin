"use client";

import Link from "next/link";
import {
  BadgeCheck,
  BookOpenText,
  Bot,
  ChartNoAxesColumnIncreasing,
  Cpu,
  Landmark,
  Languages,
  Layers,
  Mic,
  ScrollText,
  ShieldCheck,
  Users,
} from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { ArchFrame, Skyline, StarPattern } from "@/components/Scenery";
import { ArrowLink, SourceQuote, TRACK_META } from "@/components/ui";
import { tracks, trackLessons } from "@/lib/content";
import { useI18n } from "@/lib/i18n";
import { S } from "@/lib/strings";

export default function Landing() {
  const { t } = useI18n();

  const pillars = [
    { icon: BookOpenText, title: S.pillars.sources, sub: S.pillars.sourcesSub },
    { icon: Cpu, title: S.pillars.ai, sub: S.pillars.aiSub },
    { icon: Users, title: S.pillars.everyone, sub: S.pillars.everyoneSub },
    { icon: Languages, title: S.pillars.langs, sub: S.pillars.langsSub },
  ];

  const trust = [
    { icon: BookOpenText, title: S.trust.quran, sub: S.trust.quranSub },
    { icon: ScrollText, title: S.trust.hadith, sub: S.trust.hadithSub },
    { icon: Landmark, title: S.trust.tafsir, sub: S.trust.tafsirSub },
    { icon: BadgeCheck, title: S.trust.review, sub: S.trust.reviewSub },
    { icon: Layers, title: S.trust.levels, sub: S.trust.levelsSub },
  ];

  const features = [
    { icon: BookOpenText, title: S.features.lessons, sub: S.features.lessonsSub, href: "/library/" },
    { icon: Bot, title: S.features.tutor, sub: S.features.tutorSub, href: "/ask/" },
    { icon: Mic, title: S.features.explain, sub: S.features.explainSub, href: "/library/" },
    { icon: ChartNoAxesColumnIncreasing, title: S.features.progress, sub: S.features.progressSub, href: "/start/" },
  ];

  return (
    <div className="relative overflow-hidden">
      <StarPattern className="pointer-events-none absolute inset-0 h-full w-full text-teal-200/40" />
      <SiteHeader />

      {/* Hero */}
      <section className="relative z-10 mx-auto grid max-w-7xl items-center gap-10 px-5 pb-10 pt-4 sm:px-8 lg:grid-cols-[1.05fr_1fr]">
        <div className="rise">
          <p className="eyebrow">{t(S.hero.eyebrow)}</p>
          <h1 className="mt-4 font-serif text-[2.6rem] leading-[1.08] text-ink sm:text-6xl">
            {t(S.hero.title1)}
            <br />
            <span className="italic text-teal-600">{t(S.hero.title2)}</span>
          </h1>
          <div className="my-6 h-0.5 w-16 bg-teal-400" />
          <p className="max-w-xl text-lg text-ink-soft">{t(S.hero.sub)}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/start/" className="btn btn-primary">
              {t(S.hero.cta)} <span aria-hidden className="rtl:rotate-180">→</span>
            </Link>
            <Link href="/ask/" className="btn btn-ghost">
              <Bot className="h-4 w-4 text-teal-600" /> {t(S.hero.cta2)}
            </Link>
          </div>
        </div>

        <div className="relative rise [animation-delay:120ms]">
          <div className="relative aspect-[5/4] overflow-hidden rounded-[2rem] bg-gradient-to-b from-sky-100 via-white to-teal-50 shadow-[var(--shadow-lift)]">
            <Skyline className="absolute inset-x-0 bottom-0 h-[78%] w-full" />
            <ArchFrame className="absolute -end-6 bottom-0 h-[92%] opacity-95" />
            <div className="absolute inset-x-6 top-6 max-w-sm sm:inset-x-8 sm:top-8">
              <SourceQuote id="quran:20:114" compact />
            </div>
          </div>
        </div>
      </section>

      {/* Pillars */}
      <section className="relative z-10 mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {pillars.map(({ icon: Icon, title, sub }) => (
            <div key={title.en} className="flex items-center gap-3 rounded-2xl border border-line bg-white/80 px-4 py-3 backdrop-blur">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-600">
                <Icon className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-ink">{t(title)}</span>
                <span className="block text-xs text-muted">{t(sub)}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      <main className="relative z-10 mx-auto flex max-w-7xl flex-col gap-6 px-5 py-10 sm:px-8">
        {/* Tracks */}
        <section className="card p-5 sm:p-7" id="tracks">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-serif text-3xl text-ink">{t(S.journey.title)}</h2>
              <p className="mt-1 max-w-2xl text-sm text-ink-soft">{t(S.journey.sub)}</p>
            </div>
            <ArrowLink href="/library/">{t(S.nav.library)}</ArrowLink>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {tracks.map((track) => {
              const meta = TRACK_META[track.id];
              const Icon = meta.icon;
              const count = trackLessons(track.id).length;
              return (
                <Link
                  key={track.id}
                  href={`/start/?track=${track.id}`}
                  className={`group relative overflow-hidden rounded-2xl border border-line bg-gradient-to-br ${meta.tint} p-5 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]`}
                >
                  <Skyline className="pointer-events-none absolute inset-x-0 bottom-0 h-24 w-full opacity-40" tone={track.id === "explore" ? "sky" : "teal"} />
                  <div className="relative flex items-start gap-4">
                    <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-full ${meta.ring}`}>
                      <Icon className="h-7 w-7" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-serif text-xl text-ink">{t(track.title)}</h3>
                      <p className="mt-1 text-sm text-ink-soft">{t(track.tagline)}</p>
                      <p className="mt-1 text-xs text-muted">{t(track.audience)}</p>
                    </div>
                    <span className="ms-auto grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line bg-white text-ink-soft transition group-hover:border-teal-300 group-hover:text-teal-700">
                      <span aria-hidden className="rtl:rotate-180">›</span>
                    </span>
                  </div>
                  <div className="relative mt-5 flex flex-wrap gap-2">
                    {meta.tags.map((tag) => (
                      <span key={tag.en} className="chip">{t(tag)}</span>
                    ))}
                    {count > 0 && <span className="chip border-teal-200 text-teal-700">{count} {t(S.library.lessons)}</span>}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Sources */}
        <section className="grid gap-6 lg:grid-cols-[1fr_22rem]" id="sources">
          <div className="card p-5 sm:p-7">
            <h2 className="font-serif text-3xl text-ink">{t(S.trust.title)}</h2>
            <p className="mt-1 text-sm text-ink-soft">{t(S.trust.sub)}</p>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
              {trust.map(({ icon: Icon, title, sub }) => (
                <div key={title.en} className="rounded-2xl border border-line p-4">
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-teal-50 text-teal-600">
                    <Icon className="h-5 w-5" />
                  </span>
                  <p className="mt-3 text-sm font-semibold text-ink">{t(title)}</p>
                  <p className="text-xs text-muted">{t(sub)}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="card relative overflow-hidden p-6" id="method">
            <ShieldCheck className="h-8 w-8 text-teal-600" />
            <h3 className="mt-3 font-serif text-2xl text-ink">{t(S.promise.title)}</h3>
            <ul className="mt-4 space-y-3 text-sm text-ink-soft">
              {[S.promise.p1, S.promise.p2, S.promise.p3, S.promise.p4].map((p) => (
                <li key={p.en} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-400" />
                  {t(p)}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Features */}
        <section className="card p-5 sm:p-7">
          <h2 className="font-serif text-3xl text-ink">{t(S.features.title)}</h2>
          <p className="mt-1 text-sm text-ink-soft">{t(S.features.sub)}</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map(({ icon: Icon, title, sub, href }) => (
              <Link key={title.en} href={href} className="group rounded-2xl border border-line bg-gradient-to-b from-white to-sky-50 p-5 transition hover:border-teal-300">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-teal-50 text-teal-600 transition group-hover:bg-teal-100">
                  <Icon className="h-6 w-6" />
                </span>
                <h3 className="mt-4 text-base font-semibold text-ink">{t(title)}</h3>
                <p className="mt-1 text-sm text-ink-soft">{t(sub)}</p>
              </Link>
            ))}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
