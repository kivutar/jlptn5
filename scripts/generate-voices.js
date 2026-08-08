import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = join(rootDirectory, "data", "source");
const voiceDirectory = join(rootDirectory, "assets", "voices");
const legacyCacheDirectory = join(rootDirectory, ".cache", "speech");
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
  if (process.env.OPENAI_API_KEY) {
    return normalizeApiKey(process.env.OPENAI_API_KEY);
  }

  try {
    return normalizeApiKey(await readFile(join(rootDirectory, ".key"), "utf8"));
  } catch {
    throw new Error("Add the OpenAI API key to .key or OPENAI_API_KEY.");
  }
}

async function fileExists(path) {
  try {
    return (await stat(path)).size > 0;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

function getLegacyCachePath(text) {
  const cacheKey = createHash("sha256")
    .update(JSON.stringify({ ...speechConfiguration, text }))
    .digest("hex");
  return join(legacyCacheDirectory, `${cacheKey}.wav`);
}

async function requestSpeech(apiKey, text) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
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
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(body?.error?.message || "OpenAI could not generate speech.");
  }

  const encodedAudio = body?.choices?.[0]?.message?.audio?.data;

  if (typeof encodedAudio !== "string") {
    throw new Error("OpenAI returned no audio data.");
  }

  const audio = Buffer.from(encodedAudio, "base64");

  if (audio.length === 0) {
    throw new Error("OpenAI returned empty audio data.");
  }

  return audio;
}

async function readSources() {
  const [introduction, exercises] = await Promise.all([
    readFile(join(sourceDirectory, "introduction.json"), "utf8"),
    readFile(join(sourceDirectory, "exercises.json"), "utf8")
  ]);

  return [JSON.parse(introduction), ...JSON.parse(exercises)];
}

await mkdir(voiceDirectory, { recursive: true });

let apiKey;

for (const lesson of await readSources()) {
  if (!/^[a-z0-9-]+$/.test(lesson.id) || typeof lesson.text !== "string" || !lesson.text) {
    throw new Error("Every lesson needs a safe id and non-empty text.");
  }

  const destination = join(voiceDirectory, `${lesson.id}.wav`);

  if (await fileExists(destination)) {
    console.log(`Kept ${lesson.id}.wav`);
    continue;
  }

  const text = lesson.speechText || lesson.text;
  const legacyCachePath = getLegacyCachePath(text);

  if (await fileExists(legacyCachePath)) {
    await copyFile(legacyCachePath, destination);
    console.log(`Restored ${lesson.id}.wav from the local cache.`);
    continue;
  }

  apiKey ||= await loadApiKey();

  if (!apiKey) {
    throw new Error("The OpenAI API key is empty.");
  }

  console.log(`Generating ${lesson.id}.wav...`);
  const audio = await requestSpeech(apiKey, text);
  const temporaryPath = `${destination}.${process.pid}.tmp`;

  await writeFile(temporaryPath, audio, { mode: 0o600 });
  await rename(temporaryPath, destination);
}

console.log("Static lesson voices are ready.");
