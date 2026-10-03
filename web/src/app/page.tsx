"use client";

import Link from "next/link";
import { ArrowUpRight, BookOpenText, Check, Languages, ShieldCheck } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { ArrowLink, SourceQuote, TRACK_META } from "@/components/ui";
import { useContent } from "@/lib/content";
import { useI18n } from "@/lib/i18n";
import { S } from "@/lib/strings";

export default function Landing() {
  const { tracks, trackLessons } = useContent();
  const { t } = useI18n();
  return (
    <div className="landing">
      <SiteHeader />
      <main id="main-content" className="landing-container">
        <section className="landing-hero">
          <div className="rise">
            <p className="eyebrow">{t(S.hero.eyebrow)}</p>
            <h1 className="hero-title font-serif text-ink">
              {t(S.hero.title1)} <span className="text-brand-700">{t(S.hero.title2)}</span>
            </h1>
            <p className="hero-sub">{t({
              en: "A little learning. A deeper understanding. Explore Islam through short, clear lessons in Arabic and English, with sources you can check.",
              ar: "تعلّم قليلًا، وافهم بعمق. اكتشف الإسلام من خلال دروس قصيرة وواضحة بالعربية والإنجليزية، مع مصادر يمكنك الرجوع إليها.",
            })}</p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href="/start/" className="btn btn-primary">{t(S.hero.cta)} <span aria-hidden className="rtl:rotate-180">→</span></Link>
              <Link href="/library/" className="btn btn-ghost">{t({ en: "Explore the lessons", ar: "تصفّح الدروس" })}</Link>
            </div>
            <p className="hero-note"><Check className="h-3.5 w-3.5" aria-hidden />{t({ en: "Learn at your pace. No account needed to begin.", ar: "تعلّم على مهل. لا تحتاج إلى حساب لتبدأ." })}</p>
          </div>
          <div className="verse-panel rise">
            <p className="verse-heading eyebrow">{t({ en: "A journey that begins with knowledge", ar: "رحلة تبدأ بالعلم" })}</p>
            <SourceQuote id="quran:20:114" compact />
          </div>
        </section>

        <div className="landing-proof">
          <span><BookOpenText className="h-4 w-4 text-brand-700" aria-hidden />{t({ en: "Sources you can trace", ar: "مصادر يمكنك تتبّعها" })}</span>
          <span><Languages className="h-4 w-4 text-brand-700" aria-hidden />{t(S.pillars.langsSub)}</span>
          <span><ShieldCheck className="h-4 w-4 text-brand-700" aria-hidden />{t({ en: "Your learning, your pace", ar: "تعلّمك، على مهل" })}</span>
        </div>

        <section className="landing-section" id="tracks">
          <div className="section-intro">
            <div>
              <p className="eyebrow mb-3">{t({ en: "A place for every beginning", ar: "مكان لكل بداية" })}</p>
              <h2 className="font-serif text-ink">{t(S.journey.title)}</h2>
              <p>{t({ en: "Choose what feels right for you today. You can always change your path.", ar: "اختر ما يناسبك اليوم. يمكنك تغيير مسارك في أي وقت." })}</p>
            </div>
            <ArrowLink href="/library/?view=browse">{t({ en: "View all lessons", ar: "جميع الدروس" })}</ArrowLink>
          </div>
          <div className="track-grid">
            {tracks.map((track) => {
              const meta = TRACK_META[track.id];
              const Icon = meta.icon;
              return (
                <Link key={track.id} href={track.id === "explore" ? "/start/explore/" : `/start/?track=${track.id}`} className="track-card group">
                  <div className="flex items-center justify-between">
                    <span className={`grid h-12 w-12 place-items-center rounded-xl ${meta.ring}`}><Icon className="h-6 w-6" aria-hidden /></span>
                    <ArrowUpRight className="h-5 w-5 text-muted transition group-hover:text-brand-700 rtl:-scale-x-100" aria-hidden />
                  </div>
                  <h3 className="font-serif text-ink">{t(track.title)}</h3>
                  <p>{t(track.tagline)}</p>
                  <div className="track-card-bottom">
                    <span>{trackLessons(track.id).length} {t(S.library.lessons)}</span>
                    <span className="font-medium text-brand-700">{t({ en: "Start this path", ar: "ابدأ هذا المسار" })} <span aria-hidden className="inline-block rtl:rotate-180">→</span></span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="trust-panel" id="sources">
          <div>
            <p className="eyebrow">{t({ en: "Clarity begins with trust", ar: "الوضوح يبدأ بالثقة" })}</p>
            <h2 className="font-serif">{t({ en: "Learn with the source in sight.", ar: "تعلّم والمصدر أمامك." })}</h2>
            <p className="mt-4">{t({ en: "Qur’an, hadith, and scholarly explanations. Revealed text is shown verbatim, and sources stay visible so you can explore further.", ar: "القرآن والحديث وشروح أهل العلم. يُعرض النص الشرعي بنصّه، وتبقى المصادر ظاهرة لتتمكّن من الرجوع إليها." })}</p>
          </div>
          <div id="method">
            <h3 className="mb-5 text-lg font-medium">{t(S.promise.title)}</h3>
            <ul className="space-y-4">
              {[S.promise.p1, S.promise.p2, S.promise.p3].map((promise) => <li key={promise.en}><Check className="h-4 w-4" aria-hidden /><span>{t(promise)}</span></li>)}
            </ul>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
