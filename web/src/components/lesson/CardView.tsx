"use client";

import { useState } from "react";
import { BookMarked, MessageCircleQuestion, Pause, Volume2, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useContent } from "@/lib/content";
import { S } from "@/lib/strings";
import type { Card, Lesson } from "@/lib/types";
import { useNarration } from "@/lib/voice";
import { CardVisual } from "../Visuals";
import { CardBody, SourceQuote } from "../ui";

const LABELS = {
  obligatory: { key: S.lesson.obligatory, cls: "bg-brand-50 text-brand-800 border-brand-200" },
  recommended: { key: S.lesson.recommended, cls: "bg-violet-50 text-violet-800 border-violet-200" },
  suggestion: { key: S.lesson.suggestion, cls: "bg-slate-50 text-slate-700 border-slate-200" },
} as const;

export function CardView({ lesson, card, onAsk }: { lesson: Lesson; card: Card; onAsk: (q: string) => void }) {
  const { sources: allSources } = useContent();
  const { t, lang } = useI18n();
  const narration = useNarration();
  const [showSources, setShowSources] = useState(false);
  const [imageOk, setImageOk] = useState(true);

  const isQuote = card.kind === "quote";
  const primary = card.sources?.[0];
  // The lesson cover opens the lesson, unless the first section has its own image.
  const image = card.image ?? (lesson.cards[0]?.id === card.id ? lesson.cover : undefined);
  const labels = lesson.explain_back?.key_ideas.map((k) => k[lang]) ?? [];
  // Narrate explanation only — never the verse or hadith itself.
  const narrationText = [t(card.title), isQuote ? "" : t(card.body), t(card.takeaway)].filter(Boolean).join(". ");

  return (
    <article className="rise">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-serif text-2xl text-ink sm:text-[1.9rem]">{t(card.title)}</h2>
        {card.label && (
          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${LABELS[card.label].cls}`}>{t(LABELS[card.label].key)}</span>
        )}
      </div>

      {isQuote && primary ? (
        <div className="mt-5">
          <SourceQuote id={primary} />
        </div>
      ) : (
        <div className="mt-5 aspect-[16/9] w-full">
          {image && imageOk ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" onError={() => setImageOk(false)} className="h-full w-full rounded-[1.4rem] object-cover" />
          ) : (
            <CardVisual kind={card.visual} labels={labels} />
          )}
        </div>
      )}

      {!isQuote && card.body && <CardBody card={card} className="mt-5 text-[1.05rem] leading-relaxed text-ink" />}
      {card.takeaway && <p className="mt-4 font-serif text-xl italic leading-snug text-ink-soft">{t(card.takeaway)}</p>}

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        {card.sources?.some((id) => ["quran", "hadith"].includes(allSources[id]?.kind)) && (
          <span className="rounded-full border border-brand-300 bg-brand-50 px-2.5 py-0.5 text-brand-800">📖 {t(S.lesson.revealed)}</span>
        )}
        {!isQuote && <span className="rounded-full border border-[#6150ea]/30 bg-[#6150ea]/5 px-2.5 py-0.5 text-[#4a3cc9]">✦ {t(S.lesson.generated)}</span>}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button
          className="btn btn-ghost !py-2"
          onClick={() => (narration.playing ? narration.stop() : narration.play({ src: card.audio?.[lang], text: narrationText, lang }))}
        >
          {narration.playing ? <Pause className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          {t(narration.playing ? S.lesson.pause : S.lesson.listen)}
        </button>
        {!!card.sources?.length && (
          <button className="btn btn-ghost !py-2" onClick={() => setShowSources(true)}>
            <BookMarked className="h-4 w-4" /> {t(S.lesson.sources)} ({card.sources.length})
          </button>
        )}
        <button className="btn btn-ghost !py-2" onClick={() => onAsk(t(card.title))}>
          <MessageCircleQuestion className="h-4 w-4" /> {t(S.lesson.ask)}
        </button>
      </div>

      {showSources && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 p-3 backdrop-blur-sm sm:items-center" onClick={() => setShowSources(false)}>
          <div className="card max-h-[85vh] w-full max-w-2xl overflow-y-auto p-5" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-serif text-xl text-ink">{t(S.lesson.sources)}</h3>
              <button onClick={() => setShowSources(false)} className="rounded-lg p-1.5 text-muted hover:bg-sky-50" aria-label={t(S.common.close)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              {card.sources?.map((id) => <SourceQuote key={id} id={id} />)}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
