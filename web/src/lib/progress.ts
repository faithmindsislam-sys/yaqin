"use client";

import { useCallback, useMemo } from "react";
import { readStored, useStored, writeStored } from "./store";
import { supabase } from "./supabase";

// Learning progress only — never anything about a learner's faith or practice.
export type LessonProgress = {
  card: number;
  cardsDone: boolean;
  explained: boolean;
  quizScore: number | null;
  completedAt: string | null;
};

export type ProgressState = {
  lessons: Record<string, LessonProgress>;
  days: string[];
  notes: Record<string, string>;
};

const KEY = "yaqin.progress";
const EMPTY: ProgressState = { lessons: {}, days: [], notes: {} };
const blank: LessonProgress = { card: 0, cardsDone: false, explained: false, quizScore: null, completedAt: null };

function parse(raw: string | null): ProgressState {
  if (!raw) return EMPTY;
  try {
    return { ...EMPTY, ...JSON.parse(raw) };
  } catch {
    return EMPTY;
  }
}

const read = () => parse(readStored(KEY));
const write = (state: ProgressState) => writeStored(KEY, JSON.stringify(state));

const today = () => new Date().toISOString().slice(0, 10);

async function syncRemote(lessonId: string, p: LessonProgress) {
  const sb = supabase();
  if (!sb) return;
  const { data } = await sb.auth.getUser();
  if (!data.user) return;
  await sb.from("progress").upsert(
    {
      user_id: data.user.id,
      lesson_id: lessonId,
      card_index: p.card,
      completed_at: p.completedAt,
      quiz_score: p.quizScore,
      explain_back_score: p.explained ? 1 : null,
    },
    { onConflict: "user_id,lesson_id" },
  );
}

export function updateLesson(lessonId: string, patch: Partial<LessonProgress>) {
  const state = read();
  const next = { ...blank, ...state.lessons[lessonId], ...patch };
  const days = state.days.includes(today()) ? state.days : [...state.days, today()].slice(-120);
  write({ ...state, lessons: { ...state.lessons, [lessonId]: next }, days });
  void syncRemote(lessonId, next);
}

export function saveNote(lessonId: string, text: string) {
  const state = read();
  write({ ...state, notes: { ...state.notes, [lessonId]: text } });
}

/** Pull remote rows into the local cache after sign-in (remote wins when further along). */
export async function hydrateFromRemote() {
  const sb = supabase();
  if (!sb) return;
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return;
  const { data } = await sb.from("progress").select("*").eq("user_id", auth.user.id);
  if (!data?.length) return;
  const state = read();
  for (const row of data) {
    const local = state.lessons[row.lesson_id] ?? blank;
    state.lessons[row.lesson_id] = {
      card: Math.max(local.card, row.card_index ?? 0),
      cardsDone: local.cardsDone || !!row.completed_at,
      explained: local.explained || row.explain_back_score != null,
      quizScore: row.quiz_score ?? local.quizScore,
      completedAt: row.completed_at ?? local.completedAt,
    };
  }
  write(state);
}

export function streak(days: string[]): number {
  const set = new Set(days);
  let n = 0;
  const d = new Date();
  if (!set.has(today())) d.setDate(d.getDate() - 1);
  while (set.has(d.toISOString().slice(0, 10))) {
    n += 1;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export function useProgress(): ProgressState {
  const raw = useStored(KEY);
  return useMemo(() => parse(raw), [raw]);
}

export function useLessonProgress(lessonId: string | undefined) {
  const state = useProgress();
  const p = (lessonId && state.lessons[lessonId]) || blank;
  const update = useCallback((patch: Partial<LessonProgress>) => lessonId && updateLesson(lessonId, patch), [lessonId]);
  return [p, update] as const;
}
