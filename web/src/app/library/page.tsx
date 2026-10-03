"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { CheckCircle2, Circle, CircleDot, Clock, Layers, Lock, MessagesSquare, Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { CardVisual } from "@/components/Visuals";
import { TRACK_META } from "@/components/ui";
import { useContent } from "@/lib/content";
import { useI18n } from "@/lib/i18n";
import { nextLesson, useProgress } from "@/lib/progress";
import { useSession } from "@/lib/session";
import { useIsClient } from "@/lib/store";
import { S } from "@/lib/strings";
import { useOnboarding } from "@/lib/onboarding-state";
import type { Lesson, TrackId } from "@/lib/types";

type View = "learn" | "browse";

export default function LibraryPage() {
  return (
    <AppShell requireSession={false}>
      <Suspense><Library /></Suspense>
    </AppShell>
  );
}

function Library() {
  const { tracks } = useContent();
  const { t } = useI18n();
  // Session preferences live in the browser only: render the server defaults until this boundary has hydrated.
  const stored = useSession().prefs;
  const prefs = useIsClient() ? stored : { track: null, known: [] };
  const params = useSearchParams();
  const { setScreen } = useOnboarding();
  const paramView = params.get("view");
  const paramTrack = tracks.find((tr) => tr.id === params.get("track"))?.id;
  // Until the learner picks, follow the link, then the selected track: the guided route is the Explore Islam one.
  const [pickedView, setView] = useState<View | null>(paramView === "learn" || paramView === "browse" ? paramView : null);
  const [pickedFilter, setFilter] = useState<TrackId | "all" | null>(null);
  const view = pickedView ?? (paramTrack || (prefs.track && prefs.track !== "explore") ? "browse" : "learn");
  const filter = pickedFilter ?? paramTrack ?? prefs.track ?? "all";

  return (
    <div className="space-y-6">
      <div role="group" aria-label={t(S.library.views)} className="flex rounded-full border border-line bg-white p-1 text-sm sm:inline-flex">
        {(["learn", "browse"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            aria-pressed={view === v}
            className={`min-h-11 flex-1 whitespace-nowrap rounded-full px-5 transition ${view === v ? "bg-brand-50 font-semibold text-brand-700" : "text-ink-soft hover:bg-sky-50"}`}
          >
            {t(v === "learn" ? S.library.learnTab : S.library.browseTab)}
          </button>
        ))}
      </div>

      {view === "learn" ? <LearnIslam known={prefs.known} /> : <Browse filter={filter} setFilter={setFilter} />}

      {(view === "learn" ? prefs.track : filter) === "explore" && (
        <Link href="/start/explore/" onClick={() => setScreen(1)} className="inline-flex min-h-11 items-center text-sm text-brand-700 hover:underline">{t({ en: "Edit my answers", ar: "عدّل إجاباتي" })}</Link>
      )}
    </div>
  );
}

/** Guided route through the Explore Islam track: its modules in order, one recommended next lesson, free choice of any other. */
function LearnIslam({ known }: { known: string[] }) {
  const { getTrack, getLesson, trackLessons } = useContent();
  const { t } = useI18n();
  const progress = useProgress();
  const lessons = trackLessons("explore");
  const done = (l: Lesson) => !!progress.lessons[l.id]?.completedAt;
  const allDone = lessons.every(done);
  const next = nextLesson(lessons, known, progress.lessons);
  const started = lessons.some((l) => progress.lessons[l.id]);
  const modules = (getTrack("explore")?.modules ?? []).map((m) => ({ ...m, items: m.lessons.map(getLesson).filter((l): l is Lesson => !!l) }));

  return (
    <>
      <header className="rounded-[1.6rem] bg-gradient-to-r from-white via-sky-50 to-brand-50 p-6 sm:p-8">
        <h1 className="font-serif text-3xl text-ink sm:text-4xl">{t(S.library.learnTitle)}</h1>
        <p className="mt-2 text-lg text-ink-soft">{t(S.library.learnSub)}</p>
        {next && (
          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3">
            <Link href={`/lesson/?id=${next.id}`} className="btn btn-primary w-full !px-7 !py-3.5 text-base sm:w-auto">
              {t(allDone ? S.dash.review : started ? S.library.continueLearning : S.library.startLearning)} <span aria-hidden className="rtl:rotate-180">→</span>
            </Link>
            <p className="text-sm text-ink-soft">{allDone ? t(S.library.allDone) : `${t(next.title)} · ${next.minutes} ${t(S.library.min)}`}</p>
          </div>
        )}
      </header>

      {modules.map((m) => (
        <section key={m.id} aria-labelledby={`module-${m.id}`} className="card p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id={`module-${m.id}`} className={`font-serif text-xl ${m.items.length ? "text-ink" : "text-ink-soft"}`}>{t(m.title)}</h2>
            {!m.items.length && <span className="chip"><Lock className="h-3.5 w-3.5" aria-hidden /> {t(S.dash.comingSoon)}</span>}
          </div>
          <ol className="mt-3 space-y-1">
            {m.items.map((l) => {
              const lp = progress.lessons[l.id];
              const isNext = !allDone && l.id === next?.id;
              const Icon = lp?.completedAt ? CheckCircle2 : lp ? CircleDot : Circle;
              return (
                <li key={l.id}>
                  <Link href={`/lesson/?id=${l.id}`} aria-current={isNext ? "step" : undefined} className={`flex min-h-14 items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-sky-50 ${isNext ? "bg-brand-50 ring-1 ring-brand-200" : ""}`}>
                    <Icon className={`h-5 w-5 shrink-0 ${lp ? "text-brand-500" : "text-muted"}`} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-ink">{t(l.title)}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                        <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden /> {l.minutes} {t(S.library.min)}</span>
                        <span>{t(lp?.completedAt ? S.dash.road.done : lp ? S.dash.road.now : S.library.notStarted)}</span>
                        {isNext && <span className="font-semibold text-brand-700">{t(S.library.recommended)}</span>}
                      </span>
                    </span>
                    <span aria-hidden className="text-muted rtl:rotate-180">→</span>
                  </Link>
                </li>
              );
            })}
            {/* Planned titles have no lesson content yet: plain text, never a link. */}
            {(m.planned ?? []).map((title) => (
              <li key={title.en} className="flex items-center gap-3 px-3 py-2 text-sm text-muted">
                <Lock className="h-4 w-4 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1">{t(title)}</span>
                <span className="text-xs">{t(S.dash.comingSoon)}</span>
              </li>
            ))}
          </ol>
        </section>
      ))}

      <section className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <p className="text-ink-soft">{t(S.library.askHint)}</p>
        <Link href="/ask/?track=explore" className="btn btn-ghost w-full sm:w-auto">
          <MessagesSquare className="h-4 w-4" aria-hidden /> {t(S.nav.ask)}
        </Link>
      </section>
    </>
  );
}

