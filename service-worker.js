"use strict";

const buildVersion = "__CHAKUCHAKU_BUILD_VERSION__";
const cachePrefix = "chakuchaku-";
const shellCacheName = `${cachePrefix}shell-${buildVersion}`;
const voiceCacheName = `${cachePrefix}voices-${buildVersion}`;
const shellPaths = [
  "./",
  "index.html",
  "privacy.html",
  "grammar",
  "hiragana",
  "katakana",
  "vocabulary",
  "manifest.webmanifest",
  "manifest-fr.webmanifest",
  "styles.css",
  "app.js",
  "storage.js",
  "i18n.js",
  "voice-paths.js",
  "srs.js",
  "learning-stats.js",
  "hiragana.js",
  "katakana.js",
  "vocabulary.js",
  "exercise-selection.js",
  "statistics.js",
  "settings.js",
  "progress.js",
  "native.js",
  "native-synapse.js",
  "autocorrect.js",
  "pwa.js",
  "vendor/ts-fsrs.js",
  "vendor/wanakana.js",
  "vendor/capacitor.js",
  "vendor/capacitor-preferences.js",
  "vendor/capacitor-haptics.js",
  "vendor/capacitor-local-notifications.js",
  "vendor/capacitor-splash-screen.js",
  "vendor/capacitor-status-bar.js",
  "vendor/capacitor-keyboard.js",
  "vendor/capacitor-app.js",
  "vendor/capacitor-synapse.js",
  "vendor/capacitor-filesystem.js",
  "vendor/capacitor-share.js",
  "assets/branding/logo.png",
  "assets/branding/icon-192.png",
  "assets/branding/icon-512.png",
  "assets/branding/icon-maskable-512.png",
  "assets/branding/apple-touch-icon.png",
  "data/introduction.json",
  "data/exercises.json",
  "data/jlpt-n5-grammar.json",
  "data/jlpt-n5-kanji.json",
  "data/jlpt-n5-vocabulary.json",
  "locales/en.json",
  "locales/fr.json",
  "data/locales/fr/exercises.json",
  "data/locales/fr/grammar.json",
  "data/locales/fr/vocabulary.json",
  "data/locales/fr/kanji.json"
];

function scopedUrl(path) {
  return new URL(path, self.registration.scope).href;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(shellCacheName).then((cache) => (
      cache.addAll(shellPaths.map(scopedUrl))
    ))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();

    await Promise.all(
      cacheNames
        .filter((name) => (
          name.startsWith(cachePrefix) &&
          ![shellCacheName, voiceCacheName].includes(name)
        ))
        .map((name) => caches.delete(name))
    );
    await self.clients.claim();
  })());
});

async function networkFirst(request) {
  const cache = await caches.open(shellCacheName);

  try {
    const response = await fetch(request);

    if (response.ok) {
      await cache.put(request, response.clone());
    }

    return response;
  } catch {
    const cached = await cache.match(request, { ignoreSearch: true });

    if (cached) {
      return cached;
    }

    if (request.mode === "navigate") {
      return cache.match(scopedUrl("grammar"));
    }

    throw new Error(`No offline response is available for ${request.url}`);
  }
}

function getByteRange(request, byteLength) {
  const header = request.headers.get("range");
  const match = /^bytes=(\d*)-(\d*)$/u.exec(header || "");

  if (!match) {
    return undefined;
  }

  const suffixLength = match[1] ? undefined : Number(match[2]);
  const start = suffixLength === undefined
    ? Number(match[1])
    : Math.max(0, byteLength - suffixLength);
  const requestedEnd = match[1] && match[2] ? Number(match[2]) : byteLength - 1;
  const end = Math.min(requestedEnd, byteLength - 1);

  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > end) {
    return undefined;
  }

  return { start, end };
}

async function createAudioResponse(response, request) {
  if (!request.headers.has("range")) {
    return response;
  }

  const bytes = await response.arrayBuffer();
  const range = getByteRange(request, bytes.byteLength);

  if (!range) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${bytes.byteLength}` }
    });
  }

  const body = bytes.slice(range.start, range.end + 1);

  return new Response(body, {
    status: 206,
    headers: {
      "Accept-Ranges": "bytes",
      "Content-Length": String(body.byteLength),
      "Content-Range": `bytes ${range.start}-${range.end}/${bytes.byteLength}`,
      "Content-Type": response.headers.get("Content-Type") || "audio/mp4"
    }
  });
}

async function getFullAudioResponse(request) {
  const cache = await caches.open(voiceCacheName);
  const cached = await cache.match(request.url);

  if (cached) {
    return cached;
  }

  const response = await fetch(new Request(request.url, {
    credentials: request.credentials,
    mode: request.mode,
    cache: "no-cache"
  }));

  if (response.ok) {
    await cache.put(request.url, response.clone());
  }

  return response;
}

async function handleAudioRequest(request) {
  const cache = await caches.open(voiceCacheName);
  const cached = await cache.match(request.url);

  if (request.method === "HEAD") {
    if (cached) {
      return new Response(null, {
        status: 200,
        headers: { "Content-Type": cached.headers.get("Content-Type") || "audio/mp4" }
      });
    }

    return fetch(request);
  }

  const response = cached || await getFullAudioResponse(request);
  return createAudioResponse(response, request);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname.includes("/assets/voices/") && ["GET", "HEAD"].includes(request.method)) {
    event.respondWith(handleAudioRequest(request));
    return;
  }

  if (request.method === "GET") {
    event.respondWith(networkFirst(request));
  }
});
