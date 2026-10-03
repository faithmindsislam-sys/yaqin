"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import type { ContentBundle, TrackId } from "./types";
import { apiEnabled, contentBundle } from "./api";
import { useI18n } from "./i18n";

const initial: ContentBundle = { tracks: [], lessons: {}, sources: {} };
function checkedContent(data: ContentBundle): ContentBundle {
  if (!data || !Array.isArray(data.tracks) ||
    ![data.lessons, data.sources].every((value) => value && typeof value === "object" && !Array.isArray(value))) {
    throw new Error("Invalid content response");
  }
  return data;
}
let savedContent: Promise<ContentBundle> | null = null;
function loadSavedContent() {
  return savedContent ??= fetch("/data/content.json").then((res) => {
    if (!res.ok) throw new Error(`Saved content ${res.status}`);
    return res.json() as Promise<ContentBundle>;
  }).then(checkedContent).catch((e) => { savedContent = null; throw e; });
}
const Ctx = createContext({ bundle: initial, refresh: async () => {} });

export function ContentProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname().replace(/\/$/, "");
  const authPage = ["/signin", "/auth/callback", "/reset-password"].includes(pathname);
  const [bundle, setBundle] = useState(initial);
  const [error, setError] = useState(false);
  const refresh = useCallback(async () => {
    let saved: ContentBundle | null = null;
    try {
      const snapshot = await loadSavedContent();
      saved = snapshot;
      // Keep newer live lessons when a later refresh cannot reach the API.
      setBundle((current) => current.tracks.length ? current : snapshot);
    } catch { /* The live API can still provide content if the snapshot is missing. */ }
    if (!apiEnabled) { setError(!saved); return; }
    try {
      // Display the saved snapshot while checking for newer live lessons.
      const data = checkedContent(await contentBundle());
      setBundle(data); setError(false);
    } catch { setError(true); }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Refresh reads an external API asynchronously.
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);
  const value = useMemo(() => ({ bundle, refresh }), [bundle, refresh]);
  return <Ctx.Provider value={value}>
    {error && !authPage && <div role="status" className="bg-amber-50 px-5 py-2 text-center text-sm text-amber-900">
      {t(bundle.tracks.length
        ? { en: "Live lessons are unavailable. Showing saved content.", ar: "الدروس المباشرة غير متاحة. نعرض المحتوى المحفوظ." }
        : { en: "Lessons are currently unavailable. Please try again.", ar: "الدروس غير متاحة حاليًا. حاول مرة أخرى." })} {" "}
      <button className="underline" onClick={() => void refresh()}>{t({ en: "Retry", ar: "إعادة المحاولة" })}</button>
    </div>}
    {authPage || bundle.tracks.length ? children : !error && <p role="status" className="p-8 text-center">{t({ en: "Loading…", ar: "جارٍ التحميل…" })}</p>}
  </Ctx.Provider>;
}

export function useContent() {
  const { bundle, refresh } = useContext(Ctx);
  return useMemo(() => {
    const { tracks, lessons, sources } = bundle;
    const getTrack = (id: string | null | undefined) => tracks.find((t) => t.id === id);
    const getLesson = (id: string | null | undefined) => id ? lessons[id] : undefined;
    const trackLessons = (trackId: TrackId) => getTrack(trackId)?.modules.flatMap((m) => m.lessons).map((id) => lessons[id]).filter(Boolean) ?? [];
    const allLessons = () => tracks.flatMap((t) => trackLessons(t.id));
    const nextLessonAfter = (id: string) => {
      const lesson = lessons[id];
      if (!lesson) return undefined;
      const list = trackLessons(lesson.track);
      return list[list.findIndex((l) => l.id === id) + 1];
    };
    return { tracks, lessons, sources, getTrack, getLesson, trackLessons, allLessons, nextLessonAfter, refresh };
  }, [bundle, refresh]);
}
