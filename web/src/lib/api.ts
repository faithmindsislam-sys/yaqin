import type { AskResponse, ExplainBackResponse, Lang, TrackId } from "./types";
import { getAccessToken } from "./supabase";

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${BASE}/api${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
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
  return post<AskResponse>("/tutor/ask", { lesson_id: null, track: null, history: [], ...params });
}

export function explainBack(params: { lesson_id: string; transcript: string; lang: Lang }) {
  return post<ExplainBackResponse>("/tutor/explain-back", params);
}

export function reviewCheck(lesson: unknown) {
  return post<Record<string, unknown>>("/review/check", { lesson });
}
