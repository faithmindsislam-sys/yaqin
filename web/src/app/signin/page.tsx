"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BookOpenText, Cpu, Eye, EyeOff, Lock, Mail, UserRound, Users } from "lucide-react";
import { Logo } from "@/components/Logo";
import { ArchFrame, Skyline } from "@/components/Scenery";
import { LangToggle, SourceQuote } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { S } from "@/lib/strings";
import { supabase } from "@/lib/supabase";

export default function SignIn() {
  const { t } = useI18n();
  const { ready, user, prefs, startGuest, authAvailable } = useSession();
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && user) router.replace(prefs.onboarded ? "/app/" : "/start/");
  }, [ready, user, prefs.onboarded, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const sb = supabase();
    if (!sb) return setError(t(S.auth.unavailable));
    setBusy(true);
    setError(null);
    setMessage(null);
    const res =
      mode === "in"
        ? await sb.auth.signInWithPassword({ email, password })
        : await sb.auth.signUp({ email, password, options: { data: { full_name: name }, emailRedirectTo: `${location.origin}/start/` } });
    setBusy(false);
    if (res.error) return setError(res.error.message);
    if (mode === "up" && !res.data.session) setMessage(t(S.auth.checkEmail));
  }

  async function google() {
    const sb = supabase();
    if (!sb) return setError(t(S.auth.unavailable));
    const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${location.origin}/start/` } });
    if (error) setError(error.message);
  }

  async function forgot() {
    const sb = supabase();
    if (!sb || !email) return;
    await sb.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/signin/` });
    setMessage(t(S.auth.resetSent));
  }

  function guest() {
    startGuest();
    router.push(prefs.onboarded ? "/app/" : "/start/");
  }

  return (
    <div className="min-h-screen p-3 sm:p-5">
      <div className="mx-auto grid min-h-[calc(100vh-2.5rem)] max-w-7xl overflow-hidden rounded-[2rem] border border-line bg-white shadow-[var(--shadow-lift)] lg:grid-cols-[1.1fr_1fr]">
        {/* Story side */}
        <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-b from-sky-100 via-sky-50 to-teal-50 p-12 lg:flex">
          <Skyline className="absolute inset-x-0 bottom-0 h-[55%] w-full" />
          <ArchFrame className="absolute -start-10 bottom-0 h-[95%] opacity-90 rtl:-scale-x-100" />
          <div className="relative ms-28 max-w-md">
            <p className="eyebrow">{t(S.motto)}</p>
            <h1 className="mt-5 font-serif text-5xl leading-[1.1] text-ink">
              {t(S.auth.sideTitle1)}
              <br />
              <span className="italic text-teal-600">{t(S.auth.sideTitle2)}</span>
            </h1>
            <div className="my-6 h-0.5 w-14 bg-teal-400" />
            <p className="text-lg text-ink-soft">{t(S.auth.sideSub)}</p>
            <div className="mt-8 grid grid-cols-3 gap-4 text-sm">
              {[
                { icon: BookOpenText, title: S.pillars.sources, sub: S.pillars.sourcesSub },
                { icon: Cpu, title: S.pillars.ai, sub: S.pillars.aiSub },
                { icon: Users, title: S.pillars.everyone, sub: S.pillars.everyoneSub },
              ].map(({ icon: Icon, title, sub }) => (
                <div key={title.en}>
                  <Icon className="h-7 w-7 text-teal-600" />
                  <p className="mt-2 font-semibold text-ink">{t(title)}</p>
                  <p className="text-xs text-muted">{t(sub)}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="relative ms-auto max-w-sm">
            <SourceQuote id="quran:20:114" compact />
          </div>
        </div>

        {/* Form side */}
        <div className="flex flex-col px-6 py-8 sm:px-12">
          <div className="flex justify-end">
            <LangToggle />
          </div>
          <div className="mx-auto w-full max-w-md flex-1 py-8">
            <div className="flex flex-col items-center text-center">
              <Logo />
              <p className="mt-2 text-sm text-muted">{t(S.brandTagline)}</p>
              <h2 className="mt-8 font-serif text-4xl text-ink">{t(mode === "in" ? S.auth.welcome : S.auth.create)}</h2>
              <p className="mt-2 text-ink-soft">{t(mode === "in" ? S.auth.welcomeSub : S.auth.createSub)}</p>
            </div>

            {!authAvailable && <p className="mt-6 rounded-xl bg-sky-100 p-3 text-sm text-ink-soft">{t(S.auth.unavailable)}</p>}

            <form onSubmit={submit} className="mt-8 space-y-4">
              {mode === "up" && (
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">{t(S.auth.name)}</span>
                  <div className="relative">
                    <UserRound className="absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                    <input className="input ps-10" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                  </div>
                </label>
              )}
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">{t(S.auth.email)}</span>
                <div className="relative">
                  <Mail className="absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <input className="input ps-10" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" dir="ltr" />
                </div>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">{t(S.auth.password)}</span>
                <div className="relative">
                  <Lock className="absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <input
                    className="input pe-11 ps-10"
                    type={show ? "text" : "password"}
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === "in" ? "current-password" : "new-password"}
                    dir="ltr"
                  />
                  <button type="button" onClick={() => setShow(!show)} className="absolute end-3 top-1/2 -translate-y-1/2 p-1 text-muted" aria-label="Toggle password visibility">
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </label>
              {mode === "in" && (
                <div className="flex justify-end text-sm">
                  <button type="button" onClick={forgot} className="text-teal-700 hover:underline">{t(S.auth.forgot)}</button>
                </div>
              )}
              {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
              {message && <p className="rounded-xl bg-teal-50 p-3 text-sm text-teal-800" role="status">{message}</p>}
              <button className="btn btn-primary w-full !py-3.5 text-base" disabled={busy || !authAvailable}>
                {t(mode === "in" ? S.auth.signIn : S.auth.signUp)} <span aria-hidden className="rtl:rotate-180">→</span>
              </button>
            </form>

            <div className="my-6 flex items-center gap-3 text-xs text-muted">
              <span className="h-px flex-1 bg-line" />
              {t(S.auth.or)}
              <span className="h-px flex-1 bg-line" />
            </div>

            <div className="space-y-3">
              <button onClick={google} disabled={!authAvailable} className="btn btn-ghost w-full !py-3">
                <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
                  <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
                  <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                  <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                  <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
                </svg>
                {t(S.auth.google)}
              </button>
              <button onClick={guest} className="btn btn-ghost w-full !justify-start !rounded-2xl !px-5 !py-3 text-start">
                <Users className="h-6 w-6 text-teal-600" />
                <span>
                  <span className="block font-medium">{t(S.auth.guest)}</span>
                  <span className="block text-xs text-muted">{t(S.auth.guestSub)}</span>
                </span>
              </button>
            </div>

            <p className="mt-8 border-t border-line pt-6 text-center text-sm text-ink-soft">
              {t(mode === "in" ? S.auth.noAccount : S.auth.haveAccount)}{" "}
              <button onClick={() => setMode(mode === "in" ? "up" : "in")} className="font-medium text-teal-700 hover:underline">
                {t(mode === "in" ? S.auth.signUp : S.auth.signIn)}
              </button>
            </p>
          </div>
          <nav className="flex justify-center gap-6 text-xs text-muted">
            <Link href="/">{t(S.nav.home)}</Link>
            <Link href="/privacy/">{t(S.footer.privacy)}</Link>
          </nav>
        </div>
      </div>
    </div>
  );
}
