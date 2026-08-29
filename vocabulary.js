(function initializeVocabulary(global) {
  "use strict";

  const directions = Object.freeze({
    japaneseToEnglish: "japanese-to-english",
    englishToJapanese: "english-to-japanese",
    japaneseToTranslation: "japanese-to-english",
    translationToJapanese: "english-to-japanese"
  });

  function normalizeTranslation(value, locale = "en") {
    const conjunction = {
      en: " and ",
      fr: " et "
    }[locale] || " and ";

    return String(value || "")
      .normalize("NFKC")
      .toLocaleLowerCase(locale)
      .replace(/œ/gu, "oe")
      .replace(/&/gu, conjunction)
      .replace(/[’‘]/gu, "'")
      .replace(/[^\p{L}\p{N}']+/gu, " ")
      .trim()
      .replace(/\s+/gu, " ")
      .normalize("NFD")
      .replace(/\p{Mark}+/gu, "");
  }

  function normalizeEnglish(value) {
    return normalizeTranslation(value, "en");
  }

  function normalizeJapanese(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLocaleLowerCase("en")
      .replace(/[\s~～・･、。！？!?]+/gu, "");
  }

  function normalizeJapaneseContext(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLocaleLowerCase("en")
      .replace(/[\s~～・･]+/gu, "");
  }

  function getJapaneseForms(entry) {
    return [...new Set([
      entry?.term,
      entry?.reading,
      ...(Array.isArray(entry?.alternateReadings) ? entry.alternateReadings : []),
      ...(Array.isArray(entry?.variants) ? entry.variants : []),
      ...(Array.isArray(entry?.inflections)
        ? entry.inflections.flatMap(({ surface, reading }) => [surface, reading])
        : []),
      ...(Array.isArray(entry?.acceptedJapaneseAnswers)
        ? entry.acceptedJapaneseAnswers
        : [])
    ].map(normalizeJapanese).filter(Boolean))];
  }

  function findContextualVocabularyIds({
    tokens,
    answer,
    vocabulary,
    excludedVocabularyIds = []
  } = {}) {
    const normalizedAnswer = normalizeJapaneseContext(answer);

    if (!normalizedAnswer || !Array.isArray(tokens)) {
      return [];
    }

    const entries = vocabulary instanceof Map
      ? [...vocabulary.values()]
      : Array.isArray(vocabulary)
        ? vocabulary
        : [];
    const excludedIds = new Set(excludedVocabularyIds);
    const targetIds = new Set(tokens
      .map(({ vocabularyId }) => vocabularyId)
      .filter((vocabularyId) => vocabularyId && !excludedIds.has(vocabularyId)));

    if (targetIds.size === 0) {
      return [];
    }

    const vocabularyIdsByForm = new Map();

    for (const entry of entries) {
      const vocabularyId = entry?.vocabularyId || entry?.id;

      if (!vocabularyId) {
        continue;
      }

      for (const form of getJapaneseForms(entry)) {
        const vocabularyIds = vocabularyIdsByForm.get(form) || new Set();

        vocabularyIds.add(vocabularyId);
        vocabularyIdsByForm.set(form, vocabularyIds);
      }
    }

    const lexicalMatches = [...vocabularyIdsByForm.entries()]
      .map(([text, vocabularyIds]) => ({ text, vocabularyIds }))
      .sort((left, right) => right.text.length - left.text.length);
    const contextualMatches = [];

    const addContextualMatch = (text, vocabularyIds) => {
      const normalizedText = normalizeJapanese(text);

      if (normalizedText) {
        contextualMatches.push({
          text: normalizedText,
          vocabularyIds: new Set(vocabularyIds)
        });
      }
    };

    for (const [tokenIndex, token] of tokens.entries()) {
      if (!targetIds.has(token.vocabularyId)) {
        continue;
      }

      let contextEnd = tokenIndex + 1;

      while (contextEnd < tokens.length && !tokens[contextEnd].vocabularyId) {
        contextEnd += 1;
      }

      const bareSurface = normalizeJapanese(token.surface);
      const bareReading = normalizeJapanese(token.reading);

      addContextualMatch(
        tokens.slice(tokenIndex, contextEnd).map(({ surface }) => surface).join(""),
        [token.vocabularyId]
      );
      addContextualMatch(
        tokens.slice(tokenIndex, contextEnd).map(({ reading, surface }) => {
          return reading || surface;
        }).join(""),
        [token.vocabularyId]
      );

      // A one-character inflectional stem such as し or 見 is too ambiguous by
      // itself. Its following auxiliaries/particles provide the word boundary.
      if (bareSurface.length > 1) {
        addContextualMatch(bareSurface, [token.vocabularyId]);
      }
      if (bareReading.length > 1) {
        addContextualMatch(bareReading, [token.vocabularyId]);
      }
    }

    for (let tokenIndex = 0; tokenIndex < tokens.length;) {
      if (!targetIds.has(tokens[tokenIndex].vocabularyId)) {
        tokenIndex += 1;
        continue;
      }

      let groupEnd = tokenIndex + 1;

      while (groupEnd < tokens.length && targetIds.has(tokens[groupEnd].vocabularyId)) {
        groupEnd += 1;
      }

      if (groupEnd - tokenIndex > 1) {
        const groupedTokens = tokens.slice(tokenIndex, groupEnd);
        const groupedVocabularyIds = groupedTokens.map(({ vocabularyId }) => vocabularyId);
        const surface = groupedTokens.map(({ surface }) => surface).join("");
        const reading = groupedTokens.map(({ reading, surface: tokenSurface }) => {
          return reading || tokenSurface;
        }).join("");
        let groupContextEnd = groupEnd;

        while (
          groupContextEnd < tokens.length &&
          !targetIds.has(tokens[groupContextEnd].vocabularyId)
        ) {
          groupContextEnd += 1;
        }

        const contextualTokens = tokens.slice(tokenIndex, groupContextEnd);
        const surfaceContext = contextualTokens.map(({ surface: tokenSurface }) => {
          return tokenSurface;
        }).join("");
        const readingContext = contextualTokens.map(({ reading: tokenReading, surface: tokenSurface }) => {
          return tokenReading || tokenSurface;
        }).join("");

        addContextualMatch(surface, groupedVocabularyIds);
        addContextualMatch(reading, groupedVocabularyIds);
        addContextualMatch(surfaceContext, groupedVocabularyIds);
        addContextualMatch(readingContext, groupedVocabularyIds);
      }

      tokenIndex = groupEnd;
    }

    contextualMatches.sort((left, right) => right.text.length - left.text.length);
    const producedIds = new Set();
    let cursor = 0;

    while (cursor < normalizedAnswer.length) {
      const lexicalMatch = lexicalMatches.find(({ text }) => {
        return normalizedAnswer.startsWith(text, cursor);
      });
      const contextualMatch = contextualMatches.find(({ text }) => {
        return normalizedAnswer.startsWith(text, cursor);
      });
      const longestLength = Math.max(
        lexicalMatch?.text.length || 0,
        contextualMatch?.text.length || 0
      );

      if (longestLength === 0) {
        cursor += 1;
        continue;
      }

      if (lexicalMatch?.text.length === longestLength) {
        for (const vocabularyId of lexicalMatch.vocabularyIds) {
          if (targetIds.has(vocabularyId)) {
            producedIds.add(vocabularyId);
          }
        }
      }

      if (contextualMatch?.text.length === longestLength) {
        for (const vocabularyId of contextualMatch.vocabularyIds) {
          producedIds.add(vocabularyId);
        }
      }

      cursor += longestLength;
    }

    return [...producedIds];
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

  function createTranslationAnswers(entry, locale) {
    const authoredAnswers = Array.isArray(entry.acceptedTranslationAnswers)
      ? entry.acceptedTranslationAnswers
      : Array.isArray(entry.acceptedAnswers)
        ? entry.acceptedAnswers
        : undefined;

    if (!authoredAnswers && locale === "en") {
      return createEnglishAnswers(entry.meaning);
    }

    const answers = new Set();
    const leadingArticle = {
      en: /^(?:to|a|an|the)\s+/u,
      fr: /^(?:(?:un|une|le|la|les|des|du)\s+|l')/u
    }[locale];

    for (const value of [entry.meaning, ...(authoredAnswers || [])]) {
      for (const candidate of [value, stripParentheticalText(value)]) {
        const normalized = normalizeTranslation(candidate, locale);

        if (normalized) {
          answers.add(normalized);

          if (leadingArticle) {
            answers.add(normalized.replace(leadingArticle, ""));
          }
        }
      }
    }

    answers.delete("");
    return [...answers];
  }

  function createAcceptedAnswersByLocale(entry, locale) {
    const translations = entry.translations && typeof entry.translations === "object"
      ? entry.translations
      : {};
    const localizedEntries = Object.entries(translations).filter(([, translation]) => {
      return translation && typeof translation.meaning === "string";
    });

    if (!localizedEntries.some(([translationLocale]) => translationLocale === "en")) {
      localizedEntries.push(["en", {
        meaning: entry.canonicalMeaning || entry.meaning,
        acceptedAnswers: entry.acceptedAnswers
      }]);
    }

    if (!localizedEntries.some(([translationLocale]) => translationLocale === locale)) {
      localizedEntries.push([locale, {
        meaning: entry.meaning,
        acceptedTranslationAnswers: entry.acceptedTranslationAnswers
      }]);
    }

    return Object.fromEntries(localizedEntries.map(([translationLocale, translation]) => [
      translationLocale,
      createTranslationAnswers(translation, translationLocale)
    ]));
  }

  function getJapaneseAnswers(entry) {
    return [...new Set([
      entry.term,
      entry.reading,
      ...(Array.isArray(entry.alternateReadings) ? entry.alternateReadings : []),
      ...(Array.isArray(entry.variants) ? entry.variants : [])
    ].map(normalizeJapanese).filter(Boolean))];
  }

  function createVocabularyPool(vocabulary, { locale = "en" } = {}) {
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
      .map((entry) => {
        const canonicalMeaning = typeof entry.canonicalMeaning === "string"
          ? entry.canonicalMeaning
          : entry.meaning;

        return {
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
          canonicalMeaning,
          acceptedTranslationAnswers: createTranslationAnswers(entry, locale),
          acceptedAnswersByLocale: createAcceptedAnswersByLocale(entry, locale),
          acceptedJapaneseAnswers: getJapaneseAnswers(entry),
          audio: typeof entry.audio === "string" &&
            /^assets\/voices\/vocab\/[a-z0-9-]+\.m4a$/u.test(entry.audio)
            ? entry.audio
            : undefined
        };
      });
    const equivalentsByMeaning = new Map();

    for (const entry of entries) {
      const key = `${entry.partOfSpeech}\u0000${normalizeEnglish(entry.canonicalMeaning)}`;
      const equivalents = equivalentsByMeaning.get(key) || new Set();

      for (const answer of entry.acceptedJapaneseAnswers) {
        equivalents.add(answer);
      }

      equivalentsByMeaning.set(key, equivalents);
    }

    return entries.map((entry) => {
      const key = `${entry.partOfSpeech}\u0000${normalizeEnglish(entry.canonicalMeaning)}`;

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
      const normalizedAnswer = normalizeTranslation(answer, exercise.locale || "en");
      const correct = Object.entries(exercise.acceptedAnswersByLocale || {}).some(([
        locale,
        acceptedAnswers
      ]) => {
        return acceptedAnswers.includes(normalizeTranslation(answer, locale));
      });

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
    normalizeTranslation,
    normalizeEnglish,
    normalizeJapanese,
    findContextualVocabularyIds,
    createEnglishAnswers,
    createVocabularyPool,
    getNextDirection,
    chooseExercise,
    gradeAnswer
  });
})(globalThis);
