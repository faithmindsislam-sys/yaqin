"use client";

import { useCallback, useState } from "react";
import { CheckCircle2, Mic, Square, XCircle } from "lucide-react";
import { explainBack } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { S } from "@/lib/strings";
import type { ExplainBackResponse, Lesson } from "@/lib/types";
import { useDictation } from "@/lib/voice";
import { SourceQuote } from "../ui";

export function ExplainBack({ lesson, onDone }: { lesson: Lesson; onDone: () => void }) {
  const { t, lang } = useI18n();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ExplainBackResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onText = useCallback((s: string) => setText(s), []);
  const dictation = useDictation(lang, onText);
  const eb = lesson.explain_back;
  if (!eb) return null;

  const idea = (id: string) => eb.key_ideas.find((k) => k.id === id);

  async function check() {
    dictation.stop();
    setBusy(true);
    setError(null);
    try {
      const r = await explainBack({ lesson_id: lesson.id, transcript: text, lang });
      setResult(r);
      onDone();
    } catch {
      setError(t(S.ask.error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rise">
      <p className="eyebrow">{t(S.lesson.explainTitle)}</p>
      <h2 className="mt-2 font-serif text-3xl text-ink">{t(eb.prompt)}</h2>
      <p className="mt-2 text-ink-soft">{t(S.lesson.explainHint)}</p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {dictation.supported ? (
          <button onClick={dictation.listening ? dictation.stop : dictation.start} className={`btn ${dictation.listening ? "bg-rose text-white" : "btn-primary"}`}>
            {dictation.listening ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            {t(dictation.listening ? S.lesson.stop : S.lesson.record)}
          </button>
        ) : (
          <p className="text-sm text-muted">{t(S.lesson.voiceUnsupported)}</p>
        )}
        {dictation.listening && (
          <span className="flex h-8 items-end gap-1" aria-hidden>
            {[10, 22, 14, 28, 18, 24, 12].map((h, i) => (
              <span key={i} className="w-1.5 animate-pulse rounded bg-teal-500" style={{ height: h, animationDelay: `${i * 90}ms` }} />
            ))}
          </span>
        )}
      </div>

      <textarea
        className="input mt-4 min-h-32 text-base"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t(S.lesson.typeInstead)}
        dir={lang === "ar" ? "rtl" : "ltr"}
      />
      {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <button className="btn btn-primary mt-4" onClick={check} disabled={busy || text.trim().length < 8}>
        {busy ? t(S.ask.thinking) : t(S.lesson.check)}
      </button>

      {result && (
        <div className="mt-8 space-y-4">
          {result.covered.length > 0 && (
            <div className="rounded-2xl border border-teal-200 bg-teal-50/70 p-4">
              <p className="mb-2 font-semibold text-teal-800">{t(S.lesson.good)}</p>
              <ul className="space-y-1.5">
                {result.covered.map((id) => (
                  <li key={id} className="flex gap-2 text-ink">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" /> {idea(id)?.[lang]}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.missed.length > 0 && (
            <div className="rounded-2xl border border-rose/30 bg-rose/5 p-4">
              <p className="mb-2 font-semibold text-rose">{t(S.lesson.missed)}</p>
              <ul className="space-y-3">
                {result.missed.map((id) => {
                  const k = idea(id);
                  return (
                    <li key={id}>
                      <span className="flex gap-2 text-ink">
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose" /> {k?.[lang]}
                      </span>
                      {k?.source && (
                        <div className="mt-2 ps-6">
                          <SourceQuote id={k.source} source={result.sources[k.source]} compact />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {result.feedback && <p className="text-ink-soft">{result.feedback}</p>}
          {result.misconceptions.map((m, i) => (
            <div key={i} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm">
              <p className="text-amber-900">{m.text}</p>
              <p className="mt-1 text-ink">{m.correction}</p>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn btn-ghost" onClick={() => { setResult(null); setText(""); }}>
              {t(S.lesson.tryAgain)}
            </button>
            {result.ai_generated && <span className="chip">{t(S.common.aiLabel)}</span>}
          </div>
        </div>
      )}
    </section>
  );
}
