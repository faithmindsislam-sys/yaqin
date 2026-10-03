// Exercise the chooser's real click handlers without a browser or live account writes.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";

let session;
const actions = [];
const router = { push: (url) => actions.push(["push", url]), replace: (url) => actions.push(["replace", url]) };
const component = { exports: {} };
const source = readFileSync(new URL("../src/components/TrackChooser.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
vm.runInNewContext(compiled, { module: component, exports: component.exports, require: (name) => {
  if (name === "react/jsx-runtime") return jsx;
  if (name === "react") return { useEffect: (effect) => effect() };
  if (name === "next/navigation") return { useRouter: () => router };
  if (name === "@/lib/session") return { useSession: () => session };
  if (name === "@/lib/i18n") return { useI18n: () => ({ t: (value) => value.en }) };
  if (name === "./ui") return { LangToggle: () => null, TRACK_META: Object.fromEntries(
    ["explore", "first-steps", "deepen"].map((id) => [id, { icon: () => null }])) };
  if (name === "./Logo" || name === "lucide-react") return {};
  throw new Error(`Unexpected module ${name}`);
} });

function buttons(node) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(buttons);
  return [...(node.type === "button" ? [node] : []), ...buttons(node.props?.children)];
}
const makeSession = (patch) => ({ ready: true, user: null, guest: false,
  startGuest: () => actions.push(["guest"]), setPrefs: (prefs) => actions.push(["prefs", { ...prefs }]), ...patch });
const { TrackChooser } = component.exports;
for (const signedIn of [false, true]) {
  session = makeSession(signedIn ? { user: { id: "learner" } } : {});
  const cards = buttons(TrackChooser({}));
  assert.equal(cards.length, 3);
  for (const [index, track] of ["explore", "first-steps", "deepen"].entries()) {
    actions.length = 0;
    cards[index].props.onClick();
    assert.deepEqual(actions, track === "explore" ? [["push", "/start/explore/"]] : [...(signedIn ? [] : [["guest"]]),
      ["prefs", { track, onboarded: true }], ["push", "/app/learn/"]]);
  }
}
session = makeSession({ guest: true });
actions.length = 0;
buttons(TrackChooser({ requireSession: true }))[0].props.onClick();
assert.equal(actions.some(([action]) => action === "guest"), false);
session = makeSession({});
actions.length = 0;
assert.equal(buttons(TrackChooser({ requireSession: true })).length, 0);
assert.deepEqual(actions, [["replace", "/signin/"]]);
session = makeSession({ ready: false });
actions.length = 0;
assert.equal(buttons(TrackChooser({})).length, 0);
assert.deepEqual(actions, []);
console.log("All three tracks, account/guest selection, loading and sign-in guard passed.");
