(function initializeKatakana(global) {
  "use strict";

  const directions = Object.freeze({
    kanaToRomaji: "kana-to-romaji",
    romajiToKana: "romaji-to-kana",
    hiraganaToKatakana: "hiragana-to-katakana"
  });
  const exerciseKinds = Object.freeze({
    word: "word",
    singleKana: "single-kana"
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

  function createKanaPairs(katakana, hiragana, converter) {
    const resolvedConverter = getConverter(converter);
    const normalizedHiragana = String(hiragana || "").normalize("NFKC");
    const pairs = segmentKatakana(katakana).map((katakanaPart) => ({
      hiragana: resolvedConverter.toHiragana(katakanaPart, {
        convertLongVowelMark: false
      }),
      katakana: katakanaPart
    }));

    if (
      pairs.length === 0 ||
      pairs.some(({ hiragana: hiraganaPart }) => !hiraganaPart) ||
      pairs.map(({ hiragana: hiraganaPart }) => hiraganaPart).join("") !== normalizedHiragana
    ) {
      return [];
    }

    return pairs;
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

  function createPartResults(parts, romajiParts, failedPartIndexes, kanaPairs = []) {
    return parts.map((kana, index) => {
      const pair = kanaPairs[index];

      return {
        kana,
        ...(pair ? { pairedKana: pair.hiragana } : {}),
        romaji: romajiParts[index],
        outcome: failedPartIndexes.has(index) ? "again" : "good"
      };
    });
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

  function gradeKanaAnswer(katakana, answer, converter, kanaPairs = []) {
    const parts = segmentKatakana(katakana);
    const romajiParts = romanizeParts(parts, converter);
    const normalizedAnswer = normalizeKana(answer, converter);
    const actualParts = segmentKatakana(normalizedAnswer);
    const { cost, failedExpectedIndexes } = alignSequences(parts, actualParts);

    return {
      expectedAnswer: katakana,
      normalizedAnswer,
      correct: cost === 0,
      parts: createPartResults(parts, romajiParts, failedExpectedIndexes, kanaPairs)
    };
  }

  function gradeAnswer({ katakana, hiragana, direction, answer, converter } = {}) {
    if (direction === directions.kanaToRomaji) {
      return gradeRomajiAnswer(katakana, answer, converter);
    }

    if (direction === directions.romajiToKana) {
      return gradeKanaAnswer(katakana, answer, converter);
    }

    if (direction === directions.hiraganaToKatakana) {
      const kanaPairs = createKanaPairs(katakana, hiragana, converter);

      if (kanaPairs.length === 0) {
        throw new TypeError("Hiragana-to-Katakana exercises require a valid kana pair.");
      }

      return gradeKanaAnswer(katakana, answer, converter, kanaPairs);
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
      const kanaPairs = createKanaPairs(entry.term, entry.reading, resolvedConverter);

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
        hiragana: kanaPairs.length > 0 ? entry.reading : undefined,
        meaning: entry.meaning,
        kanaParts,
        kanaPairs,
        romajiParts,
        romaji,
        audio: typeof entry.audio === "string" &&
          /^assets\/voices\/vocab\/[a-z0-9-]+\.m4a$/u.test(entry.audio)
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

  function createSingleKanaPool(words, converter) {
    return createKanaInventory(words)
      .filter((katakana) => !["ッ", "ー"].includes(katakana))
      .map((katakana) => {
        const romaji = romanizeParts([katakana], converter)[0];

        return {
          id: `katakana-single-${katakana}`,
          katakana,
          writtenForm: katakana,
          meaning: "",
          kanaParts: [katakana],
          romajiParts: [romaji],
          romaji
        };
      })
      .filter(({ romaji }) => Boolean(romaji));
  }

  function createKanaPairInventory(words) {
    const pairsByKatakana = new Map();

    for (const { kanaPairs = [] } of words || []) {
      for (const pair of kanaPairs) {
        if (pair?.hiragana && pair?.katakana) {
          pairsByKatakana.set(pair.katakana, pair);
        }
      }
    }

    return [...pairsByKatakana.values()].sort((left, right) => {
      return left.katakana.localeCompare(right.katakana, "ja");
    });
  }

  function getCompletedKatakanaCount(exerciseHistory) {
    return Array.isArray(exerciseHistory)
      ? exerciseHistory.filter(({ section, kanaRatings }) => {
        return section === "katakana" && Array.isArray(kanaRatings) && kanaRatings.length > 0;
      }).length
      : 0;
  }

  function getNextExerciseMode(exerciseHistory) {
    const cycleIndex = getCompletedKatakanaCount(exerciseHistory) % 7;

    if (cycleIndex < 5) {
      return {
        direction: directions.kanaToRomaji,
        exerciseKind: cycleIndex === 2 ? exerciseKinds.singleKana : exerciseKinds.word
      };
    }

    return {
      direction: cycleIndex === 5
        ? directions.hiraganaToKatakana
        : directions.romajiToKana,
      exerciseKind: exerciseKinds.word
    };
  }

  function getNextDirection(exerciseHistory) {
    return getNextExerciseMode(exerciseHistory).direction;
  }

  function chooseExercise(
    words,
    targetKana,
    direction,
    { previousVocabularyId, random = Math.random } = {}
  ) {
    const matchingWords = words.filter(({ kanaParts, kanaPairs }) => {
      if (direction === directions.hiraganaToKatakana) {
        return kanaPairs.some(({ hiragana, katakana }) => {
          return hiragana === targetKana || katakana === targetKana;
        });
      }

      return kanaParts.includes(targetKana);
    });
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
      exerciseKind: exerciseKinds.word,
      targetKana,
      reviewKanaParts: direction === directions.hiraganaToKatakana
        ? word.kanaPairs.flatMap(({ hiragana, katakana }) => [hiragana, katakana])
        : word.kanaParts
    };
  }

  function chooseSingleKanaExercise(singleKanaPool, targetKana) {
    const item = singleKanaPool.find(({ katakana }) => katakana === targetKana);

    if (!item) {
      return undefined;
    }

    return {
      ...item,
      id: `${item.id}-${directions.kanaToRomaji}`,
      section: "katakana",
      direction: directions.kanaToRomaji,
      exerciseKind: exerciseKinds.singleKana,
      targetKana,
      reviewKanaParts: item.kanaParts
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
    const ratings = [];

    for (const result of partResults || []) {
      if (!result?.kana || !["again", "good"].includes(result.outcome)) {
        continue;
      }

      for (const kana of new Set([result.kana, result.pairedKana].filter(Boolean))) {
        ratings.push({ kana, outcome: result.outcome });
      }
    }

    return ratings;
  }

  global.JlptN5Katakana = Object.freeze({
    directions,
    exerciseKinds,
    segmentKatakana,
    createKanaPairs,
    normalizeRomaji,
    normalizeKana,
    romanizeParts,
    gradeAnswer,
    createWordPool,
    createKanaInventory,
    createSingleKanaPool,
    createKanaPairInventory,
    getNextExerciseMode,
    getNextDirection,
    chooseExercise,
    chooseSingleKanaExercise,
    createKanaRatings,
    summarizeKanaRatings
  });
})(globalThis);
