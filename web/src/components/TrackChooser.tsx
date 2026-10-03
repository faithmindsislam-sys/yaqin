"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Logo } from "./Logo";
import { LangToggle, TRACK_META } from "./ui";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import type { Bi, TrackId } from "@/lib/types";

const TRACKS: { id: TrackId; title: Bi; audience: Bi; description: Bi; topics: Bi[] }[] = [
  {
    id: "explore",
    title: { en: "Discover Islam", ar: "اكتشف الإسلام" },
    audience: { en: "For non-Muslims and curious minds", ar: "لغير المسلمين وكل من يريد التعرّف على الإسلام" },
    description: { en: "Get to know Islam, explore its beliefs, and find thoughtful answers to your questions. Learn through respectful dialogue, religious comparisons, and discussions of common objections.", ar: "تعرّف على الإسلام وعقيدته، واعثر على أجوبة موثّقة لأسئلتك من خلال الحوار والمناظرات باحترام، ومقارنة الأديان ومناقشة الشبهات." },
    topics: [{ en: "Islamic beliefs", ar: "العقيدة الإسلامية" }, { en: "Questions & dialogue", ar: "الأسئلة والحوار" }, { en: "Comparing religions", ar: "مقارنة الأديان" }],
  },
  {
    id: "first-steps",
    title: { en: "New Muslim Guide", ar: "دليل المسلم الجديد" },
    audience: { en: "For those beginning their life in Islam", ar: "لمن بدأ رحلته في الإسلام حديثًا" },
    description: { en: "Take your first steps with a gentle, practical guide. Build a foundation in faith, learn purification and prayer, and bring Islam into your daily life, one step at a time.", ar: "ابدأ خطواتك الأولى بدليل عملي وميسّر. ابنِ أساسك في الإيمان، وتعلّم الطهارة والصلاة، وعِش الإسلام في حياتك اليومية خطوةً خطوة." },
    topics: [{ en: "Foundations of faith", ar: "أسس الإيمان" }, { en: "Purification & prayer", ar: "الطهارة والصلاة" }, { en: "Daily Muslim life", ar: "حياة المسلم اليومية" }],
  },
  {
    id: "deepen",
    title: { en: "Deepen Your Islamic Knowledge", ar: "تعمّق في العلم الشرعي" },
    audience: { en: "For Muslims pursuing deeper understanding", ar: "للمسلمين الراغبين في التعمّق وطلب العلم الشرعي" },
    description: { en: "Strengthen your fiqh and pursue Islamic scholarship (talab al-ilm al-shar‘i). Follow a structured path through Qur’an, hadith, and Islamic sciences, grounding your understanding in trusted sources.", ar: "عزّز معرفتك بالفقه وانطلق في طلب العلم الشرعي. اتبع مسارًا منظّمًا في القرآن والحديث والعلوم الشرعية، وابنِ فهمك على مصادر موثوقة." },
    topics: [{ en: "Fiqh", ar: "الفقه" }, { en: "Qur’an & hadith", ar: "القرآن والحديث" }, { en: "Islamic scholarship", ar: "طلب العلم الشرعي" }],
  },
];

export function TrackChooser({ requireSession = false }: { requireSession?: boolean }) {
  const { t } = useI18n();
  const { ready, user, guest, startGuest, setPrefs } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (ready && requireSession && !user && !guest) router.replace("/signin/");
  }, [ready, requireSession, user, guest, router]);

  function choose(track: TrackId) {
    if (track === "explore") {
      router.push("/start/explore/");
      return;
    }
    if (!user && !guest) startGuest();
    setPrefs({ track, onboarded: true });
    router.push("/app/learn/");
  }

  return (
    <div className="min-h-dvh bg-sky-50">
      <header className="mx-auto flex max-w-7xl items-center justify-between border-b border-line px-5 py-5 sm:px-8">
        <Logo />
        <LangToggle />
      </header>
      <main className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-16">
        {!ready || (requireSession && !user && !guest) ? (
          <p role="status">{t({ en: "Loading your account…", ar: "جارٍ تحميل حسابك…" })}</p>
        ) : (
          <>
            <div className="mx-auto mb-10 max-w-2xl text-center">
              <p className="eyebrow">{t({ en: "Your journey starts here", ar: "رحلتك تبدأ هنا" })}</p>
              <h1 className="mt-3 font-serif text-4xl text-ink sm:text-5xl">{t({ en: "Choose your track", ar: "اختر مسارك" })}</h1>
              <p className="mt-4 leading-relaxed text-ink-soft">{t({ en: "Start where you are. Choose the learning journey that fits your goals, and move at your own pace.", ar: "ابدأ من حيث أنت. اختر رحلة التعلّم التي تناسب أهدافك، وتقدّم بالوتيرة التي تلائمك." })}</p>
            </div>
            <div className="grid gap-5 md:grid-cols-3">
              {TRACKS.map((track, index) => {
                const meta = TRACK_META[track.id];
                const Icon = meta.icon;
                return (
                  <button key={track.id} onClick={() => choose(track.id)} className={`group flex min-h-96 flex-col rounded-3xl border border-line bg-gradient-to-b ${meta.tint} p-7 text-start shadow-[var(--shadow-card)] transition hover:-translate-y-1 hover:border-brand-400 hover:shadow-[var(--shadow-lift)] sm:p-8`}>
                    <span className="flex w-full items-center justify-between">
                      <span className={`grid h-16 w-16 place-items-center rounded-2xl ${meta.ring}`}><Icon className="h-8 w-8" aria-hidden /></span>
                      <span className="text-sm text-muted" aria-hidden>0{index + 1}</span>
                    </span>
                    <span className="mt-7 block font-serif text-3xl leading-tight text-ink">{t(track.title)}</span>
                    <span className="mt-3 block text-sm font-medium text-brand-700">{t(track.audience)}</span>
                    <span className="mt-4 block text-sm leading-7 text-ink-soft">{t(track.description)}</span>
                    <span className="my-6 flex flex-wrap gap-2">{track.topics.map((topic) => <span key={topic.en} className="chip !text-xs">{t(topic)}</span>)}</span>
                    <span className="mt-auto flex w-full items-center justify-between border-t border-line pt-5 font-medium text-brand-700">
                      {t({ en: "Choose this track", ar: "اختر هذا المسار" })}
                      <ArrowRight className="h-5 w-5 rtl:rotate-180" aria-hidden />
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-7 text-center text-sm text-muted">{t({ en: "You can change your track at any time.", ar: "يمكنك تغيير مسارك في أي وقت." })}</p>
          </>
        )}
      </main>
    </div>
  );
}
