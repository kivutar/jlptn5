import assert from "node:assert/strict";
import test from "node:test";
import "../learning-stats.js";

const {
  readLearningStats,
  recordExerciseEncounter,
  recordExerciseAttempt,
  recordExerciseGrammarRatings,
  recordKanaEncounter,
  recordKanaAttempt,
  recordHiraganaEncounter,
  recordHiraganaAttempt,
  storageKey
} = globalThis.JlptN5Stats;

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, value);
  }
}

test("exercise encounters keep counts and first/last timestamps", () => {
  const storage = new MemoryStorage();
  const exercise = {
    grammarPointIds: ["wa-topic", "verb-masu", "wa-topic"],
    vocabularyIds: ["vocab-one", "vocab-two", "vocab-one"],
    kanjiIds: ["kanji-one", "kanji-two", "kanji-one"]
  };
  const firstEncounter = "2026-08-08T10:00:00.000Z";
  const secondEncounter = "2026-08-09T11:30:00.000Z";

  recordExerciseEncounter(exercise, { storage, now: firstEncounter });
  recordExerciseEncounter(exercise, { storage, now: secondEncounter });

  const stats = readLearningStats({ storage });

  assert.equal(stats.version, 1);
  assert.equal(stats.updatedAt, secondEncounter);
  assert.deepEqual(stats.grammarPoints["wa-topic"], {
    encounterCount: 2,
    firstEncounteredAt: firstEncounter,
    lastEncounteredAt: secondEncounter,
    encounteredAt: [firstEncounter, secondEncounter]
  });
  assert.equal(stats.grammarPoints["verb-masu"].encounterCount, 2);
  assert.equal(stats.vocabulary["vocab-one"].encounterCount, 2);
  assert.equal(stats.vocabulary["vocab-two"].encounterCount, 2);
  assert.deepEqual(stats.vocabulary["vocab-two"].encounteredAt, [
    firstEncounter,
    secondEncounter
  ]);
  assert.equal(stats.kanji["kanji-one"].encounterCount, 2);
  assert.deepEqual(stats.kanji["kanji-two"].encounteredAt, [
    firstEncounter,
    secondEncounter
  ]);
});

test("new items receive their own first encounter timestamp", () => {
  const storage = new MemoryStorage();

  recordExerciseEncounter(
    {
      grammarPointIds: ["wa-topic"],
      vocabularyIds: ["vocab-one"],
      kanjiIds: ["kanji-one"]
    },
    { storage, now: "2026-08-08T10:00:00.000Z" }
  );
  recordExerciseEncounter(
    {
      grammarPointIds: ["ga-subject"],
      vocabularyIds: ["vocab-two"],
      kanjiIds: ["kanji-two"]
    },
    { storage, now: "2026-08-10T12:00:00.000Z" }
  );

  const stats = readLearningStats({ storage });

  assert.equal(stats.grammarPoints["wa-topic"].lastEncounteredAt, "2026-08-08T10:00:00.000Z");
  assert.equal(stats.grammarPoints["ga-subject"].firstEncounteredAt, "2026-08-10T12:00:00.000Z");
  assert.equal(stats.vocabulary["vocab-two"].firstEncounteredAt, "2026-08-10T12:00:00.000Z");
  assert.equal(stats.kanji["kanji-two"].firstEncounteredAt, "2026-08-10T12:00:00.000Z");
});

test("existing version-one statistics gain an empty kanji bucket", () => {
  const storage = new MemoryStorage();

  storage.setItem(storageKey, JSON.stringify({
    version: 1,
    updatedAt: null,
    grammarPoints: {},
    vocabulary: {},
    exerciseHistory: []
  }));

  assert.deepEqual(readLearningStats({ storage }).kanji, {});
});

