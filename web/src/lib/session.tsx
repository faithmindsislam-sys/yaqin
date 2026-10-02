"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { readStored, useIsClient, useStored, writeStored } from "./store";
import { supabase } from "./supabase";
import type { TrackId } from "./types";

export type Role = "learner" | "instructor" | "reviewer";

export type Prefs = { track: TrackId | null; minutes: number; onboarded: boolean; known: string[] };

type Session = {
  ready: boolean;
  user: User | null;
  guest: boolean;
  role: Role;
  prefs: Prefs;
  authAvailable: boolean;
  startGuest: () => void;
  setPrefs: (p: Partial<Prefs>) => void;
  signOut: () => Promise<void>;
};

const Ctx = createContext<Session | null>(null);
const GUEST_KEY = "yaqin.guest";
const PREFS_KEY = "yaqin.prefs";
const DEFAULT_PREFS: Prefs = { track: null, minutes: 10, onboarded: false, known: [] };

function parsePrefs(raw: string | null): Prefs {
  if (!raw) return DEFAULT_PREFS;
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const isClient = useIsClient();
  const sb = isClient ? supabase() : null;
  const [authLoaded, setAuthLoaded] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<{ uid: string; role: Role; track: TrackId | null } | null>(null);
  const guest = useStored(GUEST_KEY) === "1";
  const rawPrefs = useStored(PREFS_KEY);
  const localPrefs = useMemo(() => parsePrefs(rawPrefs), [rawPrefs]);

  useEffect(() => {
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setAuthLoaded(true);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, [sb]);

  // Role and saved track come from the learner's own profile row (RLS).
  useEffect(() => {
    if (!sb || !user) return;
    sb.from("profiles")
      .select("role, preferred_track")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setProfile({ uid: user.id, role: (data?.role as Role) ?? "learner", track: data?.preferred_track ?? null }));
  }, [sb, user]);

  const ownProfile = user && profile?.uid === user.id ? profile : null;
  const role: Role = ownProfile?.role ?? "learner";
  const prefs = useMemo<Prefs>(
    () => (ownProfile?.track && !localPrefs.track ? { ...localPrefs, track: ownProfile.track, onboarded: true } : localPrefs),
    [localPrefs, ownProfile],
  );
  const ready = isClient && (!sb || authLoaded);

  const startGuest = useCallback(() => writeStored(GUEST_KEY, "1"), []);

  const setPrefs = useCallback(
    (p: Partial<Prefs>) => {
      writeStored(PREFS_KEY, JSON.stringify({ ...parsePrefs(readStored(PREFS_KEY)), ...p }));
      if (sb && user && p.track) {
        sb.from("profiles").update({ preferred_track: p.track }).eq("id", user.id).then(() => {});
      }
    },
    [sb, user],
  );

  const signOut = useCallback(async () => {
    await sb?.auth.signOut();
    writeStored(GUEST_KEY, null);
    setUser(null);
  }, [sb]);

  const value = useMemo<Session>(
    () => ({ ready, user, guest, role, prefs, authAvailable: !!sb || !isClient, startGuest, setPrefs, signOut }),
    [ready, user, guest, role, prefs, sb, isClient, startGuest, setPrefs, signOut],
  );

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
