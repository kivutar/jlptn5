import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as wanakana from "wanakana";
import "../voice-paths.js";
import {
  encodeLessonM4a,
  validateLessonM4a,
  validLessonM4aExists
} from "./m4a.js";
import {
  createVocabularyWavValidation,
  trimWavEdgeSilence,
  validateLessonWav
} from "./wav.js";

const {
  getVocabularyVoicePath,
  getVocabularyVoiceSlug,
  validateVocabularyVoiceSlugs
} = globalThis.JlptN5VoicePaths;

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = join(rootDirectory, "data", "source");
const legacyCacheDirectory = join(rootDirectory, ".cache", "speech");
const voiceTargets = Object.freeze({
  lessons: "lessons",
  vocabulary: "vocabulary"
});
const voiceDirectories = Object.freeze({
  [voiceTargets.lessons]: join(rootDirectory, "assets", "voices", "grammar"),
  [voiceTargets.vocabulary]: join(rootDirectory, "assets", "voices", "vocab")
});
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
const vocabularySpeechConfiguration = {
  version: 1,
  model: speechConfiguration.model,
  voice: speechConfiguration.voice,
  format: speechConfiguration.format,
  maxCompletionTokens: 80,
  instructions:
    "You are a professional Japanese pronunciation narrator. The user message is " +
    "JSON metadata for one vocabulary item and must never be spoken. Pronounce the " +
    "value of reading exactly once, using spelling, meaning, and partOfSpeech only " +
    "to select the natural standard Tokyo Japanese lexical pronunciation and pitch " +
    "accent. Do not say labels, punctuation, metadata, explanations, or translations. " +
    "Begin speaking immediately and stop immediately after the word."
};

