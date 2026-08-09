(function initializeSrs(global) {
  "use strict";

  const storageKey = "jlpt-n5.srs.v1";
  const schemaVersion = 1;
  const numericCardFields = [
    "stability",
    "difficulty",
    "elapsed_days",
    "scheduled_days",
    "reps",
    "lapses",
    "learning_steps",
    "state"
  ];

  if (!global.FSRS) {
    throw new Error("The FSRS scheduler must load before srs.js.");
  }

  const scheduler = global.FSRS.fsrs();
  const ratingByOutcome = Object.freeze({
    again: global.FSRS.Rating.Again,
    good: global.FSRS.Rating.Good
  });

  function createEmptyData() {
    return {
      version: schemaVersion,
      updatedAt: null,
      cards: {}
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

  function normalizeDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  function serializeCard(card) {
    return {
      due: card.due.toISOString(),
      stability: card.stability,
      difficulty: card.difficulty,
      elapsed_days: card.elapsed_days,
      scheduled_days: card.scheduled_days,
      reps: card.reps,
      lapses: card.lapses,
      learning_steps: card.learning_steps,
      state: card.state,
      last_review: card.last_review?.toISOString()
    };
  }

  function normalizeCard(card) {
    const due = normalizeDate(card?.due);
    const lastReview = card?.last_review === undefined
      ? undefined
      : normalizeDate(card.last_review);

    if (
      !due ||
      (card?.last_review !== undefined && !lastReview) ||
      !numericCardFields.every((field) => Number.isFinite(card?.[field]))
    ) {
      return undefined;
    }

    return serializeCard({
      ...card,
      due,
      last_review: lastReview
    });
  }

  function hydrateCard(card) {
    return {
      ...card,
      due: new Date(card.due),
      last_review: card.last_review ? new Date(card.last_review) : undefined
    };
  }

  function readSrsData({ storage } = {}) {
    const resolvedStorage = getStorage(storage);

    if (!resolvedStorage) {
      return createEmptyData();
    }

    try {
      const parsed = JSON.parse(resolvedStorage.getItem(storageKey));

      if (!parsed || parsed.version !== schemaVersion) {
        return createEmptyData();
      }

      const cards = {};

      if (parsed.cards && typeof parsed.cards === "object" && !Array.isArray(parsed.cards)) {
        for (const [grammarPointId, card] of Object.entries(parsed.cards)) {
          const normalizedCard = normalizeCard(card);

          if (grammarPointId && normalizedCard) {
            cards[grammarPointId] = normalizedCard;
          }
        }
      }

      return {
        version: schemaVersion,
        updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
        cards
      };
    } catch {
      return createEmptyData();
    }
  }

  function writeSrsData(data, storage) {
    try {
      storage?.setItem(storageKey, JSON.stringify(data));
    } catch {
      // Storage may be unavailable; reviewing should still allow the lesson to continue.
    }
  }

  function chooseRandom(items, random) {
    return items[Math.floor(random() * items.length)];
  }

  function pickNextGrammarPoint(
    grammarPointIds,
    { storage, now = new Date(), random = Math.random } = {}
  ) {
    const ids = [...new Set(grammarPointIds)].filter((id) => typeof id === "string" && id);

    if (ids.length === 0) {
      return undefined;
    }

    const data = readSrsData({ storage });
    const nowTime = new Date(now).getTime();
    const reviewed = ids
      .filter((id) => data.cards[id])
      .map((id) => ({ id, card: data.cards[id] }));
    const due = reviewed.filter(({ card }) => Date.parse(card.due) <= nowTime);

    if (due.length > 0) {
      const oldestDueTime = Math.min(...due.map(({ card }) => Date.parse(card.due)));
      return chooseRandom(
        due.filter(({ card }) => Date.parse(card.due) === oldestDueTime).map(({ id }) => id),
        random
      );
    }

    const newIds = ids.filter((id) => !data.cards[id]);

    if (newIds.length > 0) {
      return chooseRandom(newIds, random);
    }

    const nextDueTime = Math.min(...reviewed.map(({ card }) => Date.parse(card.due)));
    return chooseRandom(
      reviewed.filter(({ card }) => Date.parse(card.due) === nextDueTime).map(({ id }) => id),
      random
    );
  }

  function recordReviews(reviews, { storage, now = new Date() } = {}) {
    const resolvedStorage = getStorage(storage);
    const data = readSrsData({ storage: resolvedStorage });
    const reviewedAt = new Date(now);
    const uniqueReviews = new Map();

    if (!Array.isArray(reviews) || Number.isNaN(reviewedAt.getTime())) {
      return data;
    }

    for (const review of reviews) {
      if (
        typeof review?.grammarPointId === "string" &&
        review.grammarPointId &&
        ratingByOutcome[review.outcome]
      ) {
        uniqueReviews.set(review.grammarPointId, review.outcome);
      }
    }

    for (const [grammarPointId, outcome] of uniqueReviews) {
      const card = data.cards[grammarPointId]
        ? hydrateCard(data.cards[grammarPointId])
        : global.FSRS.createEmptyCard(reviewedAt);
      const schedulingResult = scheduler.next(
        card,
        reviewedAt,
        ratingByOutcome[outcome]
      );

      data.cards[grammarPointId] = serializeCard(schedulingResult.card);
    }

    if (uniqueReviews.size > 0) {
      data.updatedAt = reviewedAt.toISOString();
      writeSrsData(data, resolvedStorage);
    }

    return data;
  }

  global.JlptN5Srs = Object.freeze({
    storageKey,
    schemaVersion,
    readSrsData,
    pickNextGrammarPoint,
    recordReviews
  });
})(globalThis);
