import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as wanakana from "wanakana";

globalThis.wanakana = wanakana;
await import("../katakana.js");

const {
  directions,
  exerciseKinds,
  segmentKatakana,
  createKanaPairs,
  romanizeParts,
  gradeAnswer,
  createWordPool,
  createKanaInventory,
  createSingleKanaPool,
  createKanaPairInventory,
  getNextExerciseMode,
  getNextDirection,
  chooseExercise,
  chooseSingleKanaExercise,
  createKanaRatings,
  summarizeKanaRatings
} = globalThis.JlptN5Katakana;

test("Katakana segmentation keeps contracted and foreign sounds together", () => {
  assert.deepEqual(segmentKatakana("キャベツ"), ["キャ", "ベ", "ツ"]);
  assert.deepEqual(segmentKatakana("パーティー"), ["パ", "ー", "ティ", "ー"]);
  assert.deepEqual(segmentKatakana("ファッション"), ["ファ", "ッ", "ショ", "ン"]);
});

test("Katakana parts align with trustworthy Hiragana pairs", () => {
  assert.deepEqual(createKanaPairs("ファッション", "ふぁっしょん"), [
    { hiragana: "ふぁ", katakana: "ファ" },
    { hiragana: "っ", katakana: "ッ" },
    { hiragana: "しょ", katakana: "ショ" },
    { hiragana: "ん", katakana: "ン" }
  ]);
  assert.deepEqual(createKanaPairs("コーヒー", "こーひー"), [
    { hiragana: "こ", katakana: "コ" },
    { hiragana: "ー", katakana: "ー" },
    { hiragana: "ひ", katakana: "ヒ" },
    { hiragana: "ー", katakana: "ー" }
  ]);
  assert.deepEqual(createKanaPairs("コーヒー", "こうひい"), []);
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

test("Hiragana-to-Katakana grading returns paired results", () => {
  const correct = gradeAnswer({
    katakana: "ファッション",
    hiragana: "ふぁっしょん",
    direction: directions.hiraganaToKatakana,
    answer: "fasshon"
  });
  const misspelled = gradeAnswer({
    katakana: "コーヒー",
    hiragana: "こーひー",
    direction: directions.hiraganaToKatakana,
    answer: "コオヒー"
  });

  assert.equal(correct.correct, true);
  assert.deepEqual(
    correct.parts.map(({ pairedKana, kana, outcome }) => ({ pairedKana, kana, outcome })),
    [
      { pairedKana: "ふぁ", kana: "ファ", outcome: "good" },
      { pairedKana: "っ", kana: "ッ", outcome: "good" },
      { pairedKana: "しょ", kana: "ショ", outcome: "good" },
      { pairedKana: "ん", kana: "ン", outcome: "good" }
    ]
  );
  assert.deepEqual(misspelled.parts.map(({ outcome }) => outcome), [
    "good", "again", "good", "good"
  ]);
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
  assert.equal(createSingleKanaPool(words).length, 84);
  assert.equal(words.every(({ kanaPairs }) => kanaPairs.length > 0), true);
  assert.equal(createKanaPairInventory(words).length, 86);

  for (const word of words) {
    assert.equal(wanakana.toKatakana(word.romaji), word.katakana, word.katakana);
  }
});

test("the Katakana word pool carries packaged vocabulary narration", () => {
  const [word] = createWordPool([{
    id: "coffee",
    term: "コーヒー",
    reading: "こーひー",
    meaning: "coffee",
    scope: "core",
    audio: "assets/voices/vocab/coffee.m4a"
  }]);

  assert.equal(word.audio, "assets/voices/vocab/coffee.m4a");
});

test("Katakana uses a five-one-one direction cadence independently from Hiragana", () => {
  assert.equal(getNextDirection([]), directions.kanaToRomaji);
  assert.equal(getNextDirection([{
    section: "hiragana",
    kanaRatings: [{ kana: "い", outcome: "good" }]
  }]), directions.kanaToRomaji);

  const katakanaAttempt = {
    section: "katakana",
    kanaRatings: [{ kana: "ア", outcome: "good" }]
  };
  const sequence = Array.from({ length: 14 }, (_, completedCount) => {
    return getNextDirection(Array(completedCount).fill(katakanaAttempt));
  });

  assert.deepEqual(sequence, [
    directions.kanaToRomaji,
    directions.kanaToRomaji,
    directions.kanaToRomaji,
    directions.kanaToRomaji,
    directions.kanaToRomaji,
    directions.hiraganaToKatakana,
    directions.romajiToKana,
    directions.kanaToRomaji,
    directions.kanaToRomaji,
    directions.kanaToRomaji,
    directions.kanaToRomaji,
    directions.kanaToRomaji,
    directions.hiraganaToKatakana,
    directions.romajiToKana
  ]);
  assert.deepEqual(
    Array.from({ length: 7 }, (_, completedCount) => {
      return getNextExerciseMode(Array(completedCount).fill(katakanaAttempt)).exerciseKind;
    }),
    [
      exerciseKinds.word,
      exerciseKinds.word,
      exerciseKinds.singleKana,
      exerciseKinds.word,
      exerciseKinds.word,
      exerciseKinds.word,
      exerciseKinds.word
    ]
  );
});

test("single-item exercises use standalone Katakana learning units", async () => {
  const vocabulary = JSON.parse(await readFile(
    new URL("../data/jlpt-n5-vocabulary.json", import.meta.url),
    "utf8"
  ));
  const singleKanaPool = createSingleKanaPool(createWordPool(vocabulary));
  const item = chooseSingleKanaExercise(singleKanaPool, "ティ");

  assert.equal(singleKanaPool.some(({ katakana }) => katakana === "ッ"), false);
  assert.equal(singleKanaPool.some(({ katakana }) => katakana === "ー"), false);
  assert.equal(singleKanaPool.every(({ kanaParts }) => kanaParts.length === 1), true);
  assert.deepEqual(item, {
    id: "katakana-single-ティ-kana-to-romaji",
    katakana: "ティ",
    writtenForm: "ティ",
    meaning: "",
    kanaParts: ["ティ"],
    romajiParts: ["thi"],
    romaji: "thi",
    section: "katakana",
    direction: directions.kanaToRomaji,
    exerciseKind: exerciseKinds.singleKana,
    targetKana: "ティ",
    reviewKanaParts: ["ティ"]
  });
  assert.equal(gradeAnswer({
    katakana: item.katakana,
    direction: item.direction,
    answer: "ti"
  }).correct, true);
  assert.equal(chooseSingleKanaExercise(singleKanaPool, "ー"), undefined);
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

test("paired selection can target either side and reviews both scripts", () => {
  const words = [{
    vocabularyId: "coffee",
    kanaParts: ["コ", "ー", "ヒ", "ー"],
    kanaPairs: [
      { hiragana: "こ", katakana: "コ" },
      { hiragana: "ー", katakana: "ー" },
      { hiragana: "ひ", katakana: "ヒ" },
      { hiragana: "ー", katakana: "ー" }
    ],
    katakana: "コーヒー"
  }];
  const exercise = chooseExercise(
    words,
    "ひ",
    directions.hiraganaToKatakana,
    { random: () => 0 }
  );

  assert.equal(exercise.vocabularyId, "coffee");
  assert.deepEqual(exercise.reviewKanaParts, [
    "こ", "コ", "ー", "ー", "ひ", "ヒ", "ー", "ー"
  ]);
  const partResults = [
    { kana: "コ", pairedKana: "こ", outcome: "good" },
    { kana: "ー", pairedKana: "ー", outcome: "good" },
    { kana: "ヒ", pairedKana: "ひ", outcome: "good" },
    { kana: "ー", pairedKana: "ー", outcome: "again" }
  ];

  assert.deepEqual(createKanaRatings(partResults), [
    { kana: "コ", outcome: "good" },
    { kana: "こ", outcome: "good" },
    { kana: "ー", outcome: "good" },
    { kana: "ヒ", outcome: "good" },
    { kana: "ひ", outcome: "good" },
    { kana: "ー", outcome: "again" }
  ]);
  assert.deepEqual(summarizeKanaRatings(partResults), [
    { kana: "コ", outcome: "good" },
    { kana: "こ", outcome: "good" },
    { kana: "ー", outcome: "again" },
    { kana: "ヒ", outcome: "good" },
    { kana: "ひ", outcome: "good" }
  ]);
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
