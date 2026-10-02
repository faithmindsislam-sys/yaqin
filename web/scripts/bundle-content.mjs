// Bundles ../content (lessons, sources, tracks) into one JSON the static site imports.
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const contentDir = join(here, "..", "..", "content");
const outFile = join(here, "..", "src", "generated", "content.json");

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const jsonFiles = (dir) =>
  existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => join(dir, f)) : [];

const tracksFile = join(contentDir, "tracks.json");
const tracks = existsSync(tracksFile) ? readJson(tracksFile) : [];

const lessons = {};
for (const f of jsonFiles(join(contentDir, "lessons"))) {
  const lesson = readJson(f);
  if (lesson.status === "published") lessons[lesson.id] = lesson;
}

const sources = {};
for (const f of jsonFiles(join(contentDir, "sources"))) {
  const data = readJson(f);
  for (const s of Array.isArray(data) ? data : Object.values(data)) sources[s.id] = s;
}

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify({ tracks, lessons, sources }));
console.log(
  `content: ${tracks.length} tracks, ${Object.keys(lessons).length} lessons, ${Object.keys(sources).length} sources`,
);
