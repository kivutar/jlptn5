import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { handleStaticRequest } from "../scripts/serve.js";

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");
const allowedCategories = new Set([
  "particle",
  "verb",
  "auxiliary",
  "adjective",
  "noun",
  "interjection",
  "adverb",
  "determiner",
  "conjunction"
]);
const glossCategories = new Set(["noun", "verb", "adjective"]);

async function readJson(path) {
  return JSON.parse(await readFile(join(rootDirectory, path), "utf8"));
}

function assertPreparedLesson(lesson, vocabularyById) {
  assert.match(lesson.id, /^[a-z0-9-]+$/);
  assert.equal(typeof lesson.text, "string");
  assert.ok(lesson.text.length > 0);
  assert.equal(lesson.audio, `assets/voices/${lesson.id}.wav`);
  assert.ok(Array.isArray(lesson.vocabularyIds));
  assert.equal(new Set(lesson.vocabularyIds).size, lesson.vocabularyIds.length);
  assert.ok(lesson.vocabularyIds.every((id) => vocabularyById.has(id)));
  assert.ok(Array.isArray(lesson.tokens));
  assert.equal(
    lesson.tokens.map(({ surface }) => surface).join(""),
    lesson.text,
    `${lesson.id} tokens must reconstruct its text`
  );

  const usedVocabularyIds = new Set();

  for (const token of lesson.tokens) {
    assert.equal(typeof token.surface, "string");
    assert.equal(token.gloss, undefined);

    if (token.category) {
      assert.ok(allowedCategories.has(token.category));
    }

    if (token.vocabularyId) {
      assert.ok(vocabularyById.has(token.vocabularyId));
      assert.ok(lesson.vocabularyIds.includes(token.vocabularyId));
      usedVocabularyIds.add(token.vocabularyId);
    }

    if (glossCategories.has(token.category)) {
      assert.ok(token.vocabularyId, `${lesson.id}:${token.surface} must link vocabulary`);
    }
  }

  assert.deepEqual(usedVocabularyIds, new Set(lesson.vocabularyIds));
}

test("generated lessons match their authored sources", async () => {
  const [introductionSource, exerciseSources, introduction, exercises, grammarPoints, vocabulary] =
    await Promise.all([
      readJson("data/source/introduction.json"),
      readJson("data/source/exercises.json"),
      readJson("data/introduction.json"),
      readJson("data/exercises.json"),
      readJson("data/jlpt-n5-grammar.json"),
      readJson("data/jlpt-n5-vocabulary.json")
    ]);
  const grammarPointIds = new Set(grammarPoints.map(({ id }) => id));
  const vocabularyById = new Map(vocabulary.map((entry) => [entry.id, entry]));

  assert.equal(introduction.id, introductionSource.id);
  assert.equal(introduction.text, introductionSource.text);
  assert.equal(introductionSource.vocabularyIds, undefined);
  assert.equal(introductionSource.readings, undefined);
  assert.equal(introductionSource.glosses, undefined);
  assertPreparedLesson(introduction, vocabularyById);
  assert.equal(exercises.length, exerciseSources.length);

  const sourceById = new Map(exerciseSources.map((exercise) => [exercise.id, exercise]));
  const ids = new Set([introduction.id]);

  for (const exercise of exercises) {
    const source = sourceById.get(exercise.id);

    assert.ok(source, `Missing source for ${exercise.id}`);
    assert.ok(!ids.has(exercise.id), `Duplicate lesson id ${exercise.id}`);
    ids.add(exercise.id);
    assert.equal(exercise.text, source.text);
    assert.equal(exercise.solution, source.solution);
    assert.deepEqual(exercise.grammarPointIds, source.grammarPointIds);
    assert.equal(source.vocabularyIds, undefined);
    assert.equal(source.readings, undefined);
    assert.equal(source.glosses, undefined);
    assert.ok(exercise.grammarPointIds.length >= 2);
    assert.equal(new Set(exercise.grammarPointIds).size, exercise.grammarPointIds.length);
    assert.ok(exercise.grammarPointIds.every((id) => grammarPointIds.has(id)));
    assertPreparedLesson(exercise, vocabularyById);
  }

  const preparedById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const token = (exerciseId, surface) => {
    return preparedById.get(exerciseId).tokens.find((candidate) => candidate.surface === surface);
  };

  assert.equal(token("sister-not-eaten-yet", "何").reading, "なに");
  assert.equal(token("sister-not-eaten-yet", "い").category, "auxiliary");
  assert.equal(token("sister-not-eaten-yet", "い").vocabularyId, undefined);
  assert.equal(token("cat-under-table", "い").category, "verb");
  assert.ok(token("cat-under-table", "い").vocabularyId);
  assert.equal(token("library-weekday-hours", "開い").reading, "あい");
  assert.equal(token("swim-three-times-weekly", "週間").reading, "しゅうかん");
  assert.equal(token("swim-three-times-weekly", "回").reading, "かい");
  assert.equal(token("game-after-homework", "後").reading, "あと");
  assert.equal(token("siblings-study-english", "勉強").category, "noun");
  assert.ok(token("siblings-study-english", "勉強").vocabularyId);
  assert.ok(token("no-school-tomorrow", "あり").vocabularyId);
  assert.equal(token("been-to-japan", "日本").reading, "にほん");
  assert.equal(
    token("birthday-book-gift", "誕生").vocabularyId,
    token("birthday-book-gift", "日").vocabularyId
  );
  assert.ok(token("birthday-book-gift", "くれ").vocabularyId);
});

