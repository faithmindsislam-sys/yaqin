"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/lib/session";
import { useI18n } from "@/lib/i18n";
import { useBrowserValue, useIsClient } from "@/lib/store";

export default function AuthCallbackPage() {
  const { ready, user, authError } = useSession();
  const { t } = useI18n();
  const router = useRouter();
  const checked = useIsClient();
  const linkError = useBrowserValue(() => new URLSearchParams(location.hash.slice(1)).get("error_description") ?? new URLSearchParams(location.search).get("error_description"), null);
  useEffect(() => {
    if (checked && ready && user && !linkError && !authError) router.replace("/app/");
  }, [checked, ready, user, linkError, authError, router]);
  const error = linkError ?? authError ?? (checked && ready && !user ? t({ en: "The login link is invalid or expired. Please sign in again.", ar: "رابط الدخول غير صالح أو منتهي. سجّل الدخول مجددًا." }) : null);
  return <main className="mx-auto max-w-lg p-8">
    <p role={error ? "alert" : "status"}>{error ?? t({ en: "Completing sign in…", ar: "جارٍ إكمال تسجيل الدخول…" })}</p>
    {error && <Link className="btn btn-primary mt-5" href="/signin/">{t({ en: "Sign in", ar: "تسجيل الدخول" })}</Link>}
  </main>;
}
