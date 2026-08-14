import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = join(rootDirectory, "dist");
const staticFiles = [
  "index.html",
  "app.js",
  "srs.js",
  "learning-stats.js",
  "hiragana.js",
  "katakana.js",
  "exercise-selection.js",
  "statistics.js",
  "settings.js",
  "autocorrect.js",
  "styles.css",
  "data/introduction.json",
  "data/exercises.json",
  "data/jlpt-n5-grammar.json",
  "data/jlpt-n5-kanji.json",
  "data/jlpt-n5-vocabulary.json"
];
const dependencyFiles = [
  ["node_modules/ts-fsrs/dist/index.umd.js", "vendor/ts-fsrs.js"],
  ["node_modules/ts-fsrs/LICENSE", "licenses/ts-fsrs-MIT.txt"],
  ["node_modules/wanakana/wanakana.min.js", "vendor/wanakana.js"],
  ["node_modules/wanakana/LICENSE", "licenses/wanakana-MIT.txt"]
];

await rm(outputDirectory, { recursive: true, force: true });

for (const relativePath of staticFiles) {
  const destination = join(outputDirectory, relativePath);

  await mkdir(dirname(destination), { recursive: true });
  await copyFile(join(rootDirectory, relativePath), destination);
}

for (const [sourcePath, destinationPath] of dependencyFiles) {
  const destination = join(outputDirectory, destinationPath);

  await mkdir(dirname(destination), { recursive: true });
  await copyFile(join(rootDirectory, sourcePath), destination);
}

const routeHtml = (await readFile(join(rootDirectory, "index.html"), "utf8"))
  .replace("<head>", "<head>\n    <base href=\"../\">");

for (const route of ["grammar", "hiragana", "katakana"]) {
  const routeDirectory = join(outputDirectory, route);

  await mkdir(routeDirectory, { recursive: true });
  await writeFile(join(routeDirectory, "index.html"), routeHtml);
}

const [introduction, exercises, vocabulary] = await Promise.all([
  readFile(join(rootDirectory, "data", "introduction.json"), "utf8").then(JSON.parse),
  readFile(join(rootDirectory, "data", "exercises.json"), "utf8").then(JSON.parse),
  readFile(join(rootDirectory, "data", "jlpt-n5-vocabulary.json"), "utf8").then(JSON.parse)
]);
const voicePaths = [...new Set([
  ...[introduction, ...exercises].map(({ audio }) => audio),
  ...vocabulary.map(({ audio }) => audio).filter(Boolean)
])];
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
