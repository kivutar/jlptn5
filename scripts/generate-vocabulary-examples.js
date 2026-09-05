import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = join(rootDirectory, "data", "source", "vocabulary-examples.json");
const frenchPath = join(
  rootDirectory,
  "data",
  "source",
  "locales",
  "fr",
  "vocabulary-examples.json"
);
const vocabularyPath = join(rootDirectory, "data", "jlpt-n5-vocabulary.json");
const frenchVocabularyPath = join(
  rootDirectory,
  "data",
  "source",
  "locales",
  "fr",
  "vocabulary.json"
);
const apiKeyPath = join(rootDirectory, ".key");
const model = "gpt-5.4-mini";
const defaultBatchSize = 40;

function readJson(path) {
  return readFile(path, "utf8").then(JSON.parse);
}

async function readJsonIfPresent(path, fallback) {
  try {
    return await readJson(path);
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallback;
    }

    throw error;
  }
}

function parsePositiveInteger(value, option) {
  if (!/^[1-9]\d*$/u.test(value || "")) {
    throw new Error(`${option} requires a positive integer.`);
  }

  return Number(value);
}

function parseArguments(arguments_) {
  let all = false;
  let batchSize = defaultBatchSize;
  let limit;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];

    if (argument === "--all") {
      all = true;
    } else if (argument === "--batch-size") {
      batchSize = parsePositiveInteger(arguments_[index += 1], argument);
    } else if (argument.startsWith("--batch-size=")) {
      batchSize = parsePositiveInteger(argument.slice("--batch-size=".length), "--batch-size");
    } else if (argument === "--limit") {
      limit = parsePositiveInteger(arguments_[index += 1], argument);
    } else if (argument.startsWith("--limit=")) {
      limit = parsePositiveInteger(argument.slice("--limit=".length), "--limit");
    } else {
      throw new Error(`Unknown option ${argument}.`);
    }
  }

  if (all === (limit !== undefined)) {
    throw new Error("Choose exactly one of --all or --limit COUNT.");
  }

  return { batchSize, limit };
}

function extractOutputText(response) {
  return (response.output || [])
    .filter(({ type }) => type === "message")
    .flatMap(({ content }) => content || [])
    .filter(({ type }) => type === "output_text")
    .map(({ text }) => text)
    .join("");
}

function createResponseBody(entries, allowedVocabulary, validationCorrection) {
  return {
    model,
    store: false,
    reasoning: { effort: "low" },
    instructions: [
      "You are editing a beginner Japanese vocabulary course.",
      "Create exactly one bespoke example for every supplied vocabulary entry.",
      "Each Japanese example must be one natural, complete sentence of at most 18 Japanese characters, excluding punctuation, and end in 。, ！, or ？.",
      "Use one short clause whenever possible. Never join independent ideas.",
      "Show one clear, everyday use of the requested vocabulary sense. Disambiguate homophones and polysemous words through context.",
      "Do not mention, quote, define, spell, or talk about the target word; actually use it.",
      "Use only the target entry, basic Japanese particles and auxiliaries, and words from ALLOWED_VOCABULARY.",
      "Natural conjugations are allowed. Prefer polite N5-level grammar.",
      "For entries containing ～, replace ～ with a natural concrete word or number and return only the realized target portion as targetSurface.",
      "targetSurface must occur as a contiguous substring of japanese and identify the target's actual use.",
      "English and French must translate the whole sentence naturally and make the intended target sense clear.",
      `ALLOWED_VOCABULARY: ${allowedVocabulary}`
    ].join("\n"),
    input: JSON.stringify({
      entries,
      ...(validationCorrection
        ? {
            validationCorrection:
              `The previous batch was rejected: ${validationCorrection} Rewrite the batch and fix this exact problem.`
          }
        : {})
    }),
    max_output_tokens: Math.max(6000, entries.length * 260),
    text: {
      format: {
        type: "json_schema",
        name: "vocabulary_examples",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["examples"],
          properties: {
            examples: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: [
                  "vocabularyId",
                  "japanese",
                  "targetSurface",
                  "english",
                  "french"
                ],
                properties: {
                  vocabularyId: { type: "string" },
                  japanese: { type: "string" },
                  targetSurface: { type: "string" },
                  english: { type: "string" },
                  french: { type: "string" }
                }
              }
            }
          }
        }
      }
    }
  };
}

async function requestExamples(apiKey, entries, allowedVocabulary, validationCorrection) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(createResponseBody(entries, allowedVocabulary, validationCorrection))
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(body?.error?.message || "OpenAI could not generate examples.");
  }

  const outputText = extractOutputText(body);

  if (!outputText) {
    throw new Error(`OpenAI returned no example data (${body?.status || "unknown status"}).`);
  }

  return JSON.parse(outputText).examples;
}

