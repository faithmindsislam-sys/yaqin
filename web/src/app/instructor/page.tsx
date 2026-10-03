"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, BookCheck, CheckCircle2, ClipboardCheck, FileClock, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SourceQuote } from "@/components/ui";
import { reviewCheck, staffLessons, pendingSources, approveSource, saveDraft, submitDraft, reviewDecision } from "@/lib/api";
import { useContent } from "@/lib/content";
import type { Lesson, Source } from "@/lib/types";
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
  const { role, user } = useSession();
  const { allLessons, sources, refresh } = useContent();
  const lessons = allLessons();
  const [pending, setPending] = useState<Source[]>([]);
  const [staff, setStaff] = useState<(Lesson & { author_id?: string | null })[]>([]);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (role === "learner") return;
    try {
      const [rows, sources] = await Promise.all([staffLessons(), pendingSources()]);
      setStaff(rows); setPending(sources);
    } catch (e) { setError(e instanceof Error ? e.message : t(S.ask.error)); }
  }, [role, t]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- Reads the staff API; updates happen after its promise resolves.
  useEffect(() => { void load(); }, [load]);

  async function action(operation: () => Promise<unknown>, success: string) {
    setBusy(true); setError(null); setMessage(null);
    try {
      await operation(); setMessage(success);
      await load(); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : t(S.ask.error)); }
    finally { setBusy(false); }
  }
  function editedLesson() {
    const { author_id: _author, sources_by_id: _sources, ...lesson } = JSON.parse(draft);
    void _author; void _sources;
    return lesson;
  }

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult((await reviewCheck(JSON.parse(draft))) as CheckResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : t(S.ask.error));
    } finally {
      setBusy(false);
    }
  }

  if (role === "learner") return <p className="card p-6">{t(S.instructor.restricted)}</p>;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-4xl text-ink">{t(S.instructor.title)}</h1>
        <p className="mt-1 text-ink-soft">{t(S.instructor.sub)}</p>
      </header>

      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="rounded-xl bg-brand-50 p-3 text-sm text-brand-800">{message}</p>}
      <section className="card p-6">
        <h2 className="font-serif text-2xl">{t({ en: "Drafts and lesson reviews", ar: "المسودات ومراجعة الدروس" })}</h2>
        <label className="mt-4 block text-sm">{t({ en: "Review note", ar: "ملاحظة المراجعة" })}<input className="input mt-2" value={note} maxLength={4000} onChange={(e) => setNote(e.target.value)} /></label>
        <ul className="mt-4 divide-y divide-line">{staff.map((lesson) => <li key={lesson.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <span>{t(lesson.title)} <span className="chip">{lesson.status}</span></span>
          <div className="flex flex-wrap gap-2">
            {lesson.status !== "published" && <button className="btn btn-ghost" disabled={busy} onClick={() => setDraft(JSON.stringify(lesson, null, 2))}>{t({ en: "Edit", ar: "تحرير" })}</button>}
            {lesson.status === "draft" && lesson.author_id === user?.id && <button className="btn btn-primary" disabled={busy} onClick={() => void action(() => submitDraft(lesson.id), t({ en: "Submitted for review.", ar: "أُرسل للمراجعة." }))}>{t({ en: "Submit for review", ar: "إرسال للمراجعة" })}</button>}
            {role === "reviewer" && lesson.status === "in_review" && <>
              <button className="btn btn-primary" disabled={busy} onClick={() => void action(() => reviewDecision(lesson.id, "approve", note), t({ en: "Lesson published.", ar: "نُشر الدرس." }))}>{t({ en: "Approve and publish", ar: "اعتماد ونشر" })}</button>
              <button className="btn btn-ghost" disabled={busy} onClick={() => void action(() => reviewDecision(lesson.id, "request_changes", note), t({ en: "Changes requested.", ar: "طُلبت تعديلات." }))}>{t({ en: "Request changes", ar: "طلب تعديلات" })}</button>
            </>}
          </div>
        </li>)}</ul>
        {!staff.length && <p className="mt-3 text-sm text-muted">{t({ en: "No drafts yet. Use a sample below and give the new lesson a unique id.", ar: "لا توجد مسودات. استخدم النموذج أدناه وحدّد معرّفًا جديدًا للدرس." })}</p>}
      </section>
      <section className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <Stat icon={<BookCheck className="h-6 w-6 text-brand-600" />} value={lessons.length} label={t(S.instructor.lessonsPublished)} />
        <Stat icon={<FileClock className="h-6 w-6 text-amber-600" />} value={pending.length} label={t(S.instructor.sourcesPending)} />
        <Stat icon={<ShieldCheck className="h-6 w-6 text-[#6150ea]" />} value={Object.keys(sources).length} label={t(S.pillars.sources)} />
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <section className="card p-6">
          <h2 className="flex items-center gap-2 font-serif text-2xl text-ink">
            <ClipboardCheck className="h-5 w-5 text-brand-600" /> {t(S.instructor.queue)}
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
                {role === "reviewer" && preview === s.id && <button className="btn btn-primary mt-3" disabled={busy} onClick={() => void action(() => approveSource(s.id), t({ en: "Source approved.", ar: "اعتُمد المصدر." }))}>{t({ en: "Approve verified source", ar: "اعتماد المصدر بعد التحقق" })}</button>}
                {preview === s.id && (
                  <div className="mt-3">
                    <SourceQuote id={s.id} source={s} compact />
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
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn btn-primary" disabled={busy || !draft.trim()} onClick={() => void action(() => saveDraft(editedLesson()), t({ en: "Draft saved. Submit it from the draft list above.", ar: "حُفظت المسودة. أرسلها من القائمة أعلاه." }))}>{t({ en: "Save draft", ar: "حفظ المسودة" })}</button>
            <button className="btn btn-primary" onClick={run} disabled={busy || !draft.trim()}>
              {busy ? t(S.ask.thinking) : t(S.instructor.run)}
            </button>
            {lessons[0] && (
              <button className="btn btn-ghost" onClick={() => setDraft(JSON.stringify(lessons[0], null, 2))}>
                Sample
              </button>
            )}
          </div>

          {result && (
            <div className="mt-5 space-y-3">
              <p className={`flex items-center gap-2 font-semibold ${result.ready_for_reviewer ? "text-brand-700" : "text-amber-800"}`}>
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
