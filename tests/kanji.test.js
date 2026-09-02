import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as wanakana from "wanakana";

globalThis.wanakana = wanakana;
await import("../kanji.js");

const {
  activeStages,
  directions,
  normalizeReading,
  normalizeKanjiAnswer,
  createExercisePool,
  getKanjiInventory,
  getNextDirection,
  createAnswerChoices,
  chooseExercise,
  gradeAnswer,
  createKanjiRating,
  createPositiveVocabularyRating
} = globalThis.JlptN5Kanji;

function createFixturePool() {
  return createExercisePool([
    {
      id: "kanji-study",
      character: "学",
      stage: "B6",
      meaning: "study",
      onReadings: ["がく"],
      kunReadings: []
    },
    {
      id: "kanji-school",
      character: "校",
      stage: "B4",
      meaning: "school",
      onReadings: ["こう"],
      kunReadings: []
    }
  ], [
    {
      id: "vocabulary-school",
      term: "学校",
      reading: "がっこう",
      meaning: "school",
      scope: "core",
      partOfSpeech: "noun",
      audio: "assets/voices/vocab/gakkou.m4a"
    },
    {
      id: "vocabulary-student",
      term: "学生",
      reading: "がくせい",
      alternateReadings: ["がくせー"],
      meaning: "student",
      scope: "core",
      partOfSpeech: "noun"
    }
  ]);
}

test("the complete kanji curriculum exposes all 209 characters through word contexts", async () => {
  const [kanji, vocabulary, contexts] = await Promise.all([
    readFile(new URL("../data/jlpt-n5-kanji.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../data/jlpt-n5-vocabulary.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../data/kanji-contexts.json", import.meta.url), "utf8").then(JSON.parse)
  ]);
  const pool = createExercisePool(kanji, [...vocabulary, ...contexts]);
  const inventory = getKanjiInventory(pool);

  assert.deepEqual(activeStages, ["B6", "B5", "B4"]);
  assert.equal(inventory.length, 209);
  assert.deepEqual(new Set(inventory.map(({ stage }) => stage)), new Set(activeStages));
  assert.ok(pool.some(({ character, term }) => character === "田" && term === "田んぼ"));
  assert.ok(pool.some(({ character, term }) => character === "和" && term === "和室"));
  assert.ok(pool.some(({ character, term }) => character === "資" && term === "資料"));

  const four = pool.find(({ character, term }) => character === "四" && term === "四");
  const seven = pool.find(({ character, term }) => character === "七" && term === "七");

  assert.deepEqual(four.alternateReadings, ["よん"]);
  assert.deepEqual(seven.alternateReadings, ["なな"]);
  assert.equal(gradeAnswer({
    ...four,
    direction: directions.kanjiToReading
  }, "yon").correct, true);
  assert.equal(gradeAnswer({
    ...seven,
    direction: directions.kanjiToReading
  }, "nana").correct, true);
});

test("kanji-only contexts do not create vocabulary SRS ratings", async () => {
  const [kanji, contexts] = await Promise.all([
    readFile(new URL("../data/jlpt-n5-kanji.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../data/kanji-contexts.json", import.meta.url), "utf8").then(JSON.parse)
  ]);
  const pool = createExercisePool(kanji, contexts);
  const exercise = chooseExercise(
    pool,
    kanji.find(({ character }) => character === "払").id,
    directions.kanjiToReading,
    { random: () => 0 }
  );

  assert.equal(exercise.term, "払う");
  assert.equal(exercise.reading, "はらう");
  assert.equal(exercise.vocabularyId, undefined);
  assert.equal(exercise.kanjiContextId, "kanji-context-harau");
  assert.equal(createPositiveVocabularyRating(exercise, "good"), undefined);
});

test("kanji pools retain word context and mask only the scheduled character", () => {
  const pool = createFixturePool();

  assert.equal(pool.length, 3);
  assert.deepEqual(
    getKanjiInventory(pool).map(({ id }) => id),
    ["kanji-study", "kanji-school"]
  );
  assert.deepEqual(pool[0], {
    kanjiId: "kanji-study",
    character: "学",
    stage: "B6",
    kanjiMeaning: "study",
    onReadings: ["がく"],
    kunReadings: [],
    vocabularyId: "vocabulary-school",
    term: "学校",
    maskedTerm: "□校",
    reading: "がっこう",
    alternateReadings: [],
    meaning: "school",
    partOfSpeech: "noun",
    audio: "assets/voices/vocab/gakkou.m4a",
    kanjiIds: ["kanji-study", "kanji-school"]
  });
});

test("a successful full-word reading can reinforce its vocabulary positively", () => {
  const exercise = {
    direction: directions.kanjiToReading,
    vocabularyId: "vocabulary-school"
  };

  assert.deepEqual(createPositiveVocabularyRating(exercise, "good"), {
    vocabularyId: "vocabulary-school",
    outcome: "good"
  });
  assert.equal(createPositiveVocabularyRating(exercise, "again"), undefined);
  assert.equal(createPositiveVocabularyRating({
    ...exercise,
    direction: directions.readingToKanji
  }, "good"), undefined);
});

