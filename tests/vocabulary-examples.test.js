import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readJson = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8")
  .then(JSON.parse);

test("every vocabulary item has one short, localized, tokenized example", async () => {
  const [vocabulary, sources, examples, frenchSources, frenchExamples] = await Promise.all([
    readJson("data/jlpt-n5-vocabulary.json"),
    readJson("data/source/vocabulary-examples.json"),
    readJson("data/vocabulary-examples.json"),
    readJson("data/source/locales/fr/vocabulary-examples.json"),
    readJson("data/locales/fr/vocabulary-examples.json")
  ]);
  const vocabularyIds = vocabulary.map(({ id }) => id);
  const sourceIds = sources.map(({ vocabularyId }) => vocabularyId);
  const exampleIds = examples.map(({ vocabularyId }) => vocabularyId);

  assert.deepEqual(sourceIds, vocabularyIds);
  assert.deepEqual(exampleIds, vocabularyIds);
  assert.equal(new Set(exampleIds).size, vocabulary.length);
  assert.deepEqual(frenchExamples, frenchSources);
  assert.deepEqual(Object.keys(frenchExamples), vocabularyIds);

  for (const example of examples) {
    assert.match(example.text, /[。！？]$/u, example.vocabularyId);
    assert.ok(
      [...example.text.replace(/[\s。、！？!?]/gu, "")].length <= 18,
      example.vocabularyId
    );
    assert.equal(
      example.tokens.map(({ surface }) => surface).join(""),
      example.text,
      example.vocabularyId
    );
    assert.ok(example.text.includes(example.targetSurface), example.vocabularyId);
    assert.ok(Number.isInteger(example.targetTokenStart), example.vocabularyId);
    assert.ok(Number.isInteger(example.targetTokenEnd), example.vocabularyId);
    assert.ok(example.targetTokenStart >= 0, example.vocabularyId);
    assert.ok(example.targetTokenEnd > example.targetTokenStart, example.vocabularyId);
    assert.ok(example.targetTokenEnd <= example.tokens.length, example.vocabularyId);
    assert.ok(example.targetReading, example.vocabularyId);
    assert.ok(example.translation, example.vocabularyId);
    assert.ok(frenchExamples[example.vocabularyId]?.translation, example.vocabularyId);
  }
});

