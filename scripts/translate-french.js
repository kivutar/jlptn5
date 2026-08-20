import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceLocaleDirectory = join(rootDirectory, "data", "source", "locales", "fr");
const endpoint = "https://api.openai.com/v1/responses";
const model = "gpt-4.1-mini";
const batchSize = 20;
const maxBatchAttempts = 3;
const kinds = ["exercises", "grammar", "vocabulary", "kanji"];

function parseArguments(arguments_) {
  const options = { kind: "all", limit: Number.POSITIVE_INFINITY };

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];

    if (argument === "--kind") {
      options.kind = arguments_[index + 1];
      index += 1;
    } else if (argument === "--limit") {
      options.limit = Number.parseInt(arguments_[index + 1], 10);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (options.kind !== "all" && !kinds.includes(options.kind)) {
    throw new Error(`--kind must be one of: all, ${kinds.join(", ")}`);
  }

  if (!(options.limit > 0)) {
    throw new Error("--limit must be a positive integer.");
  }

  return options;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readExisting(path) {
  try {
    const value = await readJson(path);
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

async function loadApiKey() {
  return (await readFile(join(rootDirectory, ".key"), "utf8")).trim();
}

function getOutputText(response) {
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text") {
        return content.text;
      }
    }
  }

  throw new Error("The translation response contained no output text.");
}

function itemSchema(kind) {
  const common = {
    id: { type: "string" }
  };
  const properties = kind === "exercises"
    ? {
      ...common,
      translation: { type: "string" },
      hintWords: { type: "array", items: { type: "string" } }
    }
    : kind === "grammar"
      ? {
        ...common,
        name: { type: "string" },
        meaning: { type: "string" }
      }
      : kind === "vocabulary"
        ? {
          ...common,
          meaning: { type: "string" },
          acceptedAnswers: { type: "array", items: { type: "string" }, minItems: 1 }
        }
        : { ...common, meaning: { type: "string" } };

  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false
  };
}

function instructions(kind) {
  const shared = [
    "Translate learner-facing English into natural, concise standard French for a beginner Japanese study app.",
    "Preserve meaning exactly; do not simplify or add explanations.",
    "Use correct French punctuation and accents.",
    "Return one item for every supplied id, in the same order, and never alter an id."
  ];

  if (kind === "exercises") {
    shared.push(
      "For each production exercise, hintWords must contain one exact whitespace-or-punctuation-delimited token from the French translation for each supplied hint, in the supplied order.",
      "Use an empty hintWords array for recognition exercises.",
      "The hint token should be the French word that most directly corresponds to the supplied English hint word.",
      "First write the complete French translation, then copy each hint token character-for-character from that translation, including its actual conjugated or inflected form; never return a dictionary lemma that is absent from the translation.",
      "If necessary, rephrase the translation naturally so every requested hint has one corresponding token in it, and return exactly as many hintWords as supplied hints."
    );
  } else if (kind === "grammar") {
    shared.push("Keep Japanese patterns unchanged when they appear inside a name or explanation.");
  } else if (kind === "vocabulary") {
    shared.push(
      "meaning is the shortest clear French dictionary gloss.",
      "acceptedAnswers must include meaning and every materially distinct French equivalent expressed by the English gloss.",
      "Use infinitives for verbs and normally omit articles for nouns. Do not add unrelated synonyms.",
      "Never include an English answer unless the identical spelling is also a standard French word with the intended meaning."
    );
  } else {
    shared.push("Use a short French dictionary meaning suitable for a beginner kanji list.");
  }

  return shared.join(" ");
}

async function requestTranslations(apiKey, kind, entries) {
  const schema = itemSchema(kind);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      instructions: instructions(kind),
      input: JSON.stringify(entries),
      text: {
        format: {
          type: "json_schema",
          name: `french_${kind}`,
          strict: true,
          schema: {
            type: "object",
            properties: {
              items: {
                type: "array",
                items: schema,
                minItems: entries.length,
                maxItems: entries.length
              }
            },
            required: ["items"],
            additionalProperties: false
          }
        }
      },
      max_output_tokens: 8000,
      service_tier: "default",
      store: false
    })
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(body?.error?.message || `Translation request failed (${response.status}).`);
  }

  if (body?.status !== "completed") {
    throw new Error(`Translation response was incomplete (${body?.incomplete_details?.reason || "unknown"}).`);
  }

  return JSON.parse(getOutputText(body)).items;
}

function exerciseInput(exercise) {
  const production = exercise.type === "production";

  return {
    id: exercise.id,
    type: production ? "production" : "recognition",
    english: production ? exercise.text : exercise.solution,
    japanese: production ? exercise.solution : exercise.text,
    hints: production
      ? exercise.promptVocabularyHints.map(({ word }) => word)
      : []
  };
}

function normalizeToken(value) {
  return value.normalize("NFKC").toLocaleLowerCase("fr");
}

function isWordCharacter(character) {
  return Boolean(character && /[\p{L}\p{N}]/u.test(character));
}

function hasPromptHint(text, hint) {
  const normalizedText = normalizeToken(text);
  const normalizedHint = normalizeToken(hint);
  let offset = normalizedText.indexOf(normalizedHint);

  while (normalizedHint && offset >= 0) {
    const before = normalizedText[offset - 1];
    const after = normalizedText[offset + normalizedHint.length];
    const needsBoundaryBefore = isWordCharacter(normalizedHint[0]);
    const needsBoundaryAfter = isWordCharacter(normalizedHint[normalizedHint.length - 1]);

    if (
      (!needsBoundaryBefore || !isWordCharacter(before)) &&
      (!needsBoundaryAfter || !isWordCharacter(after))
    ) {
      return true;
    }

    offset = normalizedText.indexOf(normalizedHint, offset + 1);
  }

  return false;
}

