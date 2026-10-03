"use client";

import { useCallback, useEffect, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SourceQuote } from "@/components/ui";
import { apiEnabled, pendingSources, approveSource } from "@/lib/api";
import { useContent } from "@/lib/content";
import type { Source } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { S } from "@/lib/strings";
import { canReview, isStaff } from "@/lib/roles";

export default function SourcesPage() {
  return <AppShell><Sources /></AppShell>;
}

function Sources() {
  const { t, lang } = useI18n();
  const { role, user } = useSession();
  const { refresh } = useContent();
  const [pending, setPending] = useState<Source[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isStaff(role) || !user || !apiEnabled) return;
    try { setPending(await pendingSources()); }
    catch (e) { setError(e instanceof Error ? e.message : t(S.ask.error)); }
  }, [role, user, t]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- Reads the staff API asynchronously.
  useEffect(() => { void load(); }, [load]);

  async function approve(id: string) {
    setBusy(true); setError(null); setMessage(null);
    try {
      await approveSource(id); setMessage(t(S.instructor.sourceApproved));
      await load(); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : t(S.ask.error)); }
    finally { setBusy(false); }
  }

  if (!isStaff(role) || !user) return <p className="card p-6">{t(S.instructor.restricted)}</p>;
  if (!apiEnabled) return <p className="card p-6">{t(S.instructor.unavailable)}</p>;

  return <div className="space-y-6">
    <header>
      <h1 className="font-serif text-4xl text-ink">{t(S.instructor.sources)}</h1>
      <p className="mt-1 text-ink-soft">{t(S.instructor.sub)}</p>
    </header>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="rounded-xl bg-brand-50 p-3 text-sm text-brand-800">{message}</p>}
    <section className="card p-6">
      <h2 className="flex items-center gap-2 font-serif text-2xl text-ink">
        <ClipboardCheck className="h-5 w-5 text-brand-600" /> {t(S.instructor.queue)}
      </h2>
      <ul className="mt-4 divide-y divide-line">
        {pending.map((s) => (
          <li key={s.id} className="break-words py-3">
            <button onClick={() => setPreview(preview === s.id ? null : s.id)} className="flex w-full items-center justify-between gap-3 text-start">
              <span className="min-w-0">
                <span className="block font-medium text-ink">{lang === "ar" ? s.ref_ar : s.ref_en}</span>
                <span className="block text-xs text-muted">{s.kind} · {s.origin}</span>
              </span>
              <span className="chip shrink-0 border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs text-amber-800">{t(S.instructor.pending)}</span>
            </button>
            {canReview(role) && preview === s.id && <button className="btn btn-primary mt-3" disabled={busy} onClick={() => void approve(s.id)}>{t(S.instructor.approveSource)}</button>}
            {preview === s.id && (
              <div className="mt-3">
                <SourceQuote id={s.id} source={s} compact />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  </div>;
}
