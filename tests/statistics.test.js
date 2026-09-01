import assert from "node:assert/strict";
import test from "node:test";

await import("../statistics.js");

const {
  createStatisticsModel,
  createProgressBreakdown,
  getKnowledgeLevel
} = globalThis.JlptN5Statistics;

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

function createCard({
  due,
  state = 2,
  stability = 1,
  lastReview = "2026-08-08T12:00:00.000Z"
}) {
  return {
    due,
    stability,
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

test("progress separates every knowledge level, encountered, and new items", () => {
  assert.deepEqual(createProgressBreakdown([
    { card: {}, knowledge: { key: "mastered" }, encounterCount: 3 },
    { card: {}, knowledge: { key: "mature" }, encounterCount: 2 },
    { card: {}, knowledge: { key: "almostMature" }, encounterCount: 1 },
    { card: {}, knowledge: { key: "learning" }, encounterCount: 1 },
    { status: { key: "new" }, encounterCount: 1 },
    { status: { key: "new" }, encounterCount: 0 }
  ], 7), {
    mastered: 1,
    mature: 1,
    almostMature: 1,
    learningDue: 1,
    encountered: 1,
    new: 2
  });
});

test("knowledge levels use review state, stability, and current retrievability", () => {
  const now = new Date("2026-08-09T12:00:00.000Z");
  const retrieve = (_card, { now: receivedNow }) => {
    assert.equal(receivedNow, now);
    return 0.82;
  };

  assert.equal(
    getKnowledgeLevel(createCard({
      due: "2026-11-09T12:00:00.000Z",
      stability: 120
    }), now, retrieve).key,
    "mastered"
  );
  assert.equal(
    getKnowledgeLevel(createCard({
      due: "2026-10-09T12:00:00.000Z",
      stability: 45
    }), now, retrieve).key,
    "mature"
  );
  assert.equal(
    getKnowledgeLevel(createCard({
      due: "2026-09-09T12:00:00.000Z",
      stability: 25
    }), now, retrieve).key,
    "almostMature"
  );
  assert.equal(
    getKnowledgeLevel(createCard({
      due: "2026-11-09T12:00:00.000Z",
      stability: 120
    }), now, () => 0.79).key,
    "mature"
  );
  assert.equal(
    getKnowledgeLevel(createCard({
      due: "2026-11-09T12:00:00.000Z",
      stability: 120,
      state: 3
    }), now, retrieve).key,
    "learning"
  );
});

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
  assert.deepEqual(model.overview.knowledge, {
    mastered: 0,
    mature: 0,
    almostMature: 0,
    learning: 3,
    new: 5,
    reviewed: 3,
    total: 8,
    masteredByKind: { grammar: 0, kana: 0, vocabulary: 0, kanji: 0 }
  });
  assert.deepEqual(model.overview.recentResults, { good: 2, again: 2 });
  assert.equal(model.overview.recentResultCount, 4);
  assert.deepEqual(model.overview.exerciseCounts, {
    grammar: 3,
    hiragana: 0,
    katakana: 0,
    kanji: 0,
    vocabulary: 0,
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

test("global mastery counts shared kana once across script views", () => {
  const model = createStatisticsModel({
    grammarPoints: [{ id: "grammar", pattern: "〜です" }],
    hiragana: [{ id: "ー", kana: "ー", romaji: "long vowel" }],
    katakana: [{ id: "ー", kana: "ー", romaji: "long vowel" }],
    vocabulary: [{ id: "coffee", term: "コーヒー" }],
    now: "2026-08-09T12:00:00.000Z",
    getRetrievability: () => 0.85,
    srsData: {
      cards: {
        grammar: createCard({
          due: "2026-11-09T12:00:00.000Z",
          stability: 100
        })
      },
      kanaCards: {
        "ー": createCard({
          due: "2026-11-09T12:00:00.000Z",
          stability: 100
        })
      },
      vocabularyCards: {
        coffee: createCard({
          due: "2026-10-09T12:00:00.000Z",
          stability: 40
        })
      }
    }
  });

  assert.deepEqual(model.overview.knowledge, {
    mastered: 2,
    mature: 1,
    almostMature: 0,
    learning: 0,
    new: 0,
    reviewed: 3,
    total: 3,
    masteredByKind: { grammar: 1, kana: 1, vocabulary: 0, kanji: 0 }
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

test("inactive kanji remain visible without diluting global knowledge", () => {
  const model = createStatisticsModel({
    kanji,
    activeKanjiIds: ["day"]
  });

  assert.equal(model.kanji.totalCount, 2);
  assert.equal(model.kanji.activeCount, 1);
  assert.equal(model.kanji.progressEntries.length, 2);
  assert.equal(model.overview.knowledge.total, 1);
  assert.equal(model.overview.knowledge.new, 1);
  assert.equal(model.overview.knowledge.masteredByKind.kanji, 0);
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

test("global exercise counts include kana and vocabulary sections", () => {
  const model = createStatisticsModel({
    learningStats: {
      exerciseHistory: [
        { submittedAt: "2026-08-07T12:00:00.000Z" },
        { section: "grammar", submittedAt: "2026-08-08T12:00:00.000Z" },
        { section: "hiragana", submittedAt: "2026-08-09T10:00:00.000Z" },
        { section: "hiragana", submittedAt: "2026-08-09T11:00:00.000Z" },
        { section: "katakana", submittedAt: "2026-08-09T12:00:00.000Z" },
        { section: "kanji", submittedAt: "2026-08-09T12:15:00.000Z" },
        { section: "vocabulary", submittedAt: "2026-08-09T12:30:00.000Z" },
        { section: "unknown", submittedAt: "2026-08-09T13:00:00.000Z" },
        { section: "katakana", submittedAt: "not-a-date" }
      ]
    }
  });

  assert.deepEqual(model.overview.exerciseCounts, {
    grammar: 2,
    hiragana: 2,
    katakana: 1,
    kanji: 1,
    vocabulary: 1,
    kana: 3,
    total: 7
  });
});

test("global result activity includes grammar, kana, vocabulary, and kanji ratings", () => {
  const model = createStatisticsModel({
    now: "2026-08-09T12:00:00.000Z",
    learningStats: {
      exerciseHistory: [
        {
          submittedAt: "2026-08-07T12:00:00.000Z",
          grammarRatings: [
            { grammarPointId: "due-point", outcome: "good" },
            { grammarPointId: "failed-point", outcome: "again" }
          ]
        },
        {
          section: "hiragana",
          submittedAt: "2026-08-08T12:00:00.000Z",
          kanaRatings: [
            { kana: "い", outcome: "good" },
            { kana: "みゅ", outcome: "good" }
          ]
        },
        {
          section: "katakana",
          submittedAt: "2026-08-09T12:00:00.000Z",
          kanaRatings: [
            { kana: "コ", outcome: "good" },
            { kana: "ー", outcome: "again" }
          ]
        },
        {
          section: "kanji",
          submittedAt: "2026-08-09T12:30:00.000Z",
          kanjiRatings: [
            { kanjiId: "day", outcome: "good" },
            { kanjiId: "month", outcome: "again" }
          ]
        }
      ]
    }
  });

  assert.deepEqual(model.overview.recentResults, { good: 5, again: 3 });
  assert.equal(model.overview.recentResultCount, 8);
  assert.deepEqual(
    model.overview.reviewDays.slice(-3).map(({ dayKey, good, again }) => ({
      dayKey,
      good,
      again
    })),
    [
      { dayKey: "2026-08-07", good: 1, again: 1 },
      { dayKey: "2026-08-08", good: 2, again: 0 },
      { dayKey: "2026-08-09", good: 2, again: 2 }
    ]
  );
});

test("vocabulary statistics combine SRS, encounters, and graded outcomes", () => {
  const model = createStatisticsModel({
    vocabulary: [
      { id: "coffee", term: "コーヒー", reading: "こーひー", meaning: "coffee" },
      { id: "tea", term: "お茶", reading: "おちゃ", meaning: "tea" }
    ],
    now: "2026-08-09T12:00:00.000Z",
    learningStats: {
      vocabulary: {
        coffee: { encounterCount: 2 },
        tea: { encounterCount: 1 }
      },
      exerciseHistory: [
        {
          section: "vocabulary",
          vocabularyId: "coffee",
          submittedAt: "2026-08-08T12:00:00.000Z",
          outcome: "good"
        },
        {
          section: "vocabulary",
          vocabularyId: "tea",
          submittedAt: "2026-08-09T11:00:00.000Z",
          outcome: "again"
        }
      ]
    },
    srsData: {
      vocabularyCards: {
        coffee: createCard({ due: "2026-08-12T12:00:00.000Z" }),
        tea: createCard({ due: "2026-08-09T11:30:00.000Z" })
      }
    }
  });

  assert.deepEqual(
    model.vocabulary.progressEntries.map(({ id, status }) => [id, status.key]),
    [["tea", "due"], ["coffee", "review"]]
  );
  assert.equal(model.vocabulary.progressEntries[0].encounterCount, 1);
  assert.equal(model.vocabulary.progressEntries[0].results.again, 1);
  assert.equal(model.vocabulary.progressEntries[1].results.good, 1);
  assert.deepEqual(model.overview.exerciseCounts, {
    grammar: 0,
    hiragana: 0,
    katakana: 0,
    kanji: 0,
    vocabulary: 2,
    kana: 0,
    total: 2
  });
  assert.deepEqual(model.overview.recentResults, { good: 1, again: 1 });
});

test("kanji statistics combine SRS, encounters, and mechanical outcomes", () => {
  const model = createStatisticsModel({
    kanji: [
      {
        id: "day",
        character: "日",
        stage: "B6",
        meaning: "day",
        onReadings: ["ニチ"],
        kunReadings: ["ひ"]
      },
      {
        id: "month",
        character: "月",
        stage: "B6",
        meaning: "month",
        onReadings: ["ゲツ"],
        kunReadings: ["つき"]
      }
    ],
    now: "2026-08-09T12:00:00.000Z",
    learningStats: {
      kanji: {
        day: { encounterCount: 3 },
        month: { encounterCount: 1 }
      },
      exerciseHistory: [
        {
          section: "kanji",
          submittedAt: "2026-08-08T12:00:00.000Z",
          kanjiRatings: [{ kanjiId: "day", outcome: "good" }]
        },
        {
          section: "kanji",
          submittedAt: "2026-08-09T11:00:00.000Z",
          kanjiRatings: [{ kanjiId: "month", outcome: "again" }]
        }
      ]
    },
    srsData: {
      kanjiCards: {
        day: createCard({ due: "2026-08-12T12:00:00.000Z" }),
        month: createCard({ due: "2026-08-09T11:30:00.000Z" })
      }
    }
  });

  assert.deepEqual(
    model.kanji.progressEntries.map(({ id, status }) => [id, status.key]),
    [["month", "due"], ["day", "review"]]
  );
  assert.equal(model.kanji.progressEntries[0].encounterCount, 1);
  assert.equal(model.kanji.progressEntries[0].results.again, 1);
  assert.equal(model.kanji.progressEntries[1].results.good, 1);
  assert.deepEqual(model.overview.exerciseCounts, {
    grammar: 0,
    hiragana: 0,
    katakana: 0,
    kanji: 2,
    vocabulary: 0,
    kana: 0,
    total: 2
  });
  assert.deepEqual(model.overview.recentResults, { good: 1, again: 1 });
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

test("paired-script outcomes appear in both kana statistics views", () => {
  const hiragana = [
    { id: "こ", kana: "こ", romaji: "ko" },
    { id: "ー", kana: "ー", romaji: "long vowel" },
    { id: "ひ", kana: "ひ", romaji: "hi" }
  ];
  const pairedKatakana = [
    ...katakana,
    { id: "ヒ", kana: "ヒ", romaji: "hi" }
  ];
  const model = createStatisticsModel({
    hiragana,
    katakana: pairedKatakana,
    now: "2026-08-09T12:00:00.000Z",
    learningStats: {
      kana: {
        "こ": { encounterCount: 1 },
        "コ": { encounterCount: 1 },
        "ー": { encounterCount: 1 },
        "ひ": { encounterCount: 1 },
        "ヒ": { encounterCount: 1 }
      },
      exerciseHistory: [{
        section: "katakana",
        direction: "hiragana-to-katakana",
        submittedAt: "2026-08-09T11:00:00.000Z",
        kanaRatings: [
          { kana: "こ", outcome: "good" },
          { kana: "コ", outcome: "good" },
          { kana: "ー", outcome: "good" },
          { kana: "ひ", outcome: "good" },
          { kana: "ヒ", outcome: "good" },
          { kana: "ー", outcome: "again" }
        ]
      }]
    },
    srsData: {
      kanaCards: {
        "こ": createCard({ due: "2026-08-12T12:00:00.000Z" }),
        "コ": createCard({ due: "2026-08-12T12:00:00.000Z" }),
        "ー": createCard({ due: "2026-08-09T11:30:00.000Z" }),
        "ひ": createCard({ due: "2026-08-12T12:00:00.000Z" }),
        "ヒ": createCard({ due: "2026-08-12T12:00:00.000Z" })
      }
    }
  });

  assert.equal(model.hiragana.find(({ id }) => id === "こ").results.good, 1);
  assert.equal(model.katakana.find(({ id }) => id === "コ").results.good, 1);
  assert.equal(model.hiragana.find(({ id }) => id === "ひ").results.good, 1);
  assert.equal(model.katakana.find(({ id }) => id === "ヒ").results.good, 1);
  assert.equal(model.hiragana.find(({ id }) => id === "ー").results.again, 1);
  assert.equal(model.katakana.find(({ id }) => id === "ー").results.again, 1);
  assert.equal(model.hiragana.find(({ id }) => id === "ー").results.good, 1);
  assert.equal(model.katakana.find(({ id }) => id === "ー").results.good, 1);
  assert.deepEqual(model.overview.recentResults, { good: 5, again: 1 });
});

test("invalid current dates are rejected", () => {
  assert.throws(
    () => createStatisticsModel({ now: "not-a-date" }),
    /valid current date/
  );
});
