import type { Bi } from "./types";
import type { CompareData, CompareNode } from "./compare";

// Content for Religion & Belief Comparison. Edit this file to add a belief, tradition, topic or comparison:
// the interface reads everything from here. Ids are stable: they appear in links, so do not rename them.

const TOPICS = {
  god: { en: "God and existence", ar: "الإله والوجود" },
  sources: { en: "Texts and sources of knowledge", ar: "النصوص ومصادر المعرفة" },
  life: { en: "Human life and purpose", ar: "حياة الإنسان وغايتها" },
  practice: { en: "Ethics and religious practices", ar: "الأخلاق والشعائر الدينية" },
  afterlife: { en: "Life after death", ar: "الحياة بعد الموت" },
} satisfies Record<string, Bi>;

type TopicKey = keyof typeof TOPICS;

// Labels for positions that have no scripture or worship.
const NON_RELIGIOUS: Partial<Record<TopicKey, Bi>> = {
  god: { en: "The question of God's existence", ar: "مسألة وجود الإله" },
  sources: { en: "Sources of knowledge", ar: "مصادر المعرفة" },
  practice: { en: "Ethics and way of life", ar: "الأخلاق ونمط الحياة" },
  afterlife: { en: "Death and what follows", ar: "الموت وما بعده" },
};

/** The standard topics under a belief or tradition, with optional adapted labels. Topic id: `<parent>.<topic>`. */
const topics = (parent: string, labels: Partial<Record<TopicKey, Bi>> = {}): CompareNode[] =>
  (Object.keys(TOPICS) as TopicKey[]).map((key) => ({ id: `${parent}.${key}`, type: "topic", parent, title: labels[key] ?? TOPICS[key] }));

const node = (type: CompareNode["type"], parent: string, id: string, en: string, ar: string): CompareNode => ({ id, type, parent, title: { en, ar } });

export const DATA: CompareData = {
  nodes: [
    { id: "islam", type: "reference", parent: null, title: { en: "Islam", ar: "الإسلام" } },

    node("group", "islam", "religions", "Religions", "الأديان"),
    node("belief", "religions", "christianity", "Christianity", "المسيحية"),
    node("belief", "religions", "judaism", "Judaism", "اليهودية"),
    node("belief", "religions", "hinduism", "Hinduism", "الهندوسية"),
    node("belief", "religions", "buddhism", "Buddhism", "البوذية"),
    node("belief", "religions", "sikhism", "Sikhism", "السيخية"),

    node("group", "islam", "positions", "Non-religious positions", "مواقف غير دينية"),
    node("belief", "positions", "atheism", "Atheism", "الإلحاد"),
    node("belief", "positions", "agnosticism", "Agnosticism", "اللاأدرية"),

    ...topics("christianity"),
    ...topics("judaism"),
    ...topics("hinduism"),
    ...topics("buddhism", { god: { en: "The question of God and existence", ar: "مسألة الإله والوجود" } }),
    ...topics("sikhism"),
    ...topics("atheism", NON_RELIGIOUS),
    ...topics("agnosticism", NON_RELIGIOUS),

    // Sample branches: a tradition sits under its belief and has its own topics.
    node("tradition", "christianity", "christianity.catholicism", "Catholicism", "الكاثوليكية"),
    node("tradition", "christianity", "christianity.orthodoxy", "Orthodoxy", "الأرثوذكسية"),
    node("tradition", "christianity", "christianity.protestantism", "Protestantism", "البروتستانتية"),
    ...topics("christianity.catholicism"),
    ...topics("christianity.orthodoxy"),
    ...topics("christianity.protestantism"),
  ],

  // Reviewed text goes here, keyed by topic id. A topic with no entry shows placeholders and "In preparation".
  // "christianity.god": { status: "in_review", overview: { belief: [{ en: "…", ar: "…" }], islam: [{ en: "…", ar: "…" }] }, sources: { islam: [{ id: "quran:112:1" }] } },
  comparisons: {},
};
