import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TokenizerBuilder } from "lindera-wasm-ipadic-nodejs";

const rootDirectory = dirname(fileURLToPath(import.meta.url));
const host = "127.0.0.1";
const port = Number.parseInt(process.env.PORT || "4173", 10);
const speechCacheDirectory = join(rootDirectory, ".cache", "speech");
const pendingSpeechRequests = new Map();
const tokenizerBuilder = new TokenizerBuilder();

tokenizerBuilder.setDictionary("embedded://ipadic");
tokenizerBuilder.setMode("normal");

const tokenizer = tokenizerBuilder.build();
const speechConfiguration = {
  version: 1,
  model: "gpt-audio-1.5",
  voice: "marin",
  format: "wav",
  instructions:
    "You are a professional Japanese narrator for beginner language lessons. " +
    "Speak only the exact text in the user's message; do not add, omit, paraphrase, " +
    "translate, or explain anything. Use natural standard Tokyo Japanese with native " +
    "pitch accent, a warm neutral tone, and a clear, moderately slow teaching pace. " +
    "Keep punctuation pauses natural. Pronounce エヌご as エヌご, referring to JLPT N5."
};
const staticFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]]
]);

function normalizeApiKey(value) {
  let key = value.trim();

  if (key.startsWith("OPENAI_API_KEY=")) {
    key = key.slice("OPENAI_API_KEY=".length).trim();
  }

  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }

  return key;
}

async function loadApiKey() {
  let apiKey;

  if (process.env.OPENAI_API_KEY) {
    apiKey = normalizeApiKey(process.env.OPENAI_API_KEY);
  } else {
    try {
      apiKey = normalizeApiKey(await readFile(join(rootDirectory, ".key"), "utf8"));
    } catch {
      throw new Error("Add the OpenAI API key to .key or OPENAI_API_KEY.");
    }
  }

  if (!apiKey) {
    throw new Error("The OpenAI API key is empty.");
  }

  return apiKey;
}

async function readJson(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;

    if (size > 4096) {
      const error = new Error("Request body is too large.");
      error.statusCode = 413;
      throw error;
    }

    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.statusCode = 400;
    throw error;
  }
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(body));
}

function getSpeechCachePath(text) {
  const cacheKey = createHash("sha256")
    .update(JSON.stringify({ ...speechConfiguration, text }))
    .digest("hex");
  return join(speechCacheDirectory, `${cacheKey}.wav`);
}

async function readCachedSpeech(cachePath) {
  try {
    return await readFile(cachePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

async function requestSpeech(apiKey, text) {
  const openAiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: speechConfiguration.model,
      modalities: ["text", "audio"],
      audio: {
        voice: speechConfiguration.voice,
        format: speechConfiguration.format
      },
      messages: [
        { role: "system", content: speechConfiguration.instructions },
        { role: "user", content: text }
      ],
      temperature: 0
    })
  });

  const responseBody = await openAiResponse.json().catch(() => null);

  if (!openAiResponse.ok) {
    const message = responseBody?.error?.message || "OpenAI could not generate speech.";
    const error = new Error(message);
    error.statusCode = 502;
    throw error;
  }

  const encodedAudio = responseBody?.choices?.[0]?.message?.audio?.data;

  if (typeof encodedAudio !== "string") {
    const error = new Error("OpenAI returned no audio data.");
    error.statusCode = 502;
    throw error;
  }

  const audio = Buffer.from(encodedAudio, "base64");

  if (audio.length === 0) {
    const error = new Error("OpenAI returned empty audio data.");
    error.statusCode = 502;
    throw error;
  }

  return audio;
}

async function generateAndCacheSpeech(apiKey, text, cachePath) {
  const audio = await requestSpeech(apiKey, text);
  const temporaryPath = `${cachePath}.${process.pid}.${Date.now()}.tmp`;

  await mkdir(speechCacheDirectory, { recursive: true, mode: 0o700 });
  await writeFile(temporaryPath, audio, { mode: 0o600 });
  await rename(temporaryPath, cachePath);
  return audio;
}

