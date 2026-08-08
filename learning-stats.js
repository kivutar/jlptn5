(function initializeLearningStats(global) {
  "use strict";

  const storageKey = "jlpt-n5.learning-stats.v1";
  const schemaVersion = 1;

  function createEmptyStats() {
    return {
      version: schemaVersion,
      updatedAt: null,
      grammarPoints: {},
      vocabulary: {}
    };
  }

  function getStorage(storage) {
    if (storage !== undefined) {
      return storage;
    }

    try {
      return global.localStorage;
    } catch {
      return undefined;
    }
  }

  function normalizeBucket(bucket) {
    const normalized = {};

    if (!bucket || typeof bucket !== "object" || Array.isArray(bucket)) {
      return normalized;
    }

    for (const [id, entry] of Object.entries(bucket)) {
      const encounteredAt = Array.isArray(entry?.encounteredAt)
        ? entry.encounteredAt.filter((timestamp) => typeof timestamp === "string")
        : [];

      if (encounteredAt.length > 0) {
        normalized[id] = {
          encounterCount: encounteredAt.length,
          firstEncounteredAt: encounteredAt[0],
          lastEncounteredAt: encounteredAt[encounteredAt.length - 1],
          encounteredAt
        };
      }
    }

    return normalized;
  }

  function readLearningStats({ storage } = {}) {
    const resolvedStorage = getStorage(storage);

    if (!resolvedStorage) {
      return createEmptyStats();
    }

    try {
      const storedValue = resolvedStorage.getItem(storageKey);

      if (!storedValue) {
        return createEmptyStats();
      }

      const parsed = JSON.parse(storedValue);

      if (!parsed || parsed.version !== schemaVersion) {
        return createEmptyStats();
      }

      return {
        version: schemaVersion,
        updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
        grammarPoints: normalizeBucket(parsed.grammarPoints),
        vocabulary: normalizeBucket(parsed.vocabulary)
      };
    } catch {
      return createEmptyStats();
    }
  }

  function incrementBucket(bucket, ids, encounteredAt) {
    for (const id of new Set(ids)) {
      if (typeof id !== "string" || !id) {
        continue;
      }

      const previous = bucket[id];
      const encounteredAtHistory = previous
        ? [...previous.encounteredAt, encounteredAt]
        : [encounteredAt];

      bucket[id] = {
        encounterCount: encounteredAtHistory.length,
        firstEncounteredAt: encounteredAtHistory[0],
        lastEncounteredAt: encounteredAtHistory[encounteredAtHistory.length - 1],
        encounteredAt: encounteredAtHistory
      };
    }
  }

  function recordExerciseEncounter(exercise, { storage, now = new Date() } = {}) {
    const resolvedStorage = getStorage(storage);
    const stats = readLearningStats({ storage: resolvedStorage });

    if (
      !exercise ||
      !Array.isArray(exercise.grammarPointIds) ||
      !Array.isArray(exercise.vocabularyIds)
    ) {
      return stats;
    }

    const encounteredAt = new Date(now).toISOString();

    incrementBucket(stats.grammarPoints, exercise.grammarPointIds, encounteredAt);
    incrementBucket(stats.vocabulary, exercise.vocabularyIds, encounteredAt);
    stats.updatedAt = encounteredAt;

    try {
      resolvedStorage?.setItem(storageKey, JSON.stringify(stats));
    } catch {
      // Storage may be disabled or full; lesson rendering must still continue.
    }

    return stats;
  }

  global.JlptN5Stats = Object.freeze({
    storageKey,
    schemaVersion,
    readLearningStats,
    recordExerciseEncounter
  });
})(globalThis);
