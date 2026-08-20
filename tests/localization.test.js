import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  hasPromptHint,
  splitPromptTokens,
  validateFrenchContent,
  validateUiCatalogs
} from "../scripts/localization.js";

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (path) => readFile(join(rootDirectory, path), "utf8").then(JSON.parse);

test("French prompt hints support contractions without matching inside words", () => {
  assert.equal(hasPromptHint("Je vais à l’école aujourd’hui.", "école"), true);
  assert.equal(hasPromptHint("Je vais à l’école aujourd’hui.", "aujourd’hui"), true);
  assert.equal(hasPromptHint("Qu’est-ce que tu as acheté ?", "Qu’"), true);
  assert.equal(hasPromptHint("encore", "or"), false);
});

test("French prompt tokens handle apostrophes and punctuation", () => {
  assert.deepEqual(splitPromptTokens("J’étudie à l’école, aujourd’hui."), [
    "J",
    "étudie",
    "à",
    "l",
    "école",
    "aujourd",
    "hui"
  ]);
});

test("content localization validates exact ids, hints, and accepted answers", () => {
  const sources = {
    exercises: [{
      id: "production-school",
      text: "I go to school.",
      solution: "学校へ行きます。",
      type: "production",
      promptVocabularyHints: [{ word: "school", vocabularyIds: ["school"] }]
    }],
    grammar: [{ id: "e-direction" }],
    vocabulary: [{ id: "school" }],
    kanji: [{ id: "kanji-school" }]
  };
  const localizations = {
    exercises: {
      "production-school": {
        translation: "Je vais à l’école.",
        promptVocabularyHints: [{ word: "école", vocabularyIds: ["school"] }]
      }
    },
    grammar: { "e-direction": { name: "Direction avec へ", meaning: "Indique une direction." } },
    vocabulary: { school: { meaning: "école", acceptedAnswers: ["école"] } },
    kanji: { "kanji-school": { meaning: "école" } }
  };

  assert.deepEqual(validateFrenchContent({ ...sources, localizations }), []);

  localizations.exercises["production-school"].promptVocabularyHints[0].word = "collège";
  assert.match(validateFrenchContent({ ...sources, localizations }).join("\n"), /not a prompt token/);
});

test("UI catalog validation requires matching keys, plurals, and placeholders", () => {
  assert.deepEqual(validateUiCatalogs(
    { greeting: "Hello {name}", count: { one: "{count} item", other: "{count} items" } },
    { greeting: "Bonjour {name}", count: { one: "{count} élément", other: "{count} éléments" } }
  ), []);

  assert.match(validateUiCatalogs(
    { greeting: "Hello {name}" },
    { greeting: "Bonjour" }
  ).join("\n"), /placeholders/);
});

test("committed French catalogs completely cover canonical content", async () => {
  const [
    exercises,
    grammar,
    vocabulary,
    kanji,
    englishUi,
    frenchUi,
    localizedExercises,
    localizedGrammar,
    localizedVocabulary,
    localizedKanji
  ] = await Promise.all([
    readJson("data/source/exercises.json"),
    readJson("data/jlpt-n5-grammar.json"),
    readJson("data/jlpt-n5-vocabulary.json"),
    readJson("data/jlpt-n5-kanji.json"),
    readJson("locales/en.json"),
    readJson("locales/fr.json"),
    readJson("data/source/locales/fr/exercises.json"),
    readJson("data/source/locales/fr/grammar.json"),
    readJson("data/source/locales/fr/vocabulary.json"),
    readJson("data/source/locales/fr/kanji.json")
  ]);

  assert.deepEqual(validateUiCatalogs(englishUi, frenchUi), []);
  assert.deepEqual(validateFrenchContent({
    exercises,
    grammar,
    vocabulary,
    kanji,
    localizations: {
      exercises: localizedExercises,
      grammar: localizedGrammar,
      vocabulary: localizedVocabulary,
      kanji: localizedKanji
    }
  }), []);
});
