import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");
const host = "127.0.0.1";
const port = Number.parseInt(process.env.PORT || "4173", 10);
const publicFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/privacy.html", ["privacy.html", "text/html; charset=utf-8"]],
  ["/grammar", ["index.html", "text/html; charset=utf-8"]],
  ["/hiragana", ["index.html", "text/html; charset=utf-8"]],
  ["/katakana", ["index.html", "text/html; charset=utf-8"]],
  ["/vocabulary", ["index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/native.js", ["native.js", "text/javascript; charset=utf-8"]],
  ["/native-synapse.js", ["native-synapse.js", "text/javascript; charset=utf-8"]],
  ["/pwa.js", ["pwa.js", "text/javascript; charset=utf-8"]],
  ["/service-worker.js", ["service-worker.js", "text/javascript; charset=utf-8"]],
  ["/manifest.webmanifest", ["manifest.webmanifest", "application/manifest+json"]],
  ["/manifest-fr.webmanifest", ["manifest-fr.webmanifest", "application/manifest+json"]],
  ["/storage.js", ["storage.js", "text/javascript; charset=utf-8"]],
  ["/i18n.js", ["i18n.js", "text/javascript; charset=utf-8"]],
  ["/voice-paths.js", ["voice-paths.js", "text/javascript; charset=utf-8"]],
  ["/srs.js", ["srs.js", "text/javascript; charset=utf-8"]],
  ["/learning-stats.js", ["learning-stats.js", "text/javascript; charset=utf-8"]],
  ["/hiragana.js", ["hiragana.js", "text/javascript; charset=utf-8"]],
  ["/katakana.js", ["katakana.js", "text/javascript; charset=utf-8"]],
  ["/vocabulary.js", ["vocabulary.js", "text/javascript; charset=utf-8"]],
  ["/exercise-selection.js", ["exercise-selection.js", "text/javascript; charset=utf-8"]],
  ["/statistics.js", ["statistics.js", "text/javascript; charset=utf-8"]],
  ["/history.js", ["history.js", "text/javascript; charset=utf-8"]],
  ["/settings.js", ["settings.js", "text/javascript; charset=utf-8"]],
  ["/progress.js", ["progress.js", "text/javascript; charset=utf-8"]],
  ["/autocorrect.js", ["autocorrect.js", "text/javascript; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/assets/branding/logo.png", ["assets/branding/logo.png", "image/png"]],
  ["/assets/branding/icon-192.png", ["assets/branding/icon-192.png", "image/png"]],
  ["/assets/branding/icon-512.png", ["assets/branding/icon-512.png", "image/png"]],
  [
    "/assets/branding/icon-maskable-512.png",
    ["assets/branding/icon-maskable-512.png", "image/png"]
  ],
  [
    "/assets/branding/apple-touch-icon.png",
    ["assets/branding/apple-touch-icon.png", "image/png"]
  ],
  [
    "/vendor/ts-fsrs.js",
    ["node_modules/ts-fsrs/dist/index.umd.js", "text/javascript; charset=utf-8"]
  ],
  [
    "/vendor/wanakana.js",
    ["node_modules/wanakana/wanakana.min.js", "text/javascript; charset=utf-8"]
  ],
  [
    "/vendor/capacitor.js",
    ["node_modules/@capacitor/core/dist/capacitor.js", "text/javascript; charset=utf-8"]
  ],
  [
    "/vendor/capacitor-preferences.js",
    ["node_modules/@capacitor/preferences/dist/plugin.js", "text/javascript; charset=utf-8"]
  ],
  [
    "/vendor/capacitor-haptics.js",
    ["node_modules/@capacitor/haptics/dist/plugin.js", "text/javascript; charset=utf-8"]
  ],
  [
    "/vendor/capacitor-local-notifications.js",
    [
      "node_modules/@capacitor/local-notifications/dist/plugin.js",
      "text/javascript; charset=utf-8"
    ]
  ],
  [
    "/vendor/capacitor-splash-screen.js",
    ["node_modules/@capacitor/splash-screen/dist/plugin.js", "text/javascript; charset=utf-8"]
  ],
  [
    "/vendor/capacitor-status-bar.js",
    ["node_modules/@capacitor/status-bar/dist/plugin.js", "text/javascript; charset=utf-8"]
  ],
  [
    "/vendor/capacitor-keyboard.js",
    ["node_modules/@capacitor/keyboard/dist/plugin.js", "text/javascript; charset=utf-8"]
  ],
  [
    "/vendor/capacitor-app.js",
    ["node_modules/@capacitor/app/dist/plugin.js", "text/javascript; charset=utf-8"]
  ],
  [
    "/vendor/capacitor-synapse.js",
    ["node_modules/@capacitor/synapse/dist/synapse.js", "text/javascript; charset=utf-8"]
  ],
  [
    "/vendor/capacitor-filesystem.js",
    ["node_modules/@capacitor/filesystem/dist/plugin.js", "text/javascript; charset=utf-8"]
  ],
  [
    "/vendor/capacitor-share.js",
    ["node_modules/@capacitor/share/dist/plugin.js", "text/javascript; charset=utf-8"]
  ],
  ["/data/introduction.json", ["data/introduction.json", "application/json; charset=utf-8"]],
  ["/data/exercises.json", ["data/exercises.json", "application/json; charset=utf-8"]],
  ["/locales/en.json", ["locales/en.json", "application/json; charset=utf-8"]],
  ["/locales/fr.json", ["locales/fr.json", "application/json; charset=utf-8"]],
  [
    "/data/locales/fr/exercises.json",
    ["data/locales/fr/exercises.json", "application/json; charset=utf-8"]
  ],
  [
    "/data/locales/fr/grammar.json",
    ["data/locales/fr/grammar.json", "application/json; charset=utf-8"]
  ],
  [
    "/data/locales/fr/vocabulary.json",
    ["data/locales/fr/vocabulary.json", "application/json; charset=utf-8"]
  ],
  [
    "/data/locales/fr/kanji.json",
    ["data/locales/fr/kanji.json", "application/json; charset=utf-8"]
  ],
  [
    "/data/jlpt-n5-kanji.json",
    ["data/jlpt-n5-kanji.json", "application/json; charset=utf-8"]
  ],
  [
    "/data/jlpt-n5-vocabulary.json",
    ["data/jlpt-n5-vocabulary.json", "application/json; charset=utf-8"]
  ],
  [
    "/data/jlpt-n5-grammar.json",
    ["data/jlpt-n5-grammar.json", "application/json; charset=utf-8"]
  ]
]);