test("missing-kanji prompts exclude words that would need the same answer twice", () => {
  const pool = createExercisePool([
    {
      id: "kanji-day",
      character: "日",
      stage: "B6",
      meaning: "day",
      onReadings: ["にち"],
      kunReadings: ["ひ"]
    }
  ], [{
    id: "vocabulary-sunday",
    term: "日曜日",
    reading: "にちようび",
    meaning: "Sunday",
    scope: "core",
    partOfSpeech: "noun"
  }]);

  assert.deepEqual(pool, []);
});

test("kanji exercise directions alternate and ignore other history sections", () => {
  assert.equal(getNextDirection([]), directions.kanjiToReading);
  assert.equal(getNextDirection([
    { section: "vocabulary", direction: "japanese-to-english" },
    { section: "kanji", direction: directions.kanjiToReading }
  ]), directions.readingToKanji);
  assert.equal(getNextDirection([
    { section: "kanji", direction: directions.readingToKanji }
  ]), directions.kanjiToReading);
});

test("missing-kanji choices include one answer and unique active distractors", () => {
  const characters = ["日", "月", "火", "水", "木", "金", "土", "山"];
  const pool = characters.map((character, index) => ({
    kanjiId: `kanji-${index}`,
    character,
    stage: "B6",
    kanjiMeaning: character,
    onReadings: [],
    kunReadings: []
  }));
  const choices = createAnswerChoices(pool, "kanji-0", {
    count: 6,
    random: () => 0.25
  });

  assert.equal(choices.length, 6);
  assert.equal(new Set(choices).size, 6);
  assert.equal(choices.filter((character) => character === "日").length, 1);
  assert.equal(choices.every((character) => characters.includes(character)), true);
});

test("selection targets one kanji and avoids repeating its previous word", () => {
  const pool = createFixturePool();
  const exercise = chooseExercise(
    pool,
    "kanji-study",
    directions.kanjiToReading,
    { previousVocabularyId: "vocabulary-school", random: () => 0 }
  );

  assert.equal(exercise.vocabularyId, "vocabulary-student");
  assert.equal(exercise.prompt, "学生");
  assert.equal(exercise.solution, "がくせい");
  assert.equal(exercise.section, "kanji");

  const orthography = chooseExercise(
    pool,
    "kanji-study",
    directions.readingToKanji,
    { random: () => 0 }
  );

  assert.equal(orthography.prompt, "□校");
  assert.equal(orthography.solution, "学");
  assert.deepEqual(orthography.choices, ["校", "学"]);
});

test("kanji reading accepts kana and committed romaji mechanically", () => {
  const exercise = chooseExercise(
    createFixturePool(),
    "kanji-study",
    directions.kanjiToReading,
    { random: () => 0 }
  );

  assert.equal(normalizeReading(" GAKKOU "), "がっこう");
  assert.equal(gradeAnswer(exercise, "gakkou").correct, true);
  assert.equal(gradeAnswer(exercise, "ガッコウ").correct, true);
  assert.equal(gradeAnswer(exercise, "がこう").outcome, "again");
});

test("identical written prompts accept every vocabulary reading", () => {
  const pool = createExercisePool([{
    id: "kanji-ten",
    character: "十",
    stage: "B6",
    meaning: "ten",
    onReadings: ["じゅう"],
    kunReadings: ["とお"]
  }], [{
    id: "vocabulary-ten-on",
    term: "十",
    reading: "じゅう",
    meaning: "ten",
    scope: "core",
    partOfSpeech: "number"
  }, {
    id: "vocabulary-ten-kun",
    term: "十",
    reading: "とお",
    meaning: "ten things",
    scope: "core",
    partOfSpeech: "number"
  }]);
  const exercise = chooseExercise(
    pool,
    "kanji-ten",
    directions.kanjiToReading,
    { previousVocabularyId: "vocabulary-ten-on", random: () => 0 }
  );

  assert.equal(exercise.reading, "とお");
  assert.deepEqual(exercise.alternateReadings, ["じゅう"]);
  assert.equal(gradeAnswer(exercise, "じゅう").correct, true);
  assert.equal(gradeAnswer(exercise, "とお").correct, true);
});

test("kanji orthography grades the one missing target character", () => {
  const exercise = chooseExercise(
    createFixturePool(),
    "kanji-study",
    directions.readingToKanji,
    { random: () => 0 }
  );

  assert.equal(normalizeKanjiAnswer(" 学。 "), "学");
  assert.deepEqual(gradeAnswer(exercise, "学"), {
    expectedAnswer: "学",
    normalizedAnswer: "学",
    correct: true,
    outcome: "good"
  });
  assert.equal(gradeAnswer(exercise, "校").correct, false);
  assert.deepEqual(createKanjiRating("kanji-study", "easy"), {
    kanjiId: "kanji-study",
    outcome: "again"
  });
});
