import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as wanakana from "wanakana";
import "../voice-paths.js";

const {
  getVocabularyVoicePath,
  validateVocabularyVoiceSlugs
} = globalThis.JlptN5VoicePaths;

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = join(rootDirectory, "dist");
const staticFiles = [
  "index.html",
  "privacy.html",
  "app.js",
  "pwa.js",
  "service-worker.js",
  "manifest.webmanifest",
  "manifest-fr.webmanifest",
  "storage.js",
  "i18n.js",
  "voice-paths.js",
  "srs.js",
  "learning-stats.js",
  "hiragana.js",
  "katakana.js",
  "kanji.js",
  "vocabulary.js",
  "exercise-selection.js",
  "statistics.js",
  "history.js",
  "settings.js",
  "progress.js",
  "native.js",
  "native-synapse.js",
  "autocorrect.js",
  "styles.css",
  "assets/branding/logo.png",
  "assets/branding/icon-192.png",
  "assets/branding/icon-512.png",
  "assets/branding/icon-maskable-512.png",
  "assets/branding/apple-touch-icon.png",
  "data/introduction.json",
  "data/exercises.json",
  "data/kanji-contexts.json",
  "data/jlpt-n5-grammar.json",
  "data/jlpt-n5-kanji.json",
  "data/jlpt-n5-vocabulary.json",
  "locales/en.json",
  "locales/fr.json",
  "data/locales/fr/exercises.json",
  "data/locales/fr/grammar.json",
  "data/locales/fr/kanji-contexts.json",
  "data/locales/fr/vocabulary.json",
  "data/locales/fr/kanji.json"
];
const dependencyFiles = [
  ["node_modules/ts-fsrs/dist/index.umd.js", "vendor/ts-fsrs.js"],
  ["node_modules/ts-fsrs/LICENSE", "licenses/ts-fsrs-MIT.txt"],
  ["node_modules/wanakana/wanakana.min.js", "vendor/wanakana.js"],
  ["node_modules/wanakana/LICENSE", "licenses/wanakana-MIT.txt"],
  ["node_modules/@capacitor/core/dist/capacitor.js", "vendor/capacitor.js"],
  ["node_modules/@capacitor/preferences/dist/plugin.js", "vendor/capacitor-preferences.js"],
  ["node_modules/@capacitor/haptics/dist/plugin.js", "vendor/capacitor-haptics.js"],
  [
    "node_modules/@capacitor/local-notifications/dist/plugin.js",
    "vendor/capacitor-local-notifications.js"
  ],
  [
    "node_modules/@capacitor/splash-screen/dist/plugin.js",
    "vendor/capacitor-splash-screen.js"
  ],
  ["node_modules/@capacitor/status-bar/dist/plugin.js", "vendor/capacitor-status-bar.js"],
  ["node_modules/@capacitor/keyboard/dist/plugin.js", "vendor/capacitor-keyboard.js"],
  ["node_modules/@capacitor/app/dist/plugin.js", "vendor/capacitor-app.js"],
  ["node_modules/@capacitor/synapse/dist/synapse.js", "vendor/capacitor-synapse.js"],
  ["node_modules/@capacitor/filesystem/dist/plugin.js", "vendor/capacitor-filesystem.js"],
  ["node_modules/@capacitor/share/dist/plugin.js", "vendor/capacitor-share.js"],
  ["node_modules/@capacitor/core/LICENSE", "licenses/capacitor-MIT.txt"],
  ["node_modules/@capacitor/filesystem/LICENSE", "licenses/capacitor-filesystem-MIT.txt"],
  ["node_modules/@capacitor/share/LICENSE", "licenses/capacitor-share-MIT.txt"],
  ["node_modules/@capacitor/synapse/LICENSE.md", "licenses/capacitor-synapse-ISC.txt"]
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

for (const route of ["grammar", "hiragana", "katakana", "kanji", "vocabulary"]) {
  const routeDirectory = join(outputDirectory, route);

  await mkdir(routeDirectory, { recursive: true });
  await writeFile(join(routeDirectory, "index.html"), routeHtml);
}

const [introduction, exercises, vocabulary] = await Promise.all([
  readFile(join(rootDirectory, "data", "introduction.json"), "utf8").then(JSON.parse),
  readFile(join(rootDirectory, "data", "exercises.json"), "utf8").then(JSON.parse),
  readFile(join(rootDirectory, "data", "jlpt-n5-vocabulary.json"), "utf8").then(JSON.parse)
]);

validateVocabularyVoiceSlugs(vocabulary, wanakana);

const voicePaths = [...new Set([
  ...[introduction, ...exercises].map(({ audio }) => audio),
  ...vocabulary.map((entry) => getVocabularyVoicePath(entry, wanakana))
])];
const copiedVoicePaths = [];
let copiedVoiceCount = 0;

for (const relativePath of voicePaths) {
  const destination = join(outputDirectory, relativePath);

  try {
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(join(rootDirectory, relativePath), destination);
    copiedVoicePaths.push(relativePath);
    copiedVoiceCount += 1;
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

await writeFile(
  join(outputDirectory, "data", "available-voices.json"),
  `${JSON.stringify(copiedVoicePaths.sort(), null, 2)}\n`
);

await writeFile(join(outputDirectory, ".nojekyll"), "");

async function listOutputFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = join(prefix, entry.name);

    if (entry.isDirectory()) {
      files.push(...await listOutputFiles(join(directory, entry.name), relativePath));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return files;
}

const buildHash = createHash("sha256");

for (const relativePath of (await listOutputFiles(outputDirectory)).sort()) {
  buildHash.update(relativePath);
  buildHash.update(await readFile(join(outputDirectory, relativePath)));
}

const buildVersion = buildHash.digest("hex").slice(0, 16);
const buildVersionPlaceholder = "__CHAKUCHAKU_BUILD_VERSION__";

for (const relativePath of ["pwa.js", "service-worker.js"]) {
  const path = join(outputDirectory, relativePath);
  const source = await readFile(path, "utf8");

  if (!source.includes(buildVersionPlaceholder)) {
    throw new Error(`${relativePath} is missing its build version placeholder.`);
  }

  await writeFile(path, source.replaceAll(buildVersionPlaceholder, buildVersion));
}

console.log(
  `Built static site ${buildVersion} with ${copiedVoiceCount} voice files; ` +
  `${voicePaths.length - copiedVoiceCount} audio items have no narration yet.`
);
