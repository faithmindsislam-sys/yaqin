import type { AskResponse, ExplainBackResponse, Lang, TrackId, ContentBundle, Lesson, Source } from "./types";
import { getAccessToken } from "./supabase";
import type { Role } from "./roles";

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";
export const apiEnabled = process.env.NEXT_PUBLIC_API_ENABLED !== "false";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, body?: unknown): Promise<T> {
  if (!apiEnabled) throw new ApiError(503, "backend_unavailable", "This feature is currently unavailable. Please try again later.");
  const token = await getAccessToken();
  const res = await fetch(`${BASE}/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = data?.error ?? {};
    throw new ApiError(res.status, err.code ?? "upstream", err.message ?? res.statusText);
  }
  return data as T;
}

export type ChatTurn = { role: "user" | "assistant"; content: string };

export function ask(params: {
  question: string;
  lang: Lang;
  lesson_id?: string | null;
  track?: TrackId | null;
  history?: ChatTurn[];
}) {
  return request<AskResponse>("/tutor/ask", { lesson_id: null, track: null, history: [], ...params });
}

export function explainBack(params: { lesson_id: string; transcript: string; lang: Lang }) {
  return request<ExplainBackResponse>("/tutor/explain-back", params);
}

export type ReviewIssue = { card: string; severity: "high" | "medium" | "low"; issue: string; suggestion?: string };
export function reviewCheck(lesson: unknown) {
  return request<{ ready_for_reviewer: boolean; issues: ReviewIssue[] }>("/review/check", lesson);
}

export function contentBundle() { return request<ContentBundle>("/content"); }
export function staffLessons() { return request<StaffLesson[]>("/review/lessons"); }
export type StaffLesson = Lesson & { author_id?: string | null };
/** One lesson for the editor. The API also returns drafts to their author and to admins. */
export function staffLesson(id: string) { return request<StaffLesson & { sources_by_id?: unknown }>(`/lessons/${encodeURIComponent(id)}`); }
/** AI first draft from a prompt, opened in the same editor as a hand-written lesson.
 *  TODO(ai): call the lesson generation endpoint once the backend exists (input: the prompt;
 *  output: a lesson draft). Until then nothing is generated and the editor starts empty. */
export async function generateLesson(prompt: string): Promise<Lesson | null> {
  void prompt;
  return null;
}
export type LessonEvent = {
  id: string; kind: string; actor_id: string | null; actor_name: string | null; actor_email?: string | null; created_at: string;
  payload: { note?: string; reviewed?: boolean };
};
export function lessonHistory(id: string) { return request<LessonEvent[]>(`/review/${encodeURIComponent(id)}/history`); }
export function archiveLesson(id: string) { return request(`/review/${encodeURIComponent(id)}/archive`, {}); }
export function pendingSources() { return request<Source[]>("/review/sources"); }
/** Puts one Qur'an verse in the source library (if it is not there yet) and returns the library entry. */
export function quranSource(surah: number, ayah: number) { return request<Source>("/review/sources/quran", { surah, ayah }); }
export function approveSource(id: string) { return request(`/review/sources/${encodeURIComponent(id)}/approve`, {}); }
export function saveDraft(lesson: unknown) { return request<{ lesson_id: string; status: string; contributors?: string[] }>("/review/drafts", lesson); }
export function submitDraft(id: string) { return request(`/review/${encodeURIComponent(id)}/submit`, {}); }
export function reviewDecision(id: string, decision: "approve" | "request_changes", note: string) {
  return request(`/review/${encodeURIComponent(id)}/decision`, { decision, note });
}

export type AdminUser = { id: string; email: string | null; display_name: string | null; role: Role; created_at: string };
export function searchUsers(q: string) { return request<AdminUser[]>(`/admin/users?q=${encodeURIComponent(q)}`); }
export function changeUserRole(id: string, role: Role) {
  return request<{ id: string; role: Role }>(`/admin/users/${encodeURIComponent(id)}/role`, { role });
}

export function unpublishLesson(id: string) { return request(`/review/${encodeURIComponent(id)}/unpublish`, {}); }
export function deleteLesson(id: string) { return request(`/review/${encodeURIComponent(id)}/delete`, {}); }
export function addPlanned(track: TrackId, module: string, title: { en: string; ar: string }) {
  return request("/review/planned", { track, module, title });
}
export function removePlanned(track: TrackId, module: string, index: number) {
  return request("/review/planned/remove", { track, module, index });
}
