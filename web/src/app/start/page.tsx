"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Check } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Skyline } from "@/components/Scenery";
import { LangToggle, TRACK_META } from "@/components/ui";
import { trackLessons, tracks } from "@/lib/content";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { S } from "@/lib/strings";
import type { Lang, TrackId } from "@/lib/types";

const MINUTES = [5, 10, 15, 20];
const LEVELS = [
  { en: "New to me", ar: "جديد عليّ" },
  { en: "I know a little", ar: "أعرف قليلًا" },
  { en: "I'm confident", ar: "أعرفه جيدًا" },
];

export default function StartPage() {
  return (
    <Suspense>
      <Onboarding />
    </Suspense>
  );
}

function Onboarding() {
  const { t, lang, setLang } = useI18n();
  const { user, guest, prefs, setPrefs, startGuest } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const initial = params.get("track") as TrackId | null;

  const [step, setStep] = useState(0);
  const [track, setTrack] = useState<TrackId | null>(initial ?? prefs.track);
  const [minutes, setMinutes] = useState(prefs.minutes);
  const [familiarity, setFamiliarity] = useState<Record<string, number>>({});

  const lessons = track ? trackLessons(track) : [];

  function finish() {
    if (!user && !guest) startGuest();
    // Lessons marked "confident" move later in the plan, not out of it.
    const known = lessons.filter((l) => familiarity[l.id] === 2).map((l) => l.id);
    setPrefs({ track, minutes, onboarded: true, known });
    router.push("/app/");
  }

  const steps = 3;
  const canNext = step === 0 ? !!track : true;

  return (
    <div className="relative min-h-screen overflow-hidden">
      <Skyline className="pointer-events-none fixed inset-x-0 bottom-0 h-64 w-full opacity-70" />
      <header className="relative mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <Logo />
        <LangToggle />
      </header>

      <main className="relative mx-auto max-w-3xl px-5 pb-40 pt-6">
        <p className="text-sm text-muted">
          {t(S.onboarding.step)} {step + 1} {t(S.onboarding.of)} {steps}
        </p>
        <div className="mt-2 h-1.5 rounded-full bg-line">
          <div className="h-full rounded-full bg-teal-500 transition-all" style={{ width: `${((step + 1) / steps) * 100}%` }} />
        </div>

        {step === 0 && (
          <section className="rise mt-8">
            <h1 className="font-serif text-4xl text-ink">{t(S.onboarding.trackQ)}</h1>
            <p className="mt-2 text-ink-soft">{t(S.onboarding.trackHint)}</p>
            <div className="mt-6 grid gap-3">
              {tracks.map((tr) => {
                const meta = TRACK_META[tr.id];
                const Icon = meta.icon;
                const selected = track === tr.id;
                return (
                  <button
                    key={tr.id}
                    onClick={() => setTrack(tr.id)}
                    aria-pressed={selected}
                    className={`card flex items-center gap-4 p-5 text-start transition ${selected ? "!border-teal-400 ring-2 ring-teal-200" : "hover:border-teal-200"}`}
                  >
                    <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-full ${meta.ring}`}>
                      <Icon className="h-7 w-7" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-serif text-xl text-ink">{t(tr.title)}</span>
                      <span className="block text-sm text-ink-soft">{t(tr.audience)}</span>
                    </span>
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border ${selected ? "border-teal-500 bg-teal-500 text-white" : "border-line"}`}>
                      {selected && <Check className="h-4 w-4" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {step === 1 && (
          <section className="rise mt-8 space-y-10">
            <div>
              <h1 className="font-serif text-4xl text-ink">{t(S.onboarding.langQ)}</h1>
              <div className="mt-5 grid grid-cols-2 gap-3">
                {(["en", "ar"] as Lang[]).map((l) => (
                  <button key={l} onClick={() => setLang(l)} aria-pressed={lang === l} className={`card p-5 text-lg transition ${lang === l ? "!border-teal-400 ring-2 ring-teal-200" : ""}`}>
                    {l === "en" ? "English" : "العربية"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h2 className="font-serif text-3xl text-ink">{t(S.onboarding.timeQ)}</h2>
              <div className="mt-5 grid grid-cols-4 gap-3">
                {MINUTES.map((m) => (
                  <button key={m} onClick={() => setMinutes(m)} aria-pressed={minutes === m} className={`card p-4 transition ${minutes === m ? "!border-teal-400 ring-2 ring-teal-200" : ""}`}>
                    <span className="block text-2xl font-semibold text-ink">{m}</span>
                    <span className="text-xs text-muted">{t(S.onboarding.minutes)}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="rise mt-8">
            <h1 className="font-serif text-4xl text-ink">{t(S.onboarding.checkQ)}</h1>
            <p className="mt-2 text-ink-soft">{t(S.onboarding.checkHint)}</p>
            <div className="mt-6 space-y-3">
              {lessons.map((l) => (
                <div key={l.id} className="card p-5">
                  <p className="font-medium text-ink">{t(l.title)}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {LEVELS.map((lv, i) => (
                      <button
                        key={lv.en}
                        onClick={() => setFamiliarity({ ...familiarity, [l.id]: i })}
                        aria-pressed={familiarity[l.id] === i}
                        className={`chip !px-3.5 !py-1.5 transition ${familiarity[l.id] === i ? "!border-teal-400 !bg-teal-50 !text-teal-800" : ""}`}
                      >
                        {t(lv)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <button className="btn btn-ghost" onClick={() => (step === 0 ? router.push("/") : setStep(step - 1))}>
            {t(S.onboarding.back)}
          </button>
          <div className="flex gap-2">
            {step === 2 && (
              <button className="btn btn-ghost" onClick={finish}>
                {t(S.onboarding.skip)}
              </button>
            )}
            <button className="btn btn-primary" disabled={!canNext} onClick={() => (step < steps - 1 ? setStep(step + 1) : finish())}>
              {step < steps - 1 ? t(S.onboarding.next) : t(S.onboarding.finish)} <span aria-hidden className="rtl:rotate-180">→</span>
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
