// Run actual role and API modules with fake services; no credentials or backend needed.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";

function load(path, imports = {}, globals = {}) {
  const mod = { exports: {} };
  const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(compiled, { module: mod, exports: mod.exports, ...globals, require: (name) => {
    if (name in imports) return imports[name];
    throw new Error("Unexpected module " + name);
  } });
  return mod.exports;
}
const roles = load("../src/lib/roles.ts");
for (const [input, expected] of [["learner", "learner"], ["teacher", "teacher"], ["admin", "admin"],
  ["super_admin", "super_admin"], ["instructor", "teacher"], ["reviewer", "admin"], ["unknown", "learner"], [null, "learner"]]) {
  assert.equal(roles.normalizeRole(input), expected);
}
assert.equal(roles.isStaff("learner"), false);
assert.equal(roles.isStaff("unknown"), false);
assert.equal(roles.canReview("teacher"), false);
assert.equal(roles.canReview("admin"), true);
assert.equal(roles.canReview("super_admin"), true);

let networkCalls = 0;
const api = load("../src/lib/api.ts", { "./supabase": { getAccessToken: () => { throw new Error("Auth must not be requested"); } } }, {
  process: { env: { NEXT_PUBLIC_API_ENABLED: "false" } },
  fetch: () => { networkCalls++; throw new Error("API must not be requested"); },
});
assert.equal(api.apiEnabled, false);
await assert.rejects(api.staffLessons(), (e) => e.status === 503 && e.code === "backend_unavailable");
assert.equal(networkCalls, 0);

// Drive the real ContentProvider's refresh callback and inspect its resulting state.
async function contentScenario({ enabled, savedFails = false, liveFails = false, savedData,
  pathname = "/app/learn/", refreshes = 1, liveFailsAfterFirst = false }) {
  const saved = { tracks: [{ id: "saved" }], lessons: {}, sources: {} };
  const live = { tracks: [{ id: "live" }], lessons: {}, sources: {} };
  const states = [];
  let stateIndex = 0;
  let liveCalls = 0;
  let refresh;
  const { ContentProvider } = load("../src/lib/content.tsx", {
    "react/jsx-runtime": jsx,
    "next/navigation": { usePathname: () => pathname },
    react: {
      createContext: () => ({ Provider: "provider" }), useContext: () => {},
      useState: (initial) => {
        const i = stateIndex++;
        if (i === states.length) states.push(initial);
        return [states[i], (next) => { states[i] = typeof next === "function" ? next(states[i]) : next; }];
      },
      useCallback: (fn) => { refresh = fn; return fn; }, useEffect: () => {}, useMemo: (fn) => fn(),
    },
    "./api": { apiEnabled: enabled, contentBundle: async () => {
      liveCalls++;
      if (liveFails || (liveFailsAfterFirst && liveCalls > 1)) throw new Error("API unavailable");
      return live;
    } },
    "./i18n": { useI18n: () => ({ t: (value) => value.en }) },
  }, {
    fetch: async (url) => { assert.equal(url, "/data/content.json"); return {
      ok: !savedFails, status: savedFails ? 404 : 200, json: async () => savedData === undefined ? saved : savedData,
    }; },
  });
  const render = () => { stateIndex = 0; return ContentProvider({ children: "content" }); };
  const initialRender = render();
  for (let i = 0; i < refreshes; i++) await refresh();
  return { states, liveCalls, initialRender, rendered: render() };
}
const cdn = await contentScenario({ enabled: false });
assert.equal(cdn.states[0].tracks[0].id, "saved");
assert.equal(cdn.states[1], false);
assert.equal(cdn.liveCalls, 0);
const outage = await contentScenario({ enabled: true, liveFails: true });
assert.equal(outage.states[0].tracks[0].id, "saved");
assert.equal(outage.states[1], true);
const recovered = await contentScenario({ enabled: true, savedFails: true });
assert.equal(recovered.states[0].tracks[0].id, "live");
assert.equal(recovered.states[1], false);
for (const pathname of ["/signin", "/signin/", "/auth/callback/", "/reset-password/"]) {
  const login = await contentScenario({ enabled: false, savedFails: true, pathname });
  assert.equal(login.initialRender.props.children[1], "content", "Auth must render while content is loading");
  assert.equal(login.rendered.props.children[1], "content", "Content outages must not block auth pages");
}
const cachedLive = await contentScenario({ enabled: true, refreshes: 2, liveFailsAfterFirst: true });
assert.equal(cachedLive.states[0].tracks[0].id, "live", "A later API outage must retain the last live lessons");
for (const savedData of [null, { tracks: null, lessons: {}, sources: {} }]) {
  const invalid = await contentScenario({ enabled: false, savedData });
  assert.equal(invalid.states[0].tracks.length, 0);
  assert.equal(invalid.states[1], true);
  const rescued = await contentScenario({ enabled: true, savedData });
  assert.equal(rescued.states[0].tracks[0].id, "live");
  assert.equal(rescued.states[1], false);
}
console.log("Auth: roles, approval permissions, CDN-only requests, auth pages during outages, snapshot validation and retained live lessons passed.");

