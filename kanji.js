(function initializeKanji(global) {
  "use strict";

  const directions = Object.freeze({
    kanjiToReading: "kanji-to-reading",
    readingToKanji: "reading-to-kanji"
  });
  const stageOrder = Object.freeze(["B6", "B5", "B4"]);
  const activeStages = Object.freeze(["B6"]);

  function getConverter(converter) {
    const resolvedConverter = converter || global.wanakana;

    if (typeof resolvedConverter?.toHiragana !== "function") {
      throw new Error("WanaKana must load before kanji exercises are used.");
    }

    return resolvedConverter;
  }

  function normalizeReading(value, converter) {
    const compactValue = String(value || "")
      .normalize("NFKC")
      .replace(/[\s\-・･]+/gu, "");

    return getConverter(converter).toHiragana(compactValue);
  }

  function normalizeKanjiAnswer(value) {
    return String(value || "")
      .normalize("NFKC")
      .replace(/[\s・･、。！？!?]+/gu, "");
  }

  function createExercisePool(
    kanji,
    vocabulary,
    { stages = activeStages } = {}
  ) {
    if (!Array.isArray(kanji) || !Array.isArray(vocabulary)) {
      return [];
    }

    const enabledStages = new Set(stages);
    const metadataByCharacter = new Map(kanji
      .filter((entry) => {
        return (
          typeof entry?.id === "string" &&
          typeof entry.character === "string" &&
          entry.character &&
          enabledStages.has(entry.stage)
        );
      })
      .map((entry) => [entry.character, entry]));
    const allKanjiIdsByCharacter = new Map(kanji
      .filter((entry) => typeof entry?.id === "string" && entry.id)
      .map((entry) => [entry.character, entry.id]));
    const readingsByTerm = new Map();
    const pool = [];

    for (const word of vocabulary) {
      if (
        word?.scope !== "core" ||
        typeof word.term !== "string" ||
        typeof word.reading !== "string"
      ) {
        continue;
      }

      const term = word.term.replace(/[～〜]/gu, "");
      const readings = [
        word.reading,
        ...(Array.isArray(word.alternateReadings) ? word.alternateReadings : [])
      ]
        .filter((reading) => typeof reading === "string" && reading)
        .map((reading) => reading.replace(/[～〜]/gu, ""));

      if (!term || readings.length === 0) {
        continue;
      }

      const knownReadings = readingsByTerm.get(term) || new Set();

      for (const reading of readings) {
        knownReadings.add(reading);
      }

      readingsByTerm.set(term, knownReadings);
    }

    for (const word of vocabulary) {
      if (
        word?.scope !== "core" ||
        typeof word.id !== "string" ||
        typeof word.term !== "string" ||
        !word.term ||
        typeof word.reading !== "string" ||
        !word.reading ||
        typeof word.meaning !== "string" ||
        !word.meaning
      ) {
        continue;
      }

      const term = word.term.replace(/[～〜]/gu, "");
      const reading = word.reading.replace(/[～〜]/gu, "");

      if (!term || !reading) {
        continue;
      }

      const targetCharacters = [...new Set(
        [...term].filter((character) => metadataByCharacter.has(character))
      )];
      const kanjiIds = [...new Set(
        [...term]
          .map((character) => allKanjiIdsByCharacter.get(character))
          .filter(Boolean)
      )];

      for (const character of targetCharacters) {
        if ([...term].filter((candidate) => candidate === character).length !== 1) {
          continue;
        }

        const metadata = metadataByCharacter.get(character);
        const alternateReadings = [...(readingsByTerm.get(term) || [])]
          .filter((candidate) => {
            return typeof candidate === "string" && candidate && candidate !== reading;
          });

        pool.push({
          kanjiId: metadata.id,
          character,
          stage: metadata.stage,
          kanjiMeaning: metadata.meaning,
          onReadings: Array.isArray(metadata.onReadings) ? metadata.onReadings : [],
          kunReadings: Array.isArray(metadata.kunReadings) ? metadata.kunReadings : [],
          vocabularyId: word.id,
          term,
          maskedTerm: term.replaceAll(character, "□"),
          reading,
          alternateReadings,
          meaning: word.meaning,
          partOfSpeech: word.partOfSpeech,
          audio: word.audio,
          kanjiIds
        });
      }
    }

    return pool;
  }

  function getKanjiInventory(pool) {
    if (!Array.isArray(pool)) {
      return [];
    }

    return [...new Map(pool.map((entry) => [entry.kanjiId, {
      id: entry.kanjiId,
      character: entry.character,
      stage: entry.stage,
      meaning: entry.kanjiMeaning,
      onReadings: entry.onReadings,
      kunReadings: entry.kunReadings
    }])).values()];
  }

  function getNextDirection(exerciseHistory) {
    const attempts = Array.isArray(exerciseHistory)
      ? exerciseHistory.filter((attempt) => {
        return attempt?.section === "kanji" && Object.values(directions).includes(attempt.direction);
      })
      : [];
    const previousDirection = attempts.at(-1)?.direction;

    return previousDirection === directions.kanjiToReading
      ? directions.readingToKanji
      : directions.kanjiToReading;
  }

  function shuffle(values, random) {
    const shuffled = [...values];

    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));

      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }

    return shuffled;
  }

  function createAnswerChoices(
    pool,
    targetKanjiId,
    { count = 6, random = Math.random } = {}
  ) {
    const inventory = getKanjiInventory(pool);
    const target = inventory.find(({ id }) => id === targetKanjiId);

    if (!target) {
      return [];
    }

    const distractors = shuffle(
      inventory.filter(({ id }) => id !== targetKanjiId),
      random
    ).slice(0, Math.max(0, count - 1));

    return shuffle([target, ...distractors], random)
      .map(({ character }) => character);
  }

  function chooseExercise(
    pool,
    targetKanjiId,
    direction,
    { previousVocabularyId, random = Math.random } = {}
  ) {
    if (!Object.values(directions).includes(direction)) {
      return undefined;
    }

    const targeted = Array.isArray(pool)
      ? pool.filter(({ kanjiId }) => kanjiId === targetKanjiId)
      : [];
    const alternatives = targeted.filter(({ vocabularyId }) => {
      return vocabularyId !== previousVocabularyId;
    });
    const candidates = alternatives.length > 0 ? alternatives : targeted;

    if (candidates.length === 0) {
      return undefined;
    }

    const selected = candidates[Math.floor(random() * candidates.length)];
    const prompt = direction === directions.kanjiToReading
      ? selected.term
      : selected.maskedTerm;
    const solution = direction === directions.kanjiToReading
      ? selected.reading
      : selected.character;

    return {
      ...selected,
      id: `${selected.kanjiId}-${selected.vocabularyId}-${direction}`,
      section: "kanji",
      direction,
      prompt,
      solution,
      ...(direction === directions.readingToKanji
        ? { choices: createAnswerChoices(pool, selected.kanjiId, { random }) }
        : {})
    };
  }

  function gradeAnswer(exercise, answer, converter) {
    if (exercise?.direction === directions.kanjiToReading) {
      const normalizedAnswer = normalizeReading(answer, converter);
      const acceptedReadings = [exercise.reading, ...(exercise.alternateReadings || [])]
        .map((reading) => normalizeReading(reading, converter));
      const correct = acceptedReadings.includes(normalizedAnswer);

      return {
        expectedAnswer: exercise.reading,
        normalizedAnswer,
        correct,
        outcome: correct ? "good" : "again"
      };
    }

    if (exercise?.direction === directions.readingToKanji) {
      const normalizedAnswer = normalizeKanjiAnswer(answer);
      const expectedAnswer = normalizeKanjiAnswer(exercise.character);
      const correct = normalizedAnswer === expectedAnswer;

      return {
        expectedAnswer: exercise.character,
        normalizedAnswer,
        correct,
        outcome: correct ? "good" : "again"
      };
    }

    return {
      expectedAnswer: "",
      normalizedAnswer: "",
      correct: false,
      outcome: "again"
    };
  }

  function createKanjiRating(kanjiId, outcome) {
    return {
      kanjiId,
      outcome: outcome === "good" ? "good" : "again"
    };
  }

  function createPositiveVocabularyRating(exercise, outcome) {
    if (
      exercise?.direction !== directions.kanjiToReading ||
      outcome !== "good" ||
      typeof exercise.vocabularyId !== "string" ||
      !exercise.vocabularyId
    ) {
      return undefined;
    }

    return {
      vocabularyId: exercise.vocabularyId,
      outcome: "good"
    };
  }

  global.JlptN5Kanji = Object.freeze({
    directions,
    stageOrder,
    activeStages,
    normalizeReading,
    normalizeKanjiAnswer,
    createExercisePool,
    getKanjiInventory,
    getNextDirection,
    createAnswerChoices,
    chooseExercise,
    gradeAnswer,
    createKanjiRating,
    createPositiveVocabularyRating
  });
})(globalThis);
