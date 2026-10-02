"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { S } from "@/lib/strings";
import { LangToggle } from "./ui";
import { Logo, Mark } from "./Logo";

export function SiteHeader() {
  const { t } = useI18n();
  const { user, guest } = useSession();
  const inApp = !!user || guest;
  return (
    <header className="relative z-20 mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
      <Logo />
      <nav className="hidden items-center gap-7 text-sm text-ink-soft md:flex">
        <Link href="/" className="font-medium text-teal-700">{t(S.nav.home)}</Link>
        <Link href="/library/" className="hover:text-ink">{t(S.nav.library)}</Link>
        <Link href="/ask/" className="hover:text-ink">{t(S.nav.ask)}</Link>
        <Link href="/#sources" className="hover:text-ink">{t(S.nav.sources)}</Link>
        <Link href="/instructor/" className="hover:text-ink">{t(S.nav.educators)}</Link>
      </nav>
      <div className="flex items-center gap-2.5">
        <LangToggle className="hidden sm:inline-flex" />
        {inApp ? (
          <Link href="/app/" className="btn btn-primary !py-2 text-sm">{t(S.nav.dashboard)}</Link>
        ) : (
          <>
            <Link href="/signin/" className="btn btn-ghost !py-2 text-sm">{t(S.nav.signIn)}</Link>
            <Link href="/start/" className="btn btn-primary !py-2 text-sm">
              {t(S.nav.getStarted)} <span aria-hidden className="rtl:rotate-180">→</span>
            </Link>
          </>
        )}
      </div>
    </header>
  );
}

export function SiteFooter() {
  const { t } = useI18n();
  return (
    <footer className="border-t border-line bg-white/70">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-8 sm:px-8 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <Mark size={34} />
          <div>
            <p className="font-serif text-lg text-ink">Yaqin · يقين</p>
            <p className="text-sm text-ink-soft">{t(S.footer.line)}</p>
          </div>
        </div>
        <nav className="flex gap-6 text-sm text-ink-soft">
          <Link href="/#method" className="hover:text-ink">{t(S.footer.method)}</Link>
          <Link href="/#sources" className="hover:text-ink">{t(S.nav.sources)}</Link>
          <Link href="/privacy/" className="hover:text-ink">{t(S.footer.privacy)}</Link>
        </nav>
        <LangToggle />
      </div>
      <p className="mx-auto max-w-7xl px-5 pb-6 text-xs text-muted sm:px-8">{t(S.footer.ai)}</p>
    </footer>
  );
}