// Render the real Studio routes and both shared-shell navs for each account role.
const strings = load("../src/lib/strings.ts").S;
const hooks = { useEffect: () => {}, useCallback: (fn) => fn, useRef: () => ({ current: null }),
  useState: (initial) => [initial, () => {}] };
const selectImport = { Select: ({ label, value, options, onChange, name }) => jsx.jsx("select", {
  "aria-label": label, value, name, onChange: (event) => onChange(event.target.value),
  children: options.map((option) => jsx.jsx("option", { value: option.value, children: option.label }, option.value)),
}) };
const content = { getTrack: () => undefined, allLessons: () => [], tracks: [], sources: {}, refresh: async () => {} };
function elements(node) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  if (typeof node.type === "function") return elements(node.type(node.props));
  return [node, ...elements(node.props?.children)];
}
for (const lang of ["en", "ar"]) {
  const t = (value) => value[lang];
  for (const role of ["learner", "teacher", "admin", "super_admin", "guest"]) {
    const session = { ready: true, user: role === "guest" ? null : { id: "test" }, guest: role === "guest",
      role: role === "guest" ? "learner" : role, prefs: {}, signOut: async () => {} };
    const imports = {
      "react/jsx-runtime": jsx, react: hooks, "lucide-react": new Proxy({}, { get: () => () => null }),
      "next/link": { default: "a" },
      "@/lib/i18n": { useI18n: () => ({ t, lang }) },
      "@/lib/session": { useSession: () => session, displayName: () => "Test" },
      "@/lib/content": { useContent: () => content }, "@/lib/strings": { S: strings }, "@/lib/roles": roles,
      "@/lib/types": load("../src/lib/types.ts"),
      "./Logo": { Logo: () => null }, "./ui": { LangToggle: () => null, TRACK_META: {} },
      "@/components/ui": { SourceQuote: () => jsx.jsx("blockquote", { children: "Preview" }), CardBody: () => null, TRACK_META: {} },
      "@/components/Select": selectImport,
      "@/components/AppShell": { AppShell: ({ children }) => children }, "@/lib/api": { apiEnabled: true },
    };
    for (const pathname of ["/studio/", "/studio/sources/", "/studio/users/", "/app/learn/"]) {
      const { AppShell } = load("../src/components/AppShell.tsx", { ...imports,
        "next/navigation": { usePathname: () => pathname, useRouter: () => ({ replace: () => {} }) } });
      const navs = elements(AppShell({ children: null })).filter((node) => node.type === "nav");
      const expected = pathname.startsWith("/studio")
        ? ["/studio/", ...(role === "super_admin" ? ["/studio/users/"] : []), "/app/learn/"]
        : ["/app/", "/app/learn/", "/library/", "/quran/", "/compare/", "/ask/", ...(roles.isStaff(session.role) ? ["/studio/"] : [])];
      for (const nav of navs) {
        const links = elements(nav).filter((node) => node.type === "a");
        assert.deepEqual(Array.from(links, (node) => node.props.href), expected);
        assert.deepEqual(Array.from(links.filter((node) => node.props["aria-current"] === "page"), (node) => node.props.href),
          expected.includes(pathname) ? [pathname] : []);
      }
      if (!pathname.startsWith("/studio")) continue;
      const route = pathname === "/studio/" ? "page" : pathname.split("/")[2] + "/page";
      let stateIndex = 0;
      const sourcePreview = pathname === "/studio/sources/";
      const Page = load(`../src/app/studio/${route}.tsx`, { ...imports, react: { ...hooks,
        useState: (initial) => {
          const i = stateIndex++;
          return [sourcePreview && i === 0 ? [{ id: "source", ref_en: "Test", ref_ar: "اختبار" }]
            : sourcePreview && i === 1 ? "source" : initial, () => {}];
        },
      } }).default;
      const nodes = elements(Page());
      const restricted = !roles.isStaff(session.role) || !session.user;
      if (restricted) assert(nodes.some((node) => node.props?.children === t(strings.instructor.restricted)));
      else if (pathname === "/studio/users/" && role !== "super_admin")
        assert(nodes.some((node) => node.props?.children === t(strings.users.restricted)));
      else if (pathname === "/studio/") {
        // Lessons are written in the editor page; the list only links to it.
        assert.equal(nodes.filter((node) => node.type === "textarea").length, 0);
        assert(nodes.some((node) => node.type === "a" && node.props.href === "/studio/lesson/"));
        assert(!nodes.some((node) => node.props?.children === t(strings.instructor.queue)));
      } else if (pathname === "/studio/sources/") {
        assert.equal(nodes.filter((node) => node.type === "textarea").length, 0);
        assert(nodes.some((node) => node.type === "blockquote"));
        assert.equal(nodes.some((node) => node.type === "button" && node.props.children === t(strings.instructor.approveSource)), roles.canReview(session.role));
      }
    }
  }
}
assert.match(readFileSync(new URL("../src/app/instructor/page.tsx", import.meta.url), "utf8"), /export \{ default \} from "\.\.\/studio\/page"/);
console.log("Studio: bilingual desktop/mobile navigation, active links, learner nav, role access, split editor and instructor alias passed.");

