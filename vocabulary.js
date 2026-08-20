(function initializeVocabulary(global) {
  "use strict";

  const directions = Object.freeze({
    japaneseToEnglish: "japanese-to-english",
    englishToJapanese: "english-to-japanese"
  });

  function normalizeEnglish(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLocaleLowerCase("en")
      .replace(/&/gu, " and ")
      .replace(/[’‘]/gu, "'")
      .replace(/[^\p{L}\p{N}']+/gu, " ")
      .trim()
      .replace(/\s+/gu, " ");
  }

  function normalizeJapanese(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLocaleLowerCase("en")
      .replace(/[\s~～・･、。！？!?]+/gu, "");
  }

  function splitGlosses(value) {
    const glosses = [];
    let current = "";
    let parenthesisDepth = 0;

    for (const character of String(value || "")) {
      if (character === "(") {
        parenthesisDepth += 1;
      } else if (character === ")") {
        parenthesisDepth = Math.max(0, parenthesisDepth - 1);
      }

      if (parenthesisDepth === 0 && /[,;/]/u.test(character)) {
        glosses.push(current);
        current = "";
      } else {
        current += character;
      }
    }

    glosses.push(current);
    return glosses.map((gloss) => gloss.trim()).filter(Boolean);
  }

  function stripParentheticalText(value) {
    let stripped = String(value || "");
    let previous;

    do {
      previous = stripped;
      stripped = stripped.replace(/\([^()]*\)/gu, " ");
    } while (stripped !== previous);

    return stripped;
  }

  function addEnglishAnswer(answers, value) {
    const normalized = normalizeEnglish(value);

    if (!normalized) {
      return;
    }

    answers.add(normalized);
    answers.add(normalized.replace(/^(?:to|a|an|the)\s+/u, ""));
  }

  function createEnglishAnswers(meaning) {
    const answers = new Set();

    for (const gloss of [meaning, ...splitGlosses(meaning)]) {
      addEnglishAnswer(answers, gloss);
      addEnglishAnswer(answers, stripParentheticalText(gloss));
    }

    answers.delete("");
    return [...answers];
  }

  function getJapaneseAnswers(entry) {
    return [...new Set([
      entry.term,
      entry.reading,
      ...(Array.isArray(entry.alternateReadings) ? entry.alternateReadings : []),
      ...(Array.isArray(entry.variants) ? entry.variants : [])
    ].map(normalizeJapanese).filter(Boolean))];
  }

  function createVocabularyPool(vocabulary) {
    if (!Array.isArray(vocabulary)) {
      return [];
    }

    const entries = vocabulary
      .filter((entry) => {
        return (
          ["core", "supplemental"].includes(entry?.scope) &&
          typeof entry.id === "string" &&
          entry.id &&
          typeof entry.term === "string" &&
          entry.term &&
          typeof entry.reading === "string" &&
          entry.reading &&
          typeof entry.meaning === "string" &&
          entry.meaning
        );
      })
      .map((entry) => ({
        id: entry.id,
        vocabularyId: entry.id,
        term: entry.term,
        reading: entry.reading,
        meaning: entry.meaning,
        partOfSpeech: typeof entry.partOfSpeech === "string"
          ? entry.partOfSpeech
          : "word",
        alternateReadings: Array.isArray(entry.alternateReadings)
          ? entry.alternateReadings
          : [],
        variants: Array.isArray(entry.variants) ? entry.variants : [],
        acceptedEnglishAnswers: createEnglishAnswers(entry.meaning),
        acceptedJapaneseAnswers: getJapaneseAnswers(entry),
        audio: typeof entry.audio === "string" &&
          /^assets\/voices\/[a-z0-9-]+\.wav$/u.test(entry.audio)
          ? entry.audio
          : undefined
      }));
    const equivalentsByMeaning = new Map();

    for (const entry of entries) {
      const key = `${entry.partOfSpeech}\u0000${normalizeEnglish(entry.meaning)}`;
      const equivalents = equivalentsByMeaning.get(key) || new Set();

      for (const answer of entry.acceptedJapaneseAnswers) {
        equivalents.add(answer);
      }

      equivalentsByMeaning.set(key, equivalents);
    }

    return entries.map((entry) => {
      const key = `${entry.partOfSpeech}\u0000${normalizeEnglish(entry.meaning)}`;

      return {
        ...entry,
        acceptedJapaneseAnswers: [...equivalentsByMeaning.get(key)]
      };
    });
  }

  function getNextDirection(exerciseHistory) {
    const completedCount = Array.isArray(exerciseHistory)
      ? exerciseHistory.filter(({ section, outcome }) => {
        return section === "vocabulary" && ["again", "good"].includes(outcome);
      }).length
      : 0;

    return completedCount % 2 === 0
      ? directions.japaneseToEnglish
      : directions.englishToJapanese;
  }

  function chooseExercise(vocabularyPool, targetVocabularyId, direction) {
    const entry = vocabularyPool.find(({ vocabularyId }) => {
      return vocabularyId === targetVocabularyId;
    });

    if (!entry || !Object.values(directions).includes(direction)) {
      return undefined;
    }

    const japaneseToEnglish = direction === directions.japaneseToEnglish;

    return {
      ...entry,
      id: `vocabulary-${entry.vocabularyId}-${direction}`,
      section: "vocabulary",
      direction,
      prompt: japaneseToEnglish ? entry.term : entry.meaning,
      solution: japaneseToEnglish ? entry.meaning : entry.term
    };
  }

  function gradeAnswer(exercise, answer) {
    if (exercise?.direction === directions.japaneseToEnglish) {
      const normalizedAnswer = normalizeEnglish(answer);
      const correct = exercise.acceptedEnglishAnswers.includes(normalizedAnswer);

      return {
        correct,
        expectedAnswer: exercise.meaning,
        normalizedAnswer,
        outcome: correct ? "good" : "again"
      };
    }

    if (exercise?.direction === directions.englishToJapanese) {
      const normalizedAnswer = normalizeJapanese(answer);
      const correct = exercise.acceptedJapaneseAnswers.includes(normalizedAnswer);

      return {
        correct,
        expectedAnswer: exercise.term,
        normalizedAnswer,
        outcome: correct ? "good" : "again"
      };
    }

    throw new TypeError(`Unknown vocabulary exercise direction: ${exercise?.direction}`);
  }

  global.JlptN5Vocabulary = Object.freeze({
    directions,
    normalizeEnglish,
    normalizeJapanese,
    createEnglishAnswers,
    createVocabularyPool,
    getNextDirection,
    chooseExercise,
    gradeAnswer
  });
})(globalThis);
