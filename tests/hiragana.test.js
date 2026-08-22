import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as wanakana from "wanakana";

globalThis.wanakana = wanakana;
await import("../hiragana.js");

const {
  directions,
  segmentHiragana,
  romanizeParts,
  gradeAnswer,
  createWordPool,
  createKanaInventory,
  getNextDirection,
  chooseExercise,
  createKanaRatings,
  summarizeKanaRatings
} = globalThis.JlptN5Hiragana;

test("hiragana segmentation treats contracted sounds as one knowledge item", () => {
  assert.deepEqual(segmentHiragana("みゅ"), ["みゅ"]);
  assert.deepEqual(segmentHiragana("ぎゅうにゅう"), ["ぎゅ", "う", "にゅ", "う"]);
  assert.deepEqual(segmentHiragana("きって"), ["き", "っ", "て"]);
});

test("romaji grading assigns exact outcomes to each hiragana part", () => {
  const correct = gradeAnswer({
    reading: "いもうと",
    direction: directions.kanaToRomaji,
    answer: " Imouto "
  });
  const typo = gradeAnswer({
    reading: "いもうと",
    direction: directions.kanaToRomaji,
    answer: "imouta"
  });

  assert.equal(correct.correct, true);
  assert.equal(correct.expectedAnswer, "imouto");
  assert.deepEqual(correct.parts.map(({ outcome }) => outcome), [
    "good", "good", "good", "good"
  ]);
  assert.equal(typo.correct, false);
  assert.deepEqual(typo.parts.map(({ outcome }) => outcome), [
    "good", "good", "good", "again"
  ]);
});

test("romaji grading handles digraphs and small tsu without splitting them", () => {
  const result = gradeAnswer({
    reading: "きって",
    direction: directions.kanaToRomaji,
    answer: "kite"
  });

  assert.deepEqual(romanizeParts(["き", "っ", "て"]), ["ki", "t", "te"]);
  assert.equal(result.expectedAnswer, "kitte");
  assert.deepEqual(result.parts, [
    { kana: "き", romaji: "ki", outcome: "good" },
    { kana: "っ", romaji: "t", outcome: "again" },
    { kana: "て", romaji: "te", outcome: "good" }
  ]);
});

test("displayed romaji remains reversible for n and doubled ch sounds", () => {
  const fridayParts = segmentHiragana("きんようび");
  const overThereParts = segmentHiragana("あっち");
  const friday = romanizeParts(fridayParts).join("");
  const overThere = romanizeParts(overThereParts).join("");

  assert.equal(friday, "kin'youbi");
  assert.equal(wanakana.toHiragana(friday), "きんようび");
  assert.equal(overThere, "acchi");
  assert.equal(wanakana.toHiragana(overThere), "あっち");
  assert.equal(gradeAnswer({
    reading: "きんようび",
    direction: directions.kanaToRomaji,
    answer: "kinyoubi"
  }).correct, true);
});

test("kana grading accepts IME-style romaji and isolates substitutions", () => {
  const correct = gradeAnswer({
    reading: "おちゃ",
    direction: directions.romajiToKana,
    answer: "ocha"
  });
  const typo = gradeAnswer({
    reading: "いもうと",
    direction: directions.romajiToKana,
    answer: "いもおと"
  });

  assert.equal(correct.normalizedAnswer, "おちゃ");
  assert.equal(correct.correct, true);
  assert.deepEqual(correct.parts.map(({ kana }) => kana), ["お", "ちゃ"]);
  assert.deepEqual(typo.parts.map(({ outcome }) => outcome), [
    "good", "good", "again", "good"
  ]);
});

test("the word pool uses full core N5 words and excludes katakana spellings", () => {
  const words = createWordPool([
    {
      id: "sister",
      term: "妹",
      reading: "いもうと",
      meaning: "younger sister",
      scope: "core",
      audio: "assets/voices/vocab/sister.m4a"
    },
    {
      id: "shirt",
      term: "シャツ",
      reading: "しゃつ",
      meaning: "shirt",
      scope: "core"
    },
    {
      id: "favorite",
      term: "忍者",
      reading: "にんじゃ",
      meaning: "ninja",
      scope: "supplemental"
    }
  ]);

  assert.equal(words.length, 1);
  assert.equal(words[0].writtenForm, "妹");
  assert.equal(words[0].romaji, "imouto");
  assert.equal(words[0].audio, "assets/voices/vocab/sister.m4a");
  assert.deepEqual(createKanaInventory(words).sort(), ["い", "う", "と", "も"]);
});

test("every generated N5 word has a reversible romaji prompt", async () => {
  const vocabulary = JSON.parse(await readFile(
    new URL("../data/jlpt-n5-vocabulary.json", import.meta.url),
    "utf8"
  ));
  const words = createWordPool(vocabulary);

  assert.ok(words.length > 500);

  for (const word of words) {
    assert.equal(wanakana.toHiragana(word.romaji), word.reading, word.writtenForm);
  }
});

test("exercise directions alternate after completed hiragana attempts", () => {
  assert.equal(getNextDirection([]), directions.kanaToRomaji);
  assert.equal(getNextDirection([{
    section: "hiragana",
    kanaRatings: [{ kana: "い", outcome: "good" }]
  }]), directions.romajiToKana);
  assert.equal(getNextDirection([{
    section: "grammar",
    grammarRatings: [{ grammarPointId: "wa-topic", outcome: "good" }]
  }]), directions.kanaToRomaji);
});

test("exercise selection targets a scheduled kana and avoids an immediate repeat", () => {
  const words = [
    { vocabularyId: "one", kanaParts: ["い", "ぬ"], reading: "いぬ" },
    { vocabularyId: "two", kanaParts: ["ぬ", "ま"], reading: "ぬま" }
  ];
  const exercise = chooseExercise(words, "ぬ", directions.kanaToRomaji, {
    previousVocabularyId: "one",
    random: () => 0
  });

  assert.equal(exercise.vocabularyId, "two");
  assert.equal(exercise.targetKana, "ぬ");
});

test("repeated kana receive one conservative SRS rating", () => {
  assert.deepEqual(createKanaRatings([
    { kana: "こ", outcome: "good" },
    { kana: "こ", outcome: "again" },
    { kana: "に", outcome: "good" }
  ]), [
    { kana: "こ", outcome: "good" },
    { kana: "こ", outcome: "again" },
    { kana: "に", outcome: "good" }
  ]);
  assert.deepEqual(summarizeKanaRatings([
    { kana: "こ", outcome: "good" },
    { kana: "こ", outcome: "again" },
    { kana: "に", outcome: "good" }
  ]), [
    { kana: "こ", outcome: "again" },
    { kana: "に", outcome: "good" }
  ]);
});
