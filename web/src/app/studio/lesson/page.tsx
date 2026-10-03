"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, CircleAlert, Eye, PenLine, Plus, Quote, Send, Sparkles, Trash2, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Select } from "@/components/Select";
import { SourceQuote } from "@/components/ui";
import { CardView } from "@/components/lesson/CardView";
import { RichText } from "@/components/studio/RichText";
import { SourcePicker } from "@/components/studio/SourcePicker";
import {
  ApiError, apiEnabled, generateLesson, lessonHistory, reviewCheck, reviewDecision, saveDraft, staffLesson, submitDraft, unpublishLesson,
  type LessonEvent, type ReviewIssue, type StaffLesson,
} from "@/lib/api";
import { useContent } from "@/lib/content";
import { useI18n } from "@/lib/i18n";
import { canReview, isStaff } from "@/lib/roles";
import { useSession } from "@/lib/session";
import { S } from "@/lib/strings";
import { lessonLevel, type Bi, type Card, type Lang, type Lesson, type Source, type TrackId } from "@/lib/types";

const E = S.editor;
const LANGS: { id: Lang; name: string }[] = [{ id: "en", name: "English" }, { id: "ar", name: "العربية" }];

const empty = (): Bi => ({ en: "", ar: "" });
const shortId = () => crypto.randomUUID().slice(0, 8);
const filled = (text?: Bi) => !!(text?.en?.trim() || text?.ar?.trim());
const withLang = (text: Bi | undefined, lang: Lang, value: string): Bi => ({ ...empty(), ...text, [lang]: value });
const plain = (html = "") => html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
const escapeHtml = (text = "") => text.replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char]!).replace(/\n/g, "<br>");
/** Sections written before this editor only have plain text. */
const cardHtml = (card: Card): Bi => card.html ?? { en: escapeHtml(card.body?.en), ar: escapeHtml(card.body?.ar) };
const newSection = (): Card => ({ id: shortId(), kind: "concept", title: empty(), html: empty(), sources: [] });

/** What a page still needs before the lesson can be saved. */
const gaps = (card: Card) => {
  const html = cardHtml(card);
  return [
    ...(filled(card.title) ? [] : [E.needsTitle]),
    ...(card.kind === "quote" || plain(html.en) || plain(html.ar) ? [] : [E.needsText]),
    ...(card.sources?.length ? [] : [E.needsSource]),
  ];
};

export default function LessonEditorPage() {
  return (
    <AppShell>
      <Suspense>
        <Editor />
      </Suspense>
    </AppShell>
  );
}

