const supportedContentLocale = "fr";

export function splitPromptTokens(text) {
  return String(text || "")
    .split(/(\s+|[.,!?;:'"’«»()]+)/u)
    .filter((segment) => segment && !/^(?:\s+|[.,!?;:'"’«»()]+)$/u.test(segment));
}

function normalizeFrench(value) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase("fr");
}

function isWordCharacter(character) {
  return Boolean(character && /[\p{L}\p{N}]/u.test(character));
}

export function hasPromptHint(text, hint) {
  const normalizedText = normalizeFrench(text);
  const normalizedHint = normalizeFrench(hint);
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

function validateExercises(sources, localizations, errors) {
  validateExactIds("exercises", sources, localizations, errors);

  for (const source of sources) {
    const localized = localizations[source.id];

    if (!localized) {
      continue;
    }

    if (!isNonemptyString(localized.translation)) {
      errors.push(`${source.id}: French translation is blank.`);
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

      if (!isNonemptyString(hint?.word) || !hasPromptHint(localized.translation, hint.word)) {
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

function validateGrammar(sources, localizations, errors) {
  validateExactIds("grammar", sources, localizations, errors);

  for (const source of sources) {
    const localized = localizations[source.id];

    if (localized && (!isNonemptyString(localized.name) || !isNonemptyString(localized.meaning))) {
      errors.push(`${source.id}: French grammar name and meaning are required.`);
    }
  }
}

function validateVocabulary(sources, localizations, errors) {
  validateExactIds("vocabulary", sources, localizations, errors);

  for (const source of sources) {
    const localized = localizations[source.id];

    if (!localized) {
      continue;
    }

    if (!isNonemptyString(localized.meaning)) {
      errors.push(`${source.id}: French vocabulary meaning is required.`);
    }

    if (
      !Array.isArray(localized.acceptedAnswers) ||
      localized.acceptedAnswers.length === 0 ||
      localized.acceptedAnswers.some((answer) => !isNonemptyString(answer))
    ) {
      errors.push(`${source.id}: French accepted answers are required.`);
    } else if (
      new Set(localized.acceptedAnswers.map(normalizeFrench)).size !==
      localized.acceptedAnswers.length
    ) {
      errors.push(`${source.id}: French accepted answers must be unique.`);
    }
  }
}

function validateKanji(sources, localizations, errors) {
  validateExactIds("kanji", sources, localizations, errors);

  for (const source of sources) {
    if (localizations[source.id] && !isNonemptyString(localizations[source.id].meaning)) {
      errors.push(`${source.id}: French kanji meaning is required.`);
    }
  }
}

function placeholders(value) {
  return [...String(value).matchAll(/\{([a-zA-Z][a-zA-Z0-9]*)\}/gu)]
    .map((match) => match[1])
    .sort();
}

export function validateUiCatalogs(english, french) {
  const errors = [];
  const englishKeys = Object.keys(english);
  const frenchKeys = Object.keys(french);

  for (const key of englishKeys) {
    if (!Object.hasOwn(french, key)) {
      errors.push(`ui: French catalogue is missing ${key}.`);
      continue;
    }

    const englishValue = english[key];
    const frenchValue = french[key];
    const englishVariants = typeof englishValue === "string" ? { message: englishValue } : englishValue;
    const frenchVariants = typeof frenchValue === "string" ? { message: frenchValue } : frenchValue;

    if (!englishVariants || !frenchVariants || typeof englishVariants !== "object" ||
        typeof frenchVariants !== "object") {
      errors.push(`ui: ${key} has an invalid value.`);
      continue;
    }

    for (const [variant, message] of Object.entries(englishVariants)) {
      if (!isNonemptyString(frenchVariants[variant])) {
        errors.push(`ui: ${key}.${variant} is missing in French.`);
      } else if (
        placeholders(message).join("\0") !== placeholders(frenchVariants[variant]).join("\0")
      ) {
        errors.push(`ui: ${key}.${variant} changed interpolation placeholders.`);
      }
    }
  }

  for (const key of frenchKeys) {
    if (!Object.hasOwn(english, key)) {
      errors.push(`ui: French catalogue has unknown ${key}.`);
    }
  }

  return errors;
}

export function validateFrenchContent({
  exercises,
  grammar,
  vocabulary,
  kanji,
  localizations
}) {
  const errors = [];

  validateExercises(exercises, localizations.exercises, errors);
  validateGrammar(grammar, localizations.grammar, errors);
  validateVocabulary(vocabulary, localizations.vocabulary, errors);
  validateKanji(kanji, localizations.kanji, errors);
  return errors;
}

export { supportedContentLocale };
