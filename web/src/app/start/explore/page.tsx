"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, ChevronDown, HeartHandshake, Landmark, Sparkle, Sprout, X } from "lucide-react";
import { Logo } from "@/components/Logo";
import { LangToggle } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { ESSENTIALS, INTRODUCTION, PURPOSES, TOPICS, changePurposes, type OnboardingPreferences, type PurposeId } from "@/lib/onboarding";
import { useSession } from "@/lib/session";
import { suggestTopics } from "@/lib/onboarding-journey";
import { useOnboarding } from "@/lib/onboarding-state";
import { useContent } from "@/lib/content";

// Card colors and icons for the four intro explainers; the wording lives in ESSENTIALS.
const ESSENTIAL_STYLE = {
  tawhid: { icon: Sparkle, bg: "bg-[var(--n-accent-soft)]", ink: "text-[var(--n-accent)]" },
  islam: { icon: Landmark, bg: "bg-salmon-50", ink: "text-salmon-600" },
  iman: { icon: Sprout, bg: "bg-[#fdf6e3]", ink: "text-[#8a6410]" },
  akhlaq: { icon: HeartHandshake, bg: "bg-sky-100", ink: "text-[var(--n-navy)]" },
};

// Keep the original declaration intact, including punctuation and Arabic spelling.
const declaration = INTRODUCTION.shahada.declaration;
const arabicBreak = declaration.ar.indexOf(" وأشهد");
const englishBreak = declaration.en.indexOf(" and I bear witness");
const testimonies = [
  { ar: declaration.ar.slice(0, arabicBreak), en: declaration.en.slice(0, englishBreak) },
  { ar: declaration.ar.slice(arabicBreak), en: declaration.en.slice(englishBreak) },
];
export default function ExploreOnboarding() {
  const { t, lang } = useI18n();
  const { preferences: p, setPreferences, topicDraft, setTopicDraft, screen, setScreen } = useOnboarding();
  const { user, guest, startGuest, setPrefs: setSessionPrefs } = useSession();
  const router = useRouter();
  const { trackLessons } = useContent();
  const heading = useRef<HTMLHeadingElement>(null);
  const selectedPurposes = p.purposes.filter((purpose) => purpose !== "question");
  const suggestions = suggestTopics(selectedPurposes);
  const draft = topicDraft ?? suggestions;
  const purposes = PURPOSES.filter((choice) => selectedPurposes.includes(choice.id));

  useEffect(() => {
    window.scrollTo(0, 0);
    heading.current?.focus({ preventScroll: true });
  }, [screen]);

  function choosePurposes(values: PurposeId[]) {
    setTopicDraft(null);
    setPreferences((previous) => changePurposes(previous, values));
  }

  function showTopics() {
    if (!selectedPurposes.length) return;
    setTopicDraft((previous) => previous ?? suggestTopics(selectedPurposes));
    setScreen(2);
  }

  // Save the chosen topics and the Explore track, then land on the dashboard like the other tracks do.
  function finish(topics: Pick<OnboardingPreferences, "interests" | "topicsConfirmed">) {
    setPreferences((previous) => ({ ...previous, ...topics }));
    if (!user && !guest) startGuest();
    setSessionPrefs({ track: "explore", onboarded: true });
    router.push("/app/learn/");
  }

  function exploreBasics() {
    if (!user && !guest) startGuest();
    setSessionPrefs({ track: "explore", onboarded: true });
    const firstLesson = trackLessons("explore")[0];
    router.push(firstLesson ? `/lesson/?id=${encodeURIComponent(firstLesson.id)}` : "/app/learn/");
  }

  function topicChoice(topic: (typeof TOPICS)[number]) {
    const selected = draft.includes(topic.id);
    return <label key={topic.id} className="onboarding-choice">
      <input type="checkbox" name="interests" value={topic.id} checked={selected} disabled={!selected && draft.length >= 3} aria-describedby="topic-count topic-limit" onChange={() => setTopicDraft((previous) => {
        const current = previous ?? suggestions;
        return current.includes(topic.id) ? current.filter((id) => id !== topic.id) : [...current, topic.id].slice(0, 3);
      })} />
      <span>{t(topic.label)}</span>
    </label>;
  }

  return (
    <div className={`onboarding min-h-dvh bg-sky-50 ${screen === 0 ? "onboarding-intro" : screen === 1 ? "onboarding-personalization" : ""}`}>
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-8 sm:py-5">
        <Logo />
        <LangToggle />
      </header>
      <main className={`mx-auto px-5 py-8 sm:px-8 ${screen <= 1 ? "max-w-5xl" : "max-w-2xl sm:py-12"}`}>
        {screen === 0 ? (
          <section className="nutshell">
            <div className="nutshell-heading text-center">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--n-accent-soft)] px-3 py-1.5 text-xs font-medium text-[var(--n-accent)]"><BookOpen className="h-3.5 w-3.5" aria-hidden="true" />{t({ en: "Islam 101", ar: "أساسيات الإسلام" })}</span>
              <h1 ref={heading} tabIndex={-1} className="mt-5 font-serif text-4xl leading-tight sm:text-5xl">{t({ en: "Islam, in a nutshell", ar: "الإسلام باختصار" })}</h1>
              <p className="nutshell-summary">{t({ en: "Discover what Muslims believe, how they practise, and how faith shapes everyday life. Open any topic to learn more, at your own pace.", ar: "تعرّف على ما يؤمن به المسلمون، وكيف يمارسون شعائرهم، وأثر الإيمان في حياتهم اليومية. افتح أي موضوع لمعرفة المزيد بالوتيرة التي تناسبك." })}</p>
            </div>

            <nav aria-label={t({ en: "In this introduction", ar: "في هذه المقدّمة" })} className="nutshell-topics mx-auto mt-10 grid max-w-4xl grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-4">
              {ESSENTIALS.map(({ id, title, label }) => {
                const { icon: Icon, bg, ink } = ESSENTIAL_STYLE[id];
                return <button key={id} type="button" aria-haspopup="dialog" onClick={() => (document.getElementById(`essential-${id}`) as HTMLDialogElement).showModal()} className={`group relative cursor-pointer rounded-[20px] border border-transparent p-3 text-start transition hover:-translate-y-0.5 hover:border-[var(--n-border)] sm:p-5 ${bg}`}>
                  <span className={`grid h-9 w-9 place-items-center rounded-xl bg-white/80 ${ink}`}><Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" /></span>
                  <ArrowUpRight className={`absolute end-3 top-3 h-4 w-4 opacity-40 transition-opacity group-hover:opacity-100 rtl:-scale-x-100 sm:end-4 sm:top-4 ${ink}`} aria-hidden="true" />
                  <span className="mt-3 block text-sm font-medium text-[var(--n-navy)] sm:text-base">{t(title)}</span>
                  <span className="mt-0.5 block text-xs text-ink-soft">{t(label)}</span>
                </button>;
              })}
            </nav>

            {ESSENTIALS.map(({ id, title, label, intro, items }) => {
              const { icon: Icon, bg, ink } = ESSENTIAL_STYLE[id];
              return <dialog key={id} id={`essential-${id}`} aria-labelledby={`essential-${id}-title`} className="nutshell-dialog" onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
                <div className={`flex items-start gap-4 px-6 pb-5 pt-6 sm:px-8 ${bg}`}>
                  <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/80 ${ink}`}><Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" /></span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs font-medium ${ink}`}>{t(label)}</p>
                    <h2 id={`essential-${id}-title`} className="mt-0.5 font-serif text-2xl">{t(title)}</h2>
                  </div>
                  <form method="dialog"><button aria-label={t({ en: "Close", ar: "إغلاق" })} className="-me-2 -mt-1 grid h-11 w-11 cursor-pointer place-items-center rounded-full text-ink-soft hover:bg-white/70"><X className="h-5 w-5" aria-hidden="true" /></button></form>
                </div>
                <div className="px-6 py-6 sm:px-8">
                  <p className="text-sm leading-7 text-ink-soft">{t(intro)}</p>
                  <ol className="mt-5 space-y-4">{items.map((item, index) => <li key={item.title.en} className="flex gap-3">
                    <span aria-hidden="true" className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-medium ${bg} ${ink}`}>{index + 1}</span>
                    <div><p className="text-sm font-medium">{t(item.title)}</p><p className="mt-0.5 text-sm leading-6 text-ink-soft">{t(item.body)}</p></div>
                  </li>)}</ol>
                  {id === "tawhid" && <section aria-labelledby="shahada-title" className="shahada-card">
                    <h3 id="shahada-title" className="shahada-title">{t(INTRODUCTION.shahada.title)}</h3>
                    <p className="shahada-intro">{t(INTRODUCTION.shahada.meaning)}</p>
                    <div className="shahada-testimonies">
                      {testimonies.map((part, index) => (
                        <div className="shahada-testimony" key={index}>
                          <div className="shahada-ornament" aria-hidden="true"><span>✦</span></div>
                          <p className="shahada-label">{t(index === 0 ? { en: "First", ar: "الأولى" } : { en: "Second", ar: "الثانية" })}</p>
                          <p lang="ar" dir="rtl" className="shahada-arabic">{part.ar}</p>
                          {lang !== "ar" && <p lang="en" dir="ltr" className="shahada-translation">{part.en}</p>}
                        </div>
                      ))}
                    </div>
                  </section>}
                </div>
              </dialog>;
            })}

            <div className="nutshell-actions mt-10 flex flex-col items-center gap-1 sm:flex-row sm:justify-center sm:gap-5">
              <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-white px-6 text-sm font-medium text-[var(--n-accent)] transition-colors hover:bg-[var(--n-accent-soft)] focus-visible:outline-[var(--n-accent)]" onClick={exploreBasics}>{t({ en: "Basic journey", ar: "رحلة الأساسيات" })}</button>
              <button type="button" className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-full bg-[var(--n-accent)] px-5 text-sm font-medium text-white transition-colors hover:bg-brand-800 focus-visible:outline-[var(--n-accent)]" onClick={() => setScreen(1)}>{t({ en: "Personalized journey", ar: "رحلة مخصصة لك" })}<span className="rounded-full bg-white/15 px-2 py-1 text-[10px] leading-tight">{t({ en: "Recommended", ar: "موصى بها" })}</span></button>
            </div>
            <button type="button" className="nutshell-back inline-flex min-h-11 items-center justify-center gap-2 self-center rounded-full px-3 text-sm text-ink-soft hover:text-brand-700" onClick={() => router.push("/start/")}><ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />{t({ en: "Back", ar: "رجوع" })}</button>
          </section>
        ) : screen === 1 ? (
          <section className="personalization-card card p-5 sm:p-8">
            <p className="eyebrow">{t({ en: "Your interests · 1 of 2", ar: "ما يهمّك · 1 من 2" })}</p>
            <h1 ref={heading} tabIndex={-1} className="mt-3 font-serif text-3xl sm:text-4xl">{t({ en: "What would you like to understand?", ar: "ما الذي تودّ فهمه؟" })}</h1>
            <p id="purpose-description" className="mt-3 text-sm leading-7 text-ink-soft">{t({ en: "Choose any topics that interest you. We’ll suggest where to begin, and you can change your journey anytime.", ar: "اختر المواضيع التي تهمّك. سنقترح لك نقطة بداية، ويمكنك تغيير رحلتك في أي وقت." })}</p>
            <fieldset className="mt-6" aria-describedby="purpose-description">
              <legend className="sr-only">{t({ en: "What would you like to understand? Select all that apply.", ar: "ما الذي تودّ فهمه؟ يمكنك اختيار أكثر من موضوع." })}</legend>
              <div className="personalization-options">{PURPOSES.filter((choice) => choice.id !== "question").map((choice) => <label key={choice.id} className="onboarding-choice"><input type="checkbox" name="purposes" value={choice.id} checked={selectedPurposes.includes(choice.id)} onChange={() => choosePurposes(selectedPurposes.includes(choice.id) ? selectedPurposes.filter((id) => id !== choice.id) : [...selectedPurposes, choice.id])} /><span><span className="block font-medium">{t(choice.label)}</span><span className="mt-1 block text-xs leading-5 text-ink-soft">{t(choice.description)}</span></span></label>)}</div>
              {p.purposes.length > 0 && <button className="mt-2 min-h-11 text-xs text-ink-soft underline underline-offset-4" onClick={() => choosePurposes([])}>{t({ en: "Clear choices", ar: "ألغِ الاختيارات" })}</button>}
            </fieldset>
            <nav aria-label={t({ en: "Question navigation", ar: "التنقّل في السؤال" })} className="mt-6 border-t border-line pt-5">
              <div className="flex items-center justify-between gap-3"><button className="btn btn-ghost !px-4 text-sm" onClick={() => setScreen(0)}><ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />{t({ en: "Back", ar: "رجوع" })}</button><button className="btn btn-primary text-sm disabled:!bg-slate-200 disabled:!text-slate-500 disabled:cursor-not-allowed" disabled={!selectedPurposes.length} onClick={showTopics}>{t({ en: "Show my suggested journey", ar: "اعرض رحلتي المقترحة" })}</button></div>
              <button className="mx-auto mt-2 block min-h-11 text-sm text-ink-soft underline underline-offset-4" onClick={exploreBasics}>{t({ en: "Prefer a general introduction? Choose Basic journey.", ar: "تفضّل مقدّمة عامة؟ اختر رحلة الأساسيات." })}</button>
            </nav>
          </section>
        ) : (
          <section className="card p-5 sm:p-8">
            <p className="eyebrow">{t({ en: "Your starting topics · 2 of 2", ar: "مواضيع البداية · 2 من 2" })}</p>
            <h1 ref={heading} tabIndex={-1} className="mt-3 font-serif text-3xl sm:text-4xl">{t({ en: "Does this feel like a good start?", ar: "هل تناسبك هذه البداية؟" })}</h1>
            <p id="topic-description" className="mt-3 text-sm leading-7 text-ink-soft">{t(purposes.length ? { en: "We’ve checked a few topics based on your choices. Keep up to three: uncheck any or add others before confirming.", ar: "حدّدنا بعض المواضيع بناءً على اختياراتك. اختر حتى ثلاثة منها، وألغِ ما لا يناسبك أو أضف غيرها قبل التأكيد." } : { en: "Here are a few general suggestions. Keep up to three: uncheck any or add others before confirming.", ar: "إليك بعض الاقتراحات العامة. اختر حتى ثلاثة منها، وألغِ ما لا يناسبك أو أضف غيرها قبل التأكيد." })}</p>
            <fieldset className="mt-5" aria-describedby="topic-description">
              <legend className="sr-only">{t({ en: "Review your suggested topics", ar: "راجع المواضيع المقترحة" })}</legend>
              <p id="topic-count" className="mb-3 text-sm font-medium text-brand-700" role="status">{t({ en: `${draft.length} of 3 selected · awaiting your confirmation`, ar: `${draft.length} من 3 محدّدة · بانتظار تأكيدك` })}</p>
              <div className="space-y-2.5">{suggestions.map((id) => topicChoice(TOPICS.find((topic) => topic.id === id)!))}</div>
              <details className="mt-4 rounded-2xl border border-line bg-sky-50 p-4" open={TOPICS.some((topic) => !suggestions.includes(topic.id) && draft.includes(topic.id)) || undefined}>
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-brand-700">{t({ en: "Add other topics", ar: "أضف مواضيع أخرى" })}<ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" /></summary>
                <div className="mt-3 space-y-2.5">{TOPICS.filter((topic) => !suggestions.includes(topic.id)).map(topicChoice)}</div>
              </details>
              <p id="topic-limit" className="mt-3 text-xs leading-6 text-ink-soft">{t(draft.length === 3 ? { en: "Uncheck a topic to add another. You can keep up to three.", ar: "ألغِ تحديد موضوع لإضافة آخر. يمكنك إبقاء ثلاثة مواضيع كحدّ أقصى." } : { en: "Keep up to three topics, or leave them all unchecked.", ar: "أبقِ حتى ثلاثة مواضيع، أو اتركها جميعًا دون تحديد." })}</p>
              <button className="mt-1 min-h-11 text-xs text-ink-soft underline underline-offset-4" onClick={() => setTopicDraft([])}>{t({ en: "Uncheck all", ar: "ألغِ تحديد الكل" })}</button>
            </fieldset>
            <nav aria-label={t({ en: "Topic review navigation", ar: "التنقّل في مراجعة المواضيع" })} className="mt-5 border-t border-line pt-5">
              <div className="flex items-center justify-between gap-3"><button className="btn btn-ghost !px-4 text-sm" onClick={() => setScreen(1)}><ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />{t({ en: "Back", ar: "رجوع" })}</button><button className="btn btn-primary text-sm" onClick={() => { finish({ interests: [...draft], topicsConfirmed: true }); }}>{t({ en: "Confirm my topics", ar: "أكّد مواضيعي" })}<ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" /></button></div>
              <button className="mx-auto mt-2 block min-h-11 text-sm text-ink-soft underline underline-offset-4" onClick={() => { finish({ interests: [], topicsConfirmed: false }); }}>{t({ en: "Skip for now", ar: "تخطّ الآن" })}</button>
            </nav>
          </section>
        )}
      </main>
    </div>
  );
}