async function generateSpeech(apiKey, text) {
  const cachePath = getSpeechCachePath(text);
  const cachedAudio = await readCachedSpeech(cachePath);

  if (cachedAudio) {
    return { audio: cachedAudio, cacheStatus: "HIT" };
  }

  let pendingRequest = pendingSpeechRequests.get(cachePath);

  if (!pendingRequest) {
    pendingRequest = generateAndCacheSpeech(apiKey, text, cachePath);
    pendingSpeechRequests.set(cachePath, pendingRequest);
  }

  try {
    return { audio: await pendingRequest, cacheStatus: "MISS" };
  } finally {
    if (pendingSpeechRequests.get(cachePath) === pendingRequest) {
      pendingSpeechRequests.delete(cachePath);
    }
  }
}

async function handleSpeechRequest(request, response, apiKey) {
  if (!request.headers["content-type"]?.startsWith("application/json")) {
    const error = new Error("Content-Type must be application/json.");
    error.statusCode = 415;
    throw error;
  }

  const { text } = await readJson(request);

  if (typeof text !== "string" || text.trim().length === 0 || text.length > 1000) {
    const error = new Error("Speech text must contain between 1 and 1000 characters.");
    error.statusCode = 400;
    throw error;
  }

  const { audio, cacheStatus } = await generateSpeech(apiKey, text.trim());
  response.writeHead(200, {
    "Content-Type": "audio/wav",
    "Content-Length": audio.length,
    "Cache-Control": "private, max-age=31536000, immutable",
    "X-Speech-Cache": cacheStatus
  });
  response.end(audio);
}

function getTokenCategory(details) {
  return {
    助詞: "particle",
    動詞: "verb",
    助動詞: "auxiliary",
    形容詞: "adjective",
    名詞: "noun",
    感動詞: "interjection"
  }[details[0]];
}

function tokenizeForLesson(text) {
  return tokenizer.tokenize(text).map((token) => {
    return {
      surface: token.surface,
      category: getTokenCategory(token.details)
    };
  });
}

async function handleTokenizeRequest(request, response) {
  if (!request.headers["content-type"]?.startsWith("application/json")) {
    const error = new Error("Content-Type must be application/json.");
    error.statusCode = 415;
    throw error;
  }

  const { text } = await readJson(request);

  if (typeof text !== "string" || text.trim().length === 0 || text.length > 1000) {
    const error = new Error("Lesson text must contain between 1 and 1000 characters.");
    error.statusCode = 400;
    throw error;
  }

  sendJson(response, 200, { tokens: tokenizeForLesson(text) });
}

async function serveStaticFile(pathname, response, headOnly = false) {
  const asset = staticFiles.get(pathname);

  if (!asset) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const [fileName, contentType] = asset;
  const contents = await readFile(join(rootDirectory, fileName));
  response.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": contents.length
  });
  response.end(headOnly ? undefined : contents);
}

const apiKey = await loadApiKey();
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, `http://${request.headers.host || host}`).pathname;

  try {
    if (request.method === "POST" && pathname === "/api/speech") {
      await handleSpeechRequest(request, response, apiKey);
      return;
    }

    if (request.method === "POST" && pathname === "/api/tokenize") {
      await handleTokenizeRequest(request, response);
      return;
    }

    if (request.method === "GET" || request.method === "HEAD") {
      await serveStaticFile(pathname, response, request.method === "HEAD");
      return;
    }

    response.writeHead(405, { Allow: "GET, HEAD, POST" });
    response.end();
  } catch (error) {
    const statusCode = error.statusCode || 500;
    console.error(`[${request.method} ${pathname}] ${error.message}`);
    sendJson(response, statusCode, { error: error.message });
  }
});

server.listen(port, host, () => {
  console.log(`JLPT N5 is running at http://${host}:${port}`);
});
