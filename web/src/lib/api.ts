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

export function reviewCheck(lesson: unknown) {
  return request<Record<string, unknown>>("/review/check", lesson);
}

export function contentBundle() { return request<ContentBundle>("/content"); }
export function staffLessons() { return request<(Lesson & { author_id?: string | null })[]>("/review/lessons"); }
export function pendingSources() { return request<Source[]>("/review/sources"); }
export function approveSource(id: string) { return request(`/review/sources/${encodeURIComponent(id)}/approve`, {}); }
export function saveDraft(lesson: unknown) { return request<{ lesson_id: string; status: string }>("/review/drafts", lesson); }
export function submitDraft(id: string) { return request(`/review/${encodeURIComponent(id)}/submit`, {}); }
export function reviewDecision(id: string, decision: "approve" | "request_changes", note: string) {
  return request(`/review/${encodeURIComponent(id)}/decision`, { decision, note });
}

export type AdminUser = { id: string; email: string | null; display_name: string | null; role: Role; created_at: string };
export function searchUsers(q: string) { return request<AdminUser[]>(`/admin/users?q=${encodeURIComponent(q)}`); }
export function changeUserRole(id: string, role: Role) {
  return request<{ id: string; role: Role }>(`/admin/users/${encodeURIComponent(id)}/role`, { role });
}
