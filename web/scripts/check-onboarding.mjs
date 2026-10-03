// Exercise real topic suggestions and UI handlers without a browser, storage or services.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";

function load(path, imports = {}) {
  const mod = { exports: {} };
  const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(compiled, { module: mod, exports: mod.exports, require: (name) => {
    if (name in imports) return imports[name];
    throw new Error("Unexpected module " + name);
  } });
  return mod.exports;
}
const plain = (value) => JSON.parse(JSON.stringify(value));
const schema = load("../src/lib/onboarding.ts");
const { EMPTY_PREFERENCES: empty, INTRODUCTION, PURPOSES, TOPICS, changePurposes } = schema;
const journeyModule = load("../src/lib/onboarding-journey.ts", { "./onboarding": schema });
const { suggestTopics } = journeyModule;
const content = JSON.parse(readFileSync(new URL("../src/generated/content.json", import.meta.url), "utf8"));
for (const reference of INTRODUCTION.references) {
  if (reference.sourceId) assert.ok(content.sources[reference.sourceId]?.url, "Stored intro reference must exist");
  assert.ok(reference.url.ar.startsWith("https://") && reference.url.en.startsWith("https://"));
}
assert.equal(INTRODUCTION.pillars.items.length, 5);
assert.deepEqual(plain(schema.ESSENTIALS.map((card) => card.id)), ["tawhid", "islam", "iman", "akhlaq"]);
for (const card of schema.ESSENTIALS) {
  assert.ok(card.items.length > 0 && card.items.every((item) => item.title.ar && item.title.en && item.body.ar && item.body.en));
  assert.ok(card.references.length > 0 && card.references.every((reference) => reference.url.ar.startsWith("https://") && reference.url.en.startsWith("https://")));
}
// All combinations: valid, unique, bounded suggestions, independent of click order.
for (let mask = 0; mask < 2 ** PURPOSES.length; mask++) {
  const purposes = PURPOSES.filter((_, index) => mask & (1 << index)).map((choice) => choice.id);
  const suggestions = suggestTopics(purposes);
  assert.ok(suggestions.length > 0 && suggestions.length <= 3);
  assert.equal(new Set(suggestions).size, suggestions.length);
  assert.ok(suggestions.every((id) => TOPICS.some((topic) => topic.id === id)));
  assert.deepEqual(plain(suggestions), plain(suggestTopics([...purposes].reverse())));
}
assert.deepEqual(plain(suggestTopics(["family"])), ["prayer", "ethics"]);
assert.deepEqual(plain(suggestTopics(["question"])), ["questions", "god"]);
assert.deepEqual(plain(suggestTopics(["family", "question"])), ["questions", "prayer", "god"]);
const confirmed = { ...empty, purposes: ["family"], interests: ["ethics", "quran"], topicsConfirmed: true };
assert.equal(changePurposes(confirmed, ["family"]), confirmed);
assert.deepEqual(plain(changePurposes(confirmed, ["curious"]).interests), []);
assert.equal(changePurposes(confirmed, ["curious"]).topicsConfirmed, false);
const withQuestion = { ...confirmed, purposes: ["question", "family"], questionText: "Example question" };
assert.equal(changePurposes(withQuestion, ["question", "basics"]).questionText, "Example question");
assert.equal(changePurposes(withQuestion, ["family"]).questionText, null);
assert.deepEqual(plain(changePurposes(confirmed, ["family", "question", "family"]).purposes), ["question", "family"]);