test("submitted exercise answers are retained in chronological history", () => {
  const storage = new MemoryStorage();
  const exercise = {
    id: "coffee-before-work",
    text: "毎朝、コーヒーを飲んでから仕事に行きます。",
    grammarPointIds: ["te-kara"],
    vocabularyIds: ["coffee"],
    kanjiIds: ["kanji-every"]
  };

  recordExerciseEncounter(exercise, {
    storage,
    now: "2026-08-08T09:00:00.000Z"
  });
  recordExerciseAttempt(exercise, "I drink coffee before work.", {
    storage,
    now: "2026-08-08T09:01:00.000Z"
  });
  recordExerciseAttempt(exercise, "Every morning I go to work after coffee.", {
    storage,
    now: "2026-08-09T10:30:00.000Z"
  });

  const stats = readLearningStats({ storage });

  assert.equal(stats.updatedAt, "2026-08-09T10:30:00.000Z");
  assert.equal(stats.grammarPoints["te-kara"].encounterCount, 1);
  assert.deepEqual(stats.exerciseHistory, [
    {
      exerciseId: "coffee-before-work",
      text: exercise.text,
      answer: "I drink coffee before work.",
      submittedAt: "2026-08-08T09:01:00.000Z",
      grammarRatings: []
    },
    {
      exerciseId: "coffee-before-work",
      text: exercise.text,
      answer: "Every morning I go to work after coffee.",
      submittedAt: "2026-08-09T10:30:00.000Z",
      grammarRatings: []
    }
  ]);
});

test("grammar ratings enrich the matching history attempt", () => {
  const storage = new MemoryStorage();
  const exercise = {
    id: "coffee-before-work",
    text: "毎朝、コーヒーを飲んでから仕事に行きます。"
  };
  const submittedAt = "2026-08-09T10:30:00.000Z";
  const ratedAt = "2026-08-09T10:31:00.000Z";

  recordExerciseAttempt(exercise, "I go to work after coffee.", {
    storage,
    now: submittedAt
  });
  recordExerciseGrammarRatings(exercise.id, submittedAt, [
    { grammarPointId: "te-kara", outcome: "good" },
    { grammarPointId: "verb-masu", outcome: "again" },
    { grammarPointId: "te-kara", outcome: "good" },
    { grammarPointId: "invalid", outcome: "easy" }
  ], { storage, now: ratedAt });

  const stats = readLearningStats({ storage });

  assert.equal(stats.updatedAt, ratedAt);
  assert.deepEqual(stats.exerciseHistory[0].grammarRatings, [
    { grammarPointId: "te-kara", outcome: "good" },
    { grammarPointId: "verb-masu", outcome: "again" }
  ]);
});

test("legacy attempts without ratings remain readable", () => {
  const storage = new MemoryStorage();

  storage.setItem(storageKey, JSON.stringify({
    version: 1,
    updatedAt: "2026-08-09T10:30:00.000Z",
    grammarPoints: {},
    vocabulary: {},
    kanji: {},
    exerciseHistory: [{
      exerciseId: "legacy",
      text: "テストです。",
      answer: "It is a test.",
      submittedAt: "2026-08-09T10:30:00.000Z"
    }]
  }));

  assert.deepEqual(readLearningStats({ storage }).exerciseHistory[0].grammarRatings, []);
});

test("later encounters preserve exercise history", () => {
  const storage = new MemoryStorage();
  const exercise = {
    id: "test-exercise",
    text: "テストです。",
    grammarPointIds: ["desu-copula"],
    vocabularyIds: [],
    kanjiIds: []
  };

  recordExerciseAttempt(exercise, "It is a test.", {
    storage,
    now: "2026-08-08T09:00:00.000Z"
  });
  recordExerciseEncounter(exercise, {
    storage,
    now: "2026-08-10T09:00:00.000Z"
  });

  assert.equal(readLearningStats({ storage }).exerciseHistory.length, 1);
});

