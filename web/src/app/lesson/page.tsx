"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { PartyPopper } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { CardView } from "@/components/lesson/CardView";
import { ExplainBack } from "@/components/lesson/ExplainBack";
import { Quiz } from "@/components/lesson/Quiz";
import { Companion, Notes, Steps } from "@/components/lesson/SidePanel";
import { useContent } from "@/lib/content";
import { useI18n } from "@/lib/i18n";
import { useLessonProgress } from "@/lib/progress";
import { S } from "@/lib/strings";

type Phase = "cards" | "explain" | "quiz" | "done";

export default function LessonPage() {
  return (
    <AppShell>
      <Suspense>
        <LessonPlayer />
      </Suspense>
    </AppShell>
  );
}

function LessonPlayer() {
  const { getLesson, getTrack, nextLessonAfter } = useContent();
  const { t } = useI18n();
  const params = useSearchParams();
  const router = useRouter();
  const lesson = getLesson(params.get("id"));
  const [p, update] = useLessonProgress(lesson?.id);
  const step = params.get("step");
  const [phase, setPhase] = useState<Phase>(step === "explain" || step === "quiz" ? step : "cards");
  const [index, setIndex] = useState(() => Math.min(p.card, (lesson?.cards.length ?? 1) - 1));
  const [seed, setSeed] = useState<{ q: string; n: number } | null>(null);
  const [shownId, setShownId] = useState(lesson?.id);

  // Moving to another lesson keeps this component mounted: resume that lesson instead.
  if (lesson && shownId !== lesson.id) {
    setShownId(lesson.id);
    setPhase("cards");
    setIndex(Math.min(p.card, lesson.cards.length - 1));
  }

  if (!lesson) {
    return (
      <div className="card p-10 text-center">
        <p className="text-ink-soft">{t(S.lesson.notFound)}</p>
        <Link href="/library/" className="btn btn-primary mt-4">{t(S.lesson.back)}</Link>
      </div>
    );
  }

  const cards = lesson.cards;
  const card = cards[index];
  const hasExplain = !!lesson.explain_back?.key_ideas.length;
  const hasQuiz = !!lesson.quiz?.length;
  const track = getTrack(lesson.track);
  const next = nextLessonAfter(lesson.id);
  const total = cards.length + (hasExplain ? 1 : 0) + (hasQuiz ? 1 : 0);
  const position = phase === "cards" ? index + 1 : phase === "explain" ? cards.length + 1 : phase === "quiz" ? total : total;

  function goNextCard() {
    if (index + 1 < cards.length) {
      setIndex(index + 1);
      update({ card: index + 1 });
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    update({ cardsDone: true, card: index });
    setPhase(hasExplain ? "explain" : hasQuiz ? "quiz" : "done");
    if (!hasExplain && !hasQuiz) update({ completedAt: new Date().toISOString() });
  }

  function askAbout(q: string) {
    setSeed({ q, n: Date.now() });
    document.getElementById("companion")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
      <div className="card min-w-0 p-5 sm:p-8">
        <div className="flex items-center justify-between gap-3 text-sm text-muted">
          <button onClick={() => router.push("/library/")} className="flex items-center gap-1.5 hover:text-ink">
            <span aria-hidden className="rtl:rotate-180">←</span> {t(S.lesson.back)}
          </button>
          <span>
            {track ? `${t(track.title)} · ` : ""}
            {t(lesson.title)} · {position} {t(S.lesson.of)} {total}
          </span>
        </div>
        <div className="mt-3 h-2 rounded-full bg-line">
          <div className="h-full rounded-full bg-gradient-to-r from-teal-400 to-teal-600 transition-all duration-500" style={{ width: `${(position / total) * 100}%` }} />
        </div>

        <div className="mt-8">
          {phase === "cards" && card && <CardView key={card.id} lesson={lesson} card={card} onAsk={askAbout} />}
          {phase === "explain" && <ExplainBack lesson={lesson} onDone={() => update({ explained: true })} />}
          {phase === "quiz" && (
            <Quiz
              lesson={lesson}
              onFinish={(score) => {
                update({ quizScore: score, completedAt: new Date().toISOString() });
                setPhase("done");
              }}
            />
          )}
          {phase === "done" && (
            <section className="rise py-6 text-center">
              <PartyPopper className="mx-auto h-12 w-12 text-gold" />
              <h2 className="mt-4 font-serif text-4xl text-ink">{t(S.lesson.doneTitle)}</h2>
              <p className="mt-2 text-ink-soft">{t(S.lesson.doneSub)}</p>
              {p.quizScore != null && <p className="mt-2 text-sm text-muted">{Math.round(p.quizScore * 100)}%</p>}
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                {next && (
                  <Link href={`/lesson/?id=${next.id}`} className="btn btn-primary">
                    {t(S.lesson.nextLesson)}: {t(next.title)} <span aria-hidden className="rtl:rotate-180">→</span>
                  </Link>
                )}
                <Link href="/app/" className="btn btn-ghost">{t(S.lesson.toDashboard)}</Link>
              </div>
            </section>
          )}
        </div>

        {phase !== "done" && (
          <div className="mt-8 flex items-center justify-between gap-3 border-t border-line pt-5">
            <button
              className="btn btn-ghost"
              disabled={phase === "cards" && index === 0}
              onClick={() => {
                if (phase === "cards") setIndex(Math.max(0, index - 1));
                else if (phase === "explain") setPhase("cards");
                else setPhase(hasExplain ? "explain" : "cards");
              }}
            >
              <span aria-hidden className="rtl:rotate-180">←</span> {t(S.lesson.previous)}
            </button>
            {phase === "cards" && (
              <button className="btn btn-primary" onClick={goNextCard}>
                {t(S.lesson.continue)} <span aria-hidden className="rtl:rotate-180">→</span>
              </button>
            )}
            {phase === "explain" && (
              <button className="btn btn-primary" onClick={() => (hasQuiz ? setPhase("quiz") : (update({ completedAt: new Date().toISOString() }), setPhase("done")))}>
                {t(S.lesson.continue)} <span aria-hidden className="rtl:rotate-180">→</span>
              </button>
            )}
          </div>
        )}
      </div>

      <aside className="space-y-4">
        <Companion lesson={lesson} seed={seed} />
        <Steps p={p} hasExplain={hasExplain} hasQuiz={hasQuiz} />
        <Notes lessonId={lesson.id} />
      </aside>
    </div>
  );
}
