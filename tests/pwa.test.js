import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");

function readJson(path) {
  return readFile(join(rootDirectory, path), "utf8").then(JSON.parse);
}

function readPngDimensions(image) {
  assert.equal(image.subarray(1, 4).toString("ascii"), "PNG");
  return {
    width: image.readUInt32BE(16),
    height: image.readUInt32BE(20)
  };
}

test("web manifest provides installable app metadata and valid icons", async () => {
  const [manifest, frenchManifest] = await Promise.all([
    readJson("manifest.webmanifest"),
    readJson("manifest-fr.webmanifest")
  ]);

  assert.equal(manifest.name, "ChakuChaku · Learn Japanese");
  assert.equal(manifest.short_name, "ChakuChaku");
  assert.equal(manifest.start_url, "./grammar");
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.theme_color, "#fafafa");
  assert.ok(manifest.icons.some(({ sizes, purpose }) => sizes === "512x512" && purpose === "maskable"));
  assert.equal(frenchManifest.lang, "fr");
  assert.equal(frenchManifest.short_name, manifest.short_name);
  assert.deepEqual(frenchManifest.icons, manifest.icons);

  for (const icon of manifest.icons) {
    const image = await readFile(join(rootDirectory, icon.src));
    const [expectedWidth, expectedHeight] = icon.sizes.split("x").map(Number);

    assert.deepEqual(readPngDimensions(image), {
      width: expectedWidth,
      height: expectedHeight
    });
  }
});

test("PWA registration is disabled inside native Capacitor shells", async () => {
  const [html, pwaCode] = await Promise.all([
    readFile(join(rootDirectory, "index.html"), "utf8"),
    readFile(join(rootDirectory, "pwa.js"), "utf8")
  ]);

  assert.match(html, /rel="manifest" href="manifest\.webmanifest"/);
  assert.match(html, /rel="apple-touch-icon"/);
  assert.match(html, /name="color-scheme" content="light dark"/);
  assert.match(html, /name="theme-color" content="#fafafa" media="\(prefers-color-scheme: light\)"/);
  assert.match(html, /name="theme-color" content="#101412" media="\(prefers-color-scheme: dark\)"/);
  assert.ok(html.indexOf('src="pwa.js"') < html.indexOf('src="app.js"'));
  assert.match(pwaCode, /Capacitor/);
  assert.match(pwaCode, /isNative/);
  assert.match(pwaCode, /navigator\.serviceWorker/);
});

test("service worker pre-caches the app shell but loads voices on demand", async () => {
  const [source, buildSource] = await Promise.all([
    readFile(join(rootDirectory, "service-worker.js"), "utf8"),
    readFile(join(rootDirectory, "scripts", "build-static.js"), "utf8")
  ]);
  const shellMatch = source.match(/const shellPaths = (\[[\s\S]*?\]);/u);

  assert.ok(shellMatch);
  const shellPaths = JSON.parse(shellMatch[1]);

  for (const requiredPath of [
    "grammar",
    "hiragana",
    "katakana",
    "vocabulary",
    "manifest.webmanifest",
    "manifest-fr.webmanifest",
    "privacy.html",
    "voice-paths.js",
    "data/exercises.json",
    "progress.js",
    "i18n.js",
    "locales/en.json",
    "locales/fr.json"
  ]) {
    assert.ok(shellPaths.includes(requiredPath), requiredPath);
  }

  assert.equal(shellPaths.some((path) => path.endsWith(".m4a")), false);
  assert.match(source, /\/assets\/voices\//);
  assert.match(source, /request\.headers\.has\("range"\)/);
  assert.match(source, /request\.method === "HEAD"/);
  assert.match(buildSource, /"available-voices\.json"/);
  assert.match(buildSource, /getVocabularyVoicePath\(entry, wanakana\)/);
  assert.match(buildSource, /JSON\.stringify\(copiedVoicePaths\.sort\(\), null, 2\)/);
});
