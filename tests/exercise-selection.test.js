import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");
const selectionCode = await readFile(join(rootDirectory, "exercise-selection.js"), "utf8");

function loadSelectionApi() {
  const context = {};

  context.globalThis = context;
  vm.runInNewContext(selectionCode, context);
  return context.JlptN5ExerciseSelection;
}

const exercises = [
  { id: "recognition-a", grammarPointIds: ["point-a", "point-b"] },
  { id: "recognition-b", grammarPointIds: ["point-a", "point-b"] },
  {
    id: "production-a",
    type: "production",
    grammarPointIds: ["point-a", "point-b"]
  }
];

function completedAttempt(exerciseId, grammarPointIds = ["point-a", "point-b"]) {
  return {
    exerciseId,
    grammarRatings: grammarPointIds.map((grammarPointId) => ({
      grammarPointId,
      outcome: "good"
    }))
  };
}

function select(exerciseHistory, overrides = {}) {
  return loadSelectionApi().selectExercisePool({
    exercises,
    candidates: exercises,
    exerciseHistory,
    ...overrides
  }).map(({ id }) => id);
}

test("ordinary exercise positions use recognition exercises", () => {
  assert.deepEqual(select([]), ["recognition-a", "recognition-b"]);
  assert.deepEqual(select([
    completedAttempt("recognition-a"),
    completedAttempt("recognition-b")
  ]), ["recognition-a", "recognition-b"]);
});

test("recognition exercises introduce at most one new grammar point when possible", () => {
  const mixedExercises = [
    { id: "known", grammarPointIds: ["known-a", "known-b"] },
    { id: "one-new", grammarPointIds: ["known-a", "new-a"] },
    { id: "two-new", grammarPointIds: ["new-b", "new-c"] }
  ];
  const history = [{
    exerciseId: "known",
    grammarRatings: [
      { grammarPointId: "known-a", outcome: "good" },
      { grammarPointId: "known-b", outcome: "again" }
    ]
  }];

  assert.deepEqual(select(history, {
    exercises: mixedExercises,
    candidates: mixedExercises
  }), ["known", "one-new"]);
});

test("recognition selection falls back to the fewest new points for a fresh learner", () => {
  const freshExercises = [
    { id: "two-new", grammarPointIds: ["new-a", "new-b"] },
    { id: "three-new", grammarPointIds: ["new-c", "new-d", "new-e"] }
  ];

  assert.deepEqual(select([], {
    exercises: freshExercises,
    candidates: freshExercises
  }), ["two-new"]);
});

test("every fifth completed exercise prefers an eligible production exercise", () => {
  const history = [
    completedAttempt("recognition-a"),
    completedAttempt("recognition-b"),
    completedAttempt("recognition-a"),
    completedAttempt("recognition-b")
  ];

  assert.deepEqual(select(history), ["production-a"]);
});

test("production cadence considers every ready grammar point before SRS targeting", () => {
  const mixedExercises = [
    ...exercises,
    { id: "recognition-unready", grammarPointIds: ["point-unready"] }
  ];
  const history = [
    completedAttempt("recognition-a"),
    completedAttempt("recognition-b"),
    completedAttempt("recognition-a"),
    completedAttempt("recognition-b")
  ];

  assert.deepEqual(select(history, {
    exercises: mixedExercises,
    candidates: mixedExercises
  }), ["production-a"]);
});

test("production falls back when any assessed grammar point lacks recognition", () => {
  const history = [
    completedAttempt("recognition-a"),
    completedAttempt("recognition-b", ["point-a"]),
    completedAttempt("recognition-a", ["point-a"]),
    completedAttempt("recognition-b", ["point-a"])
  ];

  assert.deepEqual(select(history), ["recognition-a", "recognition-b"]);
});

test("repeating one recognition sentence does not satisfy the threshold", () => {
  const repeatedAttempt = completedAttempt("recognition-a");

  assert.deepEqual(select([
    repeatedAttempt,
    repeatedAttempt,
    repeatedAttempt,
    repeatedAttempt
  ]), ["recognition-a", "recognition-b"]);
});

test("unfinished attempts do not affect cadence or readiness", () => {
  const unfinishedAttempt = { exerciseId: "recognition-a", grammarRatings: [] };

  assert.deepEqual(select([
    completedAttempt("recognition-a"),
    completedAttempt("recognition-b"),
    completedAttempt("recognition-a"),
    unfinishedAttempt
  ]), ["recognition-a", "recognition-b"]);
});

test("the forced production mode bypasses cadence and readiness", () => {
  assert.deepEqual(select([], { forcedExerciseType: "production" }), ["production-a"]);
});
