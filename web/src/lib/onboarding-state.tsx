"use client";

import { createContext, useContext, useState, type Dispatch, type SetStateAction } from "react";
import { EMPTY_PREFERENCES, type OnboardingPreferences, type TopicId } from "./onboarding";

const Context = createContext<{
  preferences: OnboardingPreferences;
  setPreferences: Dispatch<SetStateAction<OnboardingPreferences>>;
  topicDraft: TopicId[] | null;
  setTopicDraft: Dispatch<SetStateAction<TopicId[] | null>>;
  screen: number;
  setScreen: Dispatch<SetStateAction<number>>;
} | null>(null);

/** Deliberately memory-only: never connected to session preferences or browser storage. */
export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferences] = useState<OnboardingPreferences>(() => ({ ...EMPTY_PREFERENCES, purposes: [], interests: [] }));
  const [screen, setScreen] = useState(0);
  const [topicDraft, setTopicDraft] = useState<TopicId[] | null>(null);
  return <Context.Provider value={{ preferences, setPreferences, topicDraft, setTopicDraft, screen, setScreen }}>{children}</Context.Provider>;
}

export function useOnboarding() {
  const value = useContext(Context);
  if (!value) throw new Error("useOnboarding outside OnboardingProvider");
  return value;
}
