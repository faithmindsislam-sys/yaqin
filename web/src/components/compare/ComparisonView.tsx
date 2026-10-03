"use client";

import { Section, SourceQuote } from "@/components/ui";
import type { CompareRef, Comparison, Sides } from "@/lib/compare";
import { useContent } from "@/lib/content";
import { useI18n } from "@/lib/i18n";
import { S } from "@/lib/strings";
import type { Bi } from "@/lib/types";

function Empty() {
  const { t } = useI18n();
  return <p className="text-sm text-muted">{t(S.compare.placeholder)}</p>;
}

function Points({ items }: { items?: Bi[] }) {
  const { t } = useI18n();
  if (!items?.length) return <Empty />;
  if (items.length === 1) return <p className="leading-relaxed text-ink-soft">{t(items[0])}</p>;
  return (
    <ul className="list-disc space-y-1.5 ps-5 leading-relaxed text-ink-soft">
      {items.map((b) => <li key={b.en}>{t(b)}</li>)}
    </ul>
  );
}

/** A source id from the content bundle is shown verbatim, like in lessons; anything else is a titled link. */
function Refs({ items }: { items?: CompareRef[] }) {
  const { t } = useI18n();
  const { sources } = useContent();
  if (!items?.length) return <Empty />;
  return (
    <ul className="space-y-3 text-sm">
      {items.map((r) => (
        <li key={r.id}>
          {sources[r.id] ? <SourceQuote id={r.id} compact /> : r.url ? (
            <a href={r.url} target="_blank" rel="noreferrer" className="text-brand-700 underline decoration-dotted underline-offset-2">{t(r.title) || r.url}</a>
          ) : t(r.title)}
        </li>
      ))}
    </ul>
  );
}

function Side({ label, islam, children }: { label: string; islam?: boolean; children: React.ReactNode }) {
  return (
    <div className={`rounded-2xl border p-4 ${islam ? "border-brand-200 bg-brand-50/60" : "border-line bg-sky-50"}`}>
      <h3 className={`mb-2 text-sm font-semibold ${islam ? "text-brand-700" : "text-salmon-700"}`}>{label}</h3>
      {children}
    </div>
  );
}

/**
 * The comparison for one topic: the selected belief beside the Islamic perspective
 * (two columns on desktop, stacked on mobile). Any part without content shows a placeholder.
 */
export function ComparisonView({ belief, comparison: c }: { belief: string; comparison?: Comparison }) {
  const { t } = useI18n();
  const sec = S.compare.sections;
  const pending = (filled: unknown) => (filled ? undefined : <span className="chip">{t(S.compare.status.draft)}</span>);
  const any = (s?: Sides<unknown[]>) => !!(s?.belief?.length || s?.islam?.length);

  const twoSided = (title: Bi, sides: Sides<unknown[]> | undefined, render: (side: "belief" | "islam") => React.ReactNode) => (
    <Section title={t(title)} action={pending(any(sides))}>
      <div className="grid gap-4 md:grid-cols-2">
        <Side label={belief}>{render("belief")}</Side>
        <Side islam label={t(S.compare.islamic)}>{render("islam")}</Side>
      </div>
    </Section>
  );

  return (
    <div className="space-y-5">
      {twoSided(sec.overview, c?.overview, (s) => <Points items={c?.overview?.[s]} />)}
      {twoSided(sec.beliefs, c?.beliefs, (s) => <Points items={c?.beliefs?.[s]} />)}
      <Section title={t(sec.common)} action={pending(c?.common?.length)}>
        <Points items={c?.common} />
      </Section>
      {twoSided(sec.differences, c?.differences, (s) => <Points items={c?.differences?.[s]} />)}
      <Section title={t(sec.faq)} action={pending(c?.faq?.length)}>
        {c?.faq?.length ? c.faq.map((f) => (
          <details key={f.id} className="border-b border-line py-3 last:border-0">
            <summary className="cursor-pointer font-medium text-ink">{t(f.q)}</summary>
            <p className="mt-2 leading-relaxed text-ink-soft">{t(f.a)}</p>
          </details>
        )) : <Empty />}
      </Section>
      {twoSided(sec.sources, c?.sources, (s) => <Refs items={c?.sources?.[s]} />)}
    </div>
  );
}
