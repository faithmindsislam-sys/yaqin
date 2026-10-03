"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { S } from "@/lib/strings";
import { LangToggle } from "./ui";
import { Logo } from "./Logo";
import { Menu } from "lucide-react";

export function SiteHeader() {
  const { t } = useI18n();
  const { user, guest } = useSession();
  const inApp = !!user || guest;
  return (
    <header className="site-header relative z-20">
      <div className="site-header-inner">
        <Logo />
        <nav className="site-nav desktop-nav" aria-label={t({ en: "Main navigation", ar: "التنقل الرئيسي" })}>
          <Link href="/library/">{t(S.nav.library)}</Link>
          <Link href="/ask/">{t(S.nav.ask)}</Link>
          <Link href="/#sources">{t(S.nav.sources)}</Link>
        </nav>
        <div className="flex items-center gap-3">
          <LangToggle className="header-lang" />
          {!inApp && <Link href="/signin/" className="header-signin text-sm text-ink-soft hover:text-brand-700">{t(S.nav.signIn)}</Link>}
          <Link href={inApp ? "/app/" : "/start/"} className="btn btn-primary text-sm">
            {t(inApp ? S.nav.dashboard : S.nav.getStarted)}
          </Link>
          <details className="mobile-menu">
            <summary aria-label={t({ en: "Navigation menu", ar: "قائمة التنقل" })}><Menu className="h-5 w-5" /></summary>
            <nav className="site-nav" aria-label={t({ en: "Mobile navigation", ar: "التنقل على الهاتف" })}>
              <Link href="/library/">{t(S.nav.library)}</Link>
              <Link href="/ask/">{t(S.nav.ask)}</Link>
              <Link href="/#sources">{t(S.nav.sources)}</Link>
              {!inApp && <Link href="/signin/">{t(S.nav.signIn)}</Link>}
              <LangToggle />
            </nav>
          </details>
        </div>
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
          <Logo compact />
          <div>
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
