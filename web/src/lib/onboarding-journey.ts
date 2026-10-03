import { PURPOSES, type PurposeId, type TopicId } from "./onboarding";

const TOPICS_BY_PURPOSE: Record<PurposeId, TopicId[]> = {
  god: ["god"],
  prophets: ["prophet"],
  quran: ["quran"],
  question: ["questions", "god"],
  life: ["prayer", "ethics"],
  evidence: ["questions", "god", "quran"],
  religions: ["beliefs"],
};

/** Alternate between selected reasons so one reason cannot fill all three slots. */
export function suggestTopics(purposes: PurposeId[]): TopicId[] {
  const selected = PURPOSES.filter((choice) => purposes.includes(choice.id));
  if (!selected.length) return ["god", "quran", "questions"];
  const candidates = [0, 1, 2].flatMap((index) => selected.flatMap((choice) => TOPICS_BY_PURPOSE[choice.id].slice(index, index + 1)));
  return [...new Set(candidates)].slice(0, 3);
}

