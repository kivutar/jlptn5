import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TokenizerBuilder } from "lindera-wasm-ipadic-nodejs";

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = join(rootDirectory, "data", "source");
const checkOnly = process.argv.includes("--check");
const tokenizerBuilder = new TokenizerBuilder();
const exerciseTypes = new Set(["recognition", "production"]);
const linkedTokenCategories = new Set([
  "noun",
  "verb",
  "adjective",
  "interjection",
  "adverb",
  "determiner",
  "conjunction"
]);
const tokenCategories = new Set([
  ...linkedTokenCategories,
  "particle",
  "auxiliary"
]);

tokenizerBuilder.setDictionary("embedded://ipadic");
tokenizerBuilder.setMode("normal");

const tokenizer = tokenizerBuilder.build();

function getTokenCategory(details, previousToken) {
  const [primary, secondary, tertiary, , , , baseForm] = details;

  if (primary === "動詞" && secondary === "非自立") {
    return "auxiliary";
  }

  if (primary === "動詞" && baseForm === "しれる" && previousToken?.surface === "かも") {
    return "auxiliary";
  }

  if (primary === "名詞" && tertiary === "助動詞語幹") {
    return "auxiliary";
  }

  if (primary === "名詞" && secondary === "非自立" && baseForm === "ん") {
    return "auxiliary";
  }

  if (
    primary === "名詞" &&
    ((secondary === "非自立" && baseForm === "の") ||
      (secondary === "接尾" && tertiary === "副詞可能"))
  ) {
    return "particle";
  }

  if (primary === "名詞" && secondary === "形容動詞語幹") {
    return "adjective";
  }

  return {
    助詞: "particle",
    動詞: "verb",
    助動詞: "auxiliary",
    形容詞: "adjective",
    名詞: "noun",
    感動詞: "interjection",
    副詞: "adverb",
    連体詞: "determiner",
    接続詞: "conjunction"
  }[primary];
}

function getCompatiblePartsOfSpeech(details) {
  const [primary, secondary, tertiary] = details;

  if (primary === "名詞") {
    if (secondary === "代名詞") {
      return new Set(["pronoun", "noun"]);
    }

    if (secondary === "数") {
      return new Set(["number", "counter", "noun", "pronoun"]);
    }

    if (tertiary === "助数詞") {
      return new Set(["counter", "number", "noun"]);
    }

    if (secondary === "形容動詞語幹") {
      return new Set(["adjective"]);
    }

    return new Set(["noun", "pronoun", "number", "counter"]);
  }

  const partOfSpeech = {
    動詞: "verb",
    形容詞: "adjective",
    感動詞: "interjection",
    副詞: "adverb",
    連体詞: "determiner",
    接続詞: "conjunction"
  }[primary];

  return new Set(partOfSpeech ? [partOfSpeech] : []);
}

function getDisplayCategory(partOfSpeech) {
  if (["pronoun", "number", "counter", "affix"].includes(partOfSpeech)) {
    return "noun";
  }

  return partOfSpeech;
}

function katakanaToHiragana(text) {
  return text.replace(/[ァ-ヶ]/g, (character) => {
    return String.fromCharCode(character.charCodeAt(0) - 0x60);
  });
}

function createVocabularyIndex(vocabulary) {
  const entriesById = new Map();
  const matchesByForm = new Map();

  for (const entry of vocabulary) {
    if (entriesById.has(entry.id)) {
      throw new Error(`Duplicate vocabulary id ${entry.id}.`);
    }

    entriesById.set(entry.id, entry);

    const inflections = entry.inflections || [];

    for (const inflection of inflections) {
      if (
        inflection.allowPartOfSpeechMismatch !== undefined &&
        typeof inflection.allowPartOfSpeechMismatch !== "boolean"
      ) {
        throw new Error(
          `${entry.id}: inflection allowPartOfSpeechMismatch must be boolean.`
        );
      }
    }

    const forms = [
      { surface: entry.term, reading: entry.reading, preferReading: false },
      ...(entry.variants || []).map((surface) => ({
        surface,
        reading: entry.reading,
        preferReading: true
      })),
      ...inflections.map((inflection) => ({
        ...inflection,
        preferReading: true,
        allowPartOfSpeechMismatch: inflection.allowPartOfSpeechMismatch === true
      }))
    ];

    for (const form of forms) {
      const matches = matchesByForm.get(form.surface) || [];
      const existingMatchIndex = matches.findIndex((match) => match.entry.id === entry.id);
      const indexedMatch = {
        entry,
        reading: form.reading,
        preferReading: form.preferReading,
        allowPartOfSpeechMismatch: form.allowPartOfSpeechMismatch || false
      };

      if (existingMatchIndex === -1) {
        matches.push(indexedMatch);
      } else if (form.preferReading && !matches[existingMatchIndex].preferReading) {
        matches[existingMatchIndex] = indexedMatch;
      }

      matchesByForm.set(form.surface, matches);
    }
  }

  return { entriesById, matchesByForm };
}

