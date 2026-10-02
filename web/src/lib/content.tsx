"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import raw from "@/generated/content.json";
import type { ContentBundle, TrackId } from "./types";
import { contentBundle } from "./api";
import { useI18n } from "./i18n";

const initial = raw as unknown as ContentBundle;
const Ctx = createContext({ bundle: initial, refresh: async () => {} });

export function ContentProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const [bundle, setBundle] = useState(initial);
  const [error, setError] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const data = await contentBundle();
      if (!Array.isArray(data.tracks) || !data.lessons || !data.sources) throw new Error("Invalid content response");
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
    {error && <div role="status" className="bg-amber-50 px-5 py-2 text-center text-sm text-amber-900">
      {t({ en: "Live lessons are unavailable. Showing saved content.", ar: "الدروس المباشرة غير متاحة. نعرض المحتوى المحفوظ." })} {" "}
      <button className="underline" onClick={() => void refresh()}>{t({ en: "Retry", ar: "إعادة المحاولة" })}</button>
    </div>}
    {children}
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
