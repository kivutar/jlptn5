(function initializeKatakana(global) {
  "use strict";

  const directions = Object.freeze({
    kanaToRomaji: "kana-to-romaji",
    romajiToKana: "romaji-to-kana"
  });
  const smallKana = new Set(["ャ", "ュ", "ョ", "ァ", "ィ", "ゥ", "ェ", "ォ", "ヮ"]);
  const imeRomajiByKana = Object.freeze({
    ヂ: "di",
    ヅ: "du",
    ヲ: "wo",
    シェ: "she",
    ジェ: "je",
    チェ: "che",
    ティ: "thi",
    トゥ: "twu",
    テュ: "thu",
    ディ: "dhi",
    ドゥ: "dwu",
    デュ: "dhu",
    イェ: "ye",
    ウィ: "wi",
    ウェ: "we",
    ウォ: "who",
    ファ: "fa",
    フィ: "fi",
    フェ: "fe",
    フォ: "fo",
    フュ: "fyu",
    ツァ: "tsa",
    ツィ: "tsi",
    ツェ: "tse",
    ツォ: "tso",
    クァ: "kwa",
    クィ: "kwi",
    クェ: "kwe",
    クォ: "kwo",
    グァ: "gwa",
    ヴァ: "va",
    ヴィ: "vi",
    ヴ: "vu",
    ヴェ: "ve",
    ヴォ: "vo",
    ヴュ: "vyu"
  });
  const acceptedRomajiByKana = Object.freeze({
    ヂ: ["ji"],
    ヅ: ["zu"],
    ヲ: ["o"],
    ティ: ["ti", "tei"],
    ウィ: ["ui"],
    ウェ: ["ue"],
    ウォ: ["wo", "uo"],
    ファ: ["fua"],
    フィ: ["fyi"],
    フェ: ["fye"],
    フォ: ["fuo"]
  });

  function getConverter(converter) {
    const resolvedConverter = converter || global.wanakana;

    if (!resolvedConverter) {
      throw new Error("WanaKana must load before katakana exercises are used.");
    }

    return resolvedConverter;
  }

  function segmentKatakana(value) {
    const parts = [];

    for (const character of String(value || "").normalize("NFKC")) {
      if (smallKana.has(character) && parts.length > 0 && parts.at(-1) !== "ッ") {
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
      .replace(/ā/gu, "a-")
      .replace(/ī/gu, "i-")
      .replace(/ū/gu, "u-")
      .replace(/ē/gu, "e-")
      .replace(/ō/gu, "o-")
      .replace(/[‐‑‒–—−]/gu, "-")
      .replace(/[\s'’・･]+/gu, "");
  }

  function normalizeKana(value, converter) {
    const resolvedConverter = getConverter(converter);
    const compactValue = String(value || "")
      .normalize("NFKC")
      .replace(/[\s・･]+/gu, "");

    return resolvedConverter.toKatakana(compactValue);
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
      if (part === "ー") {
        return "-";
      }

      if (part === "ッ") {
        const nextPart = parts[index + 1] || "";
        const nextRomaji = imeRomajiByKana[nextPart] ||
          normalizeRomaji(resolvedConverter.toRomaji(nextPart));

        return getGeminatePrefix(nextRomaji);
      }

      if (part === "ン") {
        const nextPart = parts[index + 1] || "";
        const nextRomaji = imeRomajiByKana[nextPart] ||
          normalizeRomaji(resolvedConverter.toRomaji(nextPart));

        return /^[aeiouy]/u.test(nextRomaji) ? "n'" : "n";
      }

      return imeRomajiByKana[part] || normalizeRomaji(resolvedConverter.toRomaji(part));
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
    const cost = cells[expected.length][actual.length].cost;
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

    return { cost, failedExpectedIndexes };
  }

  function getLastVowel(value) {
    return [...normalizeRomaji(value)].reverse().find((character) => {
      return /[aeiou]/u.test(character);
    });
  }

  function getPartAlternatives(parts, romajiParts, index) {
    const part = parts[index];
    const primary = romajiParts[index];

    if (part === "ー") {
      const previousRomaji = [...romajiParts.slice(0, index)]
        .reverse()
        .find((romaji) => romaji && romaji !== "-");
      const repeatedVowel = getLastVowel(previousRomaji);

      return repeatedVowel ? ["-", repeatedVowel] : ["-"];
    }

    return [...new Set([primary, ...(acceptedRomajiByKana[part] || [])])];
  }

  function createRomajiVariants(parts, romajiParts) {
    let variants = [{ characters: [], partIndexByCharacter: [] }];

    for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
      const alternatives = getPartAlternatives(parts, romajiParts, partIndex)
        .map(normalizeRomaji)
        .filter(Boolean);
      const nextVariants = [];

      for (const variant of variants) {
        for (const alternative of alternatives) {
          nextVariants.push({
            characters: [...variant.characters, ...alternative],
            partIndexByCharacter: [
              ...variant.partIndexByCharacter,
              ...Array(alternative.length).fill(partIndex)
            ]
          });
        }
      }

      variants = nextVariants;
    }

    return variants;
  }

  function createPartResults(parts, romajiParts, failedPartIndexes) {
    return parts.map((kana, index) => ({
      kana,
      romaji: romajiParts[index],
      outcome: failedPartIndexes.has(index) ? "again" : "good"
    }));
  }

  function gradeRomajiAnswer(katakana, answer, converter) {
    const parts = segmentKatakana(katakana);
    const romajiParts = romanizeParts(parts, converter);
    const normalizedAnswer = normalizeRomaji(answer);
    let bestResult;

    for (const variant of createRomajiVariants(parts, romajiParts)) {
      const alignment = alignSequences(variant.characters, [...normalizedAnswer]);
      const failedPartIndexes = new Set(
        [...alignment.failedExpectedIndexes]
          .map((index) => variant.partIndexByCharacter[index])
          .filter((index) => index !== undefined)
      );
      const candidate = { ...alignment, failedPartIndexes };

      if (
        !bestResult ||
        candidate.cost < bestResult.cost ||
        (
          candidate.cost === bestResult.cost &&
          candidate.failedPartIndexes.size < bestResult.failedPartIndexes.size
        )
      ) {
        bestResult = candidate;
      }
    }

    return {
      expectedAnswer: romajiParts.join(""),
      normalizedAnswer,
      correct: bestResult.cost === 0,
      parts: createPartResults(parts, romajiParts, bestResult.failedPartIndexes)
    };
  }

  function gradeKanaAnswer(katakana, answer, converter) {
    const parts = segmentKatakana(katakana);
    const romajiParts = romanizeParts(parts, converter);
    const normalizedAnswer = normalizeKana(answer, converter);
    const actualParts = segmentKatakana(normalizedAnswer);
    const { cost, failedExpectedIndexes } = alignSequences(parts, actualParts);

    return {
      expectedAnswer: katakana,
      normalizedAnswer,
      correct: cost === 0,
      parts: createPartResults(parts, romajiParts, failedExpectedIndexes)
    };
  }

  function gradeAnswer({ katakana, direction, answer, converter } = {}) {
    if (direction === directions.kanaToRomaji) {
      return gradeRomajiAnswer(katakana, answer, converter);
    }

    if (direction === directions.romajiToKana) {
      return gradeKanaAnswer(katakana, answer, converter);
    }

    throw new TypeError(`Unknown katakana exercise direction: ${direction}`);
  }

  function createWordPool(vocabulary, converter) {
    const resolvedConverter = getConverter(converter);
    const words = [];
    const seenTerms = new Set();

    if (!Array.isArray(vocabulary)) {
      return words;
    }

    for (const entry of vocabulary) {
      if (
        !["core", "supplemental"].includes(entry?.scope) ||
        typeof entry.id !== "string" ||
        typeof entry.term !== "string" ||
        typeof entry.meaning !== "string" ||
        !/^[ァ-ヶー]+$/u.test(entry.term) ||
        seenTerms.has(entry.term)
      ) {
        continue;
      }

      const kanaParts = segmentKatakana(entry.term);
      const romajiParts = romanizeParts(kanaParts, resolvedConverter);

      if (kanaParts.length < 2 || romajiParts.some((part) => !part)) {
        continue;
      }

      const romaji = romajiParts.join("");

      if (resolvedConverter.toKatakana(romaji) !== entry.term) {
        continue;
      }

      seenTerms.add(entry.term);
      words.push({
        id: `katakana-${entry.id}`,
        vocabularyId: entry.id,
        writtenForm: entry.term,
        katakana: entry.term,
        meaning: entry.meaning,
        kanaParts,
        romajiParts,
        romaji,
        audio: typeof entry.audio === "string" &&
          /^assets\/voices\/[a-z0-9-]+\.wav$/u.test(entry.audio)
          ? entry.audio
          : undefined
      });
    }

    return words;
  }

  function createKanaInventory(words) {
    return [...new Set(words.flatMap(({ kanaParts }) => kanaParts))]
      .sort((left, right) => left.localeCompare(right, "ja"));
  }

  function getNextDirection(exerciseHistory) {
    const completedCount = Array.isArray(exerciseHistory)
      ? exerciseHistory.filter(({ section, kanaRatings }) => {
        return section === "katakana" && Array.isArray(kanaRatings) && kanaRatings.length > 0;
      }).length
      : 0;

    return completedCount % 6 === 5
      ? directions.romajiToKana
      : directions.kanaToRomaji;
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
      section: "katakana",
      direction,
      targetKana
    };
  }

  function summarizeKanaRatings(partResults) {
    const ratings = new Map();

    for (const result of partResults || []) {
      if (!result?.kana || !["again", "good"].includes(result.outcome)) {
        continue;
      }

      const previousOutcome = ratings.get(result.kana);
      ratings.set(
        result.kana,
        previousOutcome === "again" || result.outcome === "again" ? "again" : "good"
      );
    }

    return [...ratings].map(([kana, outcome]) => ({ kana, outcome }));
  }

  global.JlptN5Katakana = Object.freeze({
    directions,
    segmentKatakana,
    normalizeRomaji,
    normalizeKana,
    romanizeParts,
    gradeAnswer,
    createWordPool,
    createKanaInventory,
    getNextDirection,
    chooseExercise,
    summarizeKanaRatings
  });
})(globalThis);