function Browse({ filter, setFilter }: { filter: TrackId | "all"; setFilter: (f: TrackId | "all") => void }) {
  const { allLessons, tracks } = useContent();
  const { t } = useI18n();
  const progress = useProgress();
  const [query, setQuery] = useState("");

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allLessons().filter((l) => {
      if (filter !== "all" && l.track !== filter) return false;
      if (!q) return true;
      const hay = [l.title.en, l.title.ar, l.summary.en, l.summary.ar, ...l.cards.flatMap((c) => [c.title.en, c.title.ar])].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [filter, query, allLessons]);

  return (
    <>
      <header>
        <h1 className="font-serif text-4xl text-ink">{t(S.library.title)}</h1>
        <p className="mt-1 text-ink-soft">{t(S.library.sub)}</p>
      </header>

      <div className="relative">
        <Search className="absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input className="input !rounded-full ps-11" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t(S.library.search)} aria-label={t(S.library.search)} />
      </div>

      <div role="group" aria-label={t(S.library.filter)} className="flex flex-wrap gap-2">
        {[{ id: "all" as const, title: S.library.all }, ...tracks.map((tr) => ({ id: tr.id, title: tr.title }))].map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={`rounded-full border px-4 py-1.5 text-sm transition ${filter === f.id ? "border-brand-500 bg-brand-500 text-white" : "border-line bg-white text-ink-soft hover:border-brand-300"}`}
          >
            {t(f.title)}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <p className="card p-10 text-center text-ink-soft">{t(S.library.empty)}</p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((l) => {
            const lp = progress.lessons[l.id];
            const pct = lp?.completedAt ? 100 : lp ? Math.round(((lp.card + (lp.cardsDone ? 1 : 0)) / l.cards.length) * 100) : 0;
            const meta = TRACK_META[l.track];
            const track = tracks.find((tr) => tr.id === l.track);
            const firstVisual = l.cards.find((c) => c.visual && c.visual !== "none")?.visual;
            return (
              <Link key={l.id} href={`/lesson/?id=${l.id}`} className="card group overflow-hidden transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
                <div className="relative h-40">
                  <CardVisual kind={firstVisual} className="!rounded-none" labels={l.explain_back?.key_ideas.map((k) => k.en)} />
                  <span className={`absolute start-3 top-3 rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.ring}`}>{track ? t(track.title) : ""}</span>
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-ink group-hover:text-brand-800">{t(l.title)}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-ink-soft">{t(l.summary)}</p>
                  <div className="mt-3 flex items-center gap-4 text-xs text-muted">
                    <span className="flex items-center gap-1"><Layers className="h-3.5 w-3.5" /> {l.cards.length} {t(S.library.cards)}</span>
                    <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {l.minutes} {t(S.library.min)}</span>
                    <span>{t(l.level === "deeper" ? S.library.deeper : S.library.foundation)}</span>
                  </div>
                  <div className="mt-3 h-1.5 rounded-full bg-line">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
