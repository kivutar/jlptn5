import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TokenizerBuilder } from "lindera-wasm-ipadic-nodejs";

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = join(rootDirectory, "data", "source");
const tokenizerBuilder = new TokenizerBuilder();
const tooltipCategories = new Set(["noun", "verb", "adjective"]);

tokenizerBuilder.setDictionary("embedded://ipadic");
tokenizerBuilder.setMode("normal");

const tokenizer = tokenizerBuilder.build();

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

function katakanaToHiragana(text) {
  return text.replace(/[ァ-ヶ]/g, (character) => {
    return String.fromCharCode(character.charCodeAt(0) - 0x60);
  });
}

function getLessonVocabulary(lesson, vocabularyById) {
  if (!Array.isArray(lesson.vocabularyIds) || lesson.vocabularyIds.length === 0) {
    throw new Error(`Lesson ${lesson.id} must reference vocabulary ids.`);
  }

  const entriesByForm = new Map();
  const entries = lesson.vocabularyIds.map((id) => {
    const entry = vocabularyById.get(id);

    if (!entry) {
      throw new Error(`Lesson ${lesson.id} references unknown vocabulary ${id}.`);
    }

    const forms = [
      { surface: entry.term, reading: entry.reading },
      ...(entry.variants || []).map((surface) => ({ surface, reading: entry.reading })),
      ...(entry.inflections || [])
    ];

    for (const form of forms) {
      const existingMatch = entriesByForm.get(form.surface);

      if (existingMatch && existingMatch.entry.id !== entry.id) {
        throw new Error(`Lesson ${lesson.id} has ambiguous vocabulary form ${form.surface}.`);
      }

      entriesByForm.set(form.surface, { entry, reading: form.reading });
    }

    return entry;
  });

  if (new Set(lesson.vocabularyIds).size !== lesson.vocabularyIds.length) {
    throw new Error(`Lesson ${lesson.id} repeats a vocabulary id.`);
  }

  return { entries, entriesByForm };
}

function tokenizeLesson(lesson, vocabularyById) {
  const { entries, entriesByForm } = getLessonVocabulary(lesson, vocabularyById);
  const usedVocabularyIds = new Set();
  const tokens = tokenizer.tokenize(lesson.text).map((token) => {
    const generatedReading = token.details[7];
    const baseForm = token.details[6];
    const category = getTokenCategory(token.details);
    const surfaceMatch = entriesByForm.get(token.surface);
    const vocabularyMatch = surfaceMatch || entriesByForm.get(baseForm);
    const vocabularyEntry = vocabularyMatch?.entry;
    const result = {
      surface: token.surface
    };

    if (category) {
      result.category = category;
    }

    if (surfaceMatch) {
      result.reading = surfaceMatch.reading;
    } else if (generatedReading !== "*") {
      result.reading = katakanaToHiragana(generatedReading);
    }

    if (vocabularyEntry) {
      result.vocabularyId = vocabularyEntry.id;
      usedVocabularyIds.add(vocabularyEntry.id);
    }

    return result;
  });

  if (tokens.map(({ surface }) => surface).join("") !== lesson.text) {
    throw new Error(`Tokenizer output does not match lesson ${lesson.id}.`);
  }

  const unusedEntries = entries.filter(({ id }) => !usedVocabularyIds.has(id));

  if (unusedEntries.length > 0) {
    throw new Error(
      `Lesson ${lesson.id} does not use vocabulary: ${unusedEntries
        .map(({ term }) => term)
        .join(", ")}.`
    );
  }

  const unlinkedTooltipTokens = tokens.filter((token) => {
    return tooltipCategories.has(token.category) && !token.vocabularyId;
  });

  if (unlinkedTooltipTokens.length > 0) {
    throw new Error(
      `Lesson ${lesson.id} has unlinked content words: ${unlinkedTooltipTokens
        .map(({ surface }) => surface)
        .join(", ")}.`
    );
  }

  return tokens;
}

function validateLesson(lesson) {
  if (!lesson || typeof lesson !== "object") {
    throw new Error("Every lesson must be an object.");
  }

  if (!/^[a-z0-9-]+$/.test(lesson.id) || typeof lesson.text !== "string" || !lesson.text) {
    throw new Error("Every lesson needs a safe id and non-empty text.");
  }
}

function prepareLesson(lesson, vocabularyById) {
  validateLesson(lesson);

  return {
    id: lesson.id,
    text: lesson.text,
    audio: `assets/voices/${lesson.id}.wav`,
    vocabularyIds: lesson.vocabularyIds,
    tokens: tokenizeLesson(lesson, vocabularyById)
  };
}

function prepareExercise(exercise, grammarPointIds, vocabularyById) {
  const lesson = prepareLesson(exercise, vocabularyById);

  if (
    typeof exercise.solution !== "string" ||
    !exercise.solution.trim() ||
    !Array.isArray(exercise.grammarPointIds) ||
    exercise.grammarPointIds.length < 2 ||
    !exercise.grammarPointIds.every((id) => grammarPointIds.has(id))
  ) {
    throw new Error(`Exercise ${exercise.id} has invalid solution or grammar points.`);
  }

  return {
    ...lesson,
    solution: exercise.solution,
    grammarPointIds: exercise.grammarPointIds
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

const [introductionSource, exerciseSources, grammarPoints, vocabulary] = await Promise.all([
  readJson(join(sourceDirectory, "introduction.json")),
  readJson(join(sourceDirectory, "exercises.json")),
  readJson(join(rootDirectory, "data", "jlpt-n5-grammar.json")),
  readJson(join(rootDirectory, "data", "jlpt-n5-vocabulary.json"))
]);

if (!Array.isArray(exerciseSources) || !Array.isArray(grammarPoints) || !Array.isArray(vocabulary)) {
  throw new Error("Exercise, grammar, and vocabulary data must be arrays.");
}

const allSources = [introductionSource, ...exerciseSources];
const lessonIds = new Set(allSources.map(({ id }) => id));

if (lessonIds.size !== allSources.length) {
  throw new Error("Lesson ids must be unique.");
}

const grammarPointIds = new Set(grammarPoints.map(({ id }) => id));
const vocabularyById = new Map(vocabulary.map((entry) => [entry.id, entry]));

if (vocabularyById.size !== vocabulary.length) {
  throw new Error("Vocabulary ids must be unique.");
}

const introduction = prepareLesson(introductionSource, vocabularyById);
const exercises = exerciseSources.map((exercise) => {
  return prepareExercise(exercise, grammarPointIds, vocabularyById);
});

await Promise.all([
  writeJson(join(rootDirectory, "data", "introduction.json"), introduction),
  writeJson(join(rootDirectory, "data", "exercises.json"), exercises)
]);

console.log(`Prepared ${exercises.length + 1} static lessons.`);