function createKanjiIndex(kanji) {
  const entriesByCharacter = new Map();

  for (const entry of kanji) {
    if (entriesByCharacter.has(entry.character)) {
      throw new Error(`Duplicate kanji character ${entry.character}.`);
    }

    entriesByCharacter.set(entry.character, entry);
  }

  return entriesByCharacter;
}

function findKanjiIds(text, kanjiIndex) {
  return [...new Set(
    [...text]
      .map((character) => kanjiIndex.get(character)?.id)
      .filter(Boolean)
  )];
}

function findVocabularyCandidates(token, vocabularyIndex) {
  const compatiblePartsOfSpeech = getCompatiblePartsOfSpeech(token.details);
  const candidatesById = new Map();
  const forms = [
    { surface: token.surface, isSurface: true },
    { surface: token.details[6], isSurface: false }
  ];

  for (const form of forms) {
    if (!form.surface || form.surface === "*") {
      continue;
    }

    for (const match of vocabularyIndex.matchesByForm.get(form.surface) || []) {
      const partOfSpeechMismatch = !compatiblePartsOfSpeech.has(
        match.entry.partOfSpeech
      );

      if (
        (!partOfSpeechMismatch || match.allowPartOfSpeechMismatch) &&
        !candidatesById.has(match.entry.id)
      ) {
        candidatesById.set(match.entry.id, {
          ...match,
          isSurface: form.isSurface,
          partOfSpeechMismatch
        });
      }
    }
  }

  return [...candidatesById.values()];
}

function formatCandidates(candidates) {
  return candidates
    .map(({ entry }) => `${entry.term} (${entry.id})`)
    .join(", ");
}

function findOverrideKey(overrides, surface, occurrence) {
  const occurrenceKey = `${surface}#${occurrence}`;

  if (Object.hasOwn(overrides, occurrenceKey)) {
    return occurrenceKey;
  }

  return Object.hasOwn(overrides, surface) ? surface : undefined;
}

function validateOverrideMap(lessonId, name, overrides) {
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
    throw new Error(`${lessonId}: ${name} must be an object.`);
  }
}

function validateTokenOverrides(lessonId, overrides) {
  validateOverrideMap(lessonId, "tokenOverrides", overrides);

  for (const [key, override] of Object.entries(overrides)) {
    if (!override || typeof override !== "object" || Array.isArray(override)) {
      throw new Error(`${lessonId}: token override ${key} must be an object.`);
    }

    const fields = Object.keys(override);
    const unsupportedFields = fields.filter((field) => {
      return field !== "category" && field !== "reading";
    });

    if (fields.length === 0 || unsupportedFields.length > 0) {
      throw new Error(
        `${lessonId}: token override ${key} must contain only category or reading.`
      );
    }

    if (override.category !== undefined && !tokenCategories.has(override.category)) {
      throw new Error(`${lessonId}: token override ${key} has an invalid category.`);
    }

    if (
      override.reading !== undefined &&
      (typeof override.reading !== "string" || !override.reading)
    ) {
      throw new Error(`${lessonId}: token override ${key} needs a non-empty reading.`);
    }
  }
}

