// Mirrors docs/CONTRACT.md.

export type Lang = "en" | "ar";
/** One side may be empty: a lesson can be written in English, Arabic, or both. */
export type Bi = { en: string; ar: string };

export type TrackId = "explore" | "first-steps" | "deepen";

export type SourceKind = "quran" | "hadith" | "tafsir" | "fiqh" | "aqidah" | "faq" | "dictionary";

export interface Source {
  id: string;
  kind: SourceKind;
  ref_en: string;
  ref_ar: string;
  text_ar: string;
  text_en: string;
  translation?: string | null;
  origin?: string | null;
  url?: string | null;
  grading?: string | null;
  review_status: "pending" | "approved";
}

export type CardKind = "concept" | "quote" | "practice" | "check";
export type CardLabel = "obligatory" | "recommended" | "suggestion";

export interface Card {
  id: string;
  kind: CardKind;
  title: Bi;
  body?: Bi;
  /** Formatted body from the Studio editor, cleaned by the API. `body` is its plain text. */
  html?: Bi;
  takeaway?: Bi;
  image?: string;
  visual?: string;
  sources?: string[];
  label?: CardLabel;
  audio?: Partial<Bi>;
}

export interface KeyIdea {
  id: string;
  en: string;
  ar: string;
  source?: string | null;
}

export interface QuizItem {
  id: string;
  question: Bi;
  options: Bi[];
  answer: number;
  explanation?: Bi;
  source?: string | null;
}

export interface Lesson {
  id: string;
  track: TrackId;
  module: string;
  level: 1 | 2 | 3 | 4 | "foundation" | "deeper";
  minutes: number;
  title: Bi;
  summary: Bi;
  cover?: string;
  /** Names credited for the lesson. */
  contributors?: string[];
  /** Free keywords set in Studio. */
  tags?: string[];
  status: "draft" | "in_review" | "published" | "archived";
  cards: Card[];
  explain_back?: { prompt: Bi; key_ideas: KeyIdea[] };
  quiz?: QuizItem[];
}

/** Old cached drafts remain readable; new drafts use numbered levels. */
export function lessonLevel(level: Lesson["level"]): 1 | 2 | 3 | 4 {
  return level === "foundation" ? 1 : level === "deeper" ? 2 : level;
}

export interface Module {
  id: string;
  title: Bi;
  lessons: string[];
  /** Upcoming lesson titles (no content yet), shown locked on the dashboard. */
  planned?: Bi[];
}

export interface Track {
  id: TrackId;
  title: Bi;
  tagline: Bi;
  audience: Bi;
  modules: Module[];
}

export interface ContentBundle {
  tracks: Track[];
  lessons: Record<string, Lesson>;
  sources: Record<string, Source>;
}

export type Tier = "A" | "B" | "C" | "D" | "OUT" | "NONE";

export type AnswerBlock = { type: "text"; text: string } | { type: "source"; id: string };

export interface AskResponse {
  tier: Tier;
  answer: AnswerBlock[];
  sources: Record<string, Source>;
  referral: Bi | null;
  follow_ups: string[];
  ai_generated: boolean;
}

export interface ExplainBackResponse {
  awaiting_review?: boolean;
  covered: string[];
  missed: string[];
  misconceptions: { text: string; correction: string; source?: string }[];
  feedback: string;
  sources: Record<string, Source>;
  ai_generated: boolean;
}
