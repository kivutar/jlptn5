import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

await import("../vocabulary.js");

const {
  directions,
  normalizeEnglish,
  normalizeTranslation,
  normalizeJapanese,
  createEnglishAnswers,
  createVocabularyPool,
  getNextDirection,
  chooseExercise,
  gradeAnswer
} = globalThis.JlptN5Vocabulary;

test("vocabulary normalization is case, width, whitespace, and punctuation tolerant", () => {
  assert.equal(normalizeEnglish("  Older BROTHER! "), "older brother");
  assert.equal(normalizeEnglish("bread & butter"), "bread and butter");
  assert.equal(normalizeJapanese(" ～ ご　ろ。 "), "ごろ");
  assert.equal(normalizeJapanese("Ｎ"), "n");
});

test("curated English gloss alternatives are accepted mechanically", () => {
  assert.deepEqual(createEnglishAnswers("to meet, to see"), [
    "to meet to see",
    "meet to see",
    "to meet",
    "meet",
    "to see",
    "see"
  ]);
  assert.ok(createEnglishAnswers("(my) older brother (humble)").includes("older brother"));
  assert.ok(createEnglishAnswers("fall (season)").includes("fall"));
});

test("French vocabulary grading accepts accents, apostrophes, articles, and curated equivalents", () => {
  const [entry] = createVocabularyPool([{
    id: "school",
    term: "学校",
    reading: "がっこう",
    meaning: "école",
    canonicalMeaning: "school",
    acceptedTranslationAnswers: ["école", "l’école"],
    scope: "core",
    partOfSpeech: "noun"
  }], { locale: "fr" });
  const exercise = {
    ...chooseExercise([entry], "school", directions.japaneseToEnglish),
    locale: "fr"
  };

  assert.equal(normalizeTranslation(" ÉCOLE ! ", "fr"), "ecole");
  assert.equal(gradeAnswer(exercise, "école").correct, true);
  assert.equal(gradeAnswer(exercise, "ecole").correct, true);
  assert.equal(gradeAnswer(exercise, "l’école").correct, true);
  assert.equal(gradeAnswer(exercise, "université").correct, false);
});

test("the vocabulary pool contains the complete curated inventory", async () => {
  const vocabulary = JSON.parse(await readFile(
    new URL("../data/jlpt-n5-vocabulary.json", import.meta.url),
    "utf8"
  ));
  const pool = createVocabularyPool(vocabulary);

  assert.equal(pool.length, 826);
  assert.equal(new Set(pool.map(({ vocabularyId }) => vocabularyId)).size, 826);
  assert.equal(pool.every(({ acceptedEnglishAnswers }) => acceptedEnglishAnswers.length > 0), true);
  assert.equal(pool.every(({ acceptedJapaneseAnswers }) => acceptedJapaneseAnswers.length > 0), true);

  const dayCounter = pool.find(({ vocabularyId }) => {
    return vocabularyId === "vocab-a759a7d58008";
  });
  const dayCounterRecall = chooseExercise(
    pool,
    dayCounter.vocabularyId,
    directions.englishToJapanese
  );

  assert.deepEqual(dayCounter.alternateReadings, ["～か"]);
  assert.equal(gradeAnswer(dayCounterRecall, "にち").correct, true);
  assert.equal(gradeAnswer(dayCounterRecall, "か").correct, true);

  for (const entry of pool) {
    const recognition = chooseExercise(
      pool,
      entry.vocabularyId,
      directions.japaneseToEnglish
    );
    const recall = chooseExercise(
      pool,
      entry.vocabularyId,
      directions.englishToJapanese
    );

    assert.equal(gradeAnswer(recognition, entry.meaning).correct, true, entry.vocabularyId);
    assert.equal(gradeAnswer(recall, entry.term).correct, true, entry.vocabularyId);
    assert.equal(gradeAnswer(recall, entry.reading).correct, true, entry.vocabularyId);
  }
});

test("Japanese-to-English grading accepts individual curated glosses", () => {
  const [entry] = createVocabularyPool([{
    id: "meet",
    term: "会う",
    reading: "あう",
    meaning: "to meet, to see",
    scope: "core",
    partOfSpeech: "verb"
  }]);
  const exercise = chooseExercise(
    [entry],
    "meet",
    directions.japaneseToEnglish
  );

  assert.equal(gradeAnswer(exercise, "meet").correct, true);
  assert.equal(gradeAnswer(exercise, "to see!").correct, true);
  assert.equal(gradeAnswer(exercise, "meeting").correct, false);
});

test("English-to-Japanese grading accepts readings, variants, and unambiguous synonyms", () => {
  const pool = createVocabularyPool([
    {
      id: "milk-kanji",
      term: "牛乳",
      reading: "ぎゅうにゅう",
      meaning: "milk",
      scope: "core",
      partOfSpeech: "noun"
    },
    {
      id: "milk-katakana",
      term: "ミルク",
      reading: "みるく",
      meaning: "milk",
      scope: "core",
      partOfSpeech: "noun"
    },
    {
      id: "blue-noun",
      term: "青",
      reading: "あお",
      meaning: "blue",
      scope: "core",
      partOfSpeech: "noun"
    },
    {
      id: "blue-adjective",
      term: "青い",
      reading: "あおい",
      meaning: "blue",
      scope: "core",
      partOfSpeech: "adjective"
    }
  ]);
  const milk = chooseExercise(pool, "milk-kanji", directions.englishToJapanese);
  const blue = chooseExercise(pool, "blue-noun", directions.englishToJapanese);

  assert.equal(gradeAnswer(milk, "牛乳").correct, true);
  assert.equal(gradeAnswer(milk, "ぎゅうにゅう").correct, true);
  assert.equal(gradeAnswer(milk, "ミルク").correct, true);
  assert.equal(gradeAnswer(blue, "あお").correct, true);
  assert.equal(gradeAnswer(blue, "青い").correct, false);
});

test("vocabulary directions alternate independently from other sections", () => {
  const vocabularyAttempt = { section: "vocabulary", outcome: "good" };

  assert.equal(getNextDirection([]), directions.japaneseToEnglish);
  assert.equal(getNextDirection([
    { section: "katakana", kanaRatings: [{ kana: "コ", outcome: "good" }] }
  ]), directions.japaneseToEnglish);
  assert.deepEqual(
    Array.from({ length: 4 }, (_, count) => {
      return getNextDirection(Array(count).fill(vocabularyAttempt));
    }),
    [
      directions.japaneseToEnglish,
      directions.englishToJapanese,
      directions.japaneseToEnglish,
      directions.englishToJapanese
    ]
  );
});