// Exercise pagination and filter changes with more lessons than fit on one page.
const fixtureLessons = Array.from({ length: 8 }, (_, i) => ({ id: `lesson-${i}`, title: { en: `Lesson ${i}`, ar: `درس ${i}` },
  track: "explore", level: 1, status: i === 0 ? "draft" : "published", author_id: "test" }));
const states = [];
let stateIndex = 0;
let modalOpens = 0;
let archives = 0;
let archiveFails = false;
const Page = load("../src/app/studio/page.tsx", {
  "react/jsx-runtime": jsx,
  react: { ...hooks, useRef: () => ({ current: { showModal: () => modalOpens++, close: () => {} } }), useState: (initial) => {
    const i = stateIndex++;
    if (i === states.length) states.push(i === 3 ? fixtureLessons : initial);
    return [states[i], (next) => { states[i] = typeof next === "function" ? next(states[i]) : next; }];
  } },
  "lucide-react": new Proxy({}, { get: () => () => null }),
  "@/components/AppShell": { AppShell: ({ children }) => children },
  "next/link": { default: "a" },
  "@/components/Select": selectImport, "@/components/ui": { SourceQuote: () => null, CardBody: () => null, TRACK_META: {} },
  "@/lib/api": { apiEnabled: true, staffLessons: async () => fixtureLessons,
    archiveLesson: async () => { if (archiveFails) throw new Error("Archive unavailable"); archives++; } },
  "@/lib/roles": roles, "@/lib/types": load("../src/lib/types.ts"),
  "@/lib/i18n": { useI18n: () => ({ t: (value) => value.en }) },
  "@/lib/session": { useSession: () => ({ role: "super_admin", user: { id: "test" } }) },
  "@/lib/content": { useContent: () => ({ ...content, allLessons: () => fixtureLessons.slice(1),
    tracks: [{ id: "explore", title: { en: "Explore Islam" }, modules: [{ id: "common-questions", title: { en: "Common questions" } }] }] }) },
  "@/lib/strings": { S: strings },
}, { Error }).default;
const render = () => { stateIndex = 0; return elements(Page()); };
const textContent = (node) => node == null ? "" : Array.isArray(node) ? node.map(textContent).join("")
  : typeof node === "object" ? textContent(node.props?.children) : String(node);