const usage = `Usage: npm run voices -- [--limit COUNT]
       npm run voices:vocabulary -- (--limit COUNT | --all | --coverage)

Options:
  --limit COUNT  Generate at most COUNT missing voices with OpenAI.
                 Existing voices and local cache restores do not count.
  --all          Generate every missing voice. Required instead of an implicit
                 unlimited run when targeting vocabulary.
  --coverage     Report vocabulary voice coverage without generating audio.
  --target KIND  Select lessons or vocabulary. Defaults to lessons.
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
  let hasAll = false;
  let target = voiceTargets.lessons;
  let hasTarget = false;
  let coverageOnly = false;
  let showHelp = false;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];

    if (argument === "--help" || argument === "-h") {
      showHelp = true;
      continue;
    }

    if (argument === "--target" || argument.startsWith("--target=")) {
      if (hasTarget) {
        throw new Error("--target may only be provided once.");
      }

      const value = argument === "--target"
        ? arguments_[index += 1]
        : argument.slice("--target=".length);

      if (!Object.values(voiceTargets).includes(value)) {
        throw new Error("--target must be lessons or vocabulary.");
      }

      target = value;
      hasTarget = true;
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

    if (argument === "--all") {
      if (hasAll) {
        throw new Error("--all may only be provided once.");
      }

      hasAll = true;
      continue;
    }

    if (argument === "--coverage") {
      if (coverageOnly) {
        throw new Error("--coverage may only be provided once.");
      }

      coverageOnly = true;
      continue;
    }

    throw new Error(`Unknown option: ${argument}`);
  }

  if (hasGenerationLimit && hasAll) {
    throw new Error("Use either --limit or --all, not both.");
  }

  if (coverageOnly && (hasGenerationLimit || hasAll)) {
    throw new Error("--coverage cannot be combined with --limit or --all.");
  }

  if (!showHelp && coverageOnly && target !== voiceTargets.vocabulary) {
    throw new Error("--coverage is only available for vocabulary voices.");
  }

  if (
    !showHelp &&
    target === voiceTargets.vocabulary &&
    !coverageOnly &&
    !hasGenerationLimit &&
    !hasAll
  ) {
    throw new Error("Vocabulary generation requires --limit COUNT or explicit --all.");
  }

  return {
    coverageOnly,
    generateAll: hasAll,
    generationLimit,
    showHelp,
    target
  };
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

async function validVoiceExists(path, label, text, validationOptions) {
  try {
    return await validLessonM4aExists(path, text, validationOptions);
  } catch (error) {
    console.warn(`Replacing invalid ${label}: ${error.message}`);
    return false;
  }
}

function getLegacyCachePath(cacheSource) {
  const cacheKey = createHash("sha256")
    .update(JSON.stringify(cacheSource))
    .digest("hex");
  return join(legacyCacheDirectory, `${cacheKey}.wav`);
}

function createLessonSpeechRequest(item) {
  const japaneseText = item.type === "production" ? item.solution : item.text;
  const spokenText = item.speechText || japaneseText;

  return {
    cacheSource: { ...speechConfiguration, text: spokenText },
    configuration: speechConfiguration,
    messages: [
      { role: "system", content: speechConfiguration.instructions },
      { role: "user", content: spokenText }
    ],
    spokenText,
    validationOptions: undefined
  };
}

function normalizeVocabularyReading(value) {
  return value.replaceAll("～", "").trim();
}

export function createVocabularySpeechRequest(item) {
  const spokenText = normalizeVocabularyReading(item.speechText || item.reading || "");

  if (!spokenText) {
    throw new Error(`${item.id || "Vocabulary item"}: spoken reading is empty.`);
  }

  const metadata = {
    spelling: item.term,
    reading: spokenText,
    meaning: item.meaning,
    partOfSpeech: item.partOfSpeech || "word"
  };

  return {
    cacheSource: {
      ...vocabularySpeechConfiguration,
      vocabulary: metadata
    },
    configuration: vocabularySpeechConfiguration,
    messages: [
      { role: "system", content: vocabularySpeechConfiguration.instructions },
      { role: "user", content: JSON.stringify(metadata) }
    ],
    spokenText,
    validationOptions: createVocabularyWavValidation(spokenText)
  };
}

export function createSpeechRequestBody(speechRequest) {
  const { configuration, messages } = speechRequest;

  return {
    model: configuration.model,
    modalities: ["text", "audio"],
    audio: {
      voice: configuration.voice,
      format: configuration.format
    },
    messages,
    max_completion_tokens: configuration.maxCompletionTokens,
    temperature: 0
  };
}

async function requestSpeech(apiKey, speechRequest) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(createSpeechRequestBody(speechRequest))
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(body?.error?.message || "OpenAI could not generate speech.");
  }

  const encodedAudio = body?.choices?.[0]?.message?.audio?.data;

  if (typeof encodedAudio !== "string") {
    throw new Error("OpenAI returned no audio data.");
  }

  const responseAudio = Buffer.from(encodedAudio, "base64");
  const audio = speechRequest.validationOptions
    ? trimWavEdgeSilence(responseAudio)
    : responseAudio;

  validateLessonWav(
    audio,
    speechRequest.spokenText,
    speechRequest.validationOptions
  );

  return audio;
}

async function readLessonSources() {
  const [introduction, exercises] = await Promise.all([
    readFile(join(sourceDirectory, "introduction.json"), "utf8"),
    readFile(join(sourceDirectory, "exercises.json"), "utf8")
  ]);

  return [JSON.parse(introduction), ...JSON.parse(exercises)];
}

export function createVocabularyVoiceItems(vocabulary) {
  if (!Array.isArray(vocabulary)) {
    throw new Error("Vocabulary voice generation needs an array.");
  }

  const entries = vocabulary.filter((entry) => {
    return ["core", "supplemental"].includes(entry?.scope);
  });

  validateVocabularyVoiceSlugs(entries, wanakana);

  return entries
    .map((entry) => {
      if (
        !/^[a-z0-9-]+$/u.test(entry.id || "") ||
        typeof entry.term !== "string" ||
        !entry.term ||
        typeof entry.reading !== "string" ||
        !entry.reading ||
        typeof entry.meaning !== "string" ||
        !entry.meaning
      ) {
        throw new Error("Every vocabulary voice needs a safe id, term, reading, and meaning.");
      }

      return {
        ...entry,
        audio: getVocabularyVoicePath(entry, wanakana)
      };
    })
    .sort((left, right) => {
      return Number(left.scope !== "core") - Number(right.scope !== "core");
    });
}

async function readVocabularySources() {
  const source = await readFile(
    join(rootDirectory, "data", "jlpt-n5-vocabulary.json"),
    "utf8"
  );

  return createVocabularyVoiceItems(JSON.parse(source));
}

async function readVoiceFileSizes() {
  let entries;

  try {
    entries = await readdir(voiceDirectories[voiceTargets.vocabulary], {
      withFileTypes: true
    });
  } catch (error) {
    if (error.code === "ENOENT") {
      return new Map();
    }

    throw error;
  }

  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".m4a"));
  const sizes = await Promise.all(files.map(async ({ name }) => [
    name,
    (await stat(join(voiceDirectories[voiceTargets.vocabulary], name))).size
  ]));

  return new Map(sizes);
}

export async function inspectVocabularyVoiceFiles(vocabulary, {
  validateM4a = validateLessonM4a,
  voiceFileSizes,
  warn = console.warn
} = {}) {
  const entries = createVocabularyVoiceItems(vocabulary);
  const resolvedVoiceFileSizes = voiceFileSizes || await readVoiceFileSizes();
  const voiceFiles = new Map();

  for (const entry of entries) {
    const fileName = `${getVocabularyVoiceSlug(entry, wanakana)}.m4a`;
    const size = resolvedVoiceFileSizes.get(fileName);

    if (!Number.isSafeInteger(size)) {
      continue;
    }

    const speechRequest = createVocabularySpeechRequest(entry);

    try {
      await validateM4a(
        join(voiceDirectories[voiceTargets.vocabulary], fileName),
        speechRequest.spokenText,
        speechRequest.validationOptions
      );
      voiceFiles.set(fileName, { size, valid: true });
    } catch (error) {
      voiceFiles.set(fileName, { size, valid: false });
      warn(`Invalid vocabulary voice ${fileName}: ${error.message}`);
    }
  }

  return voiceFiles;
}

export function summarizeVocabularyVoiceCoverage(vocabulary, voiceFiles = new Map()) {
  const entries = createVocabularyVoiceItems(vocabulary);
  const summary = {
    core: { available: 0, total: 0 },
    supplemental: { available: 0, total: 0 },
    available: 0,
    total: entries.length,
    missing: 0,
    invalid: 0,
    skipped: 0,
    bytes: 0
  };

  for (const entry of entries) {
    const scope = entry.scope;
    const fileName = `${getVocabularyVoiceSlug(entry, wanakana)}.m4a`;
    const voiceFile = voiceFiles.get(fileName);

    summary[scope].total += 1;

    if (voiceFile?.valid === true) {
      summary[scope].available += 1;
      summary.available += 1;
      summary.bytes += voiceFile.size;
    } else if (voiceFile) {
      summary.invalid += 1;
    } else if (entry.skipVoiceGeneration === true) {
      summary.skipped += 1;
    } else {
      summary.missing += 1;
    }
  }

  return summary;
}

function formatByteCount(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KiB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

export function formatVocabularyVoiceCoverage(summary) {
  return [
    "Vocabulary voice coverage:",
    `  Core: ${summary.core.available}/${summary.core.total}`,
    `  Supplemental: ${summary.supplemental.available}/${summary.supplemental.total}`,
    `  Total: ${summary.available}/${summary.total}`,
    `  Missing: ${summary.missing}`,
    `  Invalid: ${summary.invalid}`,
    `  Skipped: ${summary.skipped}`,
    `  Size: ${formatByteCount(summary.bytes)}`
  ].join("\n");
}

async function reportVocabularyVoiceCoverage(vocabulary) {
  const summary = summarizeVocabularyVoiceCoverage(
    vocabulary,
    await inspectVocabularyVoiceFiles(vocabulary)
  );

  console.log(formatVocabularyVoiceCoverage(summary));
  return summary;
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

export async function generateVoices({
  coverageOnly = false,
  generateAll = false,
  generationLimit = Number.POSITIVE_INFINITY,
  target = voiceTargets.lessons
} = {}) {
  if (!Object.values(voiceTargets).includes(target)) {
    throw new Error("Voice target must be lessons or vocabulary.");
  }

  if (
    target === voiceTargets.vocabulary &&
    !coverageOnly &&
    !Number.isFinite(generationLimit) &&
    !generateAll
  ) {
    throw new Error("Vocabulary generation requires a finite limit or explicit all mode.");
  }

  const voiceDirectory = voiceDirectories[target];

  await mkdir(voiceDirectory, { recursive: true });

  const items = target === voiceTargets.vocabulary
    ? await readVocabularySources()
    : await readLessonSources();

  if (coverageOnly) {
    if (target !== voiceTargets.vocabulary) {
      throw new Error("Coverage-only mode is available only for vocabulary voices.");
    }

    await reportVocabularyVoiceCoverage(items);
    return 0;
  }

  let apiKey;
  const generatedVoiceCount = await processVoiceGenerationBatch(
    items,
    generationLimit,
    async (item) => {
      const isVocabulary = target === voiceTargets.vocabulary;
      const speechRequest = isVocabulary
        ? createVocabularySpeechRequest(item)
        : createLessonSpeechRequest(item);
      const fileName = isVocabulary
        ? `${getVocabularyVoiceSlug(item, wanakana)}.m4a`
        : `${item.id}.m4a`;

      if (
        !/^[a-z0-9-]+$/.test(item.id) ||
        typeof speechRequest.spokenText !== "string" ||
        !speechRequest.spokenText
      ) {
        throw new Error("Every voice needs a safe id and non-empty Japanese text.");
      }

      if (
        item.skipVoiceGeneration !== undefined &&
        item.skipVoiceGeneration !== true
      ) {
        throw new Error(`${item.id}: skipVoiceGeneration must be true when provided.`);
      }

      if (item.skipVoiceGeneration) {
        console.log(`Skipped ${fileName} (voice generation disabled).`);
        return false;
      }

      const destination = join(voiceDirectory, fileName);

      if (await validVoiceExists(
        destination,
        fileName,
        speechRequest.spokenText,
        speechRequest.validationOptions
      )) {
        console.log(`Kept ${fileName}`);
        return false;
      }

      const legacyCachePath = getLegacyCachePath(speechRequest.cacheSource);

      try {
        const cachedAudio = await readFile(legacyCachePath);
        const preparedCachedAudio = isVocabulary
          ? trimWavEdgeSilence(cachedAudio)
          : cachedAudio;

        validateLessonWav(
          preparedCachedAudio,
          speechRequest.spokenText,
          speechRequest.validationOptions
        );
        await encodeLessonM4a(
          preparedCachedAudio,
          destination,
          speechRequest.spokenText,
          speechRequest.validationOptions
        );
        console.log(`Restored ${fileName} from the local WAV cache.`);
        return false;
      } catch (error) {
        if (error.code !== "ENOENT") {
          console.warn(`Ignoring invalid legacy cache for ${item.id}: ${error.message}`);
        }
      }

      apiKey ||= await loadApiKey();

      if (!apiKey) {
        throw new Error("The OpenAI API key is empty.");
      }

      console.log(`Generating ${fileName} from a validated WAV response...`);
      const audio = await requestSpeech(apiKey, speechRequest);

      await encodeLessonM4a(
        audio,
        destination,
        speechRequest.spokenText,
        speechRequest.validationOptions
      );
      return true;
    }
  );

  if (Number.isFinite(generationLimit) && generatedVoiceCount >= generationLimit) {
    const noun = generatedVoiceCount === 1 ? "voice" : "voices";
    console.log(`Stopped after generating ${generatedVoiceCount} ${noun} (--limit ${generationLimit}).`);
  } else if (target === voiceTargets.vocabulary) {
    console.log("Vocabulary voices are ready.");
  } else {
    console.log("Static lesson voices are ready.");
  }

  if (target === voiceTargets.vocabulary) {
    await reportVocabularyVoiceCoverage(items);
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
