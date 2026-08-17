import assert from "node:assert/strict";
import test from "node:test";
import * as FSRS from "ts-fsrs";

globalThis.FSRS = FSRS;
await import("../srs.js");

const {
  pickNextGrammarPoint,
  pickNextKana,
  pickNextVocabulary,
  readSrsData,
  recordReviews,
  recordKanaReviews,
  recordVocabularyReviews,
  storageKey
} = globalThis.JlptN5Srs;

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

test("grammar reviews persist FSRS cards with serializable dates", () => {
  const storage = new MemoryStorage();
  const reviewedAt = "2026-08-09T10:00:00.000Z";
  const data = recordReviews([
    { grammarPointId: "te-kara", outcome: "good" },
    { grammarPointId: "kara-reason", outcome: "again" }
  ], { storage, now: reviewedAt });

  assert.equal(data.updatedAt, reviewedAt);
  assert.equal(data.cards["te-kara"].reps, 1);
  assert.equal(data.cards["kara-reason"].reps, 1);
  assert.equal(data.cards["te-kara"].last_review, reviewedAt);
  assert.ok(Date.parse(data.cards["te-kara"].due) > Date.parse(reviewedAt));
  assert.ok(
    Date.parse(data.cards["kara-reason"].due) < Date.parse(data.cards["te-kara"].due)
  );
  assert.deepEqual(readSrsData({ storage }), data);
});

test("due reviews take priority, followed by unseen and upcoming points", () => {
  const storage = new MemoryStorage();
  const reviewedAt = "2026-08-09T10:00:00.000Z";

  recordReviews([
    { grammarPointId: "good-point", outcome: "good" },
    { grammarPointId: "again-point", outcome: "again" }
  ], { storage, now: reviewedAt });

  assert.equal(
    pickNextGrammarPoint(["good-point", "again-point", "new-point"], {
      storage,
      now: reviewedAt,
      random: () => 0
    }),
    "new-point"
  );
  assert.equal(
    pickNextGrammarPoint(["good-point", "again-point"], {
      storage,
      now: reviewedAt,
      random: () => 0
    }),
    "again-point"
  );
  assert.equal(
    pickNextGrammarPoint(["good-point", "again-point", "new-point"], {
      storage,
      now: "2026-08-09T10:02:00.000Z",
      random: () => 0
    }),
    "again-point"
  );
});

test("new grammar ties are randomized without duplicating ids", () => {
  const storage = new MemoryStorage();

  assert.equal(
    pickNextGrammarPoint(["first", "first", "second"], {
      storage,
      random: () => 0.99
    }),
    "second"
  );
});

test("hiragana cards are scheduled independently from grammar cards", () => {
  const storage = new MemoryStorage();
  const reviewedAt = "2026-08-09T10:00:00.000Z";

  recordReviews([{ grammarPointId: "wa-topic", outcome: "good" }], {
    storage,
    now: reviewedAt
  });
  const data = recordKanaReviews([
    { kana: "みゅ", outcome: "good" },
    { kana: "みゅ", outcome: "again" },
    { kana: "と", outcome: "good" }
  ], { storage, now: reviewedAt });

  assert.ok(data.cards["wa-topic"]);
  assert.ok(data.kanaCards["みゅ"]);
  assert.ok(data.kanaCards["と"]);
  assert.ok(Date.parse(data.kanaCards["みゅ"].due) < Date.parse(data.kanaCards["と"].due));
  assert.equal(
    pickNextKana(["みゅ", "と"], {
      storage,
      now: "2026-08-09T10:02:00.000Z",
      random: () => 0
    }),
    "みゅ"
  );
});

test("paired Hiragana and Katakana outcomes schedule both kana cards", () => {
  const storage = new MemoryStorage();
  const reviewedAt = "2026-08-09T12:00:00.000Z";
  const data = recordKanaReviews([
    { kana: "こ", outcome: "good" },
    { kana: "コ", outcome: "good" },
    { kana: "ひ", outcome: "again" },
    { kana: "ヒ", outcome: "again" }
  ], { storage, now: reviewedAt });

  for (const kana of ["こ", "コ", "ひ", "ヒ"]) {
    assert.equal(data.kanaCards[kana].reps, 1, kana);
    assert.equal(data.kanaCards[kana].last_review, reviewedAt, kana);
  }
  assert.ok(Date.parse(data.kanaCards["ひ"].due) < Date.parse(data.kanaCards["こ"].due));
  assert.ok(Date.parse(data.kanaCards["ヒ"].due) < Date.parse(data.kanaCards["コ"].due));
});

test("vocabulary cards are scheduled independently from grammar and kana", () => {
  const storage = new MemoryStorage();
  const reviewedAt = "2026-08-09T13:00:00.000Z";
  const data = recordVocabularyReviews([
    { vocabularyId: "milk", outcome: "good" },
    { vocabularyId: "coffee", outcome: "again" }
  ], { storage, now: reviewedAt });

  assert.ok(data.vocabularyCards.milk);
  assert.ok(data.vocabularyCards.coffee);
  assert.deepEqual(data.cards, {});
  assert.deepEqual(data.kanaCards, {});
  assert.equal(
    pickNextVocabulary(["milk", "coffee"], {
      storage,
      now: "2026-08-09T13:02:00.000Z",
      random: () => 0
    }),
    "coffee"
  );
});

test("invalid or unavailable storage falls back to empty SRS data", () => {
  const storage = new MemoryStorage();
  const unavailableStorage = {
    getItem() {
      throw new Error("disabled");
    },
    setItem() {
      throw new Error("disabled");
    }
  };

  storage.setItem(storageKey, "not json");

  assert.deepEqual(readSrsData({ storage }), {
    version: 1,
    updatedAt: null,
    cards: {},
    kanaCards: {},
    vocabularyCards: {}
  });
  assert.doesNotThrow(() => recordReviews(
    [{ grammarPointId: "te-kara", outcome: "good" }],
    { storage: unavailableStorage, now: "2026-08-09T10:00:00.000Z" }
  ));
});
