"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { ArrowLeft, Users, BookOpenText, ClipboardCheck, Compass, Home, LibraryBig, LogOut, MessagesSquare, Scale } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { displayName, useSession } from "@/lib/session";
import { S } from "@/lib/strings";
import { Logo } from "./Logo";
import { LangToggle, TRACK_META } from "./ui";
import { useContent } from "@/lib/content";
import { isStaff } from "@/lib/roles";

const NAV = [
  { href: "/app/", icon: Compass, label: { en: "Choose track", ar: "اختر مسارك" } },
  { href: "/app/learn/", icon: Home, label: S.nav.dashboard },
  { href: "/library/", icon: LibraryBig, label: S.nav.library },
  { href: "/quran/", icon: BookOpenText, label: S.nav.quran, short: S.nav.quranShort },
  { href: "/compare/", icon: Scale, label: S.nav.compare, short: S.nav.compareShort },
  { href: "/ask/", icon: MessagesSquare, label: S.nav.ask },
  { href: "/studio/", icon: ClipboardCheck, label: S.nav.instructor, staff: true },
];

const STUDIO_NAV = [
  { href: "/studio/", icon: ClipboardCheck, label: S.instructor.lessons, superAdmin: false },
  { href: "/studio/sources/", icon: LibraryBig, label: S.instructor.sources, superAdmin: false },
  { href: "/studio/users/", icon: Users, label: S.users.title, superAdmin: true },
  { href: "/app/learn/", icon: ArrowLeft, label: S.instructor.backToApp, short: S.instructor.backToApp, superAdmin: false },
];

/** Signed-in (or guest) application frame: sidebar on desktop, bottom bar on mobile. */
export function AppShell({ children, requireSession = true }: { children: React.ReactNode; requireSession?: boolean }) {
  const { t } = useI18n();
  const { ready, user, guest, role, prefs, signOut, syncError, authError, retrySync } = useSession();
  const { getTrack } = useContent();
  const track = prefs.track ? getTrack(prefs.track) : undefined;
  const TrackIcon = prefs.track ? TRACK_META[prefs.track].icon : null;
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (ready && requireSession && !user && !guest) router.replace("/signin/");
  }, [ready, requireSession, user, guest, router]);


  const studio = pathname.startsWith("/studio");
  const items = studio ? STUDIO_NAV.filter((n) => !n.superAdmin || role === "super_admin") : NAV.filter((n) => !n.staff || isStaff(role));
  const isActive = (href: string) => href === "/app/" ? pathname === href
    : href === "/studio/" ? pathname === "/studio/" || pathname === "/studio"
    : pathname.startsWith(href.replace(/\/$/, ""));
  const name = displayName(user);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[15.5rem_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col border-e border-line bg-white/80 px-4 py-6 backdrop-blur lg:flex">
        <div className="px-2">
          <Logo href="/app/" />
          <p className="mt-2 text-xs text-brand-700">{t(S.motto)}</p>
          {track && TrackIcon && (
            <Link href="/app/" className="chip mt-3 inline-flex items-center gap-1.5 hover:bg-brand-100">
              <TrackIcon className="h-3.5 w-3.5" /> {t(track.title)}
            </Link>
          )}
        </div>
        <nav className="mt-8 flex flex-col gap-1">
          {items.map(({ href, icon: Icon, label }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                aria-current={active ? "page" : undefined}
                href={href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                  active ? "bg-brand-50 font-semibold text-brand-700" : "text-ink-soft hover:bg-sky-50"
                }`}
              >
                <Icon className="h-[1.1rem] w-[1.1rem] shrink-0" />
                {t(label)}
              </Link>
            );
          })}
        </nav>
        <p className="mt-auto px-3 py-6 text-sm leading-relaxed text-muted">{t(S.motto)}</p>
        <div className="mt-4 flex items-center justify-between gap-2 px-1">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{name ?? (guest ? (t({ en: "Guest", ar: "زائر" })) : "")}</p>
            <p className="text-xs text-muted capitalize">{role.replaceAll("_", " ")}</p>
          </div>
          <button onClick={() => signOut().then(() => router.push("/"))} className="rounded-lg p-2 text-muted hover:bg-sky-50 hover:text-ink" title={t(S.nav.signOut)}>
            <LogOut className="h-4 w-4 rtl:rotate-180" />
          </button>
        </div>
      </aside>

      <div className="min-w-0 pb-20 lg:pb-0">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-sky-50/95 px-4 py-3 backdrop-blur sm:px-6 lg:justify-end">
          <div className="lg:hidden">
            <Logo compact href="/app/" />
          </div>
          <LangToggle />
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
          {(syncError || authError) && <div role="alert" className="mb-5 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            <p>{t({ en: "Your changes are saved on this device, but account sync needs attention.", ar: "حُفظت تغييراتك على هذا الجهاز، لكن مزامنة الحساب تحتاج إلى معالجة." })}</p>
            <p>{syncError ?? authError}</p>
            <button className="mt-2 underline" onClick={() => void retrySync()}>{t({ en: "Retry sync", ar: "إعادة المزامنة" })}</button>
          </div>}
          {ready || !requireSession ? children : <p>{t({ en: "Loading your account…", ar: "جارٍ تحميل حسابك…" })}</p>}
        </main>
      </div>

      <nav aria-label={t(studio ? S.instructor.navigation : { en: "Learning navigation", ar: "التنقل في التعلّم" })} className="fixed inset-x-0 bottom-0 z-40 grid border-t border-line bg-white/95 backdrop-blur lg:hidden" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)`, paddingBottom: "env(safe-area-inset-bottom)" }}>
        {items.map(({ href, icon: Icon, label, short }) => (
          <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined} className={`flex flex-col items-center gap-1 px-0.5 py-2.5 text-center text-[0.7rem] leading-tight ${isActive(href) ? "text-brand-700" : "text-muted"}`}>
            <Icon className="h-5 w-5" />
            {t(short ?? label)}
          </Link>
        ))}
      </nav>
    </div>
  );
}
