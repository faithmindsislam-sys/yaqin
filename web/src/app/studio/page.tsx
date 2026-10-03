"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, BookCheck, BookOpen, CheckCircle2, CircleAlert, Clock3, FilePenLine, History, Plus, RotateCcw, Search, X } from "lucide-react";
import { Select } from "@/components/Select";
import { CardBody, SourceQuote, TRACK_META } from "@/components/ui";
import { AppShell } from "@/components/AppShell";
import { apiEnabled, staffLessons, submitDraft, reviewDecision, unpublishLesson, deleteLesson, archiveLesson, lessonHistory, type LessonEvent, type StaffLesson } from "@/lib/api";
import { useContent } from "@/lib/content";
import { lessonLevel, type Lesson, type TrackId } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { S } from "@/lib/strings";
import { canReview, isStaff } from "@/lib/roles";

const LEVELS = [1, 2, 3, 4] as const;
const STATUSES = ["published", "in_review", "draft", "archived"] as const;
const STATUS_ICONS = { published: BookCheck, in_review: Clock3, draft: FilePenLine, archived: Archive };
const editorLink = (id: string) => `/studio/lesson/?id=${encodeURIComponent(id)}`;

export default function StudioPage() {
  return (
    <AppShell>
      <Workspace />
    </AppShell>
  );
}

