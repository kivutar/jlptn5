import assert from "node:assert/strict";
import test from "node:test";
import "../learning-stats.js";

const { readLearningStats, recordExerciseEncounter, storageKey } = globalThis.JlptN5Stats;

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
    vocabularyIds: ["vocab-one", "vocab-two", "vocab-one"]
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
});

test("new items receive their own first encounter timestamp", () => {
  const storage = new MemoryStorage();

  recordExerciseEncounter(
    { grammarPointIds: ["wa-topic"], vocabularyIds: ["vocab-one"] },
    { storage, now: "2026-08-08T10:00:00.000Z" }
  );
  recordExerciseEncounter(
    { grammarPointIds: ["ga-subject"], vocabularyIds: ["vocab-two"] },
    { storage, now: "2026-08-10T12:00:00.000Z" }
  );

  const stats = readLearningStats({ storage });

  assert.equal(stats.grammarPoints["wa-topic"].lastEncounteredAt, "2026-08-08T10:00:00.000Z");
  assert.equal(stats.grammarPoints["ga-subject"].firstEncounteredAt, "2026-08-10T12:00:00.000Z");
  assert.equal(stats.vocabulary["vocab-two"].firstEncounteredAt, "2026-08-10T12:00:00.000Z");
});

test("invalid data and unavailable storage do not break lessons", () => {
  const storage = new MemoryStorage();
  storage.setItem(storageKey, "not json");

  const recovered = recordExerciseEncounter(
    { grammarPointIds: ["wa-topic"], vocabularyIds: ["vocab-one"] },
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
    { grammarPointIds: ["wa-topic"], vocabularyIds: ["vocab-one"] },
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
    vocabulary: {}
  });
});
