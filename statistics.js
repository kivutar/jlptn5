(function initializeStatistics(global) {
  "use strict";

  const cardStateNames = Object.freeze({
    0: "New",
    1: "Learning",
    2: "Review",
    3: "Relearning"
  });
  const matureStabilityDays = 30;
  const nearMatureStabilityDays = 20;
  const masteredStabilityDays = 90;
  const masteredRetrievability = 0.8;

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

  function createVocabularyReviewEvents(exerciseHistory) {
    return exerciseHistory
      .filter((attempt) => {
        return (
          attempt?.section === "vocabulary" &&
          typeof attempt.vocabularyId === "string" &&
          ["again", "good"].includes(attempt.outcome) &&
          !Number.isNaN(Date.parse(attempt.submittedAt))
        );
      })
      .map((attempt) => ({
        itemId: attempt.vocabularyId,
        outcome: attempt.outcome,
        reviewedAt: attempt.submittedAt
      }))
      .sort((left, right) => {
        return Date.parse(left.reviewedAt) - Date.parse(right.reviewedAt);
      });
  }

  function createKanjiReviewEvents(exerciseHistory) {
    const events = [];

    for (const attempt of exerciseHistory) {
      const reviewedAt = Date.parse(attempt.submittedAt);

      if (Number.isNaN(reviewedAt) || !Array.isArray(attempt.kanjiRatings)) {
        continue;
      }

      for (const rating of attempt.kanjiRatings) {
        if (
          typeof rating?.kanjiId === "string" &&
          ["again", "good"].includes(rating.outcome)
        ) {
          events.push({
            itemId: rating.kanjiId,
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

  function getKnowledgeLevel(card, now, getRetrievability) {
    if (!card) {
      return { key: "new", label: "New", retrievability: 0 };
    }

    let retrievability = 0;

    if (typeof getRetrievability === "function") {
      try {
        retrievability = getRetrievability(card, { now });
      } catch {
        retrievability = 0;
      }
    }

    if (!Number.isFinite(retrievability)) {
      retrievability = 0;
    }

    retrievability = Math.max(0, Math.min(1, retrievability));

    if (
      card.state === 2 &&
      card.stability >= masteredStabilityDays &&
      retrievability >= masteredRetrievability
    ) {
      return { key: "mastered", label: "Mastered", retrievability };
    }

    if (card.state === 2 && card.stability >= matureStabilityDays) {
      return { key: "mature", label: "Mature", retrievability };
    }

    return { key: "learning", label: "Learning", retrievability };
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

  function countCompletedExercises(exerciseHistory) {
    const counts = { grammar: 0, hiragana: 0, katakana: 0, kanji: 0, vocabulary: 0 };

    for (const attempt of exerciseHistory) {
      if (Number.isNaN(Date.parse(attempt?.submittedAt))) {
        continue;
      }

      if (["hiragana", "katakana", "kanji", "vocabulary"].includes(attempt.section)) {
        counts[attempt.section] += 1;
      } else if (attempt.section === undefined || attempt.section === "grammar") {
        counts.grammar += 1;
      }
    }

    return {
      ...counts,
      kana: counts.hiragana + counts.katakana,
      total: counts.grammar + counts.hiragana + counts.katakana + counts.kanji + counts.vocabulary
    };
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

  function createProgressBreakdown(entries = [], totalCount = entries.length) {
    const counts = {
      mastered: 0,
      mature: 0,
      learningDue: 0,
      encountered: 0,
      new: 0
    };

    for (const entry of entries) {
      if (entry?.card) {
        if (entry.knowledge?.key === "mastered") {
          counts.mastered += 1;
        } else if (entry.knowledge?.key === "mature") {
          counts.mature += 1;
        } else {
          counts.learningDue += 1;
        }
      } else if (entry?.encounterCount > 0) {
        counts.encountered += 1;
      }
    }

    counts.new = Math.max(
      0,
      totalCount - counts.mastered - counts.mature - counts.learningDue - counts.encountered
    );
    return counts;
  }

  function summarizeLearningProgress(entries = []) {
    const learningCards = entries.filter(({ card, knowledge }) => {
      return (
        card &&
        knowledge?.key === "learning" &&
        Number.isFinite(card.stability)
      );
    });
    const totalStabilityDays = learningCards.reduce((sum, { card }) => {
      return sum + Math.max(0, card.stability);
    }, 0);
    const nearMatureCount = learningCards.filter(({ card }) => {
      return card.state === 2 && card.stability >= nearMatureStabilityDays;
    }).length;

    return {
      count: learningCards.length,
      averageStabilityDays: learningCards.length > 0
        ? totalStabilityDays / learningCards.length
        : 0,
      nearMatureCount,
      nearMatureStabilityDays,
      matureStabilityDays
    };
  }

  function createStatisticsModel({
    grammarPoints = [],
    kana = [],
    hiragana = kana,
    katakana = [],
    vocabulary = [],
    kanji = [],
    activeKanjiIds,
    learningStats = {},
    srsData = {},
    getRetrievability = global.JlptN5Srs?.getRetrievability,
    now = new Date()
  } = {}) {
    const currentTime = new Date(now);

    if (Number.isNaN(currentTime.getTime())) {
      throw new TypeError("Statistics require a valid current date.");
    }

    const exerciseHistory = Array.isArray(learningStats.exerciseHistory)
      ? learningStats.exerciseHistory
      : [];
    const exerciseCounts = countCompletedExercises(exerciseHistory);
    const cards = srsData.cards && typeof srsData.cards === "object"
      ? srsData.cards
      : {};
    const events = createReviewEvents(exerciseHistory);
    const kanaEvents = createKanaReviewEvents(exerciseHistory);
    const vocabularyEvents = createVocabularyReviewEvents(exerciseHistory);
    const kanjiEvents = createKanjiReviewEvents(exerciseHistory);
    const globalReviewEvents = [...events, ...kanaEvents, ...vocabularyEvents, ...kanjiEvents]
      .sort((left, right) => {
        return Date.parse(left.reviewedAt) - Date.parse(right.reviewedAt);
      });
    const resultsByGrammarPoint = createResultIndex(events);
    const resultsByKana = createResultIndex(kanaEvents);
    const resultsByVocabulary = createResultIndex(vocabularyEvents);
    const resultsByKanji = createResultIndex(kanjiEvents);
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
        knowledge: getKnowledgeLevel(card, currentTime, getRetrievability),
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
    const createKanaEntries = (metadataEntries) => {
      const entries = metadataEntries.map((metadata) => {
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
          knowledge: getKnowledgeLevel(card, currentTime, getRetrievability),
          results,
          encounterCount: encounter?.encounterCount || 0,
          lastReviewedAt: card?.last_review || results.lastReviewedAt
        };
      });

      entries.sort((left, right) => {
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
      return entries;
    };
    const hiraganaEntries = createKanaEntries(hiragana);
    const katakanaEntries = createKanaEntries(katakana);
    const vocabularyCards = srsData.vocabularyCards &&
      typeof srsData.vocabularyCards === "object"
      ? srsData.vocabularyCards
      : {};
    const vocabularyEntries = vocabulary.map((metadata) => {
      const card = vocabularyCards[metadata.id];
      const results = resultsByVocabulary.get(metadata.id) || {
        good: 0,
        again: 0,
        lastOutcome: undefined,
        lastReviewedAt: undefined
      };
      const encounter = learningStats.vocabulary?.[metadata.id];

      return {
        id: metadata.id,
        metadata,
        card,
        status: getCardStatus(card, currentTime.getTime()),
        knowledge: getKnowledgeLevel(card, currentTime, getRetrievability),
        results,
        encounterCount: encounter?.encounterCount || 0,
        lastReviewedAt: card?.last_review || results.lastReviewedAt
      };
    });

    vocabularyEntries.sort((left, right) => {
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

      return left.metadata.term.localeCompare(right.metadata.term, "ja");
    });
    const vocabularyExposure = createExposureModel(
      vocabulary,
      learningStats.vocabulary || {}
    );
    const kanjiCards = srsData.kanjiCards && typeof srsData.kanjiCards === "object"
      ? srsData.kanjiCards
      : {};
    const activeKanjiIdSet = new Set(
      Array.isArray(activeKanjiIds)
        ? activeKanjiIds
        : kanji.map(({ id }) => id)
    );
    const kanjiEntries = kanji.map((metadata) => {
      const card = kanjiCards[metadata.id];
      const results = resultsByKanji.get(metadata.id) || {
        good: 0,
        again: 0,
        lastOutcome: undefined,
        lastReviewedAt: undefined
      };
      const encounter = learningStats.kanji?.[metadata.id];

      return {
        id: metadata.id,
        metadata,
        card,
        status: getCardStatus(card, currentTime.getTime()),
        knowledge: getKnowledgeLevel(card, currentTime, getRetrievability),
        results,
        encounterCount: encounter?.encounterCount || 0,
        lastReviewedAt: card?.last_review || results.lastReviewedAt
      };
    });

    kanjiEntries.sort((left, right) => {
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

      return left.metadata.character.localeCompare(right.metadata.character, "ja");
    });
    const kanjiExposure = createExposureModel(kanji, learningStats.kanji || {});

    const uniqueKanaEntries = [...new Map(
      [...hiraganaEntries, ...katakanaEntries].map((entry) => [entry.id, entry])
    ).values()];
    const activeKanjiEntries = kanjiEntries.filter(({ id }) => activeKanjiIdSet.has(id));
    const knowledgeEntries = [
      ...grammarEntries,
      ...uniqueKanaEntries,
      ...vocabularyEntries,
      ...activeKanjiEntries
    ];
    const reviewedEntries = knowledgeEntries.filter(({ card }) => card);
    const dueEntries = reviewedEntries.filter(({ card }) => {
      return Date.parse(card.due) <= currentTime.getTime();
    });
    const nextDueTimes = reviewedEntries
      .map(({ card }) => Date.parse(card.due))
      .filter((dueTime) => dueTime > currentTime.getTime());
    const recentEvents = [...globalReviewEvents].reverse().slice(0, 30);
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
    const masteredByKind = {
      grammar: grammarEntries.filter(({ knowledge }) => knowledge.key === "mastered").length,
      kana: uniqueKanaEntries.filter(({ knowledge }) => knowledge.key === "mastered").length,
      vocabulary: vocabularyEntries.filter(({ knowledge }) => knowledge.key === "mastered").length,
      kanji: activeKanjiEntries.filter(({ knowledge }) => knowledge.key === "mastered").length
    };
    const knowledgeCounts = knowledgeEntries.reduce(
      (counts, { knowledge }) => ({
        ...counts,
        [knowledge.key]: counts[knowledge.key] + 1
      }),
      { mastered: 0, mature: 0, learning: 0, new: 0 }
    );

    return {
      overview: {
        dueCount: dueEntries.length,
        reviewedCount: reviewedEntries.length,
        totalGrammarCount: grammarEntries.length,
        knowledge: {
          ...knowledgeCounts,
          reviewed: reviewedEntries.length,
          total: knowledgeEntries.length,
          masteredByKind
        },
        recentResults,
        recentResultCount: recentEvents.length,
        exerciseCounts,
        studyStreak: calculateStudyStreak(exerciseHistory, currentTime),
        nextDue: nextDueTimes.length > 0
          ? new Date(Math.min(...nextDueTimes)).toISOString()
          : undefined,
        reviewDays: createReviewDays(globalReviewEvents, currentTime),
        needsAttention
      },
      grammar: grammarEntries,
      hiragana: hiraganaEntries,
      katakana: katakanaEntries,
      vocabulary: {
        ...vocabularyExposure,
        progressEntries: vocabularyEntries
      },
      kanji: {
        ...kanjiExposure,
        activeCount: activeKanjiEntries.length,
        progressEntries: kanjiEntries
      }
    };
  }

  global.JlptN5Statistics = Object.freeze({
    matureStabilityDays,
    masteredStabilityDays,
    masteredRetrievability,
    createStatisticsModel,
    createProgressBreakdown,
    summarizeLearningProgress,
    getKnowledgeLevel
  });
})(globalThis);