function Workspace() {
  const { t, lang } = useI18n();
  const { role, user } = useSession();
  const { tracks, refresh } = useContent();
  const [trackFilter, setTrackFilter] = useState<TrackId | "all">("all");
  const [levelFilter, setLevelFilter] = useState<1 | 2 | 3 | 4 | "all">("all");
  const [statusFilter, setStatusFilter] = useState<Lesson["status"] | "all">("all");
  const [staff, setStaff] = useState<StaffLesson[]>([]);
  const [page, setPage] = useState(1);
  const dialog = useRef<HTMLDialogElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<StaffLesson | null>(null);
  const [history, setHistory] = useState<LessonEvent[]>([]);
  const [historyState, setHistoryState] = useState<"loading" | "ready" | "error">("ready");
  const historyRequest = useRef(0);
  const [pageSize, setPageSize] = useState(5);
  const [confirmation, setConfirmation] = useState<{ lesson: Lesson; label: string; description: string; operation: () => Promise<unknown>; success: string } | null>(null);
  const confirmDialog = useRef<HTMLDialogElement>(null);
  const toast = useRef<HTMLDivElement>(null);
  const trackOptions = tracks.map((track) => ({ value: track.id, label: t(track.title) }));
  const levelOptions = LEVELS.map((level) => ({ value: String(level), label: t(S.library.levels[level]) }));

  const load = useCallback(async () => {
    if (!isStaff(role) || !user || !apiEnabled) return;
    try {
      setStaff(await staffLessons());
    } catch (e) { setError(e instanceof Error ? e.message : t(S.ask.error)); }
  }, [role, user, t]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- Reads the staff API; updates happen after its promise resolves.
  useEffect(() => { void load(); }, [load]);
  // The editor leaves its success message here when it returns to this list (see save() in studio/lesson/page.tsx).
  useEffect(() => {
    try {
      const done = sessionStorage.getItem("yaqin-studio-toast");
      if (!done) return;
      sessionStorage.removeItem("yaqin-studio-toast");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Reads browser storage once, after the page is on screen.
      setMessage(done);
    } catch { /* storage is blocked: no message */ }
  }, []);

  useEffect(() => {
    const notification = toast.current;
    if (!notification || (!message && !error)) return;
    notification.showPopover();
    const timer = window.setTimeout(() => { setMessage(null); setError(null); }, 6000);
    return () => { window.clearTimeout(timer); if (notification.isConnected) notification.hidePopover(); };
  }, [message, error, preview]);

  async function action(operation: () => Promise<unknown>, success: string) {
    setBusy(true); setError(null); setMessage(null);
    try {
      await operation();
      await load(); await refresh(); setMessage(success);
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : t(S.ask.error)); return false; }
    finally { setBusy(false); }
  }
  async function loadHistory(id: string) {
    const request = ++historyRequest.current;
    setHistory([]); setHistoryState("loading");
    try {
      const events = await lessonHistory(id);
      if (request === historyRequest.current) { setHistory(events); setHistoryState("ready"); }
    } catch {
      if (request === historyRequest.current) setHistoryState("error");
    }
  }

  function openLesson(lesson: StaffLesson) {
    setPreview(lesson); setError(null);
    void loadHistory(lesson.id);
    dialog.current?.showModal();
  }

  function resetFilters() {
    setTrackFilter("all"); setLevelFilter("all"); setStatusFilter("all"); setSearch(""); setPage(1);
  }

  function hide(lesson: Lesson) {
    confirm(lesson, t(S.instructor.hide), t(S.instructor.hideReviewed),
      () => unpublishLesson(lesson.id), t(S.instructor.hidden));
  }

  function confirm(lesson: Lesson, label: string, description: string, operation: () => Promise<unknown>, success: string) {
    setConfirmation({ lesson, label, description, operation, success });
    confirmDialog.current?.showModal();
  }

  const filtered = staff.filter((lesson) => (trackFilter === "all" || lesson.track === trackFilter)
    && (levelFilter === "all" || lessonLevel(lesson.level) === levelFilter) && (statusFilter === "all" || lesson.status === statusFilter)
    && (!search.trim() || Object.values(lesson.title).some((title) => title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))))
    .sort((a, b) => Number(b.status === "published") - Number(a.status === "published"));
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const first = (currentPage - 1) * pageSize;
  const visible = filtered.slice(first, first + pageSize);

  if (!isStaff(role) || !user) return <p className="card p-6">{t(S.instructor.restricted)}</p>;
  if (!apiEnabled) return <p className="card p-6">{t(S.instructor.unavailable)}</p>;

  const notice = <div ref={toast} popover="manual" role={error ? "alert" : "status"} className={`studio-toast ${error ? "is-error" : "is-success"}`}>
    {error ? <CircleAlert className="h-5 w-5 shrink-0" aria-hidden /> : <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden />}
    <div className="min-w-0 flex-1"><p className="font-semibold">{t(error ? S.instructor.actionFailed : S.instructor.actionSuccess)}</p><p className="mt-1 text-sm break-words">{error || message}</p></div>
    <button type="button" className="btn btn-ghost !p-2" aria-label={t(S.instructor.closeModal)} onClick={() => { setError(null); setMessage(null); }}><X className="h-4 w-4" aria-hidden /></button>
  </div>;

  return (
    <div className="studio-workspace space-y-6">
      <header className="studio-header">
        <div>
        <h1 className="font-serif text-4xl text-ink">{t(S.instructor.title)}</h1>
        <p className="mt-1 text-ink-soft">{t(S.instructor.sub)}</p>
        {!canReview(role) && <p className="mt-2 text-sm text-muted">{t(S.instructor.reviewMode)}</p>}
        </div>
        <Link href="/studio/lesson/" className="btn btn-primary"><Plus className="h-4 w-4" aria-hidden />{t(S.instructor.newLesson)}</Link>
      </header>

      {!preview && notice}
      <dialog ref={confirmDialog} className="card studio-dialog studio-confirm" aria-labelledby="studio-confirm-title" aria-describedby="studio-confirm-description"
        onClose={() => setConfirmation(null)} onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
        <div className="p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <span className="studio-confirm-icon"><CircleAlert className="h-6 w-6" aria-hidden /></span>
            <button type="button" className="btn btn-ghost !p-2" aria-label={t(S.instructor.closeModal)} onClick={() => confirmDialog.current?.close()}><X className="h-5 w-5" aria-hidden /></button>
          </div>
          <h2 id="studio-confirm-title" className="mt-5 font-serif text-2xl">{confirmation?.label}</h2>
          {confirmation && <p className="mt-2 font-medium text-ink">{t(confirmation.lesson.title)}</p>}
          <p id="studio-confirm-description" className="mt-3 text-sm leading-relaxed text-ink-soft">{confirmation?.description}</p>
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <button type="button" autoFocus className="btn btn-ghost" onClick={() => confirmDialog.current?.close()}>{t(S.instructor.closeForm)}</button>
            <button type="button" className="btn btn-primary" disabled={!confirmation || busy} onClick={() => {
              if (!confirmation) return;
              confirmDialog.current?.close();
              void action(confirmation.operation, confirmation.success);
            }}>{confirmation?.label}</button>
          </div>
        </div>
      </dialog>
      <dialog ref={dialog} className="card studio-dialog" aria-labelledby="studio-lesson-title"
        onClose={() => { historyRequest.current++; setPreview(null); }}
        onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }}>
        {preview && notice}
        <header className="flex items-center justify-between gap-3 border-b border-line p-6">
          <h2 id="studio-lesson-title" className="font-serif text-2xl">{preview && t(preview.title)}</h2>
          <div className="flex shrink-0 items-center gap-2">
            {preview && (preview.author_id === user.id || canReview(role)) && <Link href={editorLink(preview.id)} className="btn btn-ghost !min-h-10 !px-3 !py-2 text-sm"><FilePenLine className="h-4 w-4" aria-hidden />{t(S.instructor.edit)}</Link>}
            <button className="btn btn-ghost !p-2" aria-label={t(S.instructor.closeModal)} onClick={() => dialog.current?.close()}><X className="h-5 w-5" aria-hidden /></button>
          </div>
        </header>
        {preview && <div className="space-y-6 p-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {preview.cover && <img src={preview.cover} alt="" className="aspect-[16/6] w-full rounded-2xl object-cover" onError={(event) => { event.currentTarget.hidden = true; }} />}
          <div className="flex flex-wrap items-center gap-2">
            <span className={`chip studio-status status-${preview.status}`}>{t(S.instructor.status[preview.status])}</span>
            <span className="text-sm text-muted">{t(tracks.find((track) => track.id === preview.track)?.title)} · {t(S.library.levels[lessonLevel(preview.level)])} · {preview.minutes} {t(S.instructor.minutes)}</span>
          </div>
          {!!preview.contributors?.length && <p className="text-sm text-muted">{t(S.editor.contributors)}: <span className="text-ink-soft">{preview.contributors.join(lang === "ar" ? "، " : ", ")}</span></p>}
          <p className="text-ink-soft">{t(preview.summary)}</p>
          <div className="space-y-4">{preview.cards.map((card, index) => <article key={card.id} className="rounded-2xl border border-line p-4">
            <p className="text-xs font-medium text-muted">{index + 1} / {preview.cards.length}</p>
            <h3 className="mt-1 font-serif text-xl">{t(card.title)}</h3>
            {card.kind !== "quote" && card.body && <CardBody card={card} className="mt-3 text-sm leading-relaxed text-ink-soft" />}
            {card.takeaway && <p className="mt-3 rounded-xl bg-brand-50 p-3 text-sm text-brand-800">{t(card.takeaway)}</p>}
            {card.sources?.map((id) => <div key={id} className="mt-3"><SourceQuote id={id} compact /></div>)}
          </article>)}</div>
          {preview.quiz?.length ? <section className="space-y-3">
            <h3 className="font-serif text-xl">{t(S.lesson.quizTitle)}</h3>
            {preview.quiz.map((question) => <div key={question.id} className="rounded-xl border border-line p-4 text-sm">
              <p className="font-medium">{t(question.question)}</p>
              <ol className="mt-2 list-decimal space-y-1 ps-5">{question.options.map((option, index) => <li key={index} className={index === question.answer ? "font-medium text-brand-700" : "text-muted"}>{t(option)}</li>)}</ol>
              {question.explanation && <p className="mt-2 text-ink-soft">{t(question.explanation)}</p>}
            </div>)}
          </section> : null}
        </div>}
        {preview && <section aria-labelledby="studio-history-title" className="studio-history mx-6 mb-6 border-t border-line pt-6">
          <h3 id="studio-history-title" className="flex items-center gap-2 font-serif text-xl"><History className="h-5 w-5 text-brand-600" aria-hidden />{t(S.instructor.history)}</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted">{t(S.instructor.historyHint)}</p>
          {historyState === "loading" && <p role="status" className="mt-4 text-sm text-muted">{t(S.instructor.historyLoading)}</p>}
          {historyState === "error" && <div role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            <p>{t(S.instructor.historyError)}</p><button type="button" className="mt-2 underline" onClick={() => void loadHistory(preview.id)}>{t(S.instructor.retry)}</button>
          </div>}
          {historyState === "ready" && (!history.length ? <p className="mt-4 rounded-xl bg-brand-50/50 p-4 text-sm text-muted">{t(S.instructor.historyEmpty)}</p> :
            <ol className="studio-timeline mt-5">{history.map((event) => {
              const key = event.kind === "approve" && event.payload.reviewed ? "reviewed" : event.kind;
              const label = S.instructor.events[key as keyof typeof S.instructor.events] ?? S.instructor.events.other;
              return <li key={event.id}>
                <span className="studio-timeline-dot" aria-hidden />
                <p className="text-sm"><span className="text-ink-soft">{t(label)}</span> <span className="font-medium" title={event.actor_id ?? undefined}>{event.actor_email || event.actor_name || (event.actor_id ? `${t(S.instructor.unknownActor)} (${event.actor_id.slice(0, 8)})` : t(S.instructor.unknownActor))}</span></p>
                <time dateTime={event.created_at} className="mt-1 block text-xs text-muted">{new Date(event.created_at).toLocaleString(lang, { dateStyle: "medium", timeStyle: "long", timeZone: "UTC" })}</time>
                {event.payload.note && <p className="mt-2 whitespace-pre-wrap rounded-xl bg-brand-50/60 p-3 text-sm text-ink-soft">{event.payload.note}</p>}
              </li>;
            })}</ol>)}
        </section>}
      </dialog>
      <section aria-label={t(S.instructor.overview)} className="studio-metrics">
        {(["all", ...STATUSES] as const).map((status) => {
          const Icon = status === "all" ? BookOpen : STATUS_ICONS[status];
          return <button key={status} className={`card studio-metric metric-${status}`} aria-pressed={statusFilter === status}
            onClick={() => { setStatusFilter(status); setPage(1); }}>
            <span className="studio-metric-icon"><Icon className="h-5 w-5" aria-hidden /></span>
            <span className="min-w-0">
              <span className="studio-metric-count">{status === "all" ? staff.length : staff.filter((lesson) => lesson.status === status).length}</span>
              <span className="studio-metric-label">{t(status === "all" ? S.instructor.totalLessons : S.instructor.status[status])}</span>
            </span>
          </button>;
        })}
      </section>
      <section className="card studio-lessons p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-2xl">{t(S.instructor.lessons)}</h2>
        </div>
        <div className="studio-filters mt-5">
          <label className="studio-search">
            <span className="studio-field-label">{t(S.instructor.searchTitle)}</span>
            <span className="relative block">
              <Search className="studio-search-icon h-4 w-4 text-muted" aria-hidden />
              <input type="search" className="input" placeholder={t(S.instructor.searchPlaceholder)} value={search}
                onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
              {search && <button type="button" className="studio-search-clear" aria-label={t(S.instructor.clearSearch)} onClick={() => { setSearch(""); setPage(1); }}><X className="h-4 w-4" aria-hidden /></button>}
            </span>
          </label>
          <Select label={t(S.instructor.track)} value={trackFilter} options={[{ value: "all", label: t(S.library.all) }, ...trackOptions]}
            onChange={(value) => { setTrackFilter(value as typeof trackFilter); setPage(1); }} />
          <Select label={t(S.instructor.level)} value={String(levelFilter)} options={[{ value: "all", label: t(S.instructor.allLevels) }, ...levelOptions]}
            onChange={(value) => { setLevelFilter(value === "all" ? "all" : Number(value) as 1 | 2 | 3 | 4); setPage(1); }} />
          <Select label={t(S.instructor.statusFilter)} value={statusFilter}
            options={[{ value: "all", label: t(S.instructor.allStatuses) }, ...STATUSES.map((status) => ({ value: status, label: t(S.instructor.status[status]) }))]}
            onChange={(value) => { setStatusFilter(value as typeof statusFilter); setPage(1); }} />
          <button type="button" className="btn btn-ghost studio-reset" aria-label={t(S.instructor.resetFilters)} title={t(S.instructor.resetFilters)} onClick={resetFilters}><RotateCcw className="h-4 w-4" aria-hidden /></button>
        </div>
        <p role="status" className="mt-4 text-xs text-muted">{t(S.instructor.count)}: {visible.length ? first + 1 : 0}{visible.length > 1 && `–${first + visible.length}`} {t(S.instructor.pageOf)} {filtered.length}</p>
        {!!visible.length && <table className="studio-table mt-4">
          <thead><tr>
            <th scope="col">{t(S.instructor.colLesson)}</th>
            <th scope="col">{t(S.instructor.track)}</th>
            <th scope="col">{t(S.instructor.level)}</th>
            <th scope="col">{t(S.instructor.statusFilter)}</th>
            <th scope="col">{t(S.instructor.colActions)}</th>
          </tr></thead>
          <tbody className="divide-y divide-line">{visible.map((lesson) => {
          const owner = lesson.author_id === user.id;
          const manage = owner || canReview(role);
          const meta = TRACK_META[lesson.track];
          const TrackIcon = meta?.icon ?? BookOpen;
          return <tr key={lesson.id} className="studio-lesson-row">
            <td><div className="flex items-center gap-3">
              <span className={`studio-lesson-thumb ${meta?.ring ?? "bg-brand-50 text-brand-700"}`} aria-hidden><TrackIcon className="h-5 w-5" /></span>
              <div className="min-w-0">
                <button className="studio-lesson-title block max-w-full truncate text-start" title={t(lesson.title)} aria-haspopup="dialog" onClick={() => openLesson(lesson)}>{t(lesson.title)}</button>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  <span className="flex gap-1">{(["en", "ar"] as const).filter((code) => lesson.title[code]).map((code) => <span key={code} className="studio-lang">{code}</span>)}</span>
                  {!!lesson.contributors?.length && <span>{lesson.contributors.slice(0, 2).join(lang === "ar" ? "، " : ", ")}{lesson.contributors.length > 2 && ` +${lesson.contributors.length - 2}`}</span>}
                </p>
              </div>
            </div></td>
            <td>{t(tracks.find((track) => track.id === lesson.track)?.title)}</td>
            <td>{t(S.library.levels[lessonLevel(lesson.level)])}</td>
            <td><span className={`chip studio-status status-${lesson.status}`}>{t(S.instructor.status[lesson.status])}</span></td>
            <td><div className="flex justify-end gap-2">
              {manage && <Link href={editorLink(lesson.id)} className="btn btn-tint-brand">{t(lesson.status === "archived" ? S.instructor.editArchived : S.instructor.edit)}</Link>}
              {manage && lesson.status === "draft" && <button className="btn btn-tint-danger" disabled={busy} onClick={() => confirm(lesson, t(S.instructor.delete), t(S.instructor.deleteConfirm), () => deleteLesson(lesson.id), t(S.instructor.deleted))}>{t(S.instructor.delete)}</button>}
              {lesson.status === "draft" && manage && <button className="btn btn-primary" disabled={busy} onClick={() => void action(async () => {
                await submitDraft(lesson.id);
                if (canReview(role)) await reviewDecision(lesson.id, "approve", "");
              }, t(canReview(role) ? S.instructor.published : S.instructor.submitted))}>{t(canReview(role) ? S.instructor.publishDirect : S.instructor.submit)}</button>}
              {lesson.status === "in_review" && canReview(role) && <button className="btn btn-primary" disabled={busy} onClick={() => void action(() => reviewDecision(lesson.id, "approve", ""), t(S.instructor.published))}>{t(S.instructor.publish)}</button>}
              {canReview(role) && lesson.status === "in_review" && <button className="btn btn-ghost" disabled={busy} onClick={() => void action(() => reviewDecision(lesson.id, "request_changes", ""), t(S.instructor.changesRequested))}>{t(S.instructor.requestChanges)}</button>}
              {manage && lesson.status !== "archived" && <button className="btn btn-tint-warn" disabled={busy} onClick={() => {
                confirm(lesson, t(S.instructor.archive), t(S.instructor.archiveConfirm), () => archiveLesson(lesson.id), t(S.instructor.archived));
              }}><Archive className="h-4 w-4" aria-hidden />{t(S.instructor.archive)}</button>}
              {manage && lesson.status === "published" && <button className="btn btn-ghost" disabled={busy} onClick={() => hide(lesson)}>{t(S.instructor.hide)}</button>}
            </div></td>
          </tr>;
        })}</tbody>
        </table>}
        {!filtered.length && <div className="studio-empty">
          <Search className="mx-auto h-7 w-7 text-brand-400" aria-hidden />
          <p className="mt-3 font-medium">{t(S.instructor.noResults)}</p>
          <p className="mt-1 text-sm text-muted">{t(S.instructor.noResultsHint)}</p>
          <button className="btn btn-ghost mt-4 text-sm" onClick={resetFilters}>{t(S.instructor.resetFilters)}</button>
        </div>}
        <footer className="studio-pagination mt-5 flex flex-wrap items-end justify-between gap-4 border-t border-line pt-4">
          <Select label={t(S.instructor.perPage)} value={String(pageSize)} options={[5, 10, 20].map((size) => ({ value: String(size), label: String(size) }))}
            onChange={(value) => { setPageSize(Number(value)); setPage(1); }} />
          <nav aria-label={t(S.instructor.pagination)} className="flex flex-wrap items-center gap-3">
          <button className="btn btn-ghost" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>{t(S.instructor.previousPage)}</button>
          <span className="text-sm text-muted">{t(S.instructor.page)} {currentPage} {t(S.instructor.pageOf)} {totalPages}</span>
          <button className="btn btn-ghost" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>{t(S.instructor.nextPage)}</button>
          </nav>
        </footer>
      </section>
    </div>
  );
}