const button = (nodes, name) => nodes.find((node) => node.type === "button" && textContent(node) === name);
const rows = (nodes) => nodes.filter((node) => node.type === "tr" && node.key);
let nodes = render();
assert.equal(rows(nodes).length, 5);
assert(nodes.some((node) => textContent(node) === "Lessons shown: 1–5 of 8"));
assert.equal(button(nodes, strings.instructor.previousPage.en).props.disabled, true);
button(nodes, strings.instructor.nextPage.en).props.onClick();
nodes = render();
assert.equal(rows(nodes).length, 3);
assert(nodes.some((node) => textContent(node) === "Lessons shown: 6–8 of 8"));
assert.equal(button(nodes, strings.instructor.nextPage.en).props.disabled, true);
nodes.find((node) => node.type === "select" && node.props["aria-label"] === "Level")
  .props.onChange({ target: { value: "4" } });
nodes = render();
assert.equal(states[4], 1, "Changing filters must return to page one");
assert.equal(rows(nodes).length, 0);
button(nodes, strings.instructor.resetFilters.en).props.onClick();
nodes = render();
assert.equal(rows(nodes).length, 5);
assert.equal(states[2], "all");
nodes.find((node) => node.type === "select" && node.props["aria-label"] === "Lessons per page").props.onChange({ target: { value: "10" } });
nodes = render();
assert.equal(rows(nodes).length, 8);
assert(nodes.some((node) => textContent(node) === "Lessons shown: 1–8 of 8"));
assert.equal(rows(nodes)[0].key, "lesson-1", "Published lessons precede drafts");
const link = (name) => nodes.find((node) => node.type === "a" && textContent(node) === name);
assert.equal(link(strings.instructor.newLesson.en).props.href, "/studio/lesson/");
assert.equal(link(strings.instructor.edit.en).props.href, "/studio/lesson/?id=lesson-1");
assert(!nodes.some((node) => node.props?.children === strings.instructor.reviewNote.en));
// Merely opening/cancelling a confirmation must not mutate a lesson.
button(nodes, strings.instructor.archive.en).props.onClick();
nodes = render();
assert.equal(modalOpens, 1);
assert.equal(archives, 0);
let confirmation = nodes.find((node) => node.type === "dialog" && node.props["aria-describedby"] === "studio-confirm-description");
confirmation.props.onClose();
assert.equal(archives, 0);
button(render(), strings.instructor.archive.en).props.onClick();
confirmation = render().find((node) => node.type === "dialog" && node.props["aria-describedby"] === "studio-confirm-description");
button(elements(confirmation), strings.instructor.archive.en).props.onClick();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(archives, 1);
assert.equal(states[5], strings.instructor.archived.en);
archiveFails = true;
button(render(), strings.instructor.archive.en).props.onClick();
confirmation = render().find((node) => node.type === "dialog" && node.props["aria-describedby"] === "studio-confirm-description");
button(elements(confirmation), strings.instructor.archive.en).props.onClick();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(archives, 1);
assert.equal(states[7], "Archive unavailable");
assert(render().some((node) => node.props?.popover === "manual" && node.props.role === "alert"));
console.log("Studio: visible ranges, page size, filter resets, editor links, modal confirmation/cancel and success/error feedback passed.");

