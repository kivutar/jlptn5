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

  function containsTranslationPhrase(text, phrase) {
    if (!text || !phrase) {
      return false;
    }

    const searchableText = text.replace(/'/gu, " ");
    const searchablePhrase = phrase.replace(/'/gu, " ");

    return ` ${searchableText} `.includes(` ${searchablePhrase} `);
  }

  function replaceTranslationWord(answer, wordIndex, replacements) {
    const words = answer.split(" ");

    return replacements.map((replacement) => {
      const inflectedWords = [...words];

      inflectedWords[wordIndex] = replacement;
      return inflectedWords.join(" ");
    });
  }

  function createEnglishVerbForms(word) {
    const irregularForms = {
      be: ["am", "is", "are", "was", "were", "been", "being"],
      become: ["became", "become", "becoming"],
      begin: ["began", "begun", "beginning"],
      bring: ["brought", "bringing"],
      buy: ["bought", "buying"],
      come: ["came", "coming"],
      do: ["does", "did", "done", "doing"],
      drink: ["drank", "drunk", "drinking"],
      eat: ["ate", "eaten", "eating"],
      feel: ["felt", "feeling"],
      find: ["found", "finding"],
      get: ["got", "gotten", "getting"],
      give: ["gave", "given", "giving"],
      go: ["goes", "went", "gone", "going"],
      have: ["has", "had", "having"],
      hear: ["heard", "hearing"],
      know: ["knew", "known", "knowing"],
      leave: ["left", "leaving"],
      make: ["made", "making"],
      meet: ["met", "meeting"],
      read: ["read", "reading"],
      run: ["ran", "running"],
      say: ["said", "saying"],
      see: ["saw", "seen", "seeing"],
      sit: ["sat", "sitting"],
      sleep: ["slept", "sleeping"],
      speak: ["spoke", "spoken", "speaking"],
      stand: ["stood", "standing"],
      swim: ["swam", "swum", "swimming"],
      take: ["took", "taken", "taking"],
      teach: ["taught", "teaching"],
      tell: ["told", "telling"],
      think: ["thought", "thinking"],
      understand: ["understood", "understanding"],
      wake: ["woke", "woken", "waking"],
      wear: ["wore", "worn", "wearing"],
      write: ["wrote", "written", "writing"]
    };
    const forms = new Set([word, ...(irregularForms[word] || [])]);

    if (word.endsWith("y") && !/[aeiou]y$/u.test(word)) {
      forms.add(`${word.slice(0, -1)}ies`);
      forms.add(`${word.slice(0, -1)}ied`);
    } else {
      forms.add(/(?:s|sh|ch|x|z|o)$/u.test(word) ? `${word}es` : `${word}s`);
      forms.add(word.endsWith("e") ? `${word}d` : `${word}ed`);
    }

    forms.add(
      word.endsWith("ie")
        ? `${word.slice(0, -2)}ying`
        : word.endsWith("e") && !word.endsWith("ee")
          ? `${word.slice(0, -1)}ing`
          : `${word}ing`
    );
    return [...forms];
  }

  function createFrenchVerbForms(word) {
    const irregularForms = {
      aller: ["vais", "vas", "va", "allons", "allez", "vont", "allais", "allait", "alle"],
      avoir: ["ai", "as", "a", "avons", "avez", "ont", "avais", "avait", "eu"],
      boire: ["bois", "boit", "buvons", "buvez", "boivent", "bu"],
      devoir: ["dois", "doit", "devons", "devez", "doivent", "du"],
      dire: ["dis", "dit", "disons", "dites", "disent"],
      dormir: ["dors", "dort", "dormons", "dormez", "dorment", "dormi"],
      ecrire: ["ecris", "ecrit", "ecrivons", "ecrivez", "ecrivent"],
      etre: ["suis", "es", "est", "sommes", "etes", "sont", "etais", "etait", "ete"],
      faire: ["fais", "fait", "faisons", "faites", "font", "faisait"],
      lire: ["lis", "lit", "lisons", "lisez", "lisent", "lu"],
      mettre: ["mets", "met", "mettons", "mettez", "mettent", "mis"],
      partir: ["pars", "part", "partons", "partez", "partent", "parti"],
      pouvoir: ["peux", "peut", "pouvons", "pouvez", "peuvent", "pu"],
      prendre: ["prends", "prend", "prenons", "prenez", "prennent", "pris"],
      savoir: ["sais", "sait", "savons", "savez", "savent", "su"],
      sortir: ["sors", "sort", "sortons", "sortez", "sortent", "sorti"],
      venir: ["viens", "vient", "venons", "venez", "viennent", "venu"],
      voir: ["vois", "voit", "voyons", "voyez", "voient", "vu"],
      vouloir: ["veux", "veut", "voulons", "voulez", "veulent", "voulu"]
    };
    const reflexivePrefix = word.match(/^(?:s'|se )/u)?.[0] || "";
    const lemma = reflexivePrefix ? word.slice(reflexivePrefix.length) : word;
    const forms = new Set([lemma, ...(irregularForms[lemma] || [])]);

    if (lemma.endsWith("er")) {
      const stem = lemma.slice(0, -2);

      for (const ending of ["e", "es", "ons", "ez", "ent", "ais", "ait", "ions", "iez", "aient", "ant"]) {
        forms.add(`${stem}${ending}`);
      }
    } else if (lemma.endsWith("ir")) {
      const stem = lemma.slice(0, -2);

      for (const ending of ["is", "it", "issons", "issez", "issent", "i", "issant"]) {
        forms.add(`${stem}${ending}`);
      }
    } else if (lemma.endsWith("re")) {
      const stem = lemma.slice(0, -2);

      for (const ending of ["s", "", "ons", "ez", "ent", "u"]) {
        forms.add(`${stem}${ending}`);
      }
    }

    if (!reflexivePrefix) {
      return [...forms];
    }

    return [...forms].flatMap((form) => [form, `${reflexivePrefix}${form}`]);
  }

  function createRecognitionAnswers(entry, locale, acceptedAnswers) {
    const answers = new Set(acceptedAnswers);

    for (const answer of acceptedAnswers) {
      const words = answer.split(" ");

      if (["noun", "adjective"].includes(entry.partOfSpeech) && words.length > 0) {
        const lastIndex = words.length - 1;
        const lastWord = words[lastIndex];
        const plural = locale === "fr" && /(?:au|eu)$/u.test(lastWord)
          ? `${lastWord}x`
          : lastWord.endsWith("s")
            ? lastWord
            : `${lastWord}s`;

        for (const inflectedAnswer of replaceTranslationWord(answer, lastIndex, [plural])) {
          answers.add(inflectedAnswer);
        }
      }

      if (entry.partOfSpeech !== "verb" || words.length === 0) {
        continue;
      }

      const wordIndex = locale === "en" && words[0] === "to" ? 1 : 0;
      const word = words[wordIndex];

      if (!word) {
        continue;
      }

      const forms = locale === "fr"
        ? createFrenchVerbForms(word)
        : createEnglishVerbForms(word);

      for (const inflectedAnswer of replaceTranslationWord(answer, wordIndex, forms)) {
        answers.add(inflectedAnswer);
      }
    }

    return [...answers];
  }

  function findRecognizedVocabularyIds({
    tokens,
    answer,
    referenceTranslations,
    vocabulary,
    acceptedLocales,
    excludedVocabularyIds = []
  } = {}) {
    if (
      !Array.isArray(tokens) ||
      !referenceTranslations ||
      typeof referenceTranslations !== "object"
    ) {
      return [];
    }

    const entries = vocabulary instanceof Map
      ? [...vocabulary.values()]
      : Array.isArray(vocabulary)
        ? vocabulary
        : [];
    const entriesById = new Map(entries.map((entry) => [
      entry?.vocabularyId || entry?.id,
      entry
    ]));
    const excludedIds = new Set(excludedVocabularyIds);
    const targetIds = [...new Set(tokens
      .map(({ vocabularyId }) => vocabularyId)
      .filter((vocabularyId) => vocabularyId && !excludedIds.has(vocabularyId)))];
    const locales = [...new Set(
      (Array.isArray(acceptedLocales) ? acceptedLocales : Object.keys(referenceTranslations))
        .filter((locale) => typeof locale === "string" && referenceTranslations[locale])
    )];
    const normalizedAnswers = new Map(locales.map((locale) => [
      locale,
      normalizeTranslation(answer, locale)
    ]));
    const normalizedReferences = new Map(locales.map((locale) => [
      locale,
      normalizeTranslation(referenceTranslations[locale], locale)
    ]));

    return targetIds.filter((vocabularyId) => {
      const entry = entriesById.get(vocabularyId);

      if (!entry) {
        return false;
      }

      const acceptedAnswersByLocale = createAcceptedAnswersByLocale(
        entry,
        locales[0] || "en"
      );

      return locales.some((locale) => {
        const normalizedAnswer = normalizedAnswers.get(locale);
        const normalizedReference = normalizedReferences.get(locale);

        const recognitionAnswers = createRecognitionAnswers(
          entry,
          locale,
          acceptedAnswersByLocale[locale] || []
        );

        return recognitionAnswers.some((acceptedAnswer) => {
          return containsTranslationPhrase(normalizedAnswer, acceptedAnswer) &&
            containsTranslationPhrase(normalizedReference, acceptedAnswer);
        });
      });
    });
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

    const answers = new Set(
      locale === "en" ? createEnglishAnswers(entry.meaning) : []
    );
    const leadingArticle = {
      en: /^(?:to|a|an|the)\s+/u,
      fr: /^(?:(?:un|une|le|la|les|des|du)\s+|l')/u
    }[locale];

    const authoredValues = locale === "en"
      ? authoredAnswers || []
      : [entry.meaning, ...(authoredAnswers || [])];

    for (const value of authoredValues) {
      for (const gloss of [value, ...splitGlosses(value)]) {
        for (const candidate of [gloss, stripParentheticalText(gloss)]) {
          const normalized = normalizeTranslation(candidate, locale);

          if (normalized) {
            answers.add(normalized);

            if (leadingArticle) {
              answers.add(normalized.replace(leadingArticle, ""));
            }
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
          recognitionPrompt: typeof entry.recognitionPrompt === "string" &&
            entry.recognitionPrompt.trim()
            ? entry.recognitionPrompt
            : entry.term,
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
      prompt: japaneseToEnglish ? entry.recognitionPrompt : entry.meaning,
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
    findRecognizedVocabularyIds,
    createEnglishAnswers,
    createVocabularyPool,
    getNextDirection,
    chooseExercise,
    gradeAnswer
  });
})(globalThis);
