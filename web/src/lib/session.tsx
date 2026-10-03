"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { readStored, useIsClient, useStored, writeStored } from "./store";
import { supabase } from "./supabase";
import { activateAccount, hydrateFromRemote, ACCOUNT_KEY, PROGRESS_ERROR } from "./progress";
import type { TrackId } from "./types";
import { normalizeRole, type Role } from "./roles";

export type { Role } from "./roles";
export type Prefs = { track: TrackId | null; minutes: number; onboarded: boolean; known: string[] };
type Session = {
  ready: boolean; user: User | null; guest: boolean; role: Role; prefs: Prefs; authAvailable: boolean;
  syncError: string | null; authError: string | null; retrySync: () => Promise<void>;
  startGuest: () => void; setPrefs: (p: Partial<Prefs>) => void; signOut: () => Promise<void>;
};
const Ctx = createContext<Session | null>(null);
const GUEST_KEY = "yaqin.guest";
const PREFS_KEY = "yaqin.prefs";
const PROFILE_ERROR = "yaqin.sync.profile";
const DEFAULT_PREFS: Prefs = { track: null, minutes: 10, onboarded: false, known: [] };
const prefsKey = (uid: string | null) => uid ? `${PREFS_KEY}.${uid}` : PREFS_KEY;
const pendingKey = (uid: string) => `${PREFS_KEY}.${uid}.pending`;
function parsePrefs(raw: string | null): Prefs {
  try { return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS; }
  catch { return DEFAULT_PREFS; }
}
const errorText = (e: unknown) => e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String(e.message) : "Your changes could not be synced.";

