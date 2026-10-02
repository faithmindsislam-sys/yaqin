"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, BookCheck, CheckCircle2, ClipboardCheck, FileClock, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SourceQuote } from "@/components/ui";
import { reviewCheck } from "@/lib/api";
import { allLessons, sources } from "@/lib/content";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { S } from "@/lib/strings";

type Issue = { card?: string | null; severity: string; issue: string; suggestion?: string; origin?: string };
type CheckResult = { ready_for_reviewer?: boolean; checks?: Record<string, unknown>; issues?: Issue[] };

export default function InstructorPage() {
  return (
    <AppShell>
      <Workspace />
    </AppShell>
  );
}

function Workspace() {
  const { t, lang } = useI18n();
  const { role } = useSession();
  const lessons = allLessons();
  const pending = useMemo(() => Object.values(sources).filter((s) => s.review_status === "pending"), []);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult((await reviewCheck(JSON.parse(draft))) as CheckResult);
    } catch (e) {
      setError(e instanceof SyntaxError ? "Invalid JSON" : t(S.ask.error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-4xl text-ink">{t(S.instructor.title)}</h1>
        <p className="mt-1 text-ink-soft">{t(S.instructor.sub)}</p>
        {role === "learner" && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{t(S.instructor.restricted)}</p>}
      </header>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <Stat icon={<BookCheck className="h-6 w-6 text-teal-600" />} value={lessons.length} label={t(S.instructor.lessonsPublished)} />
        <Stat icon={<FileClock className="h-6 w-6 text-amber-600" />} value={pending.length} label={t(S.instructor.sourcesPending)} />
        <Stat icon={<ShieldCheck className="h-6 w-6 text-[#6150ea]" />} value={Object.keys(sources).length} label={t(S.pillars.sources)} />
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <section className="card p-6">
          <h2 className="flex items-center gap-2 font-serif text-2xl text-ink">
            <ClipboardCheck className="h-5 w-5 text-teal-600" /> {t(S.instructor.queue)}
          </h2>
          <ul className="mt-4 divide-y divide-line">
            {pending.map((s) => (
              <li key={s.id} className="py-3">
                <button onClick={() => setPreview(preview === s.id ? null : s.id)} className="flex w-full items-center justify-between gap-3 text-start">
                  <span>
                    <span className="block font-medium text-ink">{lang === "ar" ? s.ref_ar : s.ref_en}</span>
                    <span className="block text-xs text-muted">{s.kind} · {s.origin}</span>
                  </span>
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs text-amber-800">pending</span>
                </button>
                {preview === s.id && (
                  <div className="mt-3">
                    <SourceQuote id={s.id} compact />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="card h-fit p-6">
          <h2 className="font-serif text-2xl text-ink">{t(S.instructor.aiCheck)}</h2>
          <p className="mt-1 text-sm text-ink-soft">{t(S.instructor.aiCheckSub)}</p>
          <textarea className="input mt-4 min-h-48 font-mono text-xs" dir="ltr" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder='{ "id": "...", "cards": [...] }' />
          <div className="mt-3 flex gap-2">
            <button className="btn btn-primary" onClick={run} disabled={busy || !draft.trim()}>
              {busy ? t(S.ask.thinking) : t(S.instructor.run)}
            </button>
            {lessons[0] && (
              <button className="btn btn-ghost" onClick={() => setDraft(JSON.stringify(lessons[0], null, 2))}>
                Sample
              </button>
            )}
          </div>
          {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {result && (
            <div className="mt-5 space-y-3">
              <p className={`flex items-center gap-2 font-semibold ${result.ready_for_reviewer ? "text-teal-700" : "text-amber-800"}`}>
                {result.ready_for_reviewer ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
                {result.ready_for_reviewer ? "Ready for scholarly review" : "Needs changes before review"}
              </p>
              <ul className="space-y-2">
                {(result.issues ?? []).map((iss, i) => (
                  <li key={i} className="rounded-xl border border-line p-3 text-sm">
                    <span className="me-2 rounded-full bg-sky-100 px-2 py-0.5 text-xs">{iss.severity}</span>
                    {iss.card && <span className="me-2 text-xs text-muted">{iss.card}</span>}
                    <span className="text-ink">{iss.issue}</span>
                    {iss.suggestion && <p className="mt-1 text-ink-soft">{iss.suggestion}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="card p-5">
      {icon}
      <p className="mt-3 text-3xl font-semibold text-ink">{value}</p>
      <p className="text-sm text-muted">{label}</p>
    </div>
  );
}
