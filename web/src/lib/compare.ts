import type { Bi, Lesson } from "./types";
import { DATA } from "./compare-data";

// Religion & Belief Comparison: types and data access. The content itself lives in compare-data.ts.

export type NodeType = "reference" | "group" | "belief" | "tradition" | "topic";
/** Same review vocabulary as lessons; "draft" is shown as "In preparation". */
export type ReviewStatus = Lesson["status"];

/** One point on the map. `parent` builds the tree: reference → group → belief → (tradition →) topic. */
export interface CompareNode {
  id: string;
  type: NodeType;
  parent: string | null;
  title: Bi;
}

/** `id` may be a source id from the content bundle (shown verbatim); otherwise `title` and `url` are shown. */
export interface CompareRef {
  id: string;
  title?: Bi;
  url?: string;
}

export interface Sides<T> {
  belief?: T;
  islam?: T;
}

/** The comparison for one topic node, keyed by that node's id. Every field is optional: missing parts show a placeholder. */
export interface Comparison {
  status: ReviewStatus;
  overview?: Sides<Bi[]>;
  beliefs?: Sides<Bi[]>;
  common?: Bi[];
  differences?: Sides<Bi[]>;
  faq?: { id: string; q: Bi; a: Bi }[];
  sources?: Sides<CompareRef[]>;
}

export interface CompareData {
  nodes: CompareNode[];
  comparisons: Record<string, Comparison>;
}

const byId = new Map(DATA.nodes.map((n) => [n.id, n]));

// Data check: runs on load, so a bad edit fails the dev server and the build instead of drawing a broken map.
if (byId.size !== DATA.nodes.length) throw new Error("compare: duplicate node id");
for (const n of DATA.nodes) if (n.parent && !byId.has(n.parent)) throw new Error(`compare: ${n.id} has unknown parent ${n.parent}`);
for (const id of Object.keys(DATA.comparisons)) if (byId.get(id)?.type !== "topic") throw new Error(`compare: comparison ${id} is not a topic node`);

const api = {
  root: DATA.nodes.find((n) => !n.parent)!,
  get: (id: string | null | undefined) => byId.get(id ?? ""),
  children: (id: string, type?: NodeType) => DATA.nodes.filter((n) => n.parent === id && (!type || n.type === type)),
  /** Ancestors then the node itself, root first. */
  path: (id: string) => {
    const out: CompareNode[] = [];
    for (let n = byId.get(id); n; n = byId.get(n.parent ?? "")) out.unshift(n);
    return out;
  },
  comparison: (id: string): Comparison | undefined => DATA.comparisons[id],
  status: (id: string): ReviewStatus => DATA.comparisons[id]?.status ?? "draft",
};

export const compareHref = (id?: string) => (id && id !== api.root.id ? `/compare/?n=${id}` : "/compare/");

// ponytail: local data. For a CMS or API, load CompareData here (see useContent); components only use this hook.
export function useCompare() {
  return api;
}
