"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, CheckCircle2, Circle, Send } from "lucide-react";
import { ask } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { saveNote, useProgress, type LessonProgress } from "@/lib/progress";
import { S } from "@/lib/strings";
import type { AskResponse, Lesson } from "@/lib/types";
import { AnswerView } from "../Answer";

export function Companion({ lesson, seed }: { lesson: Lesson; seed: { q: string; n: number } | null }) {
  const { t, lang } = useI18n();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const [seen, setSeen] = useState(seed);

  if (seed !== seen) {
    setSeen(seed);
    if (seed) setQ(seed.q);
  }

  useEffect(() => {
    if (seed) input.current?.focus();
  }, [seed]);

  async function submit(e?: React.FormEvent, question = q) {
    e?.preventDefault();
    if (!question.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setAnswer(await ask({ question, lang, lesson_id: lesson.id, track: lesson.track }));
    } catch {
      setError(t(S.ask.error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-4" id="companion">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-b from-teal-400 to-teal-700 text-white">
          <Bot className="h-5 w-5" />
        </span>
        <div>
          <p className="font-semibold text-ink">{t(S.lesson.companion)}</p>
          <p className="text-xs text-muted">{t(S.lesson.companionSub)}</p>
        </div>
      </div>
      <form onSubmit={submit} className="relative mt-3">
        <input ref={input} className="input pe-11 text-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t(S.lesson.companionPlaceholder)} />
        <button className="absolute end-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-teal-700 hover:bg-teal-50 disabled:opacity-40" disabled={busy || !q.trim()} aria-label={t(S.ask.send)}>
          <Send className="h-4 w-4 rtl:-scale-x-100" />
        </button>
      </form>
      {busy && <p className="mt-3 animate-pulse text-sm text-muted">{t(S.ask.thinking)}</p>}
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {answer && !busy && (
        <div className="mt-4 max-h-[26rem] overflow-y-auto pe-1">
          <AnswerView data={answer} compact onFollowUp={(f) => { setQ(f); void submit(undefined, f); }} />
        </div>
      )}
      <p className="mt-3 text-[0.7rem] leading-snug text-muted">{t(S.ask.disclaimer)}</p>
    </section>
  );
}

export function Notes({ lessonId }: { lessonId: string }) {
  const { t } = useI18n();
  const progress = useProgress();
  const [text, setText] = useState("");
  const loaded = useRef(false);

  useEffect(() => {
    if (!loaded.current && progress.notes[lessonId] !== undefined) {
      setText(progress.notes[lessonId]);
      loaded.current = true;
    }
  }, [progress.notes, lessonId]);

  return (
    <section className="card p-4">
      <p className="font-semibold text-ink">{t(S.lesson.notes)}</p>
      <textarea
        className="input mt-3 min-h-24 text-sm"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => saveNote(lessonId, text)}
        placeholder={t(S.lesson.notesPlaceholder)}
      />
    </section>
  );
}

export function Steps({ p, hasExplain, hasQuiz }: { p: LessonProgress; hasExplain: boolean; hasQuiz: boolean }) {
  const { t } = useI18n();
  const items = [
    { label: S.lesson.stepCards, done: p.cardsDone },
    ...(hasExplain ? [{ label: S.lesson.stepExplain, done: p.explained }] : []),
    ...(hasQuiz ? [{ label: S.lesson.stepQuiz, done: p.quizScore != null }] : []),
    { label: S.lesson.stepDone, done: !!p.completedAt },
  ];
  return (
    <section className="card p-4">
      <p className="font-semibold text-ink">{t(S.lesson.progress)}</p>
      <ul className="mt-3 space-y-2">
        {items.map((it) => (
          <li key={it.label.en} className="flex items-center gap-2.5 text-sm">
            {it.done ? <CheckCircle2 className="h-4.5 w-4.5 text-teal-500" /> : <Circle className="h-4.5 w-4.5 text-line" />}
            <span className={it.done ? "text-ink" : "text-muted"}>{t(it.label)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
