const supportedContentLocales = Object.freeze(["fr"]);

export function splitPromptTokens(text) {
  return String(text || "")
    .split(/(\s+|[.,!?;:'"’«»()]+)/u)
    .filter((segment) => segment && !/^(?:\s+|[.,!?;:'"’«»()]+)$/u.test(segment));
}

function normalizeLocalized(value, locale) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase(locale);
}

function getLanguageName(locale) {
  return new Intl.DisplayNames(["en"], { type: "language" }).of(locale) || locale;
}

function isWordCharacter(character) {
  return Boolean(character && /[\p{L}\p{N}]/u.test(character));
}

export function hasPromptHint(text, hint, locale = "fr") {
  const normalizedText = normalizeLocalized(text, locale);
  const normalizedHint = normalizeLocalized(hint, locale);
  let offset = normalizedText.indexOf(normalizedHint);

  while (normalizedHint && offset >= 0) {
    const before = normalizedText[offset - 1];
    const after = normalizedText[offset + normalizedHint.length];
    const needsBoundaryBefore = isWordCharacter(normalizedHint[0]);
    const needsBoundaryAfter = isWordCharacter(normalizedHint[normalizedHint.length - 1]);

    if (
      (!needsBoundaryBefore || !isWordCharacter(before)) &&
      (!needsBoundaryAfter || !isWordCharacter(after))
    ) {
      return true;
    }

    offset = normalizedText.indexOf(normalizedHint, offset + 1);
  }

  return false;
}

function validateExactIds(kind, sources, localizations, errors) {
  const expectedIds = new Set(sources.map(({ id }) => id));
  const actualIds = Object.keys(localizations || {});

  for (const id of expectedIds) {
    if (!Object.hasOwn(localizations || {}, id)) {
      errors.push(`${kind}: missing ${id}.`);
    }
  }

  for (const id of actualIds) {
    if (!expectedIds.has(id)) {
      errors.push(`${kind}: unknown ${id}.`);
    }
  }
}

function isNonemptyString(value) {
  return typeof value === "string" && Boolean(value.trim());
}

function validateExercises(sources, localizations, errors, locale) {
  const language = getLanguageName(locale);
  validateExactIds("exercises", sources, localizations, errors);

  for (const source of sources) {
    const localized = localizations[source.id];

    if (!localized) {
      continue;
    }

    if (!isNonemptyString(localized.translation)) {
      errors.push(`${source.id}: ${language} translation is blank.`);
    }

    const sourceHints = source.type === "production" ? source.promptVocabularyHints : undefined;
    const localizedHints = localized.promptVocabularyHints;

    if (!sourceHints) {
      if (localizedHints !== undefined) {
        errors.push(`${source.id}: recognition exercises cannot have localized hints.`);
      }
      continue;
    }

    if (!Array.isArray(localizedHints) || localizedHints.length !== sourceHints.length) {
      errors.push(`${source.id}: localized hint count does not match.`);
      continue;
    }

    for (const [index, hint] of localizedHints.entries()) {
      const sourceHint = sourceHints[index];

      if (
        !isNonemptyString(hint?.word) ||
        !hasPromptHint(localized.translation, hint.word, locale)
      ) {
        errors.push(`${source.id}: localized hint ${index + 1} is not a prompt token.`);
      }

      if (
        !Array.isArray(hint?.vocabularyIds) ||
        hint.vocabularyIds.join("\0") !== sourceHint.vocabularyIds.join("\0")
      ) {
        errors.push(`${source.id}: localized hint ${index + 1} changed vocabulary ids.`);
      }
    }
  }
}

function validateGrammar(sources, localizations, errors, locale) {
  const language = getLanguageName(locale);
  validateExactIds("grammar", sources, localizations, errors);

  for (const source of sources) {
    const localized = localizations[source.id];

    if (localized && (!isNonemptyString(localized.name) || !isNonemptyString(localized.meaning))) {
      errors.push(`${source.id}: ${language} grammar name and meaning are required.`);
    }
  }
}

function validateVocabulary(sources, localizations, errors, locale) {
  const language = getLanguageName(locale);
  validateExactIds("vocabulary", sources, localizations, errors);

  for (const source of sources) {
    const localized = localizations[source.id];

    if (!localized) {
      continue;
    }

    if (!isNonemptyString(localized.meaning)) {
      errors.push(`${source.id}: ${language} vocabulary meaning is required.`);
    }

    if (
      !Array.isArray(localized.acceptedAnswers) ||
      localized.acceptedAnswers.length === 0 ||
      localized.acceptedAnswers.some((answer) => !isNonemptyString(answer))
    ) {
      errors.push(`${source.id}: ${language} accepted answers are required.`);
    } else if (
      new Set(localized.acceptedAnswers.map((answer) => {
        return normalizeLocalized(answer, locale);
      })).size !==
      localized.acceptedAnswers.length
    ) {
      errors.push(`${source.id}: ${language} accepted answers must be unique.`);
    }
  }
}

function validateKanji(sources, localizations, errors, locale) {
  const language = getLanguageName(locale);
  validateExactIds("kanji", sources, localizations, errors);

  for (const source of sources) {
    if (localizations[source.id] && !isNonemptyString(localizations[source.id].meaning)) {
      errors.push(`${source.id}: ${language} kanji meaning is required.`);
    }
  }
}

function validateVocabularyExamples(sources, localizations, errors, locale) {
  const language = getLanguageName(locale);
  const keyedSources = sources.map(({ vocabularyId }) => ({ id: vocabularyId }));

  validateExactIds("vocabulary examples", keyedSources, localizations, errors);

  for (const source of keyedSources) {
    if (!isNonemptyString(localizations?.[source.id]?.translation)) {
      errors.push(`${source.id}: ${language} vocabulary example translation is required.`);
    }
  }
}

function placeholders(value) {
  return [...String(value).matchAll(/\{([a-zA-Z][a-zA-Z0-9]*)\}/gu)]
    .map((match) => match[1])
    .sort();
}

export function validateUiCatalogs(english, localized, locale = "fr") {
  const errors = [];
  const language = getLanguageName(locale);
  const englishKeys = Object.keys(english);
  const localizedKeys = Object.keys(localized);

  for (const key of englishKeys) {
    if (!Object.hasOwn(localized, key)) {
      errors.push(`ui: ${language} catalogue is missing ${key}.`);
      continue;
    }

    const englishValue = english[key];
    const localizedValue = localized[key];
    const englishVariants = typeof englishValue === "string" ? { message: englishValue } : englishValue;
    const localizedVariants = typeof localizedValue === "string"
      ? { message: localizedValue }
      : localizedValue;

    if (!englishVariants || !localizedVariants || typeof englishVariants !== "object" ||
        typeof localizedVariants !== "object") {
      errors.push(`ui: ${key} has an invalid value.`);
      continue;
    }

    for (const [variant, message] of Object.entries(englishVariants)) {
      if (!isNonemptyString(localizedVariants[variant])) {
        errors.push(`ui: ${key}.${variant} is missing in ${language}.`);
      } else if (
        placeholders(message).join("\0") !== placeholders(localizedVariants[variant]).join("\0")
      ) {
        errors.push(`ui: ${key}.${variant} changed interpolation placeholders.`);
      }
    }
  }

  for (const key of localizedKeys) {
    if (!Object.hasOwn(english, key)) {
      errors.push(`ui: ${language} catalogue has unknown ${key}.`);
    }
  }

  return errors;
}

export function validateLocalizedContent({
  locale,
  exercises,
  grammar,
  vocabulary,
  kanji,
  vocabularyExamples = [],
  localizations
}) {
  const errors = [];

  validateExercises(exercises, localizations.exercises, errors, locale);
  validateGrammar(grammar, localizations.grammar, errors, locale);
  validateVocabulary(vocabulary, localizations.vocabulary, errors, locale);
  validateKanji(kanji, localizations.kanji, errors, locale);
  if (vocabularyExamples.length > 0) {
    validateVocabularyExamples(
      vocabularyExamples,
      localizations["vocabulary-examples"],
      errors,
      locale
    );
  }
  return errors;
}

export function validateFrenchContent(options) {
  return validateLocalizedContent({ ...options, locale: "fr" });
}

export { supportedContentLocales };
