"use client";

import Link from "next/link";
import { useState } from "react";

/** A node with `href` is clickable; `filled` marks the reference (Islam); the rest is the current selection. */
export interface MapNode {
  id: string;
  title: string;
  href?: string;
  tag?: string;
  filled?: boolean;
}

export interface MapColumn {
  label: string;
  tone?: "salmon";
  nodes: MapNode[];
}

const TONE = {
  brand: { box: "border-brand-200 hover:border-brand-500", dot: "bg-brand-400", line: "var(--color-brand-200)", hot: "var(--color-brand-500)" },
  salmon: { box: "border-salmon-200 hover:border-salmon-500", dot: "bg-salmon-400", line: "var(--color-salmon-200)", hot: "var(--color-salmon-500)" },
};

/** Vertical centres (in %) of n nodes, spread around the middle. */
const spread = (n: number) => Array.from({ length: n }, (_, i) => 50 + (i - (n - 1) / 2) * Math.min(20, 72 / Math.max(n - 1, 1)));

function NodeBox({ node, tone = "brand", className = "", ...rest }: { node: MapNode; tone?: keyof typeof TONE; className?: string } & React.HTMLAttributes<HTMLElement>) {
  const look = node.filled
    ? "border-brand-700 bg-brand-700 text-white"
    : node.href
      ? `bg-white text-ink shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-lift)] ${TONE[tone].box}`
      : "border-2 border-brand-500 bg-white text-ink";
  const cls = `flex min-h-11 flex-col items-center justify-center rounded-2xl border px-3 py-2.5 text-center text-sm font-medium transition ${look} ${className}`;
  const body = (
    <>
      {node.title}
      {node.tag && <span className="mt-0.5 text-[0.7rem] font-normal opacity-75">{node.tag}</span>}
    </>
  );
  return node.href ? <Link href={node.href} className={cls} {...rest}>{body}</Link> : <div className={cls} {...rest}>{body}</div>;
}

/**
 * One layer of the exploration map: a centre node with a column of nodes on each side.
 * From `md` up it is a graph; below that the same nodes are a list, which is easier to read and tap.
 */
export function BeliefMap({ center, start, end }: { center: MapNode; start: MapColumn; end: MapColumn }) {
  const [hot, setHot] = useState<string | null>(null);
  const cols = [{ ...start, x: 17 }, { ...end, x: 83 }].map((c) => ({ ...c, ys: spread(c.nodes.length), key: c.tone ?? ("brand" as const) }));

  return (
    <>
      <div className="hidden md:block">
        <div className="grid grid-cols-[34fr_32fr_34fr] text-center">
          <p className="eyebrow">{start.label}</p>
          <span />
          <p className="eyebrow">{end.label}</p>
        </div>
        <div className="relative mt-2 h-[34rem]">
          {/* Stretched to the box, so a node at (x%, y%) sits exactly on its line end. Mirrored for right-to-left. */}
          <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full rtl:-scale-x-100">
            {cols.map((c) => c.nodes.map((n, i) => (
              <path
                key={n.id}
                d={`M50 50 C${(50 + c.x) / 2} 50 ${(50 + c.x) / 2} ${c.ys[i]} ${c.x} ${c.ys[i]}`}
                fill="none"
                vectorEffect="non-scaling-stroke"
                stroke={hot === n.id ? TONE[c.key].hot : TONE[c.key].line}
                strokeWidth={hot === n.id ? 2.5 : 1.5}
                strokeDasharray={n.href ? undefined : "5 5"}
                className="transition-[stroke,stroke-width]"
              />
            )))}
          </svg>
          <NodeBox node={center} className="absolute left-1/2 top-1/2 w-48 -translate-x-1/2 -translate-y-1/2 !px-5 !py-4 !text-base" />
          {cols.map((c) => (
            <div key={c.label} role="group" aria-label={c.label}>
              {c.nodes.map((n, i) => (
                <NodeBox
                  key={n.id}
                  node={n}
                  tone={c.key}
                  className="absolute w-44 -translate-x-1/2 -translate-y-1/2 rtl:translate-x-1/2"
                  style={{ insetInlineStart: `${c.x}%`, top: `${c.ys[i]}%` }}
                  onMouseEnter={() => setHot(n.id)}
                  onMouseLeave={() => setHot(null)}
                  onFocus={() => setHot(n.id)}
                  onBlur={() => setHot(null)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4 md:hidden">
        <NodeBox node={center} className="!px-4 !py-3 !text-base" />
        {cols.filter((c) => c.nodes.some((n) => n.href)).map((c) => (
          <section key={c.label} className="rounded-2xl border border-line p-2">
            <h2 className="eyebrow px-3 pt-2">{c.label}</h2>
            <ul className="mt-1">
              {c.nodes.filter((n) => n.href).map((n) => (
                <li key={n.id}>
                  <Link href={n.href!} className="flex min-h-14 items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-sky-50">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${TONE[c.key].dot}`} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-ink">{n.title}</span>
                      {n.tag && <span className="text-xs text-muted">{n.tag}</span>}
                    </span>
                    <span aria-hidden className="text-muted rtl:rotate-180">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