test("grammar coverage checklist matches authored exercises", async () => {
  const [grammarPoints, exercises, coverage] = await Promise.all([
    readJson("data/jlpt-n5-grammar.json"),
    readJson("data/source/exercises.json"),
    readFile(join(rootDirectory, "data", "grammar-coverage.md"), "utf8")
  ]);
  const exerciseIdsByGrammarPoint = new Map();

  for (const exercise of exercises) {
    for (const grammarPointId of exercise.grammarPointIds) {
      const exerciseIds = exerciseIdsByGrammarPoint.get(grammarPointId) || [];

      exerciseIds.push(exercise.id);
      exerciseIdsByGrammarPoint.set(grammarPointId, exerciseIds);
    }
  }

  const bullets = coverage.split("\n").filter((line) => line.startsWith("- ["));

  assert.match(
    coverage,
    new RegExp(`Covered: \\*\\*${exerciseIdsByGrammarPoint.size} / ${grammarPoints.length}\\*\\*`)
  );
  assert.equal(bullets.length, grammarPoints.length);

  grammarPoints.forEach((grammarPoint, index) => {
    const exerciseIds = exerciseIdsByGrammarPoint.get(grammarPoint.id) || [];
    const checkbox = exerciseIds.length > 0 ? "x" : " ";

    assert.ok(
      bullets[index].startsWith(`- [${checkbox}] \`${grammarPoint.id}\` - `),
      grammarPoint.id
    );

    for (const exerciseId of exerciseIds) {
      assert.ok(bullets[index].includes(`\`${exerciseId}\``), exerciseId);
    }
  });
});

test("browser code has no runtime AI or application API dependency", async () => {
  const browserCode = await readFile(join(rootDirectory, "app.js"), "utf8");

  assert.doesNotMatch(browserCode, /\/api\//);
  assert.doesNotMatch(browserCode, /openai/i);
  assert.doesNotMatch(browserCode, /\.key/);
});

test("vocabulary inventory has a substantial core and labeled learner favorites", async () => {
  const vocabulary = await readJson("data/jlpt-n5-vocabulary.json");
  const allowedPartsOfSpeech = new Set([
    "adjective",
    "adverb",
    "affix",
    "conjunction",
    "counter",
    "determiner",
    "expression",
    "interjection",
    "noun",
    "number",
    "particle",
    "pronoun",
    "verb"
  ]);
  const ids = new Set();
  const core = vocabulary.filter(({ scope }) => scope === "core");
  const supplemental = vocabulary.filter(({ scope }) => scope === "supplemental");

  assert.ok(core.length >= 700);
  assert.ok(supplemental.length > 0);

  for (const entry of vocabulary) {
    assert.match(entry.id, /^vocab-[a-f0-9]{12}$/);
    assert.ok(!ids.has(entry.id), `Duplicate vocabulary id ${entry.id}`);
    ids.add(entry.id);
    assert.ok(entry.term);
    assert.ok(entry.reading);
    assert.ok(entry.meaning);
    assert.ok(allowedPartsOfSpeech.has(entry.partOfSpeech));
    assert.ok(["core", "supplemental"].includes(entry.scope));
    assert.ok(
      [
        "open-anki-jlpt-decks",
        "curated-learner-favorites",
        "curated-lesson-vocabulary"
      ].includes(entry.source)
    );

    if (entry.variants) {
      assert.ok(Array.isArray(entry.variants));
      assert.ok(entry.variants.every(Boolean));
    }

    if (entry.inflections) {
      assert.ok(Array.isArray(entry.inflections));
      assert.ok(entry.inflections.every(({ surface, reading }) => surface && reading));
    }
  }

  const supplementalTerms = new Set(supplemental.map(({ term }) => term));

  for (const term of ["ラーメン", "寿司", "アニメ", "漫画", "ゲーム", "スマホ"]) {
    assert.ok(supplementalTerms.has(term), `Missing learner favorite ${term}`);
  }
});

async function requestStatic(path, method = "GET") {
  const result = {};
  const request = {
    method,
    url: path,
    headers: { host: "127.0.0.1" }
  };
  const response = {
    writeHead(status, headers = {}) {
      result.status = status;
      result.headers = headers;
    },
    end(body) {
      result.body = body;
    }
  };

  await handleStaticRequest(request, response);
  return result;
}

test("preview serves the committed static application", async () => {
  const expectedTypes = new Map([
    ["/", "text/html"],
    ["/app.js", "text/javascript"],
    ["/styles.css", "text/css"],
    ["/data/introduction.json", "application/json"],
    ["/data/exercises.json", "application/json"],
    ["/data/jlpt-n5-vocabulary.json", "application/json"],
    ["/data/jlpt-n5-grammar.json", "application/json"]
  ]);

  for (const [path, contentType] of expectedTypes) {
    const response = await requestStatic(path);

    assert.equal(response.status, 200, path);
    assert.match(response.headers["Content-Type"], new RegExp(`^${contentType}`));
    assert.ok(response.body.length > 0);
  }
});

test("preview exposes no private files or runtime endpoints", async () => {
  const privatePaths = [
    "/.key",
    "/data/source/introduction.json",
    "/scripts/generate-voices.js",
    "/package.json"
  ];

  for (const path of privatePaths) {
    assert.equal((await requestStatic(path)).status, 404, path);
  }

  for (const path of ["/api/speech", "/api/tokenize"]) {
    const response = await requestStatic(path, "POST");

    assert.equal(response.status, 405, path);
    assert.equal(response.headers.Allow, "GET, HEAD");
  }
});