export function getPublicFile(pathname) {
  const knownFile = publicFiles.get(pathname);

  if (knownFile) {
    return knownFile;
  }

  const voiceMatch = pathname.match(
    /^\/assets\/voices\/(grammar|vocab)\/([a-z0-9-]+\.m4a)$/
  );

  if (voiceMatch) {
    return [join("assets", "voices", voiceMatch[1], voiceMatch[2]), "audio/mp4"];
  }
}

export async function handleStaticRequest(request, response) {
  const pathname = new URL(request.url, `http://${request.headers.host || host}`).pathname;

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }

  if (["/grammar/", "/hiragana/", "/katakana/", "/vocabulary/"].includes(pathname)) {
    response.writeHead(308, { Location: pathname.slice(0, -1) });
    response.end();
    return;
  }

  const publicFile = getPublicFile(pathname);

  if (!publicFile) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  try {
    const [fileName, contentType] = publicFile;
    const contents = await readFile(join(rootDirectory, fileName));

    response.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": contents.length
    });
    response.end(request.method === "HEAD" ? undefined : contents);
  } catch (error) {
    if (error.code === "ENOENT") {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    console.error(`[${request.method} ${pathname}] ${error.message}`);
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Internal server error");
  }
}

export function createStaticServer() {
  return createServer(handleStaticRequest);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createStaticServer().listen(port, host, () => {
    console.log(`JLPT N5 static preview is running at http://${host}:${port}`);
  });
}