function tokenizeLesson(lesson, vocabularyIndex) {
  const vocabularyOverrides = lesson.vocabularyOverrides === undefined
    ? {}
    : lesson.vocabularyOverrides;
  const tokenOverrides = lesson.tokenOverrides === undefined ? {} : lesson.tokenOverrides;

  validateOverrideMap(lesson.id, "vocabularyOverrides", vocabularyOverrides);
  validateTokenOverrides(lesson.id, tokenOverrides);

  const unusedVocabularyOverrides = new Set(Object.keys(vocabularyOverrides));
  const unusedTokenOverrides = new Set(Object.keys(tokenOverrides));
  const usedVocabularyIds = new Set();
  const tokenSurfaceOccurrences = new Map();
  const vocabularySurfaceOccurrences = new Map();
  const issues = [];
  const sourceTokens = tokenizer.tokenize(lesson.text);
  const tokens = sourceTokens.map((token, index) => {
    const generatedReading = token.details[7];
    const nextToken = sourceTokens[index + 1];
    const generatedCategory = getTokenCategory(token.details, sourceTokens[index - 1]);
    const tokenOccurrence = (tokenSurfaceOccurrences.get(token.surface) || 0) + 1;
    const tokenOverrideKey = findOverrideKey(
      tokenOverrides,
      token.surface,
      tokenOccurrence
    );
    const tokenOverride = tokenOverrideKey ? tokenOverrides[tokenOverrideKey] : undefined;
    let category = generatedCategory;
    let reading;
    const result = { surface: token.surface };

    tokenSurfaceOccurrences.set(token.surface, tokenOccurrence);

    if (
      token.surface === "何" &&
      (nextToken?.details[2] === "助数詞" || nextToken?.surface === "曜日")
    ) {
      reading = "なん";
    } else if (generatedReading !== "*") {
      reading = katakanaToHiragana(generatedReading);
    }

    if (tokenOverrideKey) {
      unusedTokenOverrides.delete(tokenOverrideKey);

      if (
        tokenOverride.category !== undefined &&
        tokenOverride.category === generatedCategory
      ) {
        issues.push(`${token.surface}: category override is unnecessary; remove it`);
      } else if (tokenOverride.category !== undefined) {
        category = tokenOverride.category;
      }

      if (tokenOverride.reading !== undefined && tokenOverride.reading === reading) {
        issues.push(`${token.surface}: reading override is unnecessary; remove it`);
      } else if (tokenOverride.reading !== undefined) {
        reading = tokenOverride.reading;
      }
    }

    if (category) {
      result.category = category;
    }

    if (reading) {
      result.reading = reading;
    }

    if (!linkedTokenCategories.has(category)) {
      return result;
    }

    const candidates = findVocabularyCandidates(token, vocabularyIndex);
    const vocabularyOccurrence = (vocabularySurfaceOccurrences.get(token.surface) || 0) + 1;
    const overrideKey = findOverrideKey(
      vocabularyOverrides,
      token.surface,
      vocabularyOccurrence
    );
    const overrideId = overrideKey ? vocabularyOverrides[overrideKey] : undefined;
    let selectedMatch;

    vocabularySurfaceOccurrences.set(token.surface, vocabularyOccurrence);

    if (overrideId) {
      unusedVocabularyOverrides.delete(overrideKey);
      selectedMatch = candidates.find(({ entry }) => entry.id === overrideId);

      if (!vocabularyIndex.entriesById.has(overrideId)) {
        issues.push(`${token.surface}: override references unknown vocabulary ${overrideId}`);
      } else if (!selectedMatch) {
        issues.push(
          `${token.surface}: override ${overrideId} is not one of: ${
            formatCandidates(candidates) || "no candidates"
          }`
        );
      } else if (candidates.length === 1) {
        issues.push(`${token.surface}: override is unnecessary; remove it`);
      }
    } else if (candidates.length === 1) {
      [selectedMatch] = candidates;
    } else if (candidates.length === 0) {
      issues.push(
        `${token.surface}: no vocabulary match (tokenizer base: ${token.details[6]})`
      );
    } else {
      issues.push(
        `${token.surface}: ambiguous vocabulary; add an override for ${formatCandidates(
          candidates
        )}`
      );
    }

    if (selectedMatch) {
      if (selectedMatch.partOfSpeechMismatch) {
        result.category = getDisplayCategory(selectedMatch.entry.partOfSpeech);
      }

      if (selectedMatch.preferReading || generatedReading === "*") {
        result.reading = selectedMatch.reading;
      }

      result.vocabularyId = selectedMatch.entry.id;
      usedVocabularyIds.add(selectedMatch.entry.id);
    }

    return result;
  });

  for (const surface of unusedVocabularyOverrides) {
    issues.push(`${surface}: override does not match a linked token`);
  }

  for (const surface of unusedTokenOverrides) {
    issues.push(`${surface}: token override does not match a token`);
  }

  if (tokens.map(({ surface }) => surface).join("") !== lesson.text) {
    issues.push("tokenizer output does not reconstruct the lesson text");
  }

  if (issues.length > 0) {
    throw new Error(`${lesson.id}:\n  - ${issues.join("\n  - ")}`);
  }

  return {
    tokens,
    vocabularyIds: [...usedVocabularyIds]
  };
}

