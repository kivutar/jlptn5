import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as wanakana from "wanakana";

globalThis.wanakana = wanakana;
await import("../katakana.js");

const {
  directions,
  segmentKatakana,
  romanizeParts,
  gradeAnswer,
  createWordPool,
  createKanaInventory,
  getNextDirection,
  chooseExercise,
  summarizeKanaRatings
} = globalThis.JlptN5Katakana;

test("Katakana segmentation keeps contracted and foreign sounds together", () => {
  assert.deepEqual(segmentKatakana("キャベツ"), ["キャ", "ベ", "ツ"]);
  assert.deepEqual(segmentKatakana("パーティー"), ["パ", "ー", "ティ", "ー"]);
  assert.deepEqual(segmentKatakana("ファッション"), ["ファ", "ッ", "ショ", "ン"]);
});

test("Katakana romanization is reversible through an IME", () => {
  assert.deepEqual(
    romanizeParts(segmentKatakana("コーヒー")),
    ["ko", "-", "hi", "-"]
  );
  assert.deepEqual(
    romanizeParts(segmentKatakana("パーティー")),
    ["pa", "-", "thi", "-"]
  );
  assert.equal(wanakana.toKatakana("ko-hi-"), "コーヒー");
  assert.equal(wanakana.toKatakana("pa-thi-"), "パーティー");
  assert.equal(wanakana.toKatakana("fasshon"), "ファッション");
});

test("romaji grading accepts IME, doubled-vowel, and macron spellings", () => {
  for (const answer of ["ko-hi-", "koohii", "kōhī"]) {
    const result = gradeAnswer({
      katakana: "コーヒー",
      direction: directions.kanaToRomaji,
      answer
    });

    assert.equal(result.correct, true, answer);
    assert.deepEqual(result.parts.map(({ outcome }) => outcome), [
      "good", "good", "good", "good"
    ]);
  }
});

test("romaji grading assigns a missing long vowel to the long mark", () => {
  const result = gradeAnswer({
    katakana: "コーヒー",
    direction: directions.kanaToRomaji,
    answer: "kohii"
  });

  assert.equal(result.correct, false);
  assert.deepEqual(result.parts.map(({ kana, outcome }) => ({ kana, outcome })), [
    { kana: "コ", outcome: "good" },
    { kana: "ー", outcome: "again" },
    { kana: "ヒ", outcome: "good" },
    { kana: "ー", outcome: "good" }
  ]);
});

test("Katakana grading accepts IME input and rejects doubled kana vowels", () => {
  const correct = gradeAnswer({
    katakana: "コーヒー",
    direction: directions.romajiToKana,
    answer: "ko-hi-"
  });
  const misspelled = gradeAnswer({
    katakana: "コーヒー",
    direction: directions.romajiToKana,
    answer: "コオヒイ"
  });

  assert.equal(correct.normalizedAnswer, "コーヒー");
  assert.equal(correct.correct, true);
  assert.equal(misspelled.correct, false);
  assert.deepEqual(misspelled.parts.map(({ outcome }) => outcome), [
    "good", "again", "good", "again"
  ]);
});

test("foreign-sound aliases are accepted without weakening reverse prompts", () => {
  for (const answer of ["thi", "ti", "tei"]) {
    assert.equal(gradeAnswer({
      katakana: "ティ",
      direction: directions.kanaToRomaji,
      answer
    }).correct, true, answer);
  }

  assert.equal(gradeAnswer({
    katakana: "ティ",
    direction: directions.romajiToKana,
    answer: "thi"
  }).correct, true);
  assert.equal(gradeAnswer({
    katakana: "ティ",
    direction: directions.romajiToKana,
    answer: "ti"
  }).correct, false);
});

test("the curated pool contains every unique all-Katakana vocabulary word", async () => {
  const vocabulary = JSON.parse(await readFile(
    new URL("../data/jlpt-n5-vocabulary.json", import.meta.url),
    "utf8"
  ));
  const words = createWordPool(vocabulary);

  assert.equal(words.length, 119);
  assert.equal(new Set(words.map(({ katakana }) => katakana)).size, 119);
  assert.equal(createKanaInventory(words).length, 86);

  for (const word of words) {
    assert.equal(wanakana.toKatakana(word.romaji), word.katakana, word.katakana);
  }
});

test("Katakana directions alternate independently from Hiragana", () => {
  assert.equal(getNextDirection([]), directions.kanaToRomaji);
  assert.equal(getNextDirection([{
    section: "hiragana",
    kanaRatings: [{ kana: "い", outcome: "good" }]
  }]), directions.kanaToRomaji);
  assert.equal(getNextDirection([{
    section: "katakana",
    kanaRatings: [{ kana: "ア", outcome: "good" }]
  }]), directions.romajiToKana);
});

test("Katakana selection targets a scheduled item and avoids an immediate repeat", () => {
  const words = [
    { vocabularyId: "one", kanaParts: ["コ", "ー", "ラ"], katakana: "コーラ" },
    { vocabularyId: "two", kanaParts: ["ス", "ー", "プ"], katakana: "スープ" }
  ];
  const exercise = chooseExercise(words, "ー", directions.kanaToRomaji, {
    previousVocabularyId: "one",
    random: () => 0
  });

  assert.equal(exercise.vocabularyId, "two");
  assert.equal(exercise.section, "katakana");
});

test("repeated Katakana receive one conservative SRS rating", () => {
  assert.deepEqual(summarizeKanaRatings([
    { kana: "コ", outcome: "good" },
    { kana: "コ", outcome: "again" },
    { kana: "ー", outcome: "good" }
  ]), [
    { kana: "コ", outcome: "again" },
    { kana: "ー", outcome: "good" }
  ]);
});
