import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TokenizerBuilder } from "lindera-wasm-ipadic-nodejs";

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = join(rootDirectory, "data", "source");
const tokenizerBuilder = new TokenizerBuilder();
const glossCategories = new Set(["noun", "verb", "adjective"]);

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

function tokenizeLesson(lesson) {
  const tokens = tokenizer.tokenize(lesson.text).map((token) => {
    const generatedReading = token.details[7];
    const category = getTokenCategory(token.details);
    const result = {
      surface: token.surface
    };

    if (category) {
      result.category = category;
    }

    if (lesson.readings?.[token.surface]) {
      result.reading = lesson.readings[token.surface];
    } else if (generatedReading !== "*") {
      result.reading = katakanaToHiragana(generatedReading);
    }

    if (glossCategories.has(category) && lesson.glosses?.[token.surface]) {
      result.gloss = lesson.glosses[token.surface];
    }

    return result;
  });

  if (tokens.map(({ surface }) => surface).join("") !== lesson.text) {
    throw new Error(`Tokenizer output does not match lesson ${lesson.id}.`);
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

function prepareLesson(lesson) {
  validateLesson(lesson);

  return {
    id: lesson.id,
    text: lesson.text,
    audio: `assets/voices/${lesson.id}.wav`,
    tokens: tokenizeLesson(lesson)
  };
}

function prepareExercise(exercise, grammarPointIds) {
  const lesson = prepareLesson(exercise);

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

const [introductionSource, exerciseSources, grammarPoints] = await Promise.all([
  readJson(join(sourceDirectory, "introduction.json")),
  readJson(join(sourceDirectory, "exercises.json")),
  readJson(join(rootDirectory, "data", "jlpt-n5-grammar.json"))
]);

if (!Array.isArray(exerciseSources) || !Array.isArray(grammarPoints)) {
  throw new Error("Exercise and grammar data must be arrays.");
}

const allSources = [introductionSource, ...exerciseSources];
const lessonIds = new Set(allSources.map(({ id }) => id));

if (lessonIds.size !== allSources.length) {
  throw new Error("Lesson ids must be unique.");
}

const grammarPointIds = new Set(grammarPoints.map(({ id }) => id));
const introduction = prepareLesson(introductionSource);
const exercises = exerciseSources.map((exercise) => {
  return prepareExercise(exercise, grammarPointIds);
});

await Promise.all([
  writeJson(join(rootDirectory, "data", "introduction.json"), introduction),
  writeJson(join(rootDirectory, "data", "exercises.json"), exercises)
]);

console.log(`Prepared ${exercises.length + 1} static lessons.`);