// Write a lesson in the editor: nothing is sent while a required part is missing, then the saved
// lesson carries formatted text, a source and the author as contributor, and Publish submits and approves it.
{
  const editorStates = [];
  let editorIndex = 0;
  const sent = [];
  const steps = [];
  const visited = [];
  const toasts = [];
  let blocked = true;
  let ids = 0;
  const Editor = load("../src/app/studio/lesson/page.tsx", {
    "react/jsx-runtime": jsx, "next/link": { default: "a" },
    "next/navigation": { useRouter: () => ({ replace: () => {}, push: (url) => visited.push(url) }), useSearchParams: () => ({ get: () => null }) },
    react: { ...hooks, Suspense: ({ children }) => children, useState: (initial) => {
      const i = editorIndex++;
      if (i === editorStates.length) editorStates.push(initial);
      return [editorStates[i], (next) => { editorStates[i] = typeof next === "function" ? next(editorStates[i]) : next; }];
    } },
    "lucide-react": new Proxy({}, { get: () => () => null }),
    "@/components/AppShell": { AppShell: ({ children }) => children },
    "@/components/Select": selectImport, "@/components/ui": { SourceQuote: () => null },
    "@/components/lesson/CardView": { CardView: ({ card }) => ({ type: "card-view", props: { card } }) },
    "@/components/studio/RichText": { RichText: ({ onChange }) => ({ type: "rich-text", props: { onChange } }) },
    "@/components/studio/SourcePicker": { SourcePicker: ({ onPick }) => ({ type: "source-picker", props: { onPick } }) },
    "@/lib/api": { ApiError: class extends Error {}, apiEnabled: true, generateLesson: async () => null,
      saveDraft: async (lesson) => { sent.push(lesson); return { contributors: ["Test Author"] }; }, submitDraft: async () => { steps.push("submit"); },
      reviewDecision: async (_id, decision) => { steps.push(decision); },
      reviewCheck: async () => { steps.push("check"); return { issues: blocked ? [{ severity: "high", issue: "Unsupported claim" }] : [] }; },
      unpublishLesson: async () => { steps.push("unpublish"); }, lessonHistory: async () => [] },
    "@/lib/roles": roles, "@/lib/types": load("../src/lib/types.ts"), "@/lib/strings": { S: strings },
    "@/lib/i18n": { useI18n: () => ({ t: (value) => value?.en ?? "", lang: "en" }) },
    "@/lib/session": { useSession: () => ({ role: "admin", user: { id: "test" } }), displayName: () => "Test Author" },
    "@/lib/content": { useContent: () => ({ refresh: async () => {}, sources: { "quran:5:6": { ref_en: "Al-Ma'idah 5:6", ref_ar: "المائدة: ٦" } },
      tracks: [{ id: "explore", title: { en: "Explore Islam" }, modules: [{ id: "common-questions", title: { en: "Common questions" } }] }] }) },
  }, { Error, crypto: { randomUUID: () => `${String(++ids).padStart(8, "0")}-0000-4000-8000-000000000000` },
    sessionStorage: { setItem: (_key, text) => toasts.push(text) } }).default;
  const E = strings.editor;
  const draw = () => { editorIndex = 0; return elements(Editor()); };
  const press = (name) => button(draw(), name).props.onClick();
  const type = (label, value) => draw().find((node) => node.props?.["aria-label"] === label).props.onChange({ target: { value } });
  const settle = () => new Promise((resolve) => setImmediate(resolve));

  draw().find((node) => node.type === "button" && textContent(node).startsWith(E.ai.en)).props.onClick();
  type(E.aiTitle.en, "A lesson about wudu");
  draw().find((node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  await settle();
  assert(draw().some((node) => textContent(node) === E.aiPending.en), "No AI backend yet: the same editor opens empty");

  press(strings.instructor.saveDraft.en);
  await settle();
  assert.equal(sent.length, 0);
  assert(draw().some((node) => node.type === "li" && textContent(node) === E.needTitle.en));
  assert(draw().some((node) => node.type === "li" && textContent(node) === E.needMinutes.en), "A new lesson starts at 0 minutes");
  assert(draw().some((node) => node.type === "li" && textContent(node) === `${E.section.en} 1 ${E.needsSource.en}`));

  type(E.titlePlaceholder.en, "The order of wudu");
  type(E.summaryPlaceholder.en, "What to wash, in order.");
  type(E.minutes.en, "4");
  type(E.sectionTitle.en, "Start with the face");
  draw().find((node) => node.type === "rich-text").props.onChange("<p>Wash the <b>face</b>.</p>");
  press(E.addSource.en);
  draw().find((node) => node.type === "source-picker").props.onPick("quran:5:6");
  press(E.addQuote.en);
  draw().find((node) => node.type === "source-picker").props.onPick("quran:5:6");
  assert.equal(draw().find((node) => node.props?.["aria-current"] === "page").props["aria-label"], `${E.section.en} 2`, "A new page opens right away");
  // "View lesson" shows the learner view of the open page inside the editor, and gives a way back.
  press(E.view.en);
  assert.equal(draw().find((node) => node.type === "card-view").props.card.id, "00000002");
  assert(!draw().some((node) => node.type === "rich-text" || node.props?.["aria-label"] === E.titlePlaceholder.en));
  press(E.keepEditing.en);
  assert(!draw().some((node) => node.type === "card-view"));
  // Saving a draft closes the editor, like publishing does.
  press(strings.instructor.saveDraft.en);
  await settle();
  assert.deepEqual(visited, ["/studio/"], "Saving a draft returns to the lesson list");
  assert.deepEqual(steps, []);
  // An account that may publish can send the lesson to review instead: it is submitted, not approved.
  press(strings.instructor.submit.en);
  await settle();
  assert.deepEqual(steps, ["submit"]);
  press(strings.instructor.publishDirect.en);
  await settle();
  assert.deepEqual(steps, ["submit", "submit", "approve"]);
  assert.deepEqual(JSON.parse(JSON.stringify(sent[0])), {
    id: "the-order-of-wudu-00000003", track: "explore", module: "common-questions", level: 1, minutes: 4, status: "draft",
    title: { en: "The order of wudu", ar: "" }, summary: { en: "What to wash, in order.", ar: "" },
    cards: [
      { id: "00000001", kind: "concept", title: { en: "Start with the face", ar: "" }, html: { en: "<p>Wash the <b>face</b>.</p>", ar: "" }, sources: ["quran:5:6"] },
      { id: "00000002", kind: "quote", title: { en: "Al-Ma'idah 5:6", ar: "المائدة: ٦" }, sources: ["quran:5:6"] },
    ],
  });
  assert.equal(visited.length, 3, "Sending to review and publishing return to the lesson list");
  assert(draw().some((node) => node.props?.className === "chip max-w-full" && textContent(node) === "TTest Author"), "The API's credits list is shown after saving");

  // A live lesson is edited in place: a failed check leaves it live, a passed one hides, saves and publishes it again.
  assert.equal(button(draw(), E.update.en).props.disabled, true, "Nothing to update until the lesson changes");
  type(E.titlePlaceholder.en, "The order of wudu, step by step");
  draw().find((node) => node.props?.["aria-label"] === E.tagAdd.en).props.onKeyDown({ key: "Enter", preventDefault() {}, currentTarget: { value: " wudu " } });
  press(E.update.en);
  await settle();
  assert.deepEqual(steps.slice(3), ["check"]);
  assert.equal(sent.length, 3);
  assert(draw().some((node) => node.type === "li" && textContent(node) === "Unsupported claim"));
  blocked = false;
  press(E.update.en);
  await settle();
  assert.deepEqual(steps.slice(4), ["check", "unpublish", "submit", "approve"]);
  assert.equal(sent[3].id, sent[0].id);
  assert.equal(sent[3].title.en, "The order of wudu, step by step");
  assert.equal(sent[3].tags.join(), "wudu");
  assert.deepEqual(toasts.join("|"), [strings.instructor.draftSaved.en, strings.instructor.submitted.en, strings.instructor.published.en, E.updated.en].join("|"), "The list shows what was done");
  assert.equal(visited.length, 4, "A blocked update stays in the editor, a finished one returns to the list");
  console.log("Studio editor: AI start falls back to the empty editor, missing parts block saving, the saved lesson is published, and a live lesson is updated.");
}