let profileWrites: Promise<void> = Promise.resolve();
function saveProfile(uid: string) {
  profileWrites = profileWrites.catch(() => {}).then(async () => {
    const sb = supabase();
    if (!sb || readStored(ACCOUNT_KEY) !== uid) return;
    const raw = readStored(prefsKey(uid));
    const p = parsePrefs(raw);
    const lang = readStored("yaqin.lang") ?? "en";
    const { error } = await sb.from("profiles").update({ preferred_track: p.track,
      daily_minutes: p.minutes, onboarded: p.onboarded, known_lessons: p.known, lang }).eq("id", uid);
    if (error) throw error;
    if (readStored(ACCOUNT_KEY) !== uid) return;
    if (readStored(prefsKey(uid)) === raw && readStored("yaqin.lang") === lang) writeStored(pendingKey(uid), null);
    writeStored(PROFILE_ERROR, null);
  }).catch((e: unknown) => {
    if (readStored(ACCOUNT_KEY) === uid) writeStored(PROFILE_ERROR, errorText(e));
  });
  return profileWrites;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const isClient = useIsClient();
  const sb = isClient ? supabase() : null;
  const [authLoaded, setAuthLoaded] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<{ uid: string; role: Role } | null>(null);
  const [profileLoaded, setProfileLoaded] = useState<string | null>(null);
  const guest = useStored(GUEST_KEY) === "1";
  const rawPrefs = useStored(prefsKey(user?.id ?? null));
  const prefs = useMemo(() => parsePrefs(rawPrefs), [rawPrefs]);
  const progressError = useStored(PROGRESS_ERROR);
  const profileError = useStored(PROFILE_ERROR);

  useEffect(() => {
    if (!sb) return;
    let active = true;
    const apply = (next: User | null) => {
      activateAccount(next?.id ?? null);
      setUser(next);
      setAuthLoaded(true);
    };
    sb.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setAuthError(error.message);
      apply(data.session?.user ?? null);
    }).catch((e: unknown) => { if (active) { setAuthError(errorText(e)); setAuthLoaded(true); } });
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      // Keep Supabase calls out of the auth callback (the auth client holds a lock).
      if (active) apply(session?.user ?? null);
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, [sb]);

  const retrySync = useCallback(async () => {
    if (!sb || !user) return;
    const uid = user.id;
    await profileWrites;
    try {
      const { data, error } = await sb.from("profiles")
        .select("role, preferred_track, lang, daily_minutes, onboarded, known_lessons").eq("id", uid).single();
      if (readStored(ACCOUNT_KEY) !== uid) return;
      if (error) throw error;
      const local = parsePrefs(readStored(prefsKey(uid)));
      const guestPrefs = parsePrefs(readStored(PREFS_KEY));
      const pending = readStored(pendingKey(uid)) === "1";
      const remote: Prefs = { track: data.preferred_track, minutes: data.daily_minutes,
        onboarded: data.onboarded || !!data.preferred_track, known: data.known_lessons ?? [] };
      const next = pending ? local : remote.onboarded ? remote : guestPrefs.onboarded ? guestPrefs : remote;
      writeStored(prefsKey(uid), JSON.stringify(next));
      // Honor the signup email language before importing guest preferences.
      const accountLanguage = user.user_metadata?.lang;
      if (!pending && (remote.onboarded || accountLanguage === "en" || accountLanguage === "ar")) writeStored("yaqin.lang", data.lang);
      setProfile({ uid, role: normalizeRole(data.role) });
      writeStored(PROFILE_ERROR, null);
      if (pending || (!remote.onboarded && guestPrefs.onboarded)) {
        writeStored(pendingKey(uid), "1");
        await saveProfile(uid);
      }
      // Guest preferences have now been copied into the account cache.
      writeStored(PREFS_KEY, null);
    } catch (e) {
      if (readStored(ACCOUNT_KEY) === uid) writeStored(PROFILE_ERROR, errorText(e));
    } finally {
      if (readStored(ACCOUNT_KEY) === uid) setProfileLoaded(uid);
    }
    try { await hydrateFromRemote(uid); }
    catch (e) { if (readStored(ACCOUNT_KEY) === uid) writeStored(PROGRESS_ERROR, errorText(e)); }
  }, [sb, user]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- Hydrates the signed-in account from Supabase asynchronously.
  useEffect(() => { if (user) void retrySync(); }, [user, retrySync]);

  // Language changes use the same profile save queue as onboarding preferences.
  useEffect(() => {
    if (!user) return;
    const uid = user.id;
    const syncLanguage = () => {
      writeStored(pendingKey(uid), "1");
      void saveProfile(uid);
    };
    window.addEventListener("yaqin:language", syncLanguage);
    return () => window.removeEventListener("yaqin:language", syncLanguage);
  }, [user]);

  const startGuest = useCallback(() => writeStored(GUEST_KEY, "1"), []);
  const setPrefs = useCallback((patch: Partial<Prefs>) => {
    const uid = user?.id ?? null;
    writeStored(prefsKey(uid), JSON.stringify({ ...parsePrefs(readStored(prefsKey(uid))), ...patch }));
    if (uid) { writeStored(pendingKey(uid), "1"); void saveProfile(uid); }
  }, [user]);

  const signOut = useCallback(async () => {
    const res = await sb?.auth.signOut();
    if (res?.error) { setAuthError(res.error.message); return; }
    activateAccount(null);
    writeStored(GUEST_KEY, null);
    writeStored(PROFILE_ERROR, null);
    setUser(null);
    setProfile(null);
  }, [sb]);

  const role = user && profile?.uid === user.id ? profile.role : "learner";
  const ready = isClient && (!sb || (authLoaded && (!user || profileLoaded === user.id)));
  const value = useMemo<Session>(() => ({ ready, user, guest, role, prefs,
    authAvailable: !!sb || !isClient, syncError: profileError ?? progressError, authError,
    retrySync, startGuest, setPrefs, signOut }),
    [ready, user, guest, role, prefs, sb, isClient, profileError, progressError, authError, retrySync, startGuest, setPrefs, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession outside SessionProvider");
  return v;
}
export function displayName(user: User | null): string | null {
  const meta = user?.user_metadata as { full_name?: string; name?: string } | undefined;
  return meta?.full_name ?? meta?.name ?? user?.email?.split("@")[0] ?? null;
}
