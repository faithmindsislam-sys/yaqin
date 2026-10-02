"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { BookOpen, ClipboardCheck, Home, LibraryBig, LogOut, MessagesSquare } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { displayName, useSession } from "@/lib/session";
import { S } from "@/lib/strings";
import { hydrateFromRemote } from "@/lib/progress";
import { Logo } from "./Logo";
import { Skyline } from "./Scenery";
import { LangToggle } from "./ui";

const NAV = [
  { href: "/app/", icon: Home, label: S.nav.dashboard },
  { href: "/library/", icon: LibraryBig, label: S.nav.library },
  { href: "/ask/", icon: MessagesSquare, label: S.nav.ask },
  { href: "/instructor/", icon: ClipboardCheck, label: S.nav.instructor, staff: true },
];

/** Signed-in (or guest) application frame: sidebar on desktop, bottom bar on mobile. */
export function AppShell({ children, requireSession = true }: { children: React.ReactNode; requireSession?: boolean }) {
  const { t } = useI18n();
  const { ready, user, guest, role, signOut } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (ready && requireSession && !user && !guest) router.replace("/signin/");
  }, [ready, requireSession, user, guest, router]);

  useEffect(() => {
    if (user) void hydrateFromRemote();
  }, [user]);

  const items = NAV.filter((n) => !n.staff || role !== "learner");
  const name = displayName(user);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[15.5rem_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col border-e border-line bg-white/80 px-4 py-6 backdrop-blur lg:flex">
        <div className="px-2">
          <Logo href="/app/" />
          <p className="mt-2 text-xs text-teal-700">{t(S.motto)}</p>
        </div>
        <nav className="mt-8 flex flex-col gap-1">
          {items.map(({ href, icon: Icon, label }) => {
            const active = pathname?.startsWith(href.replace(/\/$/, ""));
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                  active ? "bg-teal-50 font-semibold text-teal-700" : "text-ink-soft hover:bg-sky-50"
                }`}
              >
                <Icon className="h-[1.1rem] w-[1.1rem]" />
                {t(label)}
              </Link>
            );
          })}
        </nav>
        <div className="relative mt-auto overflow-hidden rounded-2xl bg-gradient-to-b from-white to-teal-50 p-4">
          <Skyline className="pointer-events-none absolute inset-x-0 bottom-0 h-20 w-full opacity-60" />
          <p className="relative font-serif text-lg italic leading-snug text-ink-soft">{t(S.dash.keepGoing)}</p>
          <div className="relative h-12" />
        </div>
        <div className="mt-4 flex items-center justify-between gap-2 px-1">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{name ?? (guest ? (t({ en: "Guest", ar: "زائر" })) : "")}</p>
            <p className="text-xs text-muted capitalize">{role}</p>
          </div>
          <button onClick={() => signOut().then(() => router.push("/"))} className="rounded-lg p-2 text-muted hover:bg-sky-50 hover:text-ink" title={t(S.nav.signOut)}>
            <LogOut className="h-4 w-4 rtl:rotate-180" />
          </button>
        </div>
      </aside>

      <div className="min-w-0 pb-20 lg:pb-0">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-sky-50/85 px-4 py-3 backdrop-blur sm:px-6 lg:justify-end">
          <div className="lg:hidden">
            <Logo compact href="/app/" />
          </div>
          <LangToggle />
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-line bg-white/95 backdrop-blur lg:hidden">
        {[...items.slice(0, 3), { href: "/library/", icon: BookOpen, label: S.nav.learn }].slice(0, 4).map(({ href, icon: Icon, label }, i) => (
          <Link key={href + i} href={href} className={`flex flex-col items-center gap-1 py-2.5 text-[0.7rem] ${pathname?.startsWith(href.replace(/\/$/, "")) ? "text-teal-700" : "text-muted"}`}>
            <Icon className="h-5 w-5" />
            {t(label)}
          </Link>
        ))}
      </nav>
    </div>
  );
}