test("hiragana encounters and deterministic part ratings are retained", () => {
  const storage = new MemoryStorage();
  const exercise = {
    id: "hiragana-sister-kana-to-romaji",
    section: "hiragana",
    direction: "kana-to-romaji",
    vocabularyId: "sister",
    writtenForm: "妹",
    reading: "いもうと",
    romaji: "imouto",
    meaning: "younger sister",
    kanaParts: ["い", "も", "う", "と"],
    kanjiIds: ["younger-sister"]
  };

  recordHiraganaEncounter(exercise, {
    storage,
    now: "2026-08-10T09:00:00.000Z"
  });
  recordHiraganaAttempt(exercise, "imouta", [
    { kana: "い", outcome: "good" },
    { kana: "も", outcome: "good" },
    { kana: "う", outcome: "good" },
    { kana: "と", outcome: "again" }
  ], {
    storage,
    now: "2026-08-10T09:01:00.000Z"
  });

  const stats = readLearningStats({ storage });

  assert.equal(stats.kana["い"].encounterCount, 1);
  assert.equal(stats.vocabulary.sister.encounterCount, 1);
  assert.equal(stats.kanji["younger-sister"].encounterCount, 1);
  assert.deepEqual(stats.exerciseHistory[0], {
    section: "hiragana",
    exerciseId: exercise.id,
    text: "いもうと",
    solution: "imouto",
    writtenForm: "妹",
    meaning: "younger sister",
    direction: "kana-to-romaji",
    answer: "imouta",
    submittedAt: "2026-08-10T09:01:00.000Z",
    kanaRatings: [
      { kana: "い", outcome: "good" },
      { kana: "も", outcome: "good" },
      { kana: "う", outcome: "good" },
      { kana: "と", outcome: "again" }
    ]
  });
});

test("Katakana encounters and mechanical ratings retain their section", () => {
  const storage = new MemoryStorage();
  const exercise = {
    id: "katakana-coffee-kana-to-romaji",
    section: "katakana",
    direction: "kana-to-romaji",
    vocabularyId: "coffee",
    writtenForm: "コーヒー",
    katakana: "コーヒー",
    romaji: "ko-hi-",
    meaning: "coffee",
    kanaParts: ["コ", "ー", "ヒ", "ー"],
    kanjiIds: []
  };

  recordKanaEncounter(exercise, {
    storage,
    now: "2026-08-10T10:00:00.000Z"
  });
  recordKanaAttempt(exercise, "kohii", [
    { kana: "コ", outcome: "good" },
    { kana: "ー", outcome: "again" },
    { kana: "ヒ", outcome: "good" }
  ], {
    storage,
    now: "2026-08-10T10:01:00.000Z"
  });

  const stats = readLearningStats({ storage });

  assert.equal(stats.kana["コ"].encounterCount, 1);
  assert.equal(stats.kana["ー"].encounterCount, 1);
  assert.equal(stats.vocabulary.coffee.encounterCount, 1);
  assert.deepEqual(stats.exerciseHistory[0], {
    section: "katakana",
    exerciseId: exercise.id,
    text: "コーヒー",
    solution: "ko-hi-",
    writtenForm: "コーヒー",
    meaning: "coffee",
    direction: "kana-to-romaji",
    answer: "kohii",
    submittedAt: "2026-08-10T10:01:00.000Z",
    kanaRatings: [
      { kana: "コ", outcome: "good" },
      { kana: "ー", outcome: "again" },
      { kana: "ヒ", outcome: "good" }
    ]
  });
});

test("single Katakana reviews record one kana without a vocabulary encounter", () => {
  const storage = new MemoryStorage();
  const exercise = {
    id: "katakana-single-ティ-kana-to-romaji",
    section: "katakana",
    exerciseKind: "single-kana",
    direction: "kana-to-romaji",
    writtenForm: "ティ",
    katakana: "ティ",
    romaji: "thi",
    meaning: "",
    kanaParts: ["ティ"],
    reviewKanaParts: ["ティ"],
    kanjiIds: []
  };

  recordKanaEncounter(exercise, {
    storage,
    now: "2026-08-10T10:30:00.000Z"
  });
  recordKanaAttempt(exercise, "ti", [
    { kana: "ティ", outcome: "good" }
  ], {
    storage,
    now: "2026-08-10T10:31:00.000Z"
  });

  const stats = readLearningStats({ storage });

  assert.equal(stats.kana["ティ"].encounterCount, 1);
  assert.deepEqual(stats.vocabulary, {});
  assert.deepEqual(stats.exerciseHistory[0], {
    section: "katakana",
    exerciseId: exercise.id,
    text: "ティ",
    solution: "thi",
    writtenForm: "ティ",
    meaning: "",
    direction: "kana-to-romaji",
    answer: "ti",
    submittedAt: "2026-08-10T10:31:00.000Z",
    kanaRatings: [{ kana: "ティ", outcome: "good" }]
  });
});

