"use client";

import { AlertTriangle, BadgeCheck, Info, Scale, UserRoundSearch } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { S } from "@/lib/strings";
import type { AskResponse, Tier } from "@/lib/types";
import { SourceQuote } from "./ui";

const TIER_STYLE: Record<Tier, { cls: string; icon: typeof Info }> = {
  A: { cls: "bg-brand-50 text-brand-800 border-brand-200", icon: BadgeCheck },
  B: { cls: "bg-sky-100 text-ink border-sky-200", icon: Info },
  C: { cls: "bg-amber-50 text-amber-900 border-amber-200", icon: Scale },
  D: { cls: "bg-violet-50 text-violet-900 border-violet-200", icon: UserRoundSearch },
  OUT: { cls: "bg-slate-50 text-slate-700 border-slate-200", icon: Info },
  NONE: { cls: "bg-slate-50 text-slate-700 border-slate-200", icon: AlertTriangle },
};

/** Minimal formatting for model text: **bold** and line breaks. No HTML is interpreted. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i} className="font-semibold">
            {p.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export function TierBadge({ tier }: { tier: Tier }) {
  const { t } = useI18n();
  const { cls, icon: Icon } = TIER_STYLE[tier] ?? TIER_STYLE.NONE;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      <Icon className="h-3.5 w-3.5" />
      {t(S.ask.tier[tier] ?? S.ask.tier.NONE)}
    </span>
  );
}

/** Renders a tutor answer: model text interleaved with verbatim stored sources. */
export function AnswerView({ data, compact = false, onFollowUp }: { data: AskResponse; compact?: boolean; onFollowUp?: (q: string) => void }) {
  const { t } = useI18n();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <TierBadge tier={data.tier} />
        {data.ai_generated && <span className="chip !py-0.5 !text-[0.7rem]">{t(S.common.aiLabel)}</span>}
      </div>
      {data.answer.map((b, i) =>
        b.type === "text" ? (
          <p key={i} className={`whitespace-pre-line text-ink ${compact ? "text-sm" : "text-[0.98rem] leading-relaxed"}`}>
            <Rich text={b.text} />
          </p>
        ) : (
          <SourceQuote key={i} id={b.id} source={data.sources[b.id]} compact />
        ),
      )}
      {data.referral && (
        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950">
          <p className="font-semibold">{t(S.ask.referralTitle)}</p>
          <p className="mt-1">{t(data.referral)}</p>
        </div>
      )}
      {onFollowUp && data.follow_ups?.length > 0 && (
        <div className="pt-1">
          <p className="mb-2 text-xs text-muted">{t(S.ask.followUps)}</p>
          <div className="flex flex-wrap gap-2">
            {data.follow_ups.map((q) => (
              <button key={q} onClick={() => onFollowUp(q)} className="chip transition hover:border-brand-300 hover:text-brand-800">
                {q}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
