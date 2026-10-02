import raw from "@/generated/content.json";
import type { ContentBundle, Lesson, Source, Track, TrackId } from "./types";

const bundle = raw as unknown as ContentBundle;

export const tracks: Track[] = bundle.tracks;
export const lessons: Record<string, Lesson> = bundle.lessons;
export const sources: Record<string, Source> = bundle.sources;

export function getTrack(id: string | null | undefined): Track | undefined {
  return tracks.find((t) => t.id === id);
}

export function getLesson(id: string | null | undefined): Lesson | undefined {
  return id ? lessons[id] : undefined;
}

/** Lessons of a track in curriculum order, skipping ids that aren't published yet. */
export function trackLessons(trackId: TrackId): Lesson[] {
  const track = getTrack(trackId);
  if (!track) return [];
  return track.modules.flatMap((m) => m.lessons).map((id) => lessons[id]).filter(Boolean);
}

export function allLessons(): Lesson[] {
  return tracks.flatMap((t) => trackLessons(t.id));
}

export function nextLessonAfter(id: string): Lesson | undefined {
  const lesson = lessons[id];
  if (!lesson) return undefined;
  const list = trackLessons(lesson.track);
  return list[list.indexOf(lesson) + 1];
}