function validateLesson(lesson) {
  if (!lesson || typeof lesson !== "object") {
    throw new Error("Every lesson must be an object.");
  }

  if (!/^[a-z0-9-]+$/.test(lesson.id) || typeof lesson.text !== "string" || !lesson.text) {
    throw new Error("Every lesson needs a safe id and non-empty text.");
  }

  if (lesson.vocabularyIds !== undefined) {
    throw new Error(`${lesson.id}: source lessons must not declare vocabularyIds.`);
  }

  if (lesson.kanjiIds !== undefined) {
    throw new Error(`${lesson.id}: source lessons must not declare kanjiIds.`);
  }
}

function prepareLesson(lesson, vocabularyIndex, kanjiIndex) {
  validateLesson(lesson);
  const { tokens, vocabularyIds } = tokenizeLesson(lesson, vocabularyIndex);

  return {
    id: lesson.id,
    text: lesson.text,
    audio: `assets/voices/${lesson.id}.wav`,
    vocabularyIds,
    kanjiIds: findKanjiIds(lesson.text, kanjiIndex),
    tokens
  };
}

function prepareExercise(exercise, grammarPointIds, vocabularyIndex, kanjiIndex) {
  const type = exercise.type || "recognition";
  const uniqueGrammarPointIds = Array.isArray(exercise.grammarPointIds)
    ? new Set(exercise.grammarPointIds)
    : null;

  if (
    typeof exercise.text !== "string" ||
    !exercise.text.trim() ||
    typeof exercise.solution !== "string" ||
    !exercise.solution.trim() ||
    !exerciseTypes.has(type) ||
    !Array.isArray(exercise.grammarPointIds) ||
    exercise.grammarPointIds.length < 2 ||
    uniqueGrammarPointIds?.size !== exercise.grammarPointIds?.length ||
    !exercise.grammarPointIds.every((id) => grammarPointIds.has(id))
  ) {
    throw new Error(`${exercise.id}: invalid solution or grammar points.`);
  }

  const japaneseText = type === "production" ? exercise.solution : exercise.text;
  const lesson = prepareLesson(
    { ...exercise, text: japaneseText },
    vocabularyIndex,
    kanjiIndex
  );
  const promptWords = new Set(
    exercise.text.toLocaleLowerCase("en").split(/[^a-z]+/).filter(Boolean)
  );
  const hintWords = Array.isArray(exercise.promptVocabularyHints)
    ? exercise.promptVocabularyHints.map((hint) => (
      typeof hint?.word === "string" ? hint.word.toLocaleLowerCase("en") : ""
    ))
    : [];

  if (
    exercise.promptVocabularyHints !== undefined &&
    (
      type !== "production" ||
      !Array.isArray(exercise.promptVocabularyHints) ||
      exercise.promptVocabularyHints.length === 0 ||
      new Set(hintWords).size !== hintWords.length ||
      exercise.promptVocabularyHints.some((hint) => {
        const vocabularyIds = hint?.vocabularyIds;

        return (
          typeof hint?.word !== "string" ||
          !promptWords.has(hint.word.toLocaleLowerCase("en")) ||
          !Array.isArray(vocabularyIds) ||
          vocabularyIds.length === 0 ||
          new Set(vocabularyIds).size !== vocabularyIds.length ||
          vocabularyIds.some((id) => !vocabularyIndex.entriesById.has(id))
        );
      })
    )
  ) {
    throw new Error(`${exercise.id}: invalid prompt vocabulary hints.`);
  }

  return {
    ...lesson,
    text: exercise.text,
    solution: exercise.solution,
    ...(exercise.type ? { type: exercise.type } : {}),
    ...(exercise.promptVocabularyHints
      ? { promptVocabularyHints: exercise.promptVocabularyHints }
      : {}),
    grammarPointIds: exercise.grammarPointIds
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeOrCheckJson(path, value) {
  await writeOrCheckFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeOrCheckFile(path, content) {

  if (!checkOnly) {
    await writeFile(path, content);
    return;
  }

  let existingValue;

  try {
    existingValue = await readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`${path} is missing; run npm run content.`);
    }

    throw error;
  }

  if (existingValue !== content) {
    throw new Error(`${path} is stale; run npm run content.`);
  }
}

function createGrammarCoverage(grammarPoints, exercises) {
  const exerciseIdsByGrammarPoint = new Map();

  for (const exercise of exercises) {
    for (const grammarPointId of exercise.grammarPointIds) {
      const exerciseIds = exerciseIdsByGrammarPoint.get(grammarPointId) || [];

      exerciseIds.push(exercise.id);
      exerciseIdsByGrammarPoint.set(grammarPointId, exerciseIds);
    }
  }

  const coveredCount = exerciseIdsByGrammarPoint.size;
  const lines = [
    "# JLPT N5 grammar exercise coverage",
    "",
    "This checklist is generated by `npm run content` from the canonical grammar",
    "inventory and authored exercises. A point is covered when at least one exercise",
    "meaningfully assesses it and lists its ID. Coverage records deliberate practice,",
    "not mastery. Edit",
    "`data/source/exercises.json`, not this file.",
    "",
    `Covered: **${coveredCount} / ${grammarPoints.length}** grammar points.`,
    "",
    ...grammarPoints.map((grammarPoint) => {
      const exerciseIds = exerciseIdsByGrammarPoint.get(grammarPoint.id) || [];
      const checkbox = exerciseIds.length > 0 ? "x" : " ";
      const coverage = exerciseIds.length > 0
        ? ` - exercises: ${exerciseIds.map((id) => `\`${id}\``).join(", ")}`
        : "";

      return `- [${checkbox}] \`${grammarPoint.id}\` - \`${grammarPoint.pattern}\` - ${grammarPoint.name} (${grammarPoint.category}, ${grammarPoint.scope})${coverage}`;
    }),
    ""
  ];

  return lines.join("\n");
}

