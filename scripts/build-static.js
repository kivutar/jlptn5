import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = join(rootDirectory, "dist");
const staticFiles = [
  "index.html",
  "app.js",
  "learning-stats.js",
  "settings.js",
  "styles.css",
  "data/introduction.json",
  "data/exercises.json",
  "data/jlpt-n5-grammar.json",
  "data/jlpt-n5-vocabulary.json"
];

await rm(outputDirectory, { recursive: true, force: true });

for (const relativePath of staticFiles) {
  const destination = join(outputDirectory, relativePath);

  await mkdir(dirname(destination), { recursive: true });
  await copyFile(join(rootDirectory, relativePath), destination);
}

const [introduction, exercises] = await Promise.all([
  readFile(join(rootDirectory, "data", "introduction.json"), "utf8").then(JSON.parse),
  readFile(join(rootDirectory, "data", "exercises.json"), "utf8").then(JSON.parse)
]);
const voicePaths = [introduction, ...exercises].map(({ audio }) => audio);
let copiedVoiceCount = 0;

for (const relativePath of voicePaths) {
  const destination = join(outputDirectory, relativePath);

  try {
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(join(rootDirectory, relativePath), destination);
    copiedVoiceCount += 1;
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

await writeFile(join(outputDirectory, ".nojekyll"), "");
console.log(
  `Built static site with ${copiedVoiceCount} voice files; ` +
  `${voicePaths.length - copiedVoiceCount} lessons have no narration yet.`
);
