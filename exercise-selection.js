(function initializeExerciseSelection(global) {
  "use strict";

  const productionInterval = 5;
  const recognitionThreshold = 2;

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
      return recognitionExercises;
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

    return productionExercises.length > 0 ? productionExercises : recognitionExercises;
  }

  global.JlptN5ExerciseSelection = Object.freeze({
    productionInterval,
    recognitionThreshold,
    selectExercisePool
  });
})(globalThis);