function validateBatch(kind, sourceEntries, translatedItems) {
  if (!Array.isArray(translatedItems) || translatedItems.length !== sourceEntries.length) {
    throw new Error(`${kind}: translated batch has the wrong size.`);
  }

  for (const [index, source] of sourceEntries.entries()) {
    const translated = translatedItems[index];

    if (translated.id !== source.id) {
      throw new Error(`${kind}: expected ${source.id}, received ${translated.id}.`);
    }

    for (const [key, value] of Object.entries(translated)) {
      if (key !== "hintWords" && key !== "acceptedAnswers" &&
          (typeof value !== "string" || !value.trim())) {
        throw new Error(`${source.id}: ${key} is blank.`);
      }
    }

    if (kind === "exercises") {
      // Recognition exercises do not store or display prompt hints. Some models
      // still suggest one despite the instruction to return an empty array, so
      // only enforce the one-to-one contract where hints are actually consumed.
      if (source.hints.length > 0 && translated.hintWords.length !== source.hints.length) {
        throw new Error(`${source.id}: translated hint count does not match.`);
      }

      for (const word of source.hints.length > 0 ? translated.hintWords : []) {
        if (!hasPromptHint(translated.translation, word)) {
          throw new Error(`${source.id}: hint word ${JSON.stringify(word)} is not a prompt token.`);
        }
      }
    }

    if (kind === "vocabulary" && (
      !Array.isArray(translated.acceptedAnswers) ||
      translated.acceptedAnswers.length === 0 ||
      translated.acceptedAnswers.some((answer) => typeof answer !== "string" || !answer.trim())
    )) {
      throw new Error(`${source.id}: acceptedAnswers is invalid.`);
    }
  }
}

async function loadKind(kind) {
  if (kind === "exercises") {
    const exercises = await readJson(join(rootDirectory, "data", "source", "exercises.json"));
    return exercises.map(exerciseInput);
  }

  const filename = {
    grammar: "jlpt-n5-grammar.json",
    vocabulary: "jlpt-n5-vocabulary.json",
    kanji: "jlpt-n5-kanji.json"
  }[kind];
  const entries = await readJson(join(rootDirectory, "data", filename));

  return entries.map((entry) => {
    if (kind === "grammar") {
      return {
        id: entry.id,
        pattern: entry.pattern,
        name: entry.name,
        meaning: entry.meaning
      };
    }

    if (kind === "vocabulary") {
      return {
        id: entry.id,
        term: entry.term,
        reading: entry.reading,
        partOfSpeech: entry.partOfSpeech,
        meaning: entry.meaning
      };
    }

    return { id: entry.id, character: entry.character, meaning: entry.meaning };
  });
}

function createStoredValue(kind, source, translated) {
  if (kind === "exercises") {
    return {
      translation: translated.translation,
      ...(source.hints.length > 0
        ? {
          promptVocabularyHints: source.hints.map((word, index) => ({
            word: translated.hintWords[index],
            vocabularyIds: source.rawHints[index].vocabularyIds
          }))
        }
        : {})
    };
  }

  if (kind === "grammar") {
    return { name: translated.name, meaning: translated.meaning };
  }

  if (kind === "vocabulary") {
    return { meaning: translated.meaning, acceptedAnswers: translated.acceptedAnswers };
  }

  return { meaning: translated.meaning };
}

async function translateKind(apiKey, kind, limit) {
  let entries = await loadKind(kind);

  if (kind === "exercises") {
    const originals = await readJson(join(rootDirectory, "data", "source", "exercises.json"));
    entries = entries.map((entry, index) => ({
      ...entry,
      rawHints: originals[index].promptVocabularyHints || []
    }));
  }

  const outputPath = join(sourceLocaleDirectory, `${kind}.json`);
  const output = await readExisting(outputPath);
  const pending = entries.filter(({ id }) => !output[id]).slice(0, limit);

  for (let offset = 0; offset < pending.length; offset += batchSize) {
    const batch = pending.slice(offset, offset + batchSize);
    let remaining = batch;
    let lastErrors = [];

    for (let attempt = 1; attempt <= maxBatchAttempts && remaining.length > 0; attempt += 1) {
      const apiInput = remaining.map(({ rawHints, ...entry }) => entry);
      const retrySuffix = attempt > 1 ? ` (retry ${attempt - 1}, ${remaining.length} item(s))` : "";

      console.log(
        `Translating ${kind} ${offset + 1}-${offset + batch.length} of ${pending.length}${retrySuffix}...`
      );
      const translated = await requestTranslations(apiKey, kind, apiInput);
      const translatedById = new Map(translated.map((item) => [item?.id, item]));
      const failed = [];
      const errors = [];

      for (const [index, source] of apiInput.entries()) {
        const item = translatedById.get(source.id);

        try {
          validateBatch(kind, [source], item ? [item] : []);
          output[item.id] = createStoredValue(kind, remaining[index], item);
        } catch (error) {
          failed.push(remaining[index]);
          errors.push(error.message);
        }
      }

      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
      remaining = failed;
      lastErrors = errors;

      if (remaining.length > 0 && attempt < maxBatchAttempts) {
        console.warn(`Retrying rejected ${kind}: ${errors.join(" | ")}`);
      }
    }

    if (remaining.length > 0) {
      throw new Error(`Rejected ${kind} after ${maxBatchAttempts} attempts: ${lastErrors.join(" | ")}`);
    }
  }

  console.log(`${kind}: ${Object.keys(output).length}/${entries.length} translated.`);
}

const options = parseArguments(process.argv.slice(2));
const apiKey = await loadApiKey();
const selectedKinds = options.kind === "all" ? kinds : [options.kind];

for (const kind of selectedKinds) {
  await translateKind(apiKey, kind, options.limit);
}