let state = { preferences: { ...empty, purposes: [], interests: [] }, topicDraft: null, screen: 0 };
const context = {
  get preferences() { return state.preferences; },
  get topicDraft() { return state.topicDraft; },
  get screen() { return state.screen; },
  setPreferences: (next) => { state.preferences = typeof next === "function" ? next(state.preferences) : next; },
  setTopicDraft: (next) => { state.topicDraft = typeof next === "function" ? next(state.topicDraft) : next; },
  setScreen: (next) => { state.screen = next; },
};
const session = { pushed: [], prefs: null, guest: false };
const { default: Page } = load("../src/app/start/explore/page.tsx", {
  "react/jsx-runtime": jsx,
  react: { useEffect: () => {}, useRef: () => ({ current: null }) },
  "next/navigation": { useRouter: () => ({ push: (url) => session.pushed.push(url) }) },
  "@/lib/session": { useSession: () => ({ user: null, guest: session.guest, startGuest: () => { session.guest = true; }, setPrefs: (prefs) => { session.prefs = prefs; } }) },
  "lucide-react": {}, "@/components/Logo": {}, "@/components/ui": {},
  "@/lib/content": { useContent: () => ({ sources: content.sources }) },
  "@/lib/i18n": { useI18n: () => ({ lang: "en", t: (label) => label?.en ?? "" }) },
  "@/lib/onboarding": schema, "@/lib/onboarding-journey": journeyModule,
  "@/lib/onboarding-state": { useOnboarding: () => context },
});
function nodes(node) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (typeof node.type === "function") return nodes(node.type(node.props));
  return [node, ...nodes(node.props?.children)];
}
const controls = () => nodes(Page());
const input = (name, value) => controls().find((node) => node.type === "input" && node.props.name === name && (value === undefined || node.props.value === value));
const button = (text) => controls().find((node) => node.type === "button" && [].concat(node.props.children).includes(text));
assert.equal(controls().filter((node) => node.type === "dialog").length, 4);
assert.equal(controls().filter((node) => node.type === "input").length, 0);
button("Find my starting point").props.onClick();
assert.equal(state.screen, 1);
assert.equal(controls().filter((node) => node.type === "input" && node.props.checked).length, 0);
assert.equal(input("purposes", "family").props.type, "checkbox");
input("purposes", "family").props.onChange();
input("purposes", "question").props.onChange();
assert.equal(input("purposes", "family").props.checked, true);
assert.equal(input("purposes", "question").props.checked, true);
assert.equal(controls().some((node) => node.type === "textarea"), true);
input("purposes", "question").props.onChange();
assert.equal(input("purposes", "family").props.checked, true);
assert.equal(controls().some((node) => node.type === "textarea"), false);
button("Suggest topics").props.onClick();
assert.equal(state.screen, 2);
assert.deepEqual(plain(state.topicDraft), ["prayer", "ethics"]);
assert.deepEqual(plain(state.preferences.interests), []);
assert.equal(state.preferences.topicsConfirmed, false);
input("interests", "prayer").props.onChange();
input("interests", "quran").props.onChange();
input("interests", "god").props.onChange();
assert.equal(input("interests", "prophet").props.disabled, true);
const edited = plain(state.topicDraft);
button("Back").props.onClick();
button("Suggest topics").props.onClick();
assert.deepEqual(plain(state.topicDraft), edited);
button("Confirm my topics").props.onClick();
assert.equal(state.preferences.topicsConfirmed, true);
assert.deepEqual(plain(state.preferences.interests), edited);
// Finishing goes to the dashboard as a guest on the Explore track.
assert.deepEqual(session.pushed, ["/app/learn/"]);
assert.deepEqual(plain(session.prefs), { track: "explore", onboarded: true });
assert.equal(session.guest, true);
button("Uncheck all").props.onClick();
button("Confirm my topics").props.onClick();
assert.deepEqual(plain(state.preferences.interests), []);
button("Back").props.onClick();
assert.equal(state.screen, 1);
input("purposes", "question").props.onChange();
const question = controls().find((node) => node.type === "textarea");
assert.equal(question.props.maxLength, 300);
question.props.onChange({ target: { value: "x".repeat(350) } });
assert.equal(state.preferences.questionText.length, 300);
button("Suggest topics").props.onClick();
button("Back").props.onClick();
assert.equal(state.preferences.questionText.length, 300);
button("Skip this question").props.onClick();
assert.equal(state.screen, 2);
assert.deepEqual(plain(state.preferences.purposes), []);
assert.equal(state.preferences.questionText, null);
button("Skip for now").props.onClick();
assert.deepEqual(plain(state.preferences), plain(empty));
assert.equal(session.pushed.length, 3);
console.log("Onboarding: four sourced intro cards with dialogs, all 32 purpose combinations, multiple selections, optional text, unconfirmed drafts, edits, topic limits, skips and the dashboard redirect passed.");
