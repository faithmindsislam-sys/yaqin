"use client";

import Link from "next/link";
import { BookOpen, Compass, Languages, Sprout } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { S } from "@/lib/strings";
import { useContent } from "@/lib/content";
import type { Source, TrackId } from "@/lib/types";

export const TRACK_META: Record<TrackId, { icon: typeof Compass; tint: string; ring: string; tags: { en: string; ar: string }[] }> = {
  explore: {
    icon: Compass,
    tint: "from-sky-100 to-white",
    ring: "bg-sky-200 text-ink",
    tags: [
      { en: "Basics", ar: "الأساسيات" },
      { en: "Beliefs", ar: "العقيدة" },
      { en: "Common questions", ar: "أسئلة شائعة" },
    ],
  },
  "first-steps": {
    icon: Sprout,
    tint: "from-brand-50 to-white",
    ring: "bg-brand-100 text-brand-700",
    tags: [
      { en: "First steps", ar: "الخطوات الأولى" },
      { en: "Daily practice", ar: "عمل يومي" },
      { en: "Support", ar: "مرافقة" },
    ],
  },
  deepen: {
    icon: BookOpen,
    tint: "from-salmon-50 to-white",
    ring: "bg-salmon-100 text-salmon-700",
    tags: [
      { en: "Qur'an", ar: "القرآن" },
      { en: "Tafsir", ar: "التفسير" },
      { en: "Fiqh", ar: "الفقه" },
    ],
  },
};

export function LangToggle({ className = "" }: { className?: string }) {
  const { lang, setLang } = useI18n();
  return (
    <div className={`inline-flex items-center rounded-full border border-line bg-white p-0.5 text-sm ${className}`}>
      <Languages className="mx-1.5 h-4 w-4 text-muted" aria-hidden />
      {(["en", "ar"] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={`rounded-full px-2.5 py-1 transition ${lang === l ? "bg-brand-50 font-semibold text-brand-700" : "text-muted"}`}
        >
          {l === "en" ? "EN" : "العربية"}
        </button>
      ))}
    </div>
  );
}

/** Revealed text, always rendered verbatim from the sources table. */
export function SourceQuote({ id, source, compact = false }: { id: string; source?: Source; compact?: boolean }) {
  const { sources: allSources } = useContent();
  const { t, lang } = useI18n();
  const s = source ?? allSources[id];
  if (!s) return null;
  const isScripture = s.kind === "quran" || s.kind === "hadith";
  return (
    <figure className={`rounded-2xl border-s-4 border-brand-300 bg-brand-50/60 ${compact ? "p-3" : "p-4 sm:p-5"}`}>
      {s.text_ar && (
        <blockquote
          className={`${s.kind === "quran" ? "quran" : "font-sans"} text-ink ${compact ? "text-lg" : "text-xl sm:text-2xl"}`}
          dir="rtl"
          lang="ar"
        >
          {s.kind === "quran" ? `﴿${s.text_ar}﴾` : s.text_ar}
        </blockquote>
      )}
      {lang === "en" && s.text_en && (
        <p className={`mt-2 text-ink-soft ${compact ? "text-sm" : "text-base"}`} dir="ltr">
          “{s.text_en}”
        </p>
      )}
      <figcaption className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="font-medium text-brand-700">{lang === "ar" ? s.ref_ar : s.ref_en}</span>
        {s.grading && <span>· {s.grading}</span>}
        {isScripture && <span className="chip !py-0 !text-[0.7rem]">{t(S.lesson.revealed)}</span>}
        {s.review_status === "pending" && <span className="text-[0.7rem] opacity-80">· {t(S.lesson.pendingReview)}</span>}
        {s.url && (
          <a href={s.url} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-brand-700">
            {s.origin ?? "link"}
          </a>
        )}
      </figcaption>
    </figure>
  );
}

export function Section({ title, sub, action, children, className = "" }: {
  title: string;
  sub?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`card p-5 sm:p-7 ${className}`}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl text-ink sm:text-[1.7rem]">{title}</h2>
          {sub && <p className="mt-1 text-sm text-ink-soft">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function ArrowLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-800">
      {children}
      <span aria-hidden className="rtl:rotate-180">→</span>
    </Link>
  );
}
