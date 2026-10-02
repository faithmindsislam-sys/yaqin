"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useBrowserValue } from "./store";
import type { Lang } from "./types";

/* ---------- Narration ---------- */

// Narration plays pre-rendered audio when it exists (OmniVoice batch, served from CDN).
// Otherwise it falls back to the browser's voice. Recitation is never synthesized:
// callers pass explanation text only, never ayah or hadith text.
export function useNarration() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  const stop = useCallback(() => {
    audio.current?.pause();
    audio.current = null;
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    setPlaying(false);
  }, []);

  useEffect(() => stop, [stop]);

  const play = useCallback(
    async (opts: { src?: string; text: string; lang: Lang }) => {
      stop();
      if (opts.src) {
        const ok = await fetch(opts.src, { method: "HEAD" }).then((r) => r.ok).catch(() => false);
        if (ok) {
          const a = new Audio(opts.src);
          audio.current = a;
          a.onended = () => setPlaying(false);
          setPlaying(true);
          await a.play().catch(() => setPlaying(false));
          return;
        }
      }
      const synth = window.speechSynthesis;
      if (!synth || !opts.text) return;
      const u = new SpeechSynthesisUtterance(opts.text);
      u.lang = opts.lang === "ar" ? "ar-SA" : "en-US";
      const voice = synth.getVoices().find((v) => v.lang.startsWith(opts.lang === "ar" ? "ar" : "en"));
      if (voice) u.voice = voice;
      u.rate = 0.95;
      u.onend = () => setPlaying(false);
      setPlaying(true);
      synth.speak(u);
    },
    [stop],
  );

  return { play, stop, playing };
}

/* ---------- Dictation ---------- */

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

function getRecognition(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Browser speech-to-text. Transcripts stay on the page until the learner submits them. */
export function useDictation(lang: Lang, onText: (text: string) => void) {
  const rec = useRef<Recognition | null>(null);
  const [listening, setListening] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const supported = useBrowserValue(() => !!getRecognition(), true) && !unsupported;

  const start = useCallback(() => {
    const Ctor = getRecognition();
    if (!Ctor) return setUnsupported(true);
    const r = new Ctor();
    r.lang = lang === "ar" ? "ar-SA" : "en-US";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      onText(text.trim());
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    setListening(true);
    r.start();
  }, [lang, onText]);

  const stop = useCallback(() => {
    rec.current?.stop();
    setListening(false);
  }, []);

  return { start, stop, listening, supported };
}
