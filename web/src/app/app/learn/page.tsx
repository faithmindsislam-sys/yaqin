"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BookCheck, Check, CheckCircle2, ChevronLeft, ChevronRight, Circle, Flame, Info, Lock, Trophy } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Skyline } from "@/components/Scenery";
import { CardVisual } from "@/components/Visuals";
import { useContent } from "@/lib/content";
import { useI18n } from "@/lib/i18n";
import { streak, useProgress } from "@/lib/progress";
import { displayName, useSession } from "@/lib/session";
import { S } from "@/lib/strings";
import type { Bi, Lesson } from "@/lib/types";

export default function Dashboard() {
  return (
    <AppShell>
      <DashboardBody />
    </AppShell>
  );
}

function DashboardBody() {
  const { getTrack, getLesson, trackLessons } = useContent();
  const { t } = useI18n();
  const { user, guest, prefs } = useSession();
  const progress = useProgress();
  const trackId = prefs.track ?? "first-steps";
  const lessons = trackLessons(trackId);
  // Levels = the track's modules, in order.
  const levels = (getTrack(trackId)?.modules ?? []).map((m) => ({ ...m, items: m.lessons.map(getLesson).filter((l): l is Lesson => !!l) }));

  // Next lesson: first unfinished one, with "already confident" lessons moved to the end.
  const current = useMemo(() => {
    const ordered = [...lessons.filter((l) => !prefs.known.includes(l.id)), ...lessons.filter((l) => prefs.known.includes(l.id))];
    return ordered.find((l) => !progress.lessons[l.id]?.completedAt) ?? ordered[0];
  }, [lessons, prefs.known, progress.lessons]);

  const cp = current ? progress.lessons[current.id] : undefined;
  const plan = current
    ? [
        { label: `${t(S.dash.planRead)}: ${t(current.title)}`, done: !!cp?.cardsDone, href: `/lesson/?id=${current.id}` },
        { label: t(S.dash.planExplain), done: !!cp?.explained, href: `/lesson/?id=${current.id}&step=explain` },
        { label: t(S.dash.planQuiz), done: cp?.quizScore != null, href: `/lesson/?id=${current.id}&step=quiz` },
        { label: t(S.dash.planAsk), done: false, href: `/ask/?track=${trackId}` },
      ]
    : [];
  const doneCount = plan.filter((p) => p.done).length;

  const doneInTrack = lessons.filter((l) => progress.lessons[l.id]?.completedAt).length;
  const levelIdx = Math.max(0, current ? levels.findIndex((lv) => lv.id === current.module) : levels.length - 1);
  const level = levels[levelIdx];
  // Level shown in the journey card; defaults to the learner's current level. Higher levels are view-only (locked).
  const [picked, setPicked] = useState<number | null>(null);
  const viewIdx = Math.min(picked ?? levelIdx, levels.length - 1);
  const view = levels[viewIdx];
  const viewLocked = viewIdx > levelIdx;
  const viewDone = view ? view.items.filter((l) => progress.lessons[l.id]?.completedAt).length : 0;
  const days = streak(progress.days);
  const name = displayName(user);

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[1.6rem] bg-gradient-to-r from-white via-sky-50 to-brand-50 p-6 sm:p-8">
        <Skyline className="pointer-events-none absolute inset-y-0 end-0 hidden h-full w-1/2 opacity-70 [mask-image:linear-gradient(to_right,transparent,black_45%)] sm:block rtl:[mask-image:linear-gradient(to_left,transparent,black_45%)]" />
        <div className="relative max-w-xl">
          <h1 className="font-serif text-3xl text-ink sm:text-4xl">
            {t(S.dash.greeting[trackId].hello)}
            {name ? `، ${name}`.replace("، ", t({ en: ", ", ar: "، " })) : ""}
          </h1>
          <p className="mt-2 text-lg leading-relaxed text-ink-soft">{t(S.dash.greeting[trackId].sub)}</p>
          {guest && !user && (
            <p className="mt-5 inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink-soft shadow-sm">
              {t(S.dash.guestNote)}
              <Link href="/signin/" className="font-medium text-brand-700 hover:underline">{t(S.dash.saveProgress)}</Link>
            </p>
          )}
        </div>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <Stat icon={<Flame className="h-6 w-6 text-orange-500" />} value={days} label={t(S.dash.streak)} hint={t(S.dash.streakHint)} />
        <Stat icon={<BookCheck className="h-6 w-6 text-brand-600" />} value={`${doneInTrack}/${lessons.length}`} label={t(S.dash.lessonsDone)} />
        {level && (
          <div className="col-span-2 md:col-span-1">
            <Stat icon={<Trophy className="h-6 w-6 text-amber-500" />} value={`${t(S.dash.level)} ${levelIdx + 1}`} label={t(level.title)} />
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
        {/* Today's plan */}
        <section className="card p-6">
          <div className="flex items-baseline justify-between">
            <h2 className="font-serif text-2xl text-ink">{t(S.dash.today)}</h2>
            <span className="text-sm text-muted">
              {doneCount}/{plan.length} {t(S.dash.completed)}
            </span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-line">
            <div className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-all" style={{ width: `${plan.length ? (doneCount / plan.length) * 100 : 0}%` }} />
          </div>
          <ul className="mt-5 space-y-1">
            {plan.map((p) => (
              <li key={p.label}>
                <Link href={p.href} className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-sky-50">
                  {p.done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-brand-500" /> : <Circle className="h-5 w-5 shrink-0 text-line" />}
                  <span className={p.done ? "text-muted line-through" : "text-ink"}>{p.label}</span>
                </Link>
              </li>
            ))}
          </ul>
          {current && (
            <Link href={`/lesson/?id=${current.id}`} className="btn btn-primary mt-5 w-full">
              {cp?.card ? t(S.dash.continue) : t(S.dash.start)} <span aria-hidden className="rtl:rotate-180">→</span>
            </Link>
          )}
        </section>

        {/* Journey: one level at a time, drawn as a winding road */}
        <section className="card overflow-hidden p-6">
          <h2 className="font-serif text-2xl text-ink">{t(S.dash.journey)}</h2>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-brand-500" />{t(S.dash.road.done)}</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border-2 border-brand-500 bg-white" />{t(S.dash.road.now)}</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-line" />{t(S.dash.road.planned)}</span>
          </div>
          {view && (
            <>
              <div className={`mt-5 flex items-center gap-2 rounded-xl px-2 py-2 ${viewLocked ? "bg-sky-50/60" : "bg-brand-50"}`}>
                <button type="button" onClick={() => setPicked(viewIdx - 1)} disabled={viewIdx === 0} aria-label={t(S.dash.prevLevel)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-soft transition hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent">
                  <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
                </button>
                <div className={`min-w-0 flex-1 text-center text-sm ${viewLocked ? "text-muted" : "text-ink"}`}>
                  <p className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-brand-700">
                    {viewLocked && <Lock className="h-3 w-3" />}
                    {t(S.dash.level)} {viewIdx + 1}
                  </p>
                  <p className="truncate font-semibold">{t(view.title)}</p>
                  <p className="text-xs text-muted">
                    {viewLocked ? (view.items.length ? t(S.dash.locked) : t(S.dash.comingSoon)) : `${viewDone}/${view.items.length + (view.planned?.length ?? 0)} ${t(S.dash.completed)}`}
                  </p>
                </div>
                <button type="button" onClick={() => setPicked(viewIdx + 1)} disabled={viewIdx === levels.length - 1} aria-label={t(S.dash.nextLevel)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-soft transition hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent">
                  <ChevronRight className="h-5 w-5 rtl:rotate-180" />
                </button>
              </div>
              <div className="mt-2 flex justify-center gap-1.5">
                {levels.map((lv, i) => (
                  <button key={lv.id} type="button" onClick={() => setPicked(i)} aria-label={`${t(S.dash.level)} ${i + 1}`} aria-current={i === viewIdx}
                    className={`h-1.5 rounded-full transition-all ${i === viewIdx ? "w-5 bg-brand-500" : i <= levelIdx ? "w-1.5 bg-brand-200" : "w-1.5 bg-line"}`} />
                ))}
              </div>
              <Road key={view.id} lessons={view.items} planned={view.planned ?? []} locked={viewLocked} currentId={current?.id} />
            </>
          )}
        </section>
      </div>

      {current && (
        <Link href={`/lesson/?id=${current.id}`} className="card group block overflow-hidden md:hidden">
          <div className="h-40">
            <CardVisual kind={current.cards[0]?.visual} />
          </div>
        </Link>
      )}
    </div>
  );
}

function Stat({ icon, value, label, hint }: { icon: React.ReactNode; value: React.ReactNode; label: string; hint?: string }) {
  return (
    <div className="card p-5">
      {icon}
      <p className="mt-3 text-3xl font-semibold text-ink">{value}</p>
      <p className="flex items-center gap-1.5 text-sm text-muted">
        {label}
        {hint && (
          <span className="group relative inline-flex">
            <button type="button" aria-label={hint} className="rounded-full text-muted hover:text-brand-700 focus-visible:text-brand-700">
              <Info className="h-4 w-4" />
            </button>
            <span role="tooltip" className="pointer-events-none absolute bottom-full start-1/2 z-20 mb-2 w-56 -translate-x-1/2 rounded-lg bg-ink px-3 py-2 text-xs leading-relaxed text-white opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-within:opacity-100 rtl:translate-x-1/2">
              {hint}
            </span>
          </span>
        )}
      </p>
    </div>
  );
}

const ROW = 96; // px per lesson on the road
const xAt = (i: number) => (i % 2 === 0 ? 28 : 72); // % from the start edge, zig-zag

/** Lessons drawn as nodes on a winding road. Road is coloured up to the current lesson.
 *  `planned` titles and every node of a `locked` level are grey and not clickable. */
function Road({ lessons, planned, locked, currentId }: { lessons: Lesson[]; planned: Bi[]; locked: boolean; currentId?: string }) {
  const { t } = useI18n();
  const progress = useProgress();
  const count = lessons.length + planned.length;
  const h = count * ROW;
  const pathTo = (n: number) =>
    Array.from({ length: n + 1 }, (_, i) => {
      const y = ROW / 2 + i * ROW;
      if (i === 0) return `M ${xAt(0)} ${y}`;
      return `C ${xAt(i - 1)} ${y - ROW / 2} ${xAt(i)} ${y - ROW / 2} ${xAt(i)} ${y}`;
    }).join(" ");
  const reached = lessons.findIndex((l) => l.id === currentId);
  const allDone = lessons.length > 0 && lessons.every((l) => progress.lessons[l.id]?.completedAt);
  const coloredTo = locked ? -1 : allDone ? lessons.length - 1 : reached;
  const items = [
    ...lessons.map((l) => ({ key: l.id, title: l.title, lesson: l })),
    ...planned.map((title, i) => ({ key: `planned-${i}`, title, lesson: undefined })),
  ];

  return (
    <ol className={`relative mt-4 ${locked ? "opacity-60" : ""}`} style={{ height: h }}>
      <svg className="absolute inset-0 h-full w-full rtl:-scale-x-100" viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" aria-hidden>
        <path d={pathTo(count - 1)} fill="none" className="stroke-line" strokeWidth={14} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {coloredTo >= 0 && <path d={pathTo(coloredTo)} fill="none" className="stroke-brand-400" strokeWidth={14} strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
        <path d={pathTo(count - 1)} fill="none" stroke="white" strokeWidth={2} strokeDasharray="6 8" vectorEffect="non-scaling-stroke" />
      </svg>
      {items.map(({ key, title, lesson }, i) => {
        const open = !!lesson && !locked;
        const state = !open ? "locked" : progress.lessons[lesson.id]?.completedAt ? "done" : lesson.id === currentId ? "now" : "planned";
        const x = xAt(i);
        const labelOnEnd = x < 50;
        const body = (
          <>
            <span
              className={`absolute top-1/2 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-4 text-sm font-bold shadow-sm transition rtl:translate-x-1/2 ${open ? "group-hover:scale-110" : ""} ${
                state === "done" ? "border-white bg-brand-500 text-white" : state === "now" ? "border-brand-500 bg-white text-brand-700 ring-4 ring-brand-100" : "border-white bg-line text-muted"
              }`}
              style={{ insetInlineStart: `${x}%` }}
            >
              {state === "done" ? <Check className="h-5 w-5" /> : state === "locked" ? <Lock className="h-4 w-4" /> : i + 1}
            </span>
            <span
              className={`absolute top-1/2 -translate-y-1/2 ${labelOnEnd ? "text-start" : "text-end"}`}
              style={labelOnEnd ? { insetInlineStart: `calc(${x}% + 32px)`, insetInlineEnd: 0 } : { insetInlineStart: 0, insetInlineEnd: `calc(${100 - x}% + 32px)` }}
            >
              <span className={`block text-sm font-medium leading-snug line-clamp-2 ${state === "locked" ? "text-muted" : state === "planned" ? "text-ink-soft" : "text-ink"}`}>{t(title)}</span>
              <span className={`text-xs ${state === "now" ? "font-medium text-brand-700" : "text-muted"}`}>
                {state === "now" ? t(S.dash.road.now) : !lesson ? t(S.dash.comingSoon) : `${lesson.minutes} ${t(S.library.min)}`}
              </span>
            </span>
          </>
        );
        return (
          <li key={key} className="absolute inset-x-0" style={{ top: i * ROW, height: ROW }}>
            {open ? (
              <Link href={`/lesson/?id=${lesson.id}`} className="group block h-full" aria-label={`${t(title)} · ${t(S.dash.road[state as "done" | "now" | "planned"])}`}>
                {body}
              </Link>
            ) : (
              <div className="block h-full cursor-not-allowed" aria-disabled>{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
