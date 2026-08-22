import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeLessonM4a } from "./m4a.js";

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");
const voiceDirectory = join(rootDirectory, "assets", "voices", "grammar");

async function readJson(path) {
  return JSON.parse(await readFile(join(rootDirectory, path), "utf8"));
}

function getLessonText(lesson) {
  return lesson.speechText || (lesson.type === "production" ? lesson.solution : lesson.text);
}

const [introduction, exercises, voiceFiles] = await Promise.all([
  readJson("data/source/introduction.json"),
  readJson("data/source/exercises.json"),
  readdir(voiceDirectory)
]);
const textById = new Map(
  [introduction, ...exercises].map((lesson) => [lesson.id, getLessonText(lesson)])
);
const wavFiles = voiceFiles.filter((file) => file.endsWith(".wav")).sort();

for (const file of wavFiles) {
  const id = file.slice(0, -".wav".length);
  const text = textById.get(id);

  if (!text) {
    throw new Error(`${file}: no matching authored lesson was found.`);
  }

  const source = join(voiceDirectory, file);
  const destination = join(voiceDirectory, `${id}.m4a`);

  await encodeLessonM4a(await readFile(source), destination, text);
  console.log(`Converted ${file} to ${id}.m4a`);
}

console.log(`Converted and validated ${wavFiles.length} lesson voices.`);
