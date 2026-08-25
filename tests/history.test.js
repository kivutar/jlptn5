import assert from "node:assert/strict";
import test from "node:test";

await import("../history.js");

const {
  daysPerPage,
  attemptsPerPage,
  getAttemptOutcome,
  createHistoryDays,
  createPage
} = globalThis.JlptN5History;

function getUtcDayKey(date) {
  return date.toISOString().slice(0, 10);
}

function createAttempt(index, day = 24, overrides = {}) {
  return {
    exerciseId: `exercise-${index}`,
    text: `Exercise ${index}`,
    answer: `Answer ${index}`,
    submittedAt: `2026-08-${String(day).padStart(2, "0")}T12:${String(index % 60).padStart(2, "0")}:00.000Z`,
    grammarRatings: [{ grammarPointId: "point", outcome: "good" }],
    ...overrides
  };
}

test("history groups newest attempts by day and summarizes attempt outcomes", () => {
  const days = createHistoryDays([
    createAttempt(1, 23),
    createAttempt(2, 24),
    createAttempt(3, 24, {
      grammarRatings: [{ grammarPointId: "point", outcome: "again" }]
    }),
    createAttempt(4, 24, { grammarRatings: [] })
  ], getUtcDayKey);

  assert.deepEqual(days.map(({ key }) => key), ["2026-08-24", "2026-08-23"]);
  assert.deepEqual(
    days[0].attempts.map(({ exerciseId }) => exerciseId),
    ["exercise-4", "exercise-3", "exercise-2"]
  );
  assert.deepEqual(days[0].results, { good: 1, again: 1 });
});

test("a failed part makes the whole history attempt unsuccessful", () => {
  assert.equal(getAttemptOutcome({ outcome: "good" }), "good");
  assert.equal(getAttemptOutcome({
    kanaRatings: [
      { kana: "ア", outcome: "good" },
      { kana: "イ", outcome: "again" }
    ]
  }), "again");
  assert.equal(getAttemptOutcome({ grammarRatings: [] }), undefined);
});

test("history pages remain bounded and replace older ranges", () => {
  const values = Array.from({ length: 123 }, (_value, index) => index);
  const newest = createPage(values, 0, attemptsPerPage);
  const middle = createPage(values, 1, attemptsPerPage);
  const oldest = createPage(values, 99, attemptsPerPage);

  assert.equal(daysPerPage, 7);
  assert.equal(attemptsPerPage, 50);
  assert.deepEqual(newest.items, values.slice(0, 50));
  assert.deepEqual(middle.items, values.slice(50, 100));
  assert.deepEqual(oldest.items, values.slice(100, 123));
  assert.equal(newest.hasNewer, false);
  assert.equal(newest.hasOlder, true);
  assert.equal(middle.hasNewer, true);
  assert.equal(middle.hasOlder, true);
  assert.equal(oldest.hasNewer, true);
  assert.equal(oldest.hasOlder, false);
  assert.equal(oldest.page, 2);
});

test("history day pages expose seven headers at a time", () => {
  const attempts = Array.from({ length: 9 }, (_value, index) => {
    return createAttempt(index, 24 - index);
  });
  const days = createHistoryDays(attempts, getUtcDayKey);
  const newest = createPage(days, 0, daysPerPage);
  const oldest = createPage(days, 1, daysPerPage);

  assert.equal(newest.items.length, 7);
  assert.equal(oldest.items.length, 2);
  assert.deepEqual(
    newest.items.map(({ key }) => key),
    days.slice(0, 7).map(({ key }) => key)
  );
  assert.equal(newest.hasOlder, true);
  assert.equal(oldest.hasNewer, true);
});

test("empty history pages are stable", () => {
  assert.deepEqual(createPage([], 4, daysPerPage), {
    items: [],
    page: 0,
    pageCount: 0,
    start: 0,
    end: 0,
    total: 0,
    hasNewer: false,
    hasOlder: false
  });
});