test("Hiragana-to-Katakana pairs count both scripts in encounters and history", () => {
  const storage = new MemoryStorage();
  const exercise = {
    id: "katakana-coffee-hiragana-to-katakana",
    section: "katakana",
    direction: "hiragana-to-katakana",
    vocabularyId: "coffee",
    writtenForm: "コーヒー",
    katakana: "コーヒー",
    hiragana: "こーひー",
    romaji: "ko-hi-",
    meaning: "coffee",
    kanaParts: ["コ", "ー", "ヒ", "ー"],
    reviewKanaParts: ["こ", "コ", "ー", "ー", "ひ", "ヒ", "ー", "ー"],
    kanjiIds: []
  };

  recordKanaEncounter(exercise, {
    storage,
    now: "2026-08-10T11:00:00.000Z"
  });
  recordKanaAttempt(exercise, "コーヒ", [
    { kana: "こ", outcome: "good" },
    { kana: "コ", outcome: "good" },
    { kana: "ー", outcome: "good" },
    { kana: "ひ", outcome: "good" },
    { kana: "ヒ", outcome: "good" },
    { kana: "ー", outcome: "again" }
  ], {
    storage,
    now: "2026-08-10T11:01:00.000Z"
  });

  const stats = readLearningStats({ storage });

  for (const kana of ["こ", "コ", "ー", "ひ", "ヒ"]) {
    assert.equal(stats.kana[kana].encounterCount, 1, kana);
  }
  assert.equal(stats.vocabulary.coffee.encounterCount, 1);
  assert.deepEqual(stats.exerciseHistory[0], {
    section: "katakana",
    exerciseId: exercise.id,
    text: "こーひー",
    solution: "コーヒー",
    writtenForm: "コーヒー",
    meaning: "coffee",
    direction: "hiragana-to-katakana",
    answer: "コーヒ",
    submittedAt: "2026-08-10T11:01:00.000Z",
    kanaRatings: [
      { kana: "こ", outcome: "good" },
      { kana: "コ", outcome: "good" },
      { kana: "ー", outcome: "good" },
      { kana: "ひ", outcome: "good" },
      { kana: "ヒ", outcome: "good" },
      { kana: "ー", outcome: "again" }
    ]
  });
});

test("invalid data and unavailable storage do not break lessons", () => {
  const storage = new MemoryStorage();
  storage.setItem(storageKey, "not json");

  const recovered = recordExerciseEncounter(
    {
      grammarPointIds: ["wa-topic"],
      vocabularyIds: ["vocab-one"],
      kanjiIds: ["kanji-one"]
    },
    { storage, now: "2026-08-08T10:00:00.000Z" }
  );
  const unavailableStorage = {
    getItem() {
      throw new Error("disabled");
    },
    setItem() {
      throw new Error("disabled");
    }
  };

  assert.equal(recovered.grammarPoints["wa-topic"].encounterCount, 1);
  assert.doesNotThrow(() => recordExerciseEncounter(
    {
      grammarPointIds: ["wa-topic"],
      vocabularyIds: ["vocab-one"],
      kanjiIds: ["kanji-one"]
    },
    { storage: unavailableStorage }
  ));
});

test("lessons without exercise metadata are not recorded", () => {
  const storage = new MemoryStorage();

  recordExerciseEncounter(
    { id: "introduction", vocabularyIds: ["vocab-one"] },
    { storage, now: "2026-08-08T10:00:00.000Z" }
  );

  assert.equal(storage.getItem(storageKey), null);
  assert.deepEqual(readLearningStats({ storage }), {
    version: 1,
    updatedAt: null,
    grammarPoints: {},
    kana: {},
    vocabulary: {},
    kanji: {},
    exerciseHistory: []
  });
});
