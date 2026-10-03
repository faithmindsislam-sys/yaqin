"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { Clock, Layers, Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { CardVisual } from "@/components/Visuals";
import { TRACK_META } from "@/components/ui";
import { useContent } from "@/lib/content";
import { useI18n } from "@/lib/i18n";
import { useProgress } from "@/lib/progress";
import { S } from "@/lib/strings";
import { useOnboarding } from "@/lib/onboarding-state";
import type { TrackId } from "@/lib/types";

export default function LibraryPage() {
  return (
    <AppShell requireSession={false}>
      <Suspense><Library /></Suspense>
    </AppShell>
  );
}

function Library() {
  const { allLessons, tracks } = useContent();
  const { t } = useI18n();
  const progress = useProgress();
  const params = useSearchParams();
  const { setScreen } = useOnboarding();
  const [filter, setFilter] = useState<TrackId | "all">(() => params.get("track") === "explore" ? "explore" : "all");
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
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-4xl text-ink">{t(S.library.title)}</h1>
        <p className="mt-1 text-ink-soft">{t(S.library.sub)}</p>
        {filter === "explore" && <Link href="/start/explore/" onClick={() => setScreen(1)} className="mt-3 inline-flex min-h-11 items-center text-sm text-brand-700 hover:underline">{t({ en: "Edit my answers", ar: "عدّل إجاباتي" })}</Link>}
      </header>

      <div className="relative">
        <Search className="absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input className="input !rounded-full ps-11" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t(S.library.search)} aria-label={t(S.library.search)} />
      </div>

      <div className="flex flex-wrap gap-2">
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
    </div>
  );
}
