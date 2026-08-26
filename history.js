(function initializeHistory(global) {
  "use strict";

  const daysPerPage = 7;
  const attemptsPerPage = 50;

  function getAttemptOutcome(attempt) {
    if (["again", "good"].includes(attempt?.outcome)) {
      return attempt.outcome;
    }

    const ratings = [
      ...(Array.isArray(attempt?.grammarRatings) ? attempt.grammarRatings : []),
      ...(Array.isArray(attempt?.kanaRatings) ? attempt.kanaRatings : []),
      ...(Array.isArray(attempt?.kanjiRatings) ? attempt.kanjiRatings : [])
    ].filter(({ outcome } = {}) => ["again", "good"].includes(outcome));

    if (ratings.some(({ outcome }) => outcome === "again")) {
      return "again";
    }

    return ratings.some(({ outcome }) => outcome === "good") ? "good" : undefined;
  }

  function createHistoryDays(exerciseHistory, getDayKey) {
    if (!Array.isArray(exerciseHistory) || typeof getDayKey !== "function") {
      return [];
    }

    const attempts = exerciseHistory.flatMap((attempt) => {
      const date = new Date(attempt?.submittedAt);

      return Number.isNaN(date.getTime()) ? [] : [{ ...attempt, date }];
    }).sort((left, right) => right.date.getTime() - left.date.getTime());
    const daysByKey = new Map();

    for (const attempt of attempts) {
      const key = getDayKey(attempt.date);
      const day = daysByKey.get(key) || {
        key,
        date: attempt.date,
        attempts: [],
        results: { good: 0, again: 0 }
      };
      const outcome = getAttemptOutcome(attempt);

      day.attempts.push(attempt);

      if (outcome) {
        day.results[outcome] += 1;
      }

      daysByKey.set(key, day);
    }

    return [...daysByKey.values()];
  }

  function createPage(items, requestedPage, pageSize) {
    const values = Array.isArray(items) ? items : [];
    const size = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : 1;
    const pageCount = Math.ceil(values.length / size);
    const maximumPage = Math.max(0, pageCount - 1);
    const page = Math.max(
      0,
      Math.min(Number.isInteger(requestedPage) ? requestedPage : 0, maximumPage)
    );
    const start = page * size;
    const end = Math.min(start + size, values.length);

    return {
      items: values.slice(start, end),
      page,
      pageCount,
      start,
      end,
      total: values.length,
      hasNewer: page > 0,
      hasOlder: end < values.length
    };
  }

  global.JlptN5History = Object.freeze({
    daysPerPage,
    attemptsPerPage,
    getAttemptOutcome,
    createHistoryDays,
    createPage
  });
})(globalThis);