function Editor() {
  const { t, lang } = useI18n();
  const { role, user } = useSession();
  const { tracks, sources, refresh } = useContent();
  const router = useRouter();
  const id = useSearchParams().get("id");
  const [step, setStep] = useState<"choose" | "ai" | "edit">(id ? "edit" : "choose");
  const [lesson, setLesson] = useState<StaffLesson | null>(null);
  const [writing, setWriting] = useState<Lang>(lang);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [tried, setTried] = useState(false);
  const [issues, setIssues] = useState<ReviewIssue[]>([]);
  const [picker, setPicker] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [fromAi, setFromAi] = useState<"draft" | "empty" | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const opened = useRef<string | null>(null);
  const [page, setPage] = useState(0);
  const [lastEdit, setLastEdit] = useState<LessonEvent | null>(null);
  const [preview, setPreview] = useState(false);
  const staff = isStaff(role) && !!user && apiEnabled;

  useEffect(() => {
    if (!id || !staff || opened.current === id) return;
    opened.current = id;
    staffLesson(id).then(({ sources_by_id: _sources, ...data }) => { void _sources; setLesson(data); setStep("edit"); }, () => setLoadFailed(true));
    showLastEdit(id);
  }, [id, staff]);

  /** Who saved the lesson text last, and when: the newest "created" or "updated" entry of its history. */
  function showLastEdit(lessonId: string) {
    lessonHistory(lessonId).then((events) => setLastEdit(events.find((event) => event.kind === "updated" || event.kind === "created") ?? null), () => {});
  }

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (!isStaff(role) || !user) return <p className="card p-6">{t(S.instructor.restricted)}</p>;
  if (!apiEnabled) return <p className="card p-6">{t(S.instructor.unavailable)}</p>;

  const fail = (e: unknown) => setNotice({ ok: false, text: e instanceof Error ? e.message : t(S.ask.error) });
  const edit = (update: (current: StaffLesson) => StaffLesson) => { setLesson((current) => current && update(current)); setDirty(true); };
  const change = (patch: Partial<StaffLesson>) => edit((current) => ({ ...current, ...patch }));
  const changeCard = (cardId: string, update: (card: Card) => Card) =>
    edit((current) => ({ ...current, cards: current.cards.map((card) => (card.id === cardId ? update(card) : card)) }));

  function start(draft: Lesson | null) {
    setLesson(draft ?? {
      id: "", track: tracks[0]?.id ?? "explore", module: tracks[0]?.modules[0]?.id ?? "", level: 1, minutes: 0,
      title: empty(), summary: empty(), status: "draft", cards: [newSection()],
    });
    setStep("edit");
  }

  async function generate() {
    setBusy(true); setNotice(null);
    try {
      const draft = await generateLesson(prompt.trim());
      setFromAi(draft ? "draft" : "empty");
      setDirty(!!draft);
      start(draft && { ...draft, id: "", status: "draft" });
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  const back = (
    <Link href="/studio/" className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-brand-700"
      onClick={(event) => { if (dirty && !window.confirm(t(E.leave))) event.preventDefault(); }}>
      <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />{t(E.back)}
    </Link>
  );

  if (step === "choose") return (
    <div className="mx-auto max-w-3xl space-y-6">
      {back}
      <header>
        <h1 className="font-serif text-4xl text-ink">{t(S.instructor.newLesson)}</h1>
        <p className="mt-2 text-ink-soft">{t(E.startTitle)} {t(E.startSub)}</p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        <button type="button" className="card editor-choice" onClick={() => start(null)}>
          <span className="editor-choice-icon"><PenLine className="h-6 w-6" aria-hidden /></span>
          <span className="font-serif text-2xl text-ink">{t(E.manual)}</span>
          <span className="text-sm leading-relaxed text-ink-soft">{t(E.manualSub)}</span>
        </button>
        <button type="button" className="card editor-choice" onClick={() => setStep("ai")}>
          <span className="editor-choice-icon is-ai"><Sparkles className="h-6 w-6" aria-hidden /></span>
          <span className="font-serif text-2xl text-ink">{t(E.ai)}</span>
          <span className="text-sm leading-relaxed text-ink-soft">{t(E.aiSub)}</span>
        </button>
      </div>
    </div>
  );

  if (step === "ai") return (
    <div className="mx-auto max-w-3xl space-y-6">
      <button type="button" className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-brand-700" onClick={() => setStep("choose")}>
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />{t(S.lesson.previous)}
      </button>
      <form className="card space-y-5 p-6 sm:p-8" onSubmit={(event) => { event.preventDefault(); void generate(); }}>
        <div className="flex items-start gap-4">
          <span className="editor-choice-icon is-ai"><Sparkles className="h-6 w-6" aria-hidden /></span>
          <div>
            <h1 className="font-serif text-3xl text-ink">{t(E.aiTitle)}</h1>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">{t(E.aiHint)}</p>
          </div>
        </div>
        <textarea className="input min-h-40" autoFocus required maxLength={4000} aria-label={t(E.aiTitle)} placeholder={t(E.aiPlaceholder)}
          value={prompt} onChange={(event) => setPrompt(event.target.value)} />
        <div className="flex flex-wrap gap-2">
          {E.aiExamples.map((example) => <button key={example.en} type="button" className="chip hover:border-brand-300 hover:text-brand-800" onClick={() => setPrompt(t(example))}>{t(example)}</button>)}
        </div>
        {notice && <p role="alert" className="editor-notice is-error">{notice.text}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" className="btn btn-ghost" onClick={() => start(null)}><PenLine className="h-4 w-4" aria-hidden />{t(E.manual)}</button>
          <button className="btn btn-primary" disabled={busy || !prompt.trim()}><Sparkles className="h-4 w-4" aria-hidden />{t(busy ? E.generating : E.generate)}</button>
        </div>
      </form>
    </div>
  );

  if (loadFailed) return <div className="card space-y-4 p-8 text-center"><p className="text-ink-soft">{t(E.loadError)}</p>{back}</div>;
  if (!lesson) return <p role="status" className="p-8 text-center text-muted">{t(S.common.loading)}</p>;

  const dir = writing === "ar" ? "rtl" : "ltr";
  const live = lesson.status === "published";
  // Review is always on: a teacher's lesson goes to an admin, an admin publishes directly.
  const direct = canReview(role);
  const canPublish = canReview(role) || (lesson.author_id ? lesson.author_id === user.id : !id);
  const locked = live && !canPublish;
  const modules = tracks.find((track) => track.id === lesson.track)?.modules ?? [];
  const reference = (sourceId: string) => (sources[sourceId] ? (lang === "ar" ? sources[sourceId].ref_ar : sources[sourceId].ref_en) : sourceId);
  const complete = (language: Lang) => !!lesson.title[language]?.trim() && !!lesson.summary[language]?.trim() && lesson.cards.length > 0
    && lesson.cards.every((card) => card.title[language]?.trim() && (card.kind === "quote" || plain(cardHtml(card)[language])));
  const pickerCard = lesson.cards.find((card) => card.id === picker);
  // After a first save attempt the list of missing parts stays live, and shrinks as they are filled.
  const todo = tried ? missing(lesson) : [];

  function missing(current: StaffLesson) {
    const out: string[] = [];
    if (!filled(current.title)) out.push(t(E.needTitle));
    if (!filled(current.summary)) out.push(t(E.needSummary));
    if (!tracks.some((track) => track.id === current.track && track.modules.some((module) => module.id === current.module))) out.push(t(E.needModule));
    if (!current.minutes) out.push(t(E.needMinutes));
    if (!current.cards.length) out.push(t(E.needSection));
    current.cards.forEach((card, index) => gaps(card).forEach((gap) => out.push(`${t(E.section)} ${index + 1} ${t(gap)}`)));
    return out;
  }

  /** The lesson as the API stores it. The API rebuilds each plain `body` from the formatted text. */
  function payload(current: StaffLesson): Lesson {
    const { author_id: _author, ...rest } = current;
    void _author;
    const slug = current.title.en.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "lesson";
    return {
      ...rest, id: current.id || `${slug}-${shortId()}`, status: "draft",
      cards: current.cards.map(({ takeaway, ...card }) => ({
        ...card, ...(filled(takeaway) ? { takeaway } : {}), ...(card.kind === "quote" ? {} : { html: cardHtml(card) }),
      })),
    };
  }

  /** Saves the lesson, then leaves it as a draft, sends it to review, or publishes it (which goes through review when this account may not publish). */
  async function save(goal: "draft" | "review" | "publish") {
    const publish = goal !== "draft";
    const approve = goal === "publish" && direct;
    if (!lesson || !user) return;
    setTried(true); setIssues([]); setNotice(null);
    if (missing(lesson).length) return;
    const data = payload(lesson);
    const status = (next: Lesson["status"]) => setLesson((current) => current && { ...current, status: next });
    if (live && !direct && !window.confirm(t(S.instructor.hideReviewed))) return;
    setBusy(true);
    try {
      if (live) {
        // ponytail: the API only edits unpublished lessons, so a live one is hidden, saved and published again.
        // Learners lose it for a moment, or until it is fixed if a later step fails; checking first keeps that rare.
        // Upgrade: one API call that swaps the published content in place.
        const high = (await reviewCheck(data)).issues.filter((issue) => issue.severity === "high");
        if (high.length) { setIssues(high); setNotice({ ok: false, text: t(E.liveKept) }); return; }
        await unpublishLesson(data.id);
        status("draft");
      }
      // The API keeps the credits: it adds the account that saved.
      const { contributors } = await saveDraft(data);
      showLastEdit(data.id);
      opened.current = data.id;
      setLesson({ ...data, contributors, author_id: lesson.author_id ?? user.id });
      setDirty(false);
      if (publish) {
        // If publishing fails below, the editor stays open on the draft that was just saved.
        if (id !== data.id) router.replace(`/studio/lesson/?id=${encodeURIComponent(data.id)}`);
        await submitDraft(data.id);
        status("in_review");
        if (approve) { await reviewDecision(data.id, "approve", ""); status("published"); }
        await refresh();
      }
      // Saved, published, updated or sent for review: the work here is done, so return to the list,
      // which shows this message once (it reads the same key in studio/page.tsx).
      try { sessionStorage.setItem("yaqin-studio-toast", t(!publish ? S.instructor.draftSaved : !approve ? S.instructor.submitted : live ? E.updated : S.instructor.published)); } catch { /* storage is blocked: no message */ }
      router.push("/studio/");
    } catch (e) {
      // A blocked submission only says "needs changes": fetch what the check found.
      if (e instanceof ApiError && e.code === "needs_changes") {
        setIssues(await reviewCheck(data).then((result) => result.issues.filter((issue) => issue.severity === "high"), () => []));
      }
      fail(e);
    } finally { setBusy(false); }
  }

  function move(index: number, by: -1 | 1) {
    edit((current) => {
      const cards = [...current.cards];
      [cards[index], cards[index + by]] = [cards[index + by], cards[index]];
      return { ...current, cards };
    });
    setPage(index + by);
  }

  function addCard(next: Card) {
    setPage(lesson!.cards.length);
    edit((current) => ({ ...current, cards: [...current.cards, next] }));
  }

  // One page of the lesson is open at a time.
  const shown = Math.min(page, lesson.cards.length - 1);
  const card = lesson.cards[shown];
  const quote = card?.kind === "quote";
  const quoted = card?.sources?.[0];

  function pickSource(card: Card, sourceId: string, picked?: Source) {
    if (card.kind !== "quote") { changeCard(card.id, (current) => ({ ...current, sources: [...(current.sources ?? []), sourceId] })); return; }
    const source = picked ?? sources[sourceId];
    const previous = sources[card.sources?.[0] ?? ""];
    // The quote takes its source's reference as title, unless the author wrote another one.
    const auto = !filled(card.title) || (!!previous && card.title.en === previous.ref_en && card.title.ar === previous.ref_ar);
    changeCard(card.id, (current) => ({ ...current, sources: [sourceId], title: auto && source ? { en: source.ref_en, ar: source.ref_ar } : current.title }));
  }

  return (
    <div className="lesson-editor">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {back}
        <div role="group" aria-label={t(E.contentLang)} title={t(E.langHint)} className="editor-langs">
          <span>{t(E.contentLang)}</span>
          {LANGS.map(({ id: language, name }) => <button key={language} type="button" aria-pressed={writing === language} onClick={() => setWriting(language)}>
            {name}{complete(language) && <Check className="h-3.5 w-3.5" aria-label={t(E.langComplete)} />}
          </button>)}
        </div>
      </div>

      {fromAi && <div className="editor-ai-note">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p>{t(fromAi === "draft" ? E.aiReady : E.aiPending)}</p>
          {fromAi === "empty" && <p className="mt-1 break-words italic">“{prompt}”</p>}
        </div>
        <button type="button" className="rich-tool" aria-label={t(S.common.close)} onClick={() => setFromAi(null)}><X className="h-4 w-4" aria-hidden /></button>
      </div>}

      <div className="editor-grid">
        <div className="min-w-0 space-y-5">
          {preview ? <header className="card p-5 sm:p-7">
            <p className="editor-section-tag">{t(E.previewNote)}</p>
            <h1 className="mt-2 font-serif text-3xl text-ink">{t(lesson.title)}</h1>
            <p className="mt-2 text-ink-soft">{t(lesson.summary)}</p>
          </header> : <fieldset disabled={locked} className="card min-w-0 space-y-4 p-5 sm:p-7">
            <label className="block">
              <span className="studio-field-label">{t(E.titlePlaceholder)}</span>
              <span className="editor-field"><input className="editor-title" dir={dir} maxLength={200} aria-label={t(E.titlePlaceholder)} placeholder={t(E.titlePlaceholder)}
                value={lesson.title[writing] ?? ""} onChange={(event) => change({ title: withLang(lesson.title, writing, event.target.value) })} /><PenLine className="h-4 w-4" aria-hidden /></span>
            </label>
            <label className="block">
              <span className="studio-field-label">{t(E.summary)}</span>
              <span className="editor-field"><textarea className="editor-summary" dir={dir} rows={2} maxLength={600} aria-label={t(E.summaryPlaceholder)} placeholder={t(E.summaryPlaceholder)}
                value={lesson.summary[writing] ?? ""} onChange={(event) => change({ summary: withLang(lesson.summary, writing, event.target.value) })} /><PenLine className="h-4 w-4" aria-hidden /></span>
            </label>
          </fieldset>}

          <nav className="editor-pages" aria-label={t(E.pages)}>
            <button type="button" className="rich-tool" title={t(S.instructor.previousPage)} aria-label={t(S.instructor.previousPage)} disabled={shown <= 0} onClick={() => setPage(shown - 1)}><ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden /></button>
            {lesson.cards.map((item, index) => <button key={item.id} type="button" className={`editor-page ${tried && gaps(item).length ? "is-missing" : ""}`}
              aria-current={index === shown ? "page" : undefined} aria-label={`${t(E.section)} ${index + 1}`} onClick={() => setPage(index)}>{index + 1}</button>)}
            <button type="button" className="rich-tool" title={t(S.instructor.nextPage)} aria-label={t(S.instructor.nextPage)} disabled={shown >= lesson.cards.length - 1} onClick={() => setPage(shown + 1)}><ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden /></button>
            <span className="flex-1" />
            {!preview && <button type="button" className="chip chip-add" disabled={locked} onClick={() => addCard(newSection())}><Plus className="h-3.5 w-3.5" aria-hidden />{t(E.addSection)}</button>}
            {!preview && <button type="button" className="chip chip-add" disabled={locked} onClick={() => {
              const next: Card = { id: shortId(), kind: "quote", title: empty(), sources: [] };
              addCard(next);
              setPicker(next.id);
            }}><Quote className="h-3.5 w-3.5" aria-hidden />{t(E.addQuote)}</button>}
          </nav>

          {/* The page as a learner sees it, with the changes that are not saved yet. */}
          {card && preview && <div className="card p-5 sm:p-7"><CardView key={card.id} lesson={lesson} card={quote ? card : { ...card, html: cardHtml(card) }} onAsk={() => {}} /></div>}
          {card && !preview && <fieldset key={card.id} disabled={locked} className="card editor-section min-w-0">
            <header className="flex items-center justify-between gap-2">
              <span className="editor-section-tag">{quote && <Quote className="h-3.5 w-3.5" aria-hidden />}{t(E.section)} {shown + 1} / {lesson.cards.length}{quote && ` · ${t(E.quote)}`}</span>
              <span className="flex gap-1">
                <button type="button" className="rich-tool" title={t(E.moveUp)} aria-label={t(E.moveUp)} disabled={shown === 0} onClick={() => move(shown, -1)}><ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden /></button>
                <button type="button" className="rich-tool" title={t(E.moveDown)} aria-label={t(E.moveDown)} disabled={shown === lesson.cards.length - 1} onClick={() => move(shown, 1)}><ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden /></button>
                <button type="button" className="rich-tool" title={t(E.remove)} aria-label={t(E.remove)} onClick={() => edit((current) => ({ ...current, cards: current.cards.filter((item) => item.id !== card.id) }))}><Trash2 className="h-4 w-4" aria-hidden /></button>
              </span>
            </header>
            <label className="block">
              <span className="studio-field-label">{t(quote ? E.quoteTitle : E.sectionTitle)}</span>
              <span className="editor-field"><input className="editor-section-title" dir={dir} maxLength={200} aria-label={t(quote ? E.quoteTitle : E.sectionTitle)} placeholder={t(quote ? E.quoteTitle : E.sectionTitle)}
              value={card.title[writing] ?? ""} onChange={(event) => changeCard(card.id, (current) => ({ ...current, title: withLang(current.title, writing, event.target.value) }))} /><PenLine className="h-4 w-4" aria-hidden /></span>
            </label>
            {!quote && <RichText key={`${card.id}-${writing}`} dir={dir} readOnly={locked} label={`${t(E.section)} ${shown + 1}`} placeholder={t(E.sectionBody)}
              value={cardHtml(card)[writing]} onChange={(html) => changeCard(card.id, (current) => ({ ...current, html: { ...cardHtml(current), [writing]: html } }))} />}
            {quote && (quoted ? <div className="space-y-2">
              <SourceQuote id={quoted} />
              <button type="button" className="btn btn-ghost !min-h-9 !px-3 !py-1.5 text-xs" onClick={() => setPicker(card.id)}>{t(E.change)}</button>
            </div> : <button type="button" className="editor-quote-empty" onClick={() => setPicker(card.id)}>
              <BookOpen className="h-6 w-6 text-brand-600" aria-hidden />
              <span>{t(E.quoteEmpty)}</span>
              <span className="btn btn-primary !min-h-9 !py-1.5 text-sm">{t(E.chooseQuote)}</span>
            </button>)}
            <label className="block">
              <span className="studio-field-label">{t(quote ? E.quoteNote : E.takeaway)}</span>
              <input className="input" dir={dir} maxLength={400} aria-label={t(quote ? E.quoteNote : E.takeaway)} placeholder={t(quote ? E.quoteNote : E.takeaway)}
              value={card.takeaway?.[writing] ?? ""} onChange={(event) => changeCard(card.id, (current) => ({ ...current, takeaway: withLang(current.takeaway, writing, event.target.value) }))} />
            </label>
            {!quote && <div className="editor-chips editor-sources">
              <span className="studio-field-label !mb-0">{t(S.lesson.sources)}</span>
              {card.sources?.map((sourceId) => <span key={sourceId} className="chip">
                {reference(sourceId)}
                <button type="button" aria-label={`${t(E.remove)} ${reference(sourceId)}`}
                  onClick={() => changeCard(card.id, (current) => ({ ...current, sources: current.sources?.filter((item) => item !== sourceId) }))}><X className="h-3 w-3" aria-hidden /></button>
              </span>)}
              <button type="button" className="chip chip-add" onClick={() => setPicker(card.id)}><Plus className="h-3.5 w-3.5" aria-hidden />{t(E.addSource)}</button>
              {!card.sources?.length && <span className="text-xs text-muted">{t(E.sourceHint)}</span>}
            </div>}
          </fieldset>}
        </div>

        <aside className="space-y-4">
          <div className="card editor-bar">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`chip studio-status status-${lesson.status}`}>{t(S.instructor.status[lesson.status])}</span>
              <span role="status" className={`editor-state ${dirty || !lesson.id ? "is-dirty" : ""}`}>{t(busy ? E.working : live && !dirty ? E.live : !lesson.id ? E.notSaved : dirty ? E.unsaved : E.saved)}</span>
            </div>
            {canPublish && <button type="button" className="btn btn-primary" disabled={busy || (live && !dirty)} title={direct ? undefined : t(S.instructor.reviewMode)}
              onClick={() => void save("publish")}>{t(!direct ? S.instructor.submit : live ? E.update : S.instructor.publishDirect)}</button>}
            {/* An account that may publish can still ask for a second look first. */}
            {!live && direct && canPublish && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void save("review")}><Send className="h-4 w-4" aria-hidden />{t(S.instructor.submit)}</button>}
            {!live && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void save("draft")}>{t(S.instructor.saveDraft)}</button>}
            <button type="button" className="btn btn-ghost" aria-pressed={preview} onClick={() => setPreview(!preview)}>
              {preview ? <PenLine className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}{t(preview ? E.keepEditing : E.view)}
            </button>
            {!canPublish && <p className="text-xs text-muted">{t(E.authorPublishes)}</p>}
            {!!todo.length && <div role="alert" className="editor-notice is-error">
              <p className="font-semibold">{t(E.fixFirst)}</p>
              <ul>{todo.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>}
            {!!issues.length && <div role="alert" className="editor-notice is-error">
              <p className="font-semibold">{t(E.issues)}</p>
              <ul>{issues.map((issue, index) => <li key={index}>{issue.issue}{issue.suggestion && <span className="block text-xs opacity-80">{issue.suggestion}</span>}</li>)}</ul>
            </div>}
            {notice && <p role={notice.ok ? "status" : "alert"} className={`editor-notice flex items-start gap-2 ${notice.ok ? "is-success" : "is-error"}`}>
              {notice.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}{notice.text}
            </p>}
          </div>

          <fieldset disabled={locked} className="card min-w-0 space-y-4 p-5">
            <h2 className="font-serif text-xl text-ink">{t(E.details)}</h2>
            <Select label={t(S.instructor.track)} value={lesson.track} options={tracks.map((track) => ({ value: track.id, label: t(track.title) }))}
              onChange={(value) => change({ track: value as TrackId, module: tracks.find((track) => track.id === value)?.modules[0]?.id ?? "" })} />
            <Select key={lesson.track} label={t(S.instructor.module)} value={lesson.module}
              options={modules.map((module) => ({ value: module.id, label: t(module.title) }))} onChange={(value) => change({ module: value })} />
            <div>
              <span className="studio-field-label">{t(E.tags)}</span>
              {!!lesson.tags?.length && <div className="editor-chips mb-2">
                {lesson.tags.map((tag) => <span key={tag} className="chip">
                  {tag}<button type="button" aria-label={`${t(E.remove)} ${tag}`} onClick={() => change({ tags: lesson.tags?.filter((item) => item !== tag) })}><X className="h-3 w-3" aria-hidden /></button>
                </span>)}
              </div>}
              <input className="input" maxLength={40} aria-label={t(E.tagAdd)} placeholder={t(E.tagAdd)} onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                const tag = event.currentTarget.value.trim();
                const tags = lesson.tags ?? [];
                if (tag && !tags.includes(tag) && tags.length < 12) change({ tags: [...tags, tag] });
                event.currentTarget.value = "";
              }} />
            </div>
            <Select label={t(S.instructor.level)} value={String(lessonLevel(lesson.level))}
              options={([1, 2, 3, 4] as const).map((level) => ({ value: String(level), label: t(S.library.levels[level]) }))}
              onChange={(value) => change({ level: Number(value) as 1 | 2 | 3 | 4 })} />
            <label className="block">
              <span className="studio-field-label">{t(E.minutes)}</span>
              <input type="number" className="input" min={0} max={180} aria-label={t(E.minutes)} value={lesson.minutes}
                onChange={(event) => change({ minutes: Math.max(0, Math.min(180, Math.round(Number(event.target.value)) || 0)) })} />
            </label>
          </fieldset>

          <section className="card space-y-3 p-5">
            <h2 className="font-serif text-xl text-ink">{t(E.activity)}</h2>
            <dl className="editor-facts">
              <dt>{t(E.lastUpdated)}</dt>
              <dd>{lastEdit ? <time dateTime={lastEdit.created_at}>{new Date(lastEdit.created_at).toLocaleString(lang, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC</time>
                : t(lesson.id ? E.notRecorded : E.notSaved)}</dd>
              <dt>{t(E.lastUpdatedBy)}</dt>
              <dd className="truncate" title={lastEdit?.actor_email ?? undefined}>{lastEdit ? lastEdit.actor_email || lastEdit.actor_name || t(S.instructor.unknownActor) : "—"}</dd>
            </dl>
            <h3 className="studio-field-label !mb-0 border-t border-line pt-3">{t(E.contributors)}</h3>
            {lesson.contributors?.length ? <div className="editor-chips">
              {lesson.contributors.map((name) => <span key={name} className="chip max-w-full" title={name}>
                <span className="editor-avatar" aria-hidden>{name.slice(0, 1).toUpperCase()}</span><span className="min-w-0 truncate">{name}</span>
              </span>)}
            </div> : <p className="text-xs leading-relaxed text-muted">{t(E.contributorsHint)}</p>}
          </section>
        </aside>
      </div>

      {pickerCard && <SourcePicker exclude={pickerCard.kind === "quote" ? [] : pickerCard.sources ?? []}
        onPick={(sourceId, picked) => pickSource(pickerCard, sourceId, picked)} onClose={() => setPicker(null)} />}
    </div>
  );
}
