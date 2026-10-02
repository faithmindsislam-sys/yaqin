"use client";

import Link from "next/link";
import { useMemo } from "react";
import { BookCheck, CheckCircle2, Circle, Flame, Mic } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Skyline } from "@/components/Scenery";
import { CardVisual } from "@/components/Visuals";
import { TRACK_META } from "@/components/ui";
import { getTrack, trackLessons, tracks } from "@/lib/content";
import { useI18n } from "@/lib/i18n";
import { streak, useProgress } from "@/lib/progress";
import { displayName, useSession } from "@/lib/session";
import { S } from "@/lib/strings";

export default function Dashboard() {
  return (
    <AppShell>
      <DashboardBody />
    </AppShell>
  );
}

function DashboardBody() {
  const { t } = useI18n();
  const { user, guest, prefs, setPrefs } = useSession();
  const progress = useProgress();
  const trackId = prefs.track ?? "first-steps";
  const track = getTrack(trackId);
  const lessons = trackLessons(trackId);

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

  const completed = Object.values(progress.lessons).filter((l) => l.completedAt).length;
  const explained = Object.values(progress.lessons).filter((l) => l.explained).length;
  const days = streak(progress.days);
  const name = displayName(user);

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[1.6rem] bg-gradient-to-r from-white via-sky-50 to-teal-50 p-6 sm:p-8">
        <Skyline className="pointer-events-none absolute inset-y-0 end-0 h-full w-2/3 opacity-60" />
        <div className="relative">
          <h1 className="font-serif text-3xl text-ink sm:text-4xl">
            {t(S.dash.hello)}
            {name ? `، ${name}`.replace("، ", t({ en: ", ", ar: "، " })) : ""}
          </h1>
          <p className="mt-1 text-ink-soft">{t(S.dash.sub)}</p>
          {guest && !user && (
            <p className="mt-4 inline-flex flex-wrap items-center gap-2 rounded-xl bg-white/80 px-3 py-2 text-sm text-ink-soft">
              {t(S.dash.guestNote)}
              <Link href="/signin/" className="font-medium text-teal-700 hover:underline">{t(S.dash.saveProgress)}</Link>
            </p>
          )}
        </div>
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
            <div className="h-full rounded-full bg-gradient-to-r from-teal-400 to-teal-600 transition-all" style={{ width: `${plan.length ? (doneCount / plan.length) * 100 : 0}%` }} />
          </div>
          <ul className="mt-5 space-y-1">
            {plan.map((p) => (
              <li key={p.label}>
                <Link href={p.href} className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-sky-50">
                  {p.done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-teal-500" /> : <Circle className="h-5 w-5 shrink-0 text-line" />}
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

        {/* Journey */}
        <section className="card overflow-hidden p-6">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-serif text-2xl text-ink">{t(S.dash.journey)}</h2>
            {track && <span className="chip">{t(track.title)}</span>}
          </div>
          <ol className="relative mt-6 space-y-4 ps-8">
            <span className="absolute bottom-3 start-[0.95rem] top-3 w-0.5 rounded bg-gradient-to-b from-teal-300 to-line" aria-hidden />
            {lessons.map((l, i) => {
              const lp = progress.lessons[l.id];
              const state = lp?.completedAt ? "done" : l.id === current?.id ? "now" : "next";
              return (
                <li key={l.id} className="relative">
                  <span
                    className={`absolute -start-8 top-1 grid h-8 w-8 place-items-center rounded-full border-2 text-xs font-bold ${
                      state === "done" ? "border-teal-500 bg-teal-500 text-white" : state === "now" ? "border-teal-500 bg-white text-teal-700" : "border-line bg-white text-muted"
                    }`}
                  >
                    {state === "done" ? "✓" : i + 1}
                  </span>
                  <Link href={`/lesson/?id=${l.id}`} className={`block rounded-2xl border p-3.5 transition hover:border-teal-300 ${state === "now" ? "border-teal-300 bg-teal-50/60" : "border-line"}`}>
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-medium text-ink">{t(l.title)}</span>
                      <span className="text-xs text-muted">{l.minutes} {t(S.library.min)}</span>
                    </span>
                    <span className="mt-0.5 block text-sm text-ink-soft line-clamp-1">{t(l.summary)}</span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      </div>

      {/* Stats */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat icon={<Flame className="h-6 w-6 text-orange-500" />} value={days} label={t(S.dash.streak)} />
        <Stat icon={<BookCheck className="h-6 w-6 text-teal-600" />} value={completed} label={t(S.dash.lessonsDone)} />
        <Stat icon={<Mic className="h-6 w-6 text-[#6150ea]" />} value={explained} label={t(S.dash.explained)} />
        <div className="card flex items-center p-5">
          <p className="font-serif text-lg italic leading-snug text-ink-soft">“{t(S.dash.keepGoing)}”</p>
        </div>
      </section>

      {/* Other tracks */}
      <section className="card p-6">
        <h2 className="font-serif text-2xl text-ink">{t(S.dash.switchTrack)}</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {tracks.map((tr) => {
            const meta = TRACK_META[tr.id];
            const Icon = meta.icon;
            const active = tr.id === trackId;
            const first = trackLessons(tr.id)[0];
            return (
              <button
                key={tr.id}
                onClick={() => setPrefs({ track: tr.id })}
                aria-pressed={active}
                className={`flex items-center gap-3 rounded-2xl border p-4 text-start transition ${active ? "border-teal-400 bg-teal-50/50" : "border-line hover:border-teal-200"}`}
              >
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${meta.ring}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-medium text-ink">{t(tr.title)}</span>
                  <span className="block truncate text-xs text-muted">{first ? t(first.title) : ""}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

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

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="card p-5">
      {icon}
      <p className="mt-3 text-3xl font-semibold text-ink">{value}</p>
      <p className="text-sm text-muted">{label}</p>
    </div>
  );
}
