import assert from "node:assert/strict";
import test from "node:test";

await import("../statistics.js");

const { createStatisticsModel } = globalThis.JlptN5Statistics;

const grammarPoints = [
  { id: "due-point", pattern: "〜です" },
  { id: "failed-point", pattern: "〜ます" },
  { id: "review-point", pattern: "〜から" },
  { id: "new-point", pattern: "〜まで" }
];
const vocabulary = [
  { id: "coffee", term: "コーヒー" },
  { id: "tea", term: "お茶" }
];
const kanji = [
  { id: "day", character: "日" },
  { id: "month", character: "月" }
];
const kana = [
  { id: "い", kana: "い", romaji: "i" },
  { id: "みゅ", kana: "みゅ", romaji: "myu" }
];
const katakana = [
  { id: "コ", kana: "コ", romaji: "ko" },
  { id: "ー", kana: "ー", romaji: "long vowel" }
];

function createCard({ due, state = 2, lastReview = "2026-08-08T12:00:00.000Z" }) {
  return {
    due,
    stability: 1,
    difficulty: 5,
    elapsed_days: 1,
    scheduled_days: 1,
    reps: 1,
    lapses: 0,
    learning_steps: 0,
    state,
    last_review: lastReview
  };
}

test("statistics combine SRS scheduling with recent grammar outcomes", () => {
  const model = createStatisticsModel({
    grammarPoints,
    vocabulary,
    kanji,
    now: "2026-08-09T12:00:00.000Z",
    learningStats: {
      grammarPoints: {
        "due-point": { encounterCount: 3 },
        "failed-point": { encounterCount: 2 }
      },
      vocabulary: {},
      kanji: {},
      exerciseHistory: [
        {
          submittedAt: "2026-08-07T12:00:00.000Z",
          grammarRatings: [{ grammarPointId: "due-point", outcome: "good" }]
        },
        {
          submittedAt: "2026-08-08T12:00:00.000Z",
          grammarRatings: [{ grammarPointId: "failed-point", outcome: "again" }]
        },
        {
          submittedAt: "2026-08-09T12:00:00.000Z",
          grammarRatings: [
            { grammarPointId: "due-point", outcome: "again" },
            { grammarPointId: "review-point", outcome: "good" }
          ]
        }
      ]
    },
    srsData: {
      cards: {
        "due-point": createCard({ due: "2026-08-09T11:00:00.000Z" }),
        "failed-point": createCard({
          due: "2026-08-10T12:00:00.000Z",
          state: 1
        }),
        "review-point": createCard({ due: "2026-08-12T12:00:00.000Z" })
      }
    }
  });

  assert.equal(model.overview.dueCount, 1);
  assert.equal(model.overview.reviewedCount, 3);
  assert.equal(model.overview.totalGrammarCount, 4);
  assert.deepEqual(model.overview.recentResults, { good: 2, again: 2 });
  assert.equal(model.overview.recentResultCount, 4);
  assert.deepEqual(model.overview.exerciseCounts, {
    grammar: 3,
    hiragana: 0,
    katakana: 0,
    kana: 0,
    total: 3
  });
  assert.equal(model.overview.studyStreak, 3);
  assert.equal(model.overview.nextDue, "2026-08-10T12:00:00.000Z");
  assert.deepEqual(
    model.overview.reviewDays.slice(-3).map(({ dayKey, good, again }) => ({
      dayKey,
      good,
      again
    })),
    [
      { dayKey: "2026-08-07", good: 1, again: 0 },
      { dayKey: "2026-08-08", good: 0, again: 1 },
      { dayKey: "2026-08-09", good: 1, again: 1 }
    ]
  );
  assert.deepEqual(
    model.overview.needsAttention.map(({ id }) => id),
    ["due-point", "failed-point"]
  );

  assert.deepEqual(
    model.grammar.map(({ id, status }) => [id, status.key]),
    [
      ["due-point", "due"],
      ["failed-point", "learning"],
      ["review-point", "review"],
      ["new-point", "new"]
    ]
  );
  assert.deepEqual(model.grammar[0].results, {
    good: 1,
    again: 1,
    lastOutcome: "again",
    lastReviewedAt: "2026-08-09T12:00:00.000Z"
  });
});

test("exposure statistics report curriculum coverage and encounter dates", () => {
  const model = createStatisticsModel({
    vocabulary,
    kanji,
    learningStats: {
      exerciseHistory: [],
      grammarPoints: {},
      vocabulary: {
        coffee: {
          encounterCount: 3,
          firstEncounteredAt: "2026-08-07T12:00:00.000Z",
          lastEncounteredAt: "2026-08-09T12:00:00.000Z"
        }
      },
      kanji: {
        day: {
          encounterCount: 2,
          firstEncounteredAt: "2026-08-08T12:00:00.000Z",
          lastEncounteredAt: "2026-08-09T12:00:00.000Z"
        }
      }
    }
  });

  assert.equal(model.vocabulary.totalCount, 2);
  assert.equal(model.vocabulary.encounteredCount, 1);
  assert.equal(model.vocabulary.totalEncounters, 3);
  assert.equal(model.vocabulary.entries[0].metadata.term, "コーヒー");
  assert.equal(model.kanji.totalCount, 2);
  assert.equal(model.kanji.encounteredCount, 1);
  assert.equal(model.kanji.totalEncounters, 2);
  assert.equal(model.kanji.entries[0].metadata.character, "日");
});

