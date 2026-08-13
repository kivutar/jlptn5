(function initializeExerciseSelection(global) {
  "use strict";

  const productionInterval = 5;
  const recognitionThreshold = 2;
  const newGrammarPointLimit = 1;

  function getExerciseType(exercise) {
    return exercise?.type === "production" ? "production" : "recognition";
  }

  function isCompletedAttempt(attempt) {
    return Array.isArray(attempt?.grammarRatings) && attempt.grammarRatings.length > 0;
  }

  function createRecognitionIndex(exercises, exerciseHistory) {
    const exercisesById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
    const recognitionIdsByGrammarPoint = new Map();

    for (const attempt of exerciseHistory) {
      const exercise = exercisesById.get(attempt?.exerciseId);

      if (!exercise || getExerciseType(exercise) !== "recognition" || !isCompletedAttempt(attempt)) {
        continue;
      }

      for (const { grammarPointId } of attempt.grammarRatings) {
        if (!exercise.grammarPointIds.includes(grammarPointId)) {
          continue;
        }

        const exerciseIds = recognitionIdsByGrammarPoint.get(grammarPointId) || new Set();

        exerciseIds.add(exercise.id);
        recognitionIdsByGrammarPoint.set(grammarPointId, exerciseIds);
      }
    }

    return recognitionIdsByGrammarPoint;
  }

  function limitNewGrammarPoints(candidates, exerciseHistory) {
    // Any rating means the point has been introduced; Good versus Again is
    // mastery information handled separately by the SRS.
    const introducedGrammarPointIds = new Set(
      exerciseHistory.flatMap((attempt) => {
        return Array.isArray(attempt?.grammarRatings)
          ? attempt.grammarRatings.map(({ grammarPointId }) => grammarPointId)
          : [];
      })
    );
    const candidatesWithCounts = candidates.map((exercise) => ({
      exercise,
      newGrammarPointCount: exercise.grammarPointIds.filter((grammarPointId) => {
        return !introducedGrammarPointIds.has(grammarPointId);
      }).length
    }));
    const minimumCount = Math.min(
      ...candidatesWithCounts.map(({ newGrammarPointCount }) => newGrammarPointCount)
    );

    // Introduce at most one point when possible. Falling back to the smallest
    // available count lets a fresh learner bootstrap and avoids curriculum dead ends.
    const effectiveLimit = Math.max(newGrammarPointLimit, minimumCount);

    return candidatesWithCounts
      .filter(({ newGrammarPointCount }) => newGrammarPointCount <= effectiveLimit)
      .map(({ exercise }) => exercise);
  }

  function selectExercisePool({
    exercises,
    candidates,
    exerciseHistory,
    forcedExerciseType
  }) {
    if (forcedExerciseType) {
      return candidates.filter((exercise) => {
        return getExerciseType(exercise) === forcedExerciseType;
      });
    }

    const recognitionExercises = candidates.filter((exercise) => {
      return getExerciseType(exercise) === "recognition";
    });
    const completedExerciseCount = exerciseHistory.filter(isCompletedAttempt).length;
    const shouldUseProduction = (completedExerciseCount + 1) % productionInterval === 0;

    if (!shouldUseProduction) {
      return limitNewGrammarPoints(recognitionExercises, exerciseHistory);
    }

    const recognitionIndex = createRecognitionIndex(exercises, exerciseHistory);
    const productionExercises = candidates.filter((exercise) => {
      return (
        getExerciseType(exercise) === "production" &&
        exercise.grammarPointIds.every((grammarPointId) => {
          return (recognitionIndex.get(grammarPointId)?.size || 0) >= recognitionThreshold;
        })
      );
    });

    return productionExercises.length > 0
      ? productionExercises
      : limitNewGrammarPoints(recognitionExercises, exerciseHistory);
  }

  global.JlptN5ExerciseSelection = Object.freeze({
    newGrammarPointLimit,
    productionInterval,
    recognitionThreshold,
    selectExercisePool
  });
})(globalThis);
