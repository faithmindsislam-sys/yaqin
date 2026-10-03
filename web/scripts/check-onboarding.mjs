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
assert.deepEqual(plain(suggestTopics(["life"])), ["prayer", "ethics"]);
assert.deepEqual(plain(suggestTopics(["question"])), ["questions", "god"]);
assert.deepEqual(plain(suggestTopics(["life", "question"])), ["prayer", "questions", "ethics"]);
const confirmed = { ...empty, purposes: ["life"], interests: ["ethics", "quran"], topicsConfirmed: true };
assert.equal(changePurposes(confirmed, ["life"]), confirmed);
assert.deepEqual(plain(changePurposes(confirmed, ["prophets"]).interests), []);
assert.equal(changePurposes(confirmed, ["prophets"]).topicsConfirmed, false);
const withQuestion = { ...confirmed, purposes: ["question", "life"], questionText: "Example question" };
assert.equal(changePurposes(withQuestion, ["question", "god"]).questionText, "Example question");
assert.equal(changePurposes(withQuestion, ["life"]).questionText, null);
assert.deepEqual(plain(changePurposes(confirmed, ["life", "question", "life"]).purposes), ["life", "question"]);

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
  "@/lib/content": { useContent: () => ({ sources: content.sources, trackLessons: (id) => content.tracks.find((track) => track.id === id)?.modules.flatMap((module) => module.lessons).map((id) => content.lessons[id]).filter(Boolean) ?? [] }) },
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
const introNodes = controls();
const testimonyCard = introNodes.find((node) => node.props?.["aria-labelledby"] === "shahada-title");
assert.ok(nodes(introNodes.find((node) => node.type === "dialog" && node.props.id === "essential-tawhid")).includes(testimonyCard), "Testimonies belong inside the Oneness of Allah dialog");
for (const dialog of introNodes.filter((node) => node.type === "dialog" && node.props.id !== "essential-tawhid")) {
  assert.ok(!nodes(dialog).includes(testimonyCard));
}
button("Personalized journey").props.onClick();
assert.equal(state.screen, 1);
assert.equal(controls().filter((node) => node.type === "input" && node.props.checked).length, 0);
assert.equal(input("purposes", "question"), undefined);
assert.equal(button("Show my suggested journey").props.disabled, true);
button("Show my suggested journey").props.onClick();
assert.equal(state.screen, 1);
assert.equal(input("purposes", "life").props.type, "checkbox");
input("purposes", "life").props.onChange();
input("purposes", "quran").props.onChange();
assert.equal(input("purposes", "life").props.checked, true);
assert.equal(input("purposes", "quran").props.checked, true);
assert.equal(button("Show my suggested journey").props.disabled, false);
input("purposes", "quran").props.onChange();
assert.equal(input("purposes", "life").props.checked, true);
assert.equal(controls().some((node) => node.type === "textarea"), false);
button("Show my suggested journey").props.onClick();
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
button("Show my suggested journey").props.onClick();
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
button("Clear choices").props.onClick();
assert.equal(button("Show my suggested journey").props.disabled, true);
button("Show my suggested journey").props.onClick();
assert.equal(state.screen, 1);
context.setPreferences({ ...empty, purposes: ["question"], interests: [] });
assert.equal(button("Show my suggested journey").props.disabled, true, "A hidden old choice cannot enable the button");
context.setPreferences({ ...empty, purposes: [], interests: [] }); context.setTopicDraft(null); context.setScreen(2);
assert.equal(state.screen, 2);
assert.deepEqual(plain(state.preferences.purposes), []);
assert.equal(state.preferences.questionText, null);
button("Skip for now").props.onClick();
assert.deepEqual(plain(state.preferences), plain(empty));
assert.equal(session.pushed.length, 3);
state = { preferences: { ...empty, purposes: [], interests: [] }, topicDraft: null, screen: 0 };
session.pushed = [];
session.guest = false;
button("Basic journey").props.onClick();
const firstExploreLesson = content.tracks.find((track) => track.id === "explore").modules.flatMap((module) => module.lessons)[0];
assert.deepEqual(session.pushed, [`/lesson/?id=${encodeURIComponent(firstExploreLesson)}`]);
assert.deepEqual(plain(session.prefs), { track: "explore", onboarded: true });
assert.equal(session.guest, true);
assert.equal(state.screen, 0, "Exploring basics bypasses personalization");
assert.deepEqual(plain(state.preferences), plain(empty), "Exploring basics does not record answers");
console.log("Onboarding: testimonies inside the Oneness dialog, direct basics lesson, optional personalization, all 128 interest combinations, topic limits, skips and dashboard redirects passed.");
