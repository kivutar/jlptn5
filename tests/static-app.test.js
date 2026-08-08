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
  "interjection"
]);
const glossCategories = new Set(["noun", "verb", "adjective"]);

async function readJson(path) {
  return JSON.parse(await readFile(join(rootDirectory, path), "utf8"));
}

function assertPreparedLesson(lesson) {
  assert.match(lesson.id, /^[a-z0-9-]+$/);
  assert.equal(typeof lesson.text, "string");
  assert.ok(lesson.text.length > 0);
  assert.equal(lesson.audio, `assets/voices/${lesson.id}.wav`);
  assert.ok(Array.isArray(lesson.tokens));
  assert.equal(
    lesson.tokens.map(({ surface }) => surface).join(""),
    lesson.text,
    `${lesson.id} tokens must reconstruct its text`
  );

  for (const token of lesson.tokens) {
    assert.equal(typeof token.surface, "string");

    if (token.category) {
      assert.ok(allowedCategories.has(token.category));
    }

    if (token.gloss) {
      assert.ok(glossCategories.has(token.category));
    }
  }
}

test("generated lessons match their authored sources", async () => {
  const [introductionSource, exerciseSources, introduction, exercises, grammarPoints] =
    await Promise.all([
      readJson("data/source/introduction.json"),
      readJson("data/source/exercises.json"),
      readJson("data/introduction.json"),
      readJson("data/exercises.json"),
      readJson("data/jlpt-n5-grammar.json")
    ]);
  const grammarPointIds = new Set(grammarPoints.map(({ id }) => id));

  assert.equal(introduction.id, introductionSource.id);
  assert.equal(introduction.text, introductionSource.text);
  assertPreparedLesson(introduction);
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
    assert.ok(exercise.grammarPointIds.length >= 2);
    assert.ok(exercise.grammarPointIds.every((id) => grammarPointIds.has(id)));
    assertPreparedLesson(exercise);
  }
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
    assert.ok(["open-anki-jlpt-decks", "curated-learner-favorites"].includes(entry.source));

    if (entry.variants) {
      assert.ok(Array.isArray(entry.variants));
      assert.ok(entry.variants.every(Boolean));
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
