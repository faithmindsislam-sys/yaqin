import { PURPOSES, type PurposeId, type TopicId } from "./onboarding";

const TOPICS_BY_PURPOSE: Record<PurposeId, TopicId[]> = {
  basics: ["god", "quran", "prophet"],
  question: ["questions", "god"],
  family: ["prayer", "ethics"],
  exploring: ["god", "quran", "prayer"],
  curious: ["questions", "prophet"],
};

/** Alternate between selected reasons so one reason cannot fill all three slots. */
export function suggestTopics(purposes: PurposeId[]): TopicId[] {
  const selected = PURPOSES.filter((choice) => purposes.includes(choice.id));
  if (!selected.length) return ["god", "quran", "questions"];
  const candidates = [0, 1, 2].flatMap((index) => selected.flatMap((choice) => TOPICS_BY_PURPOSE[choice.id].slice(index, index + 1)));
  return [...new Set(candidates)].slice(0, 3);
}

