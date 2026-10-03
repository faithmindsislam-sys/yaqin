"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, Network } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { BeliefMap, type MapColumn } from "@/components/compare/BeliefMap";
import { ComparisonView } from "@/components/compare/ComparisonView";
import { compareHref, useCompare, type CompareNode } from "@/lib/compare";
import { useI18n } from "@/lib/i18n";
import { S } from "@/lib/strings";

export default function ComparePage() {
  return (
    <AppShell requireSession={false}>
      <Suspense><Explorer /></Suspense>
    </AppShell>
  );
}

/** The place in the map is the `n` query parameter, so links, the browser Back button and reloads all keep it. */
function Explorer() {
  const { t } = useI18n();
  const c = useCompare();
  const found = c.get(useSearchParams().get("n"));
  // A group has no view of its own, and an unknown id falls back to the overview.
  const node = !found || found.type === "group" ? c.root : found;
  const isRoot = node === c.root;
  const isTopic = node.type === "topic";
  const trail = c.path(node.id).filter((n) => n.type !== "group");
  const parent = trail.at(-2) ?? c.root;
  const label = (n: CompareNode) => (n === c.root ? t(S.compare.overview) : t(n.title));

  // After moving to another layer, keyboard and screen-reader users continue from its heading.
  const heading = useRef<HTMLHeadingElement>(null);
  const shown = useRef(node.id);
  useEffect(() => {
    if (shown.current === node.id) return;
    shown.current = node.id;
    heading.current?.focus();
  }, [node.id]);

  const column = (labelText: string, nodes: CompareNode[], tone?: "salmon"): MapColumn => ({
    label: labelText,
    tone,
    nodes: nodes.map((n) => ({ id: n.id, title: t(n.title), href: compareHref(n.id), tag: n.type === "topic" ? t(S.compare.status[c.status(n.id)]) : undefined })),
  });
  // ponytail: two groups = the two sides of the map. A third group needs a third column.
  const [first, second] = c.children(c.root.id, "group");
  const traditions = c.children(node.id, "tradition");

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        {!isRoot && (
          <nav aria-label={t(S.compare.breadcrumb)}>
            <ol className="flex flex-wrap items-center gap-1 text-sm text-muted">
              {trail.map((n, i) => (
                <li key={n.id} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden />}
                  {n === node ? <span aria-current="page" className="font-medium text-ink">{label(n)}</span> : (
                    <Link href={compareHref(n.id)} className="hover:text-brand-700 hover:underline">{label(n)}</Link>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            {!isRoot && <p className="eyebrow">{[parent !== c.root && t(parent.title), t(S.compare.comparedWith)].filter(Boolean).join(" · ")}</p>}
            <h1 ref={heading} tabIndex={-1} className="scroll-mt-24 font-serif text-3xl text-ink outline-none sm:text-4xl">{isRoot ? t(S.nav.compare) : t(node.title)}</h1>
            {isTopic ? <span className="chip mt-2">{t(S.compare.status[c.status(node.id)])}</span> : (
              <p className="mt-1 text-ink-soft">{t(isRoot ? S.compare.intro : S.compare.pickTopic)}</p>
            )}
          </div>
          {!isRoot && (
            <div className="flex gap-2">
              <Link href={compareHref(parent.id)} className="btn btn-ghost"><ChevronLeft className="h-4 w-4 rtl:rotate-180" aria-hidden /> {t(S.compare.back)}</Link>
              {parent !== c.root && <Link href={compareHref()} className="btn btn-ghost"><Network className="h-4 w-4" aria-hidden /> {t(S.compare.overview)}</Link>}
            </div>
          )}
        </div>
      </header>

      {isTopic ? (
        <>
          <nav aria-label={t(S.compare.topics)} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
            {c.children(parent.id, "topic").map((s) => (
              <Link
                key={s.id}
                href={compareHref(s.id)}
                aria-current={s === node ? "page" : undefined}
                className={`inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border px-4 text-sm transition ${s === node ? "border-brand-500 bg-brand-500 text-white" : "border-line bg-white text-ink-soft hover:border-brand-300"}`}
              >
                {t(s.title)}
              </Link>
            ))}
          </nav>
          <ComparisonView key={node.id} belief={t(parent.title)} comparison={c.comparison(node.id)} />
        </>
      ) : (
        <>
          <section key={node.id} className="card rise p-4 sm:p-6">
            {isRoot ? (
              <BeliefMap
                center={{ id: node.id, title: t(node.title), tag: t(S.compare.reference), filled: true }}
                start={column(t(first.title), c.children(first.id))}
                end={column(t(second.title), c.children(second.id), "salmon")}
              />
            ) : (
              <BeliefMap
                center={{ id: node.id, title: t(node.title), tag: t(S.compare.comparedWith) }}
                start={{ label: t(S.compare.reference), nodes: [{ id: c.root.id, title: t(c.root.title), filled: true }] }}
                end={column(t(S.compare.topics), c.children(node.id, "topic"))}
              />
            )}
            <p className="mt-4 text-center text-sm text-muted">{t(S.compare.referenceNote)} {t(S.compare.placeholder)}</p>
          </section>
          {traditions.length > 0 && (
            <section className="card p-5">
              <h2 className="eyebrow">{t(S.compare.traditions)}</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {traditions.map((tr) => (
                  <Link key={tr.id} href={compareHref(tr.id)} className="inline-flex min-h-11 items-center rounded-full border border-dashed border-brand-300 bg-white px-4 text-sm text-ink transition hover:bg-brand-50">
                    {t(tr.title)}
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
