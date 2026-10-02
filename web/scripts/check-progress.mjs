// Run the real progress module with a tiny Supabase/store substitute; no test framework needed.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const values = new Map();
const rows = new Map();
const days = new Map();
let fail = false;
const store = {
  readStored: (key) => values.get(key) ?? null,
  writeStored: (key, value) => value === null ? values.delete(key) : values.set(key, value),
};
const sb = {
  auth: { getUser: async () => ({ data: { user: { id: values.get("yaqin.account") } }, error: null }) },
  rpc: async (_name, p) => {
    if (fail) return { error: new Error("Offline") };
    assert.equal(p.p_user, values.get("yaqin.account"));
    const key = `${p.p_user}/${p.p_lesson}`;
    const old = rows.get(key) ?? {};
    rows.set(key, { user_id: p.p_user, lesson_id: p.p_lesson,
      card_index: Math.max(old.card_index ?? 0, p.p_card), cards_done: old.cards_done || p.p_cards_done,
      explain_back_score: p.p_explained ? 1 : old.explain_back_score ?? null,
      quiz_score: p.p_quiz_score ?? old.quiz_score ?? null, completed_at: old.completed_at ?? p.p_completed_at,
      note: p.p_note ?? old.note ?? "" });
    return { error: null };
  },
  from: (table) => ({
    select: () => ({ eq: async (_column, uid) => ({ error: null,
      data: table === "progress" ? [...rows.values()].filter((r) => r.user_id === uid) : (days.get(uid) ?? []).map((day) => ({ day })) }) }),
    upsert: async (items) => { for (const row of items) days.set(row.user_id, [...new Set([...(days.get(row.user_id) ?? []), row.day])]); return { error: null }; },
  }),
};
const sandboxModule = { exports: {} };
const source = readFileSync(new URL("../src/lib/progress.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(compiled, { module: sandboxModule, exports: sandboxModule.exports, require: (name) => {
  if (name === "react") return {};
  if (name === "./store") return store;
  if (name === "./supabase") return { supabase: () => sb };
  throw new Error(`Unexpected module ${name}`);
}, Date, Promise, console });
const p = sandboxModule.exports;
const guest = { card: 1, cardsDone: true, explained: false, quizScore: null, completedAt: null };
store.writeStored("yaqin.progress", JSON.stringify({ lessons: { wudu: guest }, days: ["2026-01-01"], notes: { wudu: "Guest note" } }));
p.activateAccount("alice");
await p.hydrateFromRemote();
assert.equal(rows.get("alice/wudu").note, "Guest note");
assert.equal(rows.get("alice/wudu").card_index, 1);
assert.equal(store.readStored("yaqin.progress"), null);

fail = true;
p.updateLesson("wudu", { card: 0, completedAt: "2026-01-02T00:00:00Z", quizScore: 0.75 });
p.saveNote("wudu", "Changed while offline");
await p.hydrateFromRemote();
assert.equal(store.readStored(p.PROGRESS_ERROR), "Offline");
assert.ok(JSON.parse(store.readStored("yaqin.progress.alice")).pending.includes("wudu"));
fail = false;
await p.hydrateFromRemote();
assert.equal(rows.get("alice/wudu").card_index, 1);
assert.equal(rows.get("alice/wudu").note, "Changed while offline");
assert.equal(rows.get("alice/wudu").completed_at, "2026-01-02T00:00:00Z");
assert.equal(store.readStored(p.PROGRESS_ERROR), null);

p.activateAccount("bob");
await p.hydrateFromRemote();
assert.equal(Object.keys(JSON.parse(store.readStored("yaqin.progress.bob")).lessons).length, 0);
assert.equal(rows.has("bob/wudu"), false);
p.activateAccount("alice");
await p.hydrateFromRemote();
assert.equal(JSON.parse(store.readStored("yaqin.progress.alice")).notes.wudu, "Changed while offline");
console.log("Guest import, offline retry, progress merge, note persistence and account isolation passed.");