test("empty statistics remain useful before the first exercise", () => {
  const model = createStatisticsModel({ grammarPoints, kana, vocabulary, kanji });

  assert.equal(model.overview.dueCount, 0);
  assert.equal(model.overview.reviewedCount, 0);
  assert.equal(model.overview.exerciseCounts.total, 0);
  assert.equal(model.overview.studyStreak, 0);
  assert.equal(model.overview.nextDue, undefined);
  assert.equal(model.overview.reviewDays.length, 14);
  assert.equal(model.overview.reviewDays.every(({ good, again }) => good + again === 0), true);
  assert.equal(model.grammar.every(({ status }) => status.key === "new"), true);
  assert.equal(model.hiragana.every(({ status }) => status.key === "new"), true);
  assert.equal(model.vocabulary.encounteredCount, 0);
  assert.equal(model.kanji.encounteredCount, 0);
});

test("global exercise counts include both kana sections", () => {
  const model = createStatisticsModel({
    learningStats: {
      exerciseHistory: [
        { submittedAt: "2026-08-07T12:00:00.000Z" },
        { section: "grammar", submittedAt: "2026-08-08T12:00:00.000Z" },
        { section: "hiragana", submittedAt: "2026-08-09T10:00:00.000Z" },
        { section: "hiragana", submittedAt: "2026-08-09T11:00:00.000Z" },
        { section: "katakana", submittedAt: "2026-08-09T12:00:00.000Z" },
        { section: "unknown", submittedAt: "2026-08-09T13:00:00.000Z" },
        { section: "katakana", submittedAt: "not-a-date" }
      ]
    }
  });

  assert.deepEqual(model.overview.exerciseCounts, {
    grammar: 2,
    hiragana: 2,
    katakana: 1,
    kana: 3,
    total: 5
  });
});

test("hiragana statistics combine kana cards, encounters, and mechanical outcomes", () => {
  const model = createStatisticsModel({
    kana,
    now: "2026-08-09T12:00:00.000Z",
    learningStats: {
      kana: { "みゅ": { encounterCount: 2 } },
      exerciseHistory: [{
        section: "hiragana",
        submittedAt: "2026-08-09T11:00:00.000Z",
        kanaRatings: [
          { kana: "みゅ", outcome: "again" },
          { kana: "い", outcome: "good" }
        ]
      }]
    },
    srsData: {
      kanaCards: {
        "みゅ": createCard({ due: "2026-08-09T11:30:00.000Z" }),
        "い": createCard({ due: "2026-08-12T12:00:00.000Z" })
      }
    }
  });

  assert.deepEqual(
    model.hiragana.map(({ id, status }) => [id, status.key]),
    [["みゅ", "due"], ["い", "review"]]
  );
  assert.equal(model.hiragana[0].encounterCount, 2);
  assert.deepEqual(model.hiragana[0].results, {
    good: 0,
    again: 1,
    lastOutcome: "again",
    lastReviewedAt: "2026-08-09T11:00:00.000Z"
  });
});

test("Katakana statistics use their own inventory in the shared kana store", () => {
  const model = createStatisticsModel({
    hiragana: kana,
    katakana,
    now: "2026-08-09T12:00:00.000Z",
    learningStats: {
      kana: {
        "い": { encounterCount: 1 },
        "ー": { encounterCount: 3 }
      },
      exerciseHistory: [{
        section: "katakana",
        submittedAt: "2026-08-09T11:00:00.000Z",
        kanaRatings: [
          { kana: "ー", outcome: "again" },
          { kana: "コ", outcome: "good" }
        ]
      }]
    },
    srsData: {
      kanaCards: {
        "ー": createCard({ due: "2026-08-09T11:30:00.000Z" }),
        "コ": createCard({ due: "2026-08-12T12:00:00.000Z" })
      }
    }
  });

  assert.equal(model.hiragana.length, 2);
  assert.deepEqual(
    model.katakana.map(({ id, status }) => [id, status.key]),
    [["ー", "due"], ["コ", "review"]]
  );
  assert.equal(model.katakana[0].encounterCount, 3);
  assert.equal(model.katakana[0].results.lastOutcome, "again");
});

test("invalid current dates are rejected", () => {
  assert.throws(
    () => createStatisticsModel({ now: "not-a-date" }),
    /valid current date/
  );
});
