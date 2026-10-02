"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Bot, Mic, Plus, Send, Square } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AnswerView } from "@/components/Answer";
import { SourceQuote } from "@/components/ui";
import { ask, type ChatTurn } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { S } from "@/lib/strings";
import type { AskResponse, Bi, TrackId } from "@/lib/types";
import { useDictation } from "@/lib/voice";

type Msg = { role: "user"; text: string } | { role: "assistant"; data: AskResponse } | { role: "error"; text: string };

const EXAMPLES: Record<TrackId, Bi[]> = {
  explore: [
    { en: "Did Islam spread by the sword?", ar: "هل انتشر الإسلام بالسيف؟" },
    { en: "Do Muslims worship the Kaaba?", ar: "هل يعبد المسلمون الكعبة؟" },
    { en: "What does Tawhid mean?", ar: "ما معنى التوحيد؟" },
  ],
  "first-steps": [
    { en: "What are the obligatory parts of wudu?", ar: "ما فرائض الوضوء؟" },
    { en: "Does sleeping break wudu?", ar: "هل النوم ينقض الوضوء؟" },
    { en: "I'm in a hard situation in my marriage — is it allowed for me to…", ar: "عندي حالة خاصة في زواجي، هل يجوز لي…" },
  ],
  deepen: [
    { en: "What does “Master of the Day of Judgement” mean?", ar: "ما معنى «مالك يوم الدين»؟" },
    { en: "Why do Muslims face the qibla?", ar: "لماذا يستقبل المسلمون القبلة؟" },
    { en: "Give me a hadith proving this saying", ar: "أعطني حديثًا يثبت هذه المقولة" },
  ],
};

export default function AskPage() {
  return (
    <AppShell requireSession={false}>
      <Suspense>
        <AskAndCheck />
      </Suspense>
    </AppShell>
  );
}

function AskAndCheck() {
  const { t, lang } = useI18n();
  const { prefs } = useSession();
  const params = useSearchParams();
  const track = (params.get("track") as TrackId | null) ?? prefs.track ?? "explore";
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const onText = useCallback((s: string) => setQ(s), []);
  const dictation = useDictation(lang, onText);

  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [msgs, busy]);

  async function send(question: string) {
    if (!question.trim() || busy) return;
    dictation.stop();
    const history: ChatTurn[] = msgs.flatMap((m): ChatTurn[] =>
      m.role === "user"
        ? [{ role: "user", content: m.text }]
        : m.role === "assistant"
          ? [{ role: "assistant", content: m.data.answer.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n") }]
          : [],
    );
    setMsgs((m) => [...m, { role: "user", text: question }]);
    setQ("");
    setBusy(true);
    try {
      const data = await ask({ question, lang, track, history: history.slice(-6) });
      setMsgs((m) => [...m, { role: "assistant", data }]);
    } catch {
      setMsgs((m) => [...m, { role: "error", text: t(S.ask.error) }]);
    } finally {
      setBusy(false);
    }
  }

  const lastAnswer = [...msgs].reverse().find((m) => m.role === "assistant") as { data: AskResponse } | undefined;
  const cited = lastAnswer ? Object.keys(lastAnswer.data.sources) : [];

  return (
    <div className="grid gap-6 xl:grid-cols-[15rem_1fr_19rem]">
      <aside className="card hidden h-fit space-y-4 p-4 xl:block">
        <button className="btn btn-ghost w-full !justify-start" onClick={() => setMsgs([])}>
          <Plus className="h-4 w-4" /> {t(S.ask.newChat)}
        </button>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{t(S.ask.examples)}</p>
          <div className="space-y-1.5">
            {EXAMPLES[track].map((e) => (
              <button key={e.en} onClick={() => send(t(e))} className="w-full rounded-xl px-2.5 py-2 text-start text-sm text-ink-soft hover:bg-sky-50 hover:text-ink">
                {t(e)}
              </button>
            ))}
          </div>
        </div>
        <div className="border-t border-line pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{t(S.ask.trusted)}</p>
          <ul className="space-y-1.5 text-sm text-ink-soft">
            {[S.trust.quran, S.trust.hadith, S.trust.tafsir, S.trust.review].map((s) => (
              <li key={s.en} className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-teal-400" /> {t(s)}</li>
            ))}
          </ul>
        </div>
      </aside>

      <section className="card flex min-h-[70vh] min-w-0 flex-col">
        <header className="flex items-center gap-3 border-b border-line p-5">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-b from-teal-400 to-teal-700 text-white">
            <Bot className="h-5 w-5" />
          </span>
          <div>
            <h1 className="font-serif text-2xl text-ink">{t(S.ask.title)}</h1>
            <p className="text-sm text-ink-soft">{t(S.ask.sub)}</p>
          </div>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {msgs.length === 0 && (
            <div className="grid gap-2 sm:grid-cols-3 xl:hidden">
              {EXAMPLES[track].map((e) => (
                <button key={e.en} onClick={() => send(t(e))} className="rounded-2xl border border-line p-3 text-start text-sm text-ink-soft hover:border-teal-300">
                  {t(e)}
                </button>
              ))}
            </div>
          )}
          {msgs.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-ee-md bg-teal-600 px-4 py-2.5 text-white">{m.text}</p>
              </div>
            ) : m.role === "assistant" ? (
              <div key={i} className="max-w-[92%] rounded-2xl rounded-es-md border border-line bg-white p-4">
                <AnswerView data={m.data} onFollowUp={send} />
              </div>
            ) : (
              <p key={i} className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{m.text}</p>
            ),
          )}
          {busy && <p className="animate-pulse text-sm text-muted">{t(S.ask.thinking)}</p>}
          <div ref={end} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(q);
          }}
          className="border-t border-line p-4"
        >
          <div className="relative flex items-center gap-2">
            <input className="input !rounded-full pe-24" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t(S.ask.placeholder)} aria-label={t(S.ask.placeholder)} />
            <div className="absolute end-1.5 flex gap-1">
              {dictation.supported && (
                <button type="button" onClick={dictation.listening ? dictation.stop : dictation.start} className={`rounded-full p-2 ${dictation.listening ? "bg-rose text-white" : "text-ink-soft hover:bg-sky-50"}`} aria-label="Voice">
                  {dictation.listening ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </button>
              )}
              <button className="rounded-full bg-teal-600 p-2 text-white disabled:opacity-40" disabled={busy || !q.trim()} aria-label={t(S.ask.send)}>
                <Send className="h-4 w-4 rtl:-scale-x-100" />
              </button>
            </div>
          </div>
          <p className="mt-2 text-center text-[0.72rem] text-muted">{t(S.ask.disclaimer)}</p>
        </form>
      </section>

      <aside className="card hidden h-fit p-4 xl:block">
        <p className="mb-3 font-semibold text-ink">{t(S.ask.related)}</p>
        {cited.length ? (
          <div className="space-y-3">
            {cited.map((id) => (
              <SourceQuote key={id} id={id} source={lastAnswer!.data.sources[id]} compact />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">—</p>
        )}
      </aside>
    </div>
  );
}
