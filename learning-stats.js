(function initializeLearningStats(global) {
  "use strict";

  const storageKey = "jlpt-n5.learning-stats.v1";
  const schemaVersion = 1;

  function createEmptyStats() {
    return {
      version: schemaVersion,
      updatedAt: null,
      grammarPoints: {},
      vocabulary: {},
      kanji: {},
      exerciseHistory: []
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

  function normalizeExerciseHistory(history) {
    if (!Array.isArray(history)) {
      return [];
    }

    return history
      .filter((attempt) => {
        return (
          typeof attempt?.exerciseId === "string" &&
          typeof attempt?.text === "string" &&
          typeof attempt?.answer === "string" &&
          typeof attempt?.submittedAt === "string" &&
          !Number.isNaN(Date.parse(attempt.submittedAt))
        );
      })
      .map(({ exerciseId, text, answer, submittedAt, grammarRatings }) => ({
        exerciseId,
        text,
        answer,
        submittedAt,
        grammarRatings: normalizeGrammarRatings(grammarRatings)
      }));
  }

  function normalizeGrammarRatings(grammarRatings) {
    const normalized = new Map();

    if (!Array.isArray(grammarRatings)) {
      return [];
    }

    for (const rating of grammarRatings) {
      if (
        typeof rating?.grammarPointId === "string" &&
        rating.grammarPointId &&
        ["again", "good"].includes(rating.outcome)
      ) {
        normalized.set(rating.grammarPointId, rating.outcome);
      }
    }

    return [...normalized].map(([grammarPointId, outcome]) => ({
      grammarPointId,
      outcome
    }));
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
        vocabulary: normalizeBucket(parsed.vocabulary),
        kanji: normalizeBucket(parsed.kanji),
        exerciseHistory: normalizeExerciseHistory(parsed.exerciseHistory)
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

  function writeLearningStats(stats, storage) {
    try {
      storage?.setItem(storageKey, JSON.stringify(stats));
    } catch {
      // Storage may be disabled or full; lesson rendering must still continue.
    }
  }

  function recordExerciseEncounter(exercise, { storage, now = new Date() } = {}) {
    const resolvedStorage = getStorage(storage);
    const stats = readLearningStats({ storage: resolvedStorage });

    if (
      !exercise ||
      !Array.isArray(exercise.grammarPointIds) ||
      !Array.isArray(exercise.vocabularyIds) ||
      !Array.isArray(exercise.kanjiIds)
    ) {
      return stats;
    }

    const encounteredAt = new Date(now).toISOString();

    incrementBucket(stats.grammarPoints, exercise.grammarPointIds, encounteredAt);
    incrementBucket(stats.vocabulary, exercise.vocabularyIds, encounteredAt);
    incrementBucket(stats.kanji, exercise.kanjiIds, encounteredAt);
    stats.updatedAt = encounteredAt;

    writeLearningStats(stats, resolvedStorage);

    return stats;
  }

  function recordExerciseAttempt(exercise, answer, { storage, now = new Date() } = {}) {
    const resolvedStorage = getStorage(storage);
    const stats = readLearningStats({ storage: resolvedStorage });

    if (
      !exercise ||
      typeof exercise.id !== "string" ||
      typeof exercise.text !== "string" ||
      typeof answer !== "string"
    ) {
      return stats;
    }

    const submittedAt = new Date(now).toISOString();

    stats.exerciseHistory.push({
      exerciseId: exercise.id,
      text: exercise.text,
      answer,
      submittedAt,
      grammarRatings: []
    });
    stats.updatedAt = submittedAt;
    writeLearningStats(stats, resolvedStorage);

    return stats;
  }

  function recordExerciseGrammarRatings(
    exerciseId,
    submittedAt,
    grammarRatings,
    { storage, now = new Date() } = {}
  ) {
    const resolvedStorage = getStorage(storage);
    const stats = readLearningStats({ storage: resolvedStorage });
    const normalizedRatings = normalizeGrammarRatings(grammarRatings);
    let attempt;

    for (let index = stats.exerciseHistory.length - 1; index >= 0; index -= 1) {
      const candidate = stats.exerciseHistory[index];

      if (candidate.exerciseId === exerciseId && candidate.submittedAt === submittedAt) {
        attempt = candidate;
        break;
      }
    }

    if (!attempt || normalizedRatings.length === 0) {
      return stats;
    }

    const updatedAt = new Date(now).toISOString();

    attempt.grammarRatings = normalizedRatings;
    stats.updatedAt = updatedAt;
    writeLearningStats(stats, resolvedStorage);
    return stats;
  }

  global.JlptN5Stats = Object.freeze({
    storageKey,
    schemaVersion,
    readLearningStats,
    recordExerciseEncounter,
    recordExerciseAttempt,
    recordExerciseGrammarRatings
  });
})(globalThis);
