import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateLessonWav } from "./wav.js";

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = join(rootDirectory, "data", "source");
const voiceDirectory = join(rootDirectory, "assets", "voices");
const legacyCacheDirectory = join(rootDirectory, ".cache", "speech");
const speechConfiguration = {
  version: 2,
  model: "gpt-audio-1.5",
  voice: "marin",
  format: "wav",
  maxCompletionTokens: 220,
  instructions:
    "You are a professional Japanese narrator for beginner language lessons. " +
    "Speak only the exact text in the user's message; do not add, omit, paraphrase, " +
    "translate, or explain anything. Use natural standard Tokyo Japanese with native " +
    "pitch accent, a warm neutral tone, and a clear, moderately slow teaching pace. " +
    "Begin speaking immediately and stop after the final punctuation; do not produce " +
    "silence or non-speech audio. Keep punctuation pauses natural. Pronounce エヌご " +
    "as エヌご, referring to JLPT N5."
};

const usage = `Usage: npm run voices -- [--limit COUNT]

Options:
  --limit COUNT  Generate at most COUNT missing voices with OpenAI.
                 Existing voices and local cache restores do not count.
  --help         Show this help.`;

function parsePositiveInteger(value, option) {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error(`${option} needs a positive integer.`);
  }

  const number = Number(value);

  if (!Number.isSafeInteger(number)) {
    throw new Error(`${option} is too large.`);
  }

  return number;
}

export function parseVoiceGenerationArguments(arguments_) {
  let generationLimit = Number.POSITIVE_INFINITY;
  let hasGenerationLimit = false;
  let showHelp = false;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];

    if (argument === "--help" || argument === "-h") {
      showHelp = true;
      continue;
    }

    if (argument === "--limit" || argument.startsWith("--limit=")) {
      if (hasGenerationLimit) {
        throw new Error("--limit may only be provided once.");
      }

      const value = argument === "--limit"
        ? arguments_[index += 1]
        : argument.slice("--limit=".length);

      if (value === undefined) {
        throw new Error("--limit needs a positive integer.");
      }

      generationLimit = parsePositiveInteger(value, "--limit");
      hasGenerationLimit = true;
      continue;
    }

    throw new Error(`Unknown option: ${argument}`);
  }

  return { generationLimit, showHelp };
}

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

async function validVoiceExists(path, label, text) {
  try {
    validateLessonWav(await readFile(path), text);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }

    console.warn(`Replacing invalid ${label}: ${error.message}`);
    return false;
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
      max_completion_tokens: speechConfiguration.maxCompletionTokens,
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

  validateLessonWav(audio, text);

  return audio;
}

async function readSources() {
  const [introduction, exercises] = await Promise.all([
    readFile(join(sourceDirectory, "introduction.json"), "utf8"),
    readFile(join(sourceDirectory, "exercises.json"), "utf8")
  ]);

  return [JSON.parse(introduction), ...JSON.parse(exercises)];
}

export async function processVoiceGenerationBatch(
  lessons,
  generationLimit,
  prepareVoice
) {
  let generatedVoiceCount = 0;

  for (const lesson of lessons) {
    if (generatedVoiceCount >= generationLimit) {
      break;
    }

    if (await prepareVoice(lesson)) {
      generatedVoiceCount += 1;
    }
  }

  return generatedVoiceCount;
}

export async function generateVoices({ generationLimit = Number.POSITIVE_INFINITY } = {}) {
  await mkdir(voiceDirectory, { recursive: true });

  let apiKey;
  const generatedVoiceCount = await processVoiceGenerationBatch(
    await readSources(),
    generationLimit,
    async (lesson) => {
      const japaneseText = lesson.type === "production" ? lesson.solution : lesson.text;

      if (!/^[a-z0-9-]+$/.test(lesson.id) || typeof japaneseText !== "string" || !japaneseText) {
        throw new Error("Every lesson needs a safe id and non-empty text.");
      }

      const destination = join(voiceDirectory, `${lesson.id}.wav`);

      const text = lesson.speechText || japaneseText;

      if (await validVoiceExists(destination, `${lesson.id}.wav`, text)) {
        console.log(`Kept ${lesson.id}.wav`);
        return false;
      }

      const legacyCachePath = getLegacyCachePath(text);

      if (await validVoiceExists(legacyCachePath, `legacy cache for ${lesson.id}.wav`, text)) {
        await copyFile(legacyCachePath, destination);
        console.log(`Restored ${lesson.id}.wav from the local cache.`);
        return false;
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
      return true;
    }
  );

  if (Number.isFinite(generationLimit) && generatedVoiceCount >= generationLimit) {
    const noun = generatedVoiceCount === 1 ? "voice" : "voices";
    console.log(`Stopped after generating ${generatedVoiceCount} ${noun} (--limit ${generationLimit}).`);
  } else {
    console.log("Static lesson voices are ready.");
  }

  return generatedVoiceCount;
}

export async function main(arguments_ = process.argv.slice(2)) {
  const options = parseVoiceGenerationArguments(arguments_);

  if (options.showHelp) {
    console.log(usage);
    return;
  }

  await generateVoices(options);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