async function requestValidatedExamples(apiKey, entries, allowedVocabulary) {
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const generated = await requestExamples(
      apiKey,
      entries,
      allowedVocabulary,
      lastError?.message
    );

    try {
      validateBatch(generated, entries);
      return generated;
    } catch (error) {
      lastError = error;
      console.warn(`Rejected generated batch (attempt ${attempt}/3): ${error.message}`);
    }
  }

  throw lastError;
}

function validateBatch(generated, requestedEntries) {
  const requestedIds = new Set(requestedEntries.map(({ vocabularyId }) => vocabularyId));

  if (!Array.isArray(generated) || generated.length !== requestedEntries.length) {
    throw new Error("The generated example count does not match the requested batch.");
  }

  for (const example of generated) {
    const { vocabularyId, japanese, targetSurface, english, french } = example || {};
    const occurrenceCount = typeof japanese === "string" && typeof targetSurface === "string"
      ? japanese.split(targetSurface).length - 1
      : 0;
    const contentLength = typeof japanese === "string"
      ? [...japanese.replace(/[\s。、！？!?]/gu, "")].length
      : Number.POSITIVE_INFINITY;

    if (
      !requestedIds.delete(vocabularyId) ||
      !japanese?.trim() ||
      !/[。！？]$/u.test(japanese) ||
      !targetSurface?.trim() ||
      targetSurface.includes("～") ||
      occurrenceCount < 1 ||
      contentLength > 18 ||
      !english?.trim() ||
      !french?.trim()
    ) {
      throw new Error(
        `Invalid generated example for ${vocabularyId || "unknown vocabulary"}: ${
          JSON.stringify(example)
        }.`
      );
    }
  }

  if (requestedIds.size > 0) {
    throw new Error(`Missing generated ids: ${[...requestedIds].join(", ")}.`);
  }
}

async function writeSources(vocabulary, examplesById, frenchById) {
  const examples = vocabulary
    .map(({ id }) => examplesById.get(id))
    .filter(Boolean);
  const french = Object.fromEntries(vocabulary.flatMap(({ id }) => {
    const translation = frenchById.get(id);

    return translation ? [[id, { translation }]] : [];
  }));

  await mkdir(dirname(frenchPath), { recursive: true });
  await Promise.all([
    writeFile(sourcePath, `${JSON.stringify(examples, null, 2)}\n`),
    writeFile(frenchPath, `${JSON.stringify(french, null, 2)}\n`)
  ]);
}

async function main(arguments_ = process.argv.slice(2)) {
  const { batchSize, limit } = parseArguments(arguments_);
  const [vocabulary, frenchVocabulary, existingExamples, existingFrench, apiKey] =
    await Promise.all([
      readJson(vocabularyPath),
      readJson(frenchVocabularyPath),
      readJsonIfPresent(sourcePath, []),
      readJsonIfPresent(frenchPath, {}),
      readFile(apiKeyPath, "utf8").then((value) => value.trim())
    ]);
  const examplesById = new Map(existingExamples.map((entry) => [entry.vocabularyId, entry]));
  const frenchById = new Map(Object.entries(existingFrench).map(([id, entry]) => [
    id,
    entry.translation
  ]));
  const missing = vocabulary.filter(({ id }) => !examplesById.has(id));
  const pending = limit === undefined ? missing : missing.slice(0, limit);
  const allowedVocabulary = [...new Set(vocabulary.flatMap(({ term, reading, variants = [] }) => [
    term,
    reading,
    ...variants
  ]))].join("、");

  if (pending.length === 0) {
    console.log(`All ${vocabulary.length} vocabulary examples already exist.`);
    return;
  }

  for (let offset = 0; offset < pending.length; offset += batchSize) {
    const batch = pending.slice(offset, offset + batchSize).map((entry) => ({
      vocabularyId: entry.id,
      term: entry.term,
      reading: entry.reading,
      partOfSpeech: entry.partOfSpeech,
      englishMeaning: entry.meaning,
      frenchMeaning: frenchVocabulary[entry.id]?.meaning
    }));

    console.log(
      `Generating examples ${offset + 1}-${offset + batch.length} of ${pending.length}...`
    );
    const generated = await requestValidatedExamples(apiKey, batch, allowedVocabulary);
    for (const { vocabularyId, japanese, targetSurface, english, french } of generated) {
      examplesById.set(vocabularyId, {
        vocabularyId,
        text: japanese,
        targetSurface,
        translation: english
      });
      frenchById.set(vocabularyId, french);
    }
    await writeSources(vocabulary, examplesById, frenchById);
  }

  console.log(`Prepared ${examplesById.size} dedicated vocabulary examples.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}

export { createResponseBody, parseArguments, validateBatch };
