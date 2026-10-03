"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, BookCheck, CheckCircle2, FileClock, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { apiEnabled, reviewCheck, staffLessons, pendingSources, saveDraft, submitDraft, reviewDecision } from "@/lib/api";
import { useContent } from "@/lib/content";
import type { Lesson } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { S } from "@/lib/strings";
import { canReview, isStaff } from "@/lib/roles";

type Issue = { card?: string | null; severity: string; issue: string; suggestion?: string; origin?: string };
type CheckResult = { ready_for_reviewer?: boolean; checks?: Record<string, unknown>; issues?: Issue[] };

export default function StudioPage() {
  return (
    <AppShell>
      <Workspace />
    </AppShell>
  );
}

function Workspace() {
  const { t } = useI18n();
  const { role, user } = useSession();
  const { allLessons, sources, refresh } = useContent();
  const lessons = allLessons();
  const [pendingCount, setPendingCount] = useState(0);
  const [staff, setStaff] = useState<(Lesson & { author_id?: string | null })[]>([]);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isStaff(role) || !user || !apiEnabled) return;
    try {
      const [rows, sources] = await Promise.all([staffLessons(), pendingSources()]);
      setStaff(rows); setPendingCount(sources.length);
    } catch (e) { setError(e instanceof Error ? e.message : t(S.ask.error)); }
  }, [role, user, t]);
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

  if (!isStaff(role) || !user) return <p className="card p-6">{t(S.instructor.restricted)}</p>;
  if (!apiEnabled) return <p className="card p-6">{t(S.instructor.unavailable)}</p>;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-4xl text-ink">{t(S.instructor.title)}</h1>
        <p className="mt-1 text-ink-soft">{t(S.instructor.sub)}</p>
      </header>

      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="rounded-xl bg-brand-50 p-3 text-sm text-brand-800">{message}</p>}
      <section className="card p-6">
        <h2 className="font-serif text-2xl">{t(S.instructor.drafts)}</h2>
        <label className="mt-4 block text-sm">{t(S.instructor.reviewNote)}<input className="input mt-2" value={note} maxLength={4000} onChange={(e) => setNote(e.target.value)} /></label>
        <ul className="mt-4 divide-y divide-line">{staff.map((lesson) => <li key={lesson.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <span>{t(lesson.title)} <span className="chip">{t(S.instructor.status[lesson.status])}</span></span>
          <div className="flex flex-wrap gap-2">
            {lesson.status !== "published" && <button className="btn btn-ghost" disabled={busy} onClick={() => setDraft(JSON.stringify(lesson, null, 2))}>{t(S.instructor.edit)}</button>}
            {lesson.status === "draft" && lesson.author_id === user?.id && <button className="btn btn-primary" disabled={busy} onClick={() => void action(() => submitDraft(lesson.id), t(S.instructor.submitted))}>{t(S.instructor.submit)}</button>}
            {canReview(role) && lesson.status === "in_review" && <>
              <button className="btn btn-primary" disabled={busy} onClick={() => void action(() => reviewDecision(lesson.id, "approve", note), t(S.instructor.published))}>{t(S.instructor.publish)}</button>
              <button className="btn btn-ghost" disabled={busy} onClick={() => void action(() => reviewDecision(lesson.id, "request_changes", note), t(S.instructor.changesRequested))}>{t(S.instructor.requestChanges)}</button>
            </>}
          </div>
        </li>)}</ul>
        {!staff.length && <p className="mt-3 text-sm text-muted">{t(S.instructor.noDrafts)}</p>}
      </section>
      <section className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <Stat icon={<BookCheck className="h-6 w-6 text-brand-600" />} value={lessons.length} label={t(S.instructor.lessonsPublished)} />
        <Stat icon={<FileClock className="h-6 w-6 text-amber-600" />} value={pendingCount} label={t(S.instructor.sourcesPending)} />
        <Stat icon={<ShieldCheck className="h-6 w-6 text-[#6150ea]" />} value={Object.keys(sources).length} label={t(S.pillars.sources)} />
      </section>

      <section className="card h-fit p-6">
        <h2 className="font-serif text-2xl text-ink">{t(S.instructor.aiCheck)}</h2>
        <p className="mt-1 text-sm text-ink-soft">{t(S.instructor.aiCheckSub)}</p>
        <textarea className="input mt-4 min-h-48 font-mono text-xs" dir="ltr" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder='{ "id": "...", "cards": [...] }' />
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn btn-primary" disabled={busy || !draft.trim()} onClick={() => void action(() => saveDraft(editedLesson()), t(S.instructor.draftSaved))}>{t(S.instructor.saveDraft)}</button>
          <button className="btn btn-primary" onClick={run} disabled={busy || !draft.trim()}>
            {busy ? t(S.ask.thinking) : t(S.instructor.run)}
          </button>
          {lessons[0] && (
            <button className="btn btn-ghost" onClick={() => setDraft(JSON.stringify(lessons[0], null, 2))}>
              {t(S.instructor.sample)}
            </button>
          )}
        </div>

        {result && (
          <div className="mt-5 space-y-3">
            <p className={`flex items-center gap-2 font-semibold ${result.ready_for_reviewer ? "text-brand-700" : "text-amber-800"}`}>
              {result.ready_for_reviewer ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
              {t(result.ready_for_reviewer ? S.instructor.readyForReview : S.instructor.needsChanges)}
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
