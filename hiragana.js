(function initializeHiragana(global) {
  "use strict";

  const directions = Object.freeze({
    kanaToRomaji: "kana-to-romaji",
    romajiToKana: "romaji-to-kana"
  });
  const smallKana = new Set(["ゃ", "ゅ", "ょ", "ぁ", "ぃ", "ぅ", "ぇ", "ぉ", "ゎ"]);

  function getConverter(converter) {
    const resolvedConverter = converter || global.wanakana;

    if (!resolvedConverter) {
      throw new Error("WanaKana must load before hiragana exercises are used.");
    }

    return resolvedConverter;
  }

  function segmentHiragana(value) {
    const parts = [];

    for (const character of String(value || "").normalize("NFKC")) {
      if (smallKana.has(character) && parts.length > 0 && parts.at(-1) !== "っ") {
        parts[parts.length - 1] += character;
      } else {
        parts.push(character);
      }
    }

    return parts;
  }

  function normalizeRomaji(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLocaleLowerCase("en")
      .replace(/[ā]/gu, "aa")
      .replace(/[ī]/gu, "ii")
      .replace(/[ū]/gu, "uu")
      .replace(/[ē]/gu, "ee")
      .replace(/[ō]/gu, "ou")
      .replace(/[\s\-'’・･]+/gu, "");
  }

  function normalizeKana(value, converter) {
    const resolvedConverter = getConverter(converter);
    const compactValue = String(value || "")
      .normalize("NFKC")
      .replace(/[\s\-・･]+/gu, "");

    return resolvedConverter.toHiragana(compactValue);
  }

  function getGeminatePrefix(nextRomaji) {
    if (nextRomaji.startsWith("ch")) {
      return "c";
    }

    if (nextRomaji.startsWith("ts")) {
      return "t";
    }

    return /^[bcdfghjklmnpqrstvwxyz]/u.test(nextRomaji)
      ? nextRomaji[0]
      : "";
  }

  function romanizeParts(parts, converter) {
    const resolvedConverter = getConverter(converter);

    return parts.map((part, index) => {
      if (part === "っ") {
        const nextRomaji = resolvedConverter.toRomaji(parts[index + 1] || "");
        return getGeminatePrefix(nextRomaji);
      }

      // IME spellings keep these otherwise ambiguous kana reversible.
      if (part === "ぢ") {
        return "di";
      }

      if (part === "づ") {
        return "du";
      }

      if (part === "ん") {
        const nextRomaji = resolvedConverter.toRomaji(parts[index + 1] || "");

        return /^[aeiouy]/u.test(nextRomaji) ? "n'" : "n";
      }

      return normalizeRomaji(resolvedConverter.toRomaji(part));
    });
  }

  function alignSequences(expected, actual) {
    const rowCount = expected.length + 1;
    const columnCount = actual.length + 1;
    const cells = Array.from({ length: rowCount }, () => Array(columnCount));

    cells[0][0] = { cost: 0 };

    for (let expectedIndex = 1; expectedIndex < rowCount; expectedIndex += 1) {
      cells[expectedIndex][0] = {
        cost: expectedIndex,
        operation: "delete",
        previousExpectedIndex: expectedIndex - 1,
        previousActualIndex: 0
      };
    }

    for (let actualIndex = 1; actualIndex < columnCount; actualIndex += 1) {
      cells[0][actualIndex] = {
        cost: actualIndex,
        operation: "insert",
        previousExpectedIndex: 0,
        previousActualIndex: actualIndex - 1
      };
    }

    const operationPriority = { match: 0, substitute: 1, delete: 2, insert: 3 };

    for (let expectedIndex = 1; expectedIndex < rowCount; expectedIndex += 1) {
      for (let actualIndex = 1; actualIndex < columnCount; actualIndex += 1) {
        const isMatch = expected[expectedIndex - 1] === actual[actualIndex - 1];
        const candidates = [
          {
            cost: cells[expectedIndex - 1][actualIndex - 1].cost + (isMatch ? 0 : 1),
            operation: isMatch ? "match" : "substitute",
            previousExpectedIndex: expectedIndex - 1,
            previousActualIndex: actualIndex - 1
          },
          {
            cost: cells[expectedIndex - 1][actualIndex].cost + 1,
            operation: "delete",
            previousExpectedIndex: expectedIndex - 1,
            previousActualIndex: actualIndex
          },
          {
            cost: cells[expectedIndex][actualIndex - 1].cost + 1,
            operation: "insert",
            previousExpectedIndex: expectedIndex,
            previousActualIndex: actualIndex - 1
          }
        ];

        candidates.sort((left, right) => {
          return left.cost - right.cost ||
            operationPriority[left.operation] - operationPriority[right.operation];
        });
        cells[expectedIndex][actualIndex] = candidates[0];
      }
    }

    const failedExpectedIndexes = new Set();
    let expectedIndex = expected.length;
    let actualIndex = actual.length;

    while (expectedIndex > 0 || actualIndex > 0) {
      const cell = cells[expectedIndex][actualIndex];

      if (cell.operation === "substitute" || cell.operation === "delete") {
        failedExpectedIndexes.add(expectedIndex - 1);
      } else if (cell.operation === "insert" && expected.length > 0) {
        failedExpectedIndexes.add(Math.min(expectedIndex, expected.length - 1));
      }

      expectedIndex = cell.previousExpectedIndex;
      actualIndex = cell.previousActualIndex;
    }

    return failedExpectedIndexes;
  }

  function createPartResults(parts, romajiParts, failedPartIndexes) {
    return parts.map((kana, index) => ({
      kana,
      romaji: romajiParts[index],
      outcome: failedPartIndexes.has(index) ? "again" : "good"
    }));
  }

  function gradeRomajiAnswer(reading, answer, converter) {
    const parts = segmentHiragana(reading);
    const romajiParts = romanizeParts(parts, converter);
    const normalizedRomajiParts = romajiParts.map(normalizeRomaji);
    const expectedCharacters = [];
    const partIndexByCharacter = [];

    normalizedRomajiParts.forEach((romaji, partIndex) => {
      for (const character of romaji) {
        expectedCharacters.push(character);
        partIndexByCharacter.push(partIndex);
      }
    });

    const normalizedAnswer = normalizeRomaji(answer);
    const failedCharacterIndexes = alignSequences(
      expectedCharacters,
      [...normalizedAnswer]
    );
    const failedPartIndexes = new Set(
      [...failedCharacterIndexes].map((index) => partIndexByCharacter[index])
    );
    const expectedAnswer = romajiParts.join("");
    const normalizedExpectedAnswer = normalizedRomajiParts.join("");

    return {
      expectedAnswer,
      normalizedAnswer,
      correct: failedPartIndexes.size === 0 && normalizedAnswer === normalizedExpectedAnswer,
      parts: createPartResults(parts, romajiParts, failedPartIndexes)
    };
  }

  function gradeKanaAnswer(reading, answer, converter) {
    const parts = segmentHiragana(reading);
    const romajiParts = romanizeParts(parts, converter);
    const normalizedAnswer = normalizeKana(answer, converter);
    const actualParts = segmentHiragana(normalizedAnswer);
    const failedPartIndexes = alignSequences(parts, actualParts);

    return {
      expectedAnswer: reading,
      normalizedAnswer,
      correct: failedPartIndexes.size === 0 && normalizedAnswer === reading,
      parts: createPartResults(parts, romajiParts, failedPartIndexes)
    };
  }

  function gradeAnswer({ reading, direction, answer, converter } = {}) {
    if (direction === directions.kanaToRomaji) {
      return gradeRomajiAnswer(reading, answer, converter);
    }

    if (direction === directions.romajiToKana) {
      return gradeKanaAnswer(reading, answer, converter);
    }

    throw new TypeError(`Unknown hiragana exercise direction: ${direction}`);
  }

  function createWordPool(vocabulary, converter) {
    const resolvedConverter = getConverter(converter);

    if (!Array.isArray(vocabulary)) {
      return [];
    }

    return vocabulary.flatMap((entry) => {
      if (
        entry?.scope !== "core" ||
        typeof entry.id !== "string" ||
        typeof entry.term !== "string" ||
        typeof entry.reading !== "string" ||
        typeof entry.meaning !== "string" ||
        !/^[ぁ-ゖ]+$/u.test(entry.reading) ||
        /\p{Script=Katakana}/u.test(entry.term)
      ) {
        return [];
      }

      const kanaParts = segmentHiragana(entry.reading);
      const romajiParts = romanizeParts(kanaParts, resolvedConverter);

      if (kanaParts.length < 2 || romajiParts.some((part) => !part)) {
        return [];
      }

      return [{
        id: `hiragana-${entry.id}`,
        vocabularyId: entry.id,
        writtenForm: entry.term,
        reading: entry.reading,
        meaning: entry.meaning,
        kanaParts,
        romajiParts,
        romaji: romajiParts.join(""),
        audio: typeof entry.audio === "string" &&
          /^assets\/voices\/vocab\/[a-z0-9-]+\.m4a$/u.test(entry.audio)
          ? entry.audio
          : undefined
      }];
    });
  }

  function createKanaInventory(words) {
    return [...new Set(words.flatMap(({ kanaParts }) => kanaParts))]
      .sort((left, right) => left.localeCompare(right, "ja"));
  }

  function getNextDirection(exerciseHistory) {
    const completedCount = Array.isArray(exerciseHistory)
      ? exerciseHistory.filter(({ section, kanaRatings }) => {
        return section === "hiragana" && Array.isArray(kanaRatings) && kanaRatings.length > 0;
      }).length
      : 0;

    return completedCount % 2 === 0
      ? directions.kanaToRomaji
      : directions.romajiToKana;
  }

  function chooseExercise(
    words,
    targetKana,
    direction,
    { previousVocabularyId, random = Math.random } = {}
  ) {
    const matchingWords = words.filter(({ kanaParts }) => kanaParts.includes(targetKana));
    const unrepeatedWords = matchingWords.filter(({ vocabularyId }) => {
      return vocabularyId !== previousVocabularyId;
    });
    const candidates = unrepeatedWords.length > 0 ? unrepeatedWords : matchingWords;

    if (candidates.length === 0) {
      return undefined;
    }

    const word = candidates[Math.floor(random() * candidates.length)];

    return {
      ...word,
      id: `${word.id}-${direction}`,
      section: "hiragana",
      direction,
      targetKana
    };
  }

  function summarizeKanaRatings(partResults) {
    const ratings = new Map();

    for (const { kana, outcome } of createKanaRatings(partResults)) {
      const previousOutcome = ratings.get(kana);
      ratings.set(
        kana,
        previousOutcome === "again" || outcome === "again" ? "again" : "good"
      );
    }

    return [...ratings].map(([kana, outcome]) => ({ kana, outcome }));
  }

  function createKanaRatings(partResults) {
    return (partResults || [])
      .filter(({ kana, outcome } = {}) => {
        return typeof kana === "string" && kana && ["again", "good"].includes(outcome);
      })
      .map(({ kana, outcome }) => ({ kana, outcome }));
  }

  global.JlptN5Hiragana = Object.freeze({
    directions,
    segmentHiragana,
    normalizeRomaji,
    normalizeKana,
    romanizeParts,
    gradeAnswer,
    createWordPool,
    createKanaInventory,
    getNextDirection,
    chooseExercise,
    createKanaRatings,
    summarizeKanaRatings
  });
})(globalThis);