const [introductionSource, exerciseSources, grammarPoints, vocabulary, kanji] = await Promise.all([
  readJson(join(sourceDirectory, "introduction.json")),
  readJson(join(sourceDirectory, "exercises.json")),
  readJson(join(rootDirectory, "data", "jlpt-n5-grammar.json")),
  readJson(join(rootDirectory, "data", "jlpt-n5-vocabulary.json")),
  readJson(join(rootDirectory, "data", "jlpt-n5-kanji.json"))
]);

if (
  !Array.isArray(exerciseSources) ||
  !Array.isArray(grammarPoints) ||
  !Array.isArray(vocabulary) ||
  !Array.isArray(kanji)
) {
  throw new Error("Exercise, grammar, vocabulary, and kanji data must be arrays.");
}

const allSources = [introductionSource, ...exerciseSources];
const lessonIds = new Set(allSources.map(({ id }) => id));

if (lessonIds.size !== allSources.length) {
  throw new Error("Lesson ids must be unique.");
}

const grammarPointIds = new Set(grammarPoints.map(({ id }) => id));

if (grammarPointIds.size !== grammarPoints.length) {
  throw new Error("Grammar point ids must be unique.");
}

const vocabularyIndex = createVocabularyIndex(vocabulary);
const kanjiIndex = createKanjiIndex(kanji);
const errors = [];
let introduction;
const exercises = [];

try {
  introduction = prepareLesson(introductionSource, vocabularyIndex, kanjiIndex);
} catch (error) {
  errors.push(error.message);
}

for (const exercise of exerciseSources) {
  try {
    exercises.push(prepareExercise(exercise, grammarPointIds, vocabularyIndex, kanjiIndex));
  } catch (error) {
    errors.push(error.message);
  }
}

if (errors.length > 0) {
  throw new Error(`Content preparation failed:\n\n${errors.join("\n\n")}`);
}

await Promise.all([
  writeOrCheckJson(join(rootDirectory, "data", "introduction.json"), introduction),
  writeOrCheckJson(join(rootDirectory, "data", "exercises.json"), exercises),
  writeOrCheckFile(
    join(rootDirectory, "data", "grammar-coverage.md"),
    createGrammarCoverage(grammarPoints, exercises)
  )
]);

console.log(
  `${checkOnly ? "Checked" : "Prepared"} ${exercises.length + 1} static lessons.`
);
