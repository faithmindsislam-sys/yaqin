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
const hooks = { useEffect: () => {}, useCallback: (fn) => fn,
  useState: (initial) => [initial, () => {}] };
const content = { getTrack: () => undefined, allLessons: () => [], sources: {}, refresh: async () => {} };
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
      "./Logo": { Logo: () => null }, "./ui": { LangToggle: () => null, TRACK_META: {} },
      "@/components/ui": { SourceQuote: () => jsx.jsx("blockquote", { children: "Preview" }) },
      "@/components/AppShell": { AppShell: ({ children }) => children }, "@/lib/api": { apiEnabled: true },
    };
    for (const pathname of ["/studio/", "/studio/sources/", "/studio/users/", "/app/learn/"]) {
      const { AppShell } = load("../src/components/AppShell.tsx", { ...imports,
        "next/navigation": { usePathname: () => pathname, useRouter: () => ({ replace: () => {} }) } });
      const navs = elements(AppShell({ children: null })).filter((node) => node.type === "nav");
      const expected = pathname.startsWith("/studio")
        ? ["/studio/", "/studio/sources/", ...(role === "super_admin" ? ["/studio/users/"] : []), "/app/learn/"]
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
        assert.equal(nodes.filter((node) => node.type === "textarea").length, 1);
        assert(nodes.some((node) => node.type === "button" && node.props.children === t(strings.instructor.saveDraft)));
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
