(function initializeStatistics(global) {
  "use strict";

  const cardStateNames = Object.freeze({
    0: "New",
    1: "Learning",
    2: "Review",
    3: "Relearning"
  });

  function getLocalDayKey(value) {
    const date = new Date(value);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  function createReviewEvents(exerciseHistory) {
    const events = [];

    for (const attempt of exerciseHistory) {
      const reviewedAt = Date.parse(attempt.submittedAt);

      if (Number.isNaN(reviewedAt) || !Array.isArray(attempt.grammarRatings)) {
        continue;
      }

      for (const rating of attempt.grammarRatings) {
        if (
          typeof rating?.grammarPointId === "string" &&
          ["again", "good"].includes(rating.outcome)
        ) {
          events.push({
            itemId: rating.grammarPointId,
            outcome: rating.outcome,
            reviewedAt: attempt.submittedAt
          });
        }
      }
    }

    return events.sort((left, right) => {
      return Date.parse(left.reviewedAt) - Date.parse(right.reviewedAt);
    });
  }

  function createKanaReviewEvents(exerciseHistory) {
    const events = [];

    for (const attempt of exerciseHistory) {
      const reviewedAt = Date.parse(attempt.submittedAt);

      if (Number.isNaN(reviewedAt) || !Array.isArray(attempt.kanaRatings)) {
        continue;
      }

      for (const rating of attempt.kanaRatings) {
        if (typeof rating?.kana === "string" && ["again", "good"].includes(rating.outcome)) {
          events.push({
            itemId: rating.kana,
            outcome: rating.outcome,
            reviewedAt: attempt.submittedAt
          });
        }
      }
    }

    return events.sort((left, right) => {
      return Date.parse(left.reviewedAt) - Date.parse(right.reviewedAt);
    });
  }

  function createResultIndex(events) {
    const results = new Map();

    for (const event of events) {
      const result = results.get(event.itemId) || {
        good: 0,
        again: 0,
        lastOutcome: undefined,
        lastReviewedAt: undefined
      };

      result[event.outcome] += 1;
      result.lastOutcome = event.outcome;
      result.lastReviewedAt = event.reviewedAt;
      results.set(event.itemId, result);
    }

    return results;
  }

  function getCardStatus(card, nowTime) {
    if (!card) {
      return { key: "new", label: "New" };
    }

    if (Date.parse(card.due) <= nowTime) {
      return { key: "due", label: "Due" };
    }

    const label = cardStateNames[card.state] || "Review";
    return { key: label.toLowerCase(), label };
  }

  function calculateStudyStreak(exerciseHistory, now) {
    const activeDays = new Set(
      exerciseHistory
        .filter(({ submittedAt }) => !Number.isNaN(Date.parse(submittedAt)))
        .map(({ submittedAt }) => getLocalDayKey(submittedAt))
    );
    const cursor = new Date(now);

    cursor.setHours(12, 0, 0, 0);

    if (!activeDays.has(getLocalDayKey(cursor))) {
      cursor.setDate(cursor.getDate() - 1);
    }

    let streak = 0;

    while (activeDays.has(getLocalDayKey(cursor))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    return streak;
  }

  function createReviewDays(events, now, dayCount = 14) {
    const days = [];
    const daysByKey = new Map();
    const cursor = new Date(now);

    cursor.setHours(12, 0, 0, 0);
    cursor.setDate(cursor.getDate() - dayCount + 1);

    for (let index = 0; index < dayCount; index += 1) {
      const date = new Date(cursor);
      const day = {
        date: date.toISOString(),
        dayKey: getLocalDayKey(date),
        good: 0,
        again: 0
      };

      days.push(day);
      daysByKey.set(day.dayKey, day);
      cursor.setDate(cursor.getDate() + 1);
    }

    for (const event of events) {
      const day = daysByKey.get(getLocalDayKey(event.reviewedAt));

      if (day) {
        day[event.outcome] += 1;
      }
    }

    return days;
  }

  function createExposureModel(entries, bucket) {
    const encountered = [];
    let totalEncounters = 0;

    for (const metadata of entries) {
      const encounter = bucket[metadata.id];

      if (!encounter) {
        continue;
      }

      totalEncounters += encounter.encounterCount;
      encountered.push({
        id: metadata.id,
        metadata,
        encounterCount: encounter.encounterCount,
        firstEncounteredAt: encounter.firstEncounteredAt,
        lastEncounteredAt: encounter.lastEncounteredAt
      });
    }

    return {
      totalCount: entries.length,
      encounteredCount: encountered.length,
      totalEncounters,
      entries: encountered
    };
  }

  function createStatisticsModel({
    grammarPoints = [],
    kana = [],
    vocabulary = [],
    kanji = [],
    learningStats = {},
    srsData = {},
    now = new Date()
  } = {}) {
    const currentTime = new Date(now);

    if (Number.isNaN(currentTime.getTime())) {
      throw new TypeError("Statistics require a valid current date.");
    }

    const exerciseHistory = Array.isArray(learningStats.exerciseHistory)
      ? learningStats.exerciseHistory
      : [];
    const cards = srsData.cards && typeof srsData.cards === "object"
      ? srsData.cards
      : {};
    const events = createReviewEvents(exerciseHistory);
    const kanaEvents = createKanaReviewEvents(exerciseHistory);
    const resultsByGrammarPoint = createResultIndex(events);
    const resultsByKana = createResultIndex(kanaEvents);
    const grammarEntries = grammarPoints.map((metadata) => {
      const card = cards[metadata.id];
      const results = resultsByGrammarPoint.get(metadata.id) || {
        good: 0,
        again: 0,
        lastOutcome: undefined,
        lastReviewedAt: undefined
      };
      const encounter = learningStats.grammarPoints?.[metadata.id];

      return {
        id: metadata.id,
        metadata,
        card,
        status: getCardStatus(card, currentTime.getTime()),
        results,
        encounterCount: encounter?.encounterCount || 0,
        lastReviewedAt: card?.last_review || results.lastReviewedAt
      };
    });
    const statusOrder = { due: 0, relearning: 1, learning: 2, review: 3, new: 4 };

    grammarEntries.sort((left, right) => {
      const statusDifference = statusOrder[left.status.key] - statusOrder[right.status.key];

      if (statusDifference !== 0) {
        return statusDifference;
      }

      if (left.card && right.card) {
        const dueDifference = Date.parse(left.card.due) - Date.parse(right.card.due);

        if (dueDifference !== 0) {
          return dueDifference;
        }
      }

      return left.metadata.pattern.localeCompare(right.metadata.pattern, "ja");
    });

    const kanaCards = srsData.kanaCards && typeof srsData.kanaCards === "object"
      ? srsData.kanaCards
      : {};
    const kanaEntries = kana.map((metadata) => {
      const card = kanaCards[metadata.id];
      const results = resultsByKana.get(metadata.id) || {
        good: 0,
        again: 0,
        lastOutcome: undefined,
        lastReviewedAt: undefined
      };
      const encounter = learningStats.kana?.[metadata.id];

      return {
        id: metadata.id,
        metadata,
        card,
        status: getCardStatus(card, currentTime.getTime()),
        results,
        encounterCount: encounter?.encounterCount || 0,
        lastReviewedAt: card?.last_review || results.lastReviewedAt
      };
    });

    kanaEntries.sort((left, right) => {
      const statusDifference = statusOrder[left.status.key] - statusOrder[right.status.key];

      if (statusDifference !== 0) {
        return statusDifference;
      }

      if (left.card && right.card) {
        const dueDifference = Date.parse(left.card.due) - Date.parse(right.card.due);

        if (dueDifference !== 0) {
          return dueDifference;
        }
      }

      return left.metadata.kana.localeCompare(right.metadata.kana, "ja");
    });

    const reviewedEntries = grammarEntries.filter(({ card }) => card);
    const dueEntries = reviewedEntries.filter(({ card }) => {
      return Date.parse(card.due) <= currentTime.getTime();
    });
    const nextDueTimes = reviewedEntries
      .map(({ card }) => Date.parse(card.due))
      .filter((dueTime) => dueTime > currentTime.getTime());
    const recentEvents = [...events].reverse().slice(0, 30);
    const recentResults = recentEvents.reduce(
      (counts, event) => ({ ...counts, [event.outcome]: counts[event.outcome] + 1 }),
      { good: 0, again: 0 }
    );
    const needsAttention = grammarEntries
      .filter(({ status, results }) => status.key === "due" || results.lastOutcome === "again")
      .sort((left, right) => {
        if (left.status.key !== right.status.key) {
          return left.status.key === "due" ? -1 : 1;
        }

        if (left.status.key === "due") {
          return Date.parse(left.card.due) - Date.parse(right.card.due);
        }

        return Date.parse(right.results.lastReviewedAt) - Date.parse(left.results.lastReviewedAt);
      });

    return {
      overview: {
        dueCount: dueEntries.length,
        reviewedCount: reviewedEntries.length,
        totalGrammarCount: grammarEntries.length,
        recentResults,
        recentResultCount: recentEvents.length,
        studyStreak: calculateStudyStreak(exerciseHistory, currentTime),
        nextDue: nextDueTimes.length > 0
          ? new Date(Math.min(...nextDueTimes)).toISOString()
          : undefined,
        reviewDays: createReviewDays(events, currentTime),
        needsAttention
      },
      grammar: grammarEntries,
      hiragana: kanaEntries,
      vocabulary: createExposureModel(vocabulary, learningStats.vocabulary || {}),
      kanji: createExposureModel(kanji, learningStats.kanji || {})
    };
  }

  global.JlptN5Statistics = Object.freeze({ createStatisticsModel });
})(globalThis);
