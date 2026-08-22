(function initializeVoicePaths(global) {
  "use strict";

  const safeVoiceSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

  function getConverter(converter) {
    const resolvedConverter = converter || global.wanakana;

    if (typeof resolvedConverter?.toRomaji !== "function") {
      throw new Error("WanaKana must load before vocabulary voice paths are used.");
    }

    return resolvedConverter;
  }

  function createVocabularyReadingSlug(reading, converter) {
    const normalizedReading = String(reading || "")
      .normalize("NFKC")
      .replace(/[～〜]/gu, "")
      .trim();
    const slug = getConverter(converter)
      .toRomaji(normalizedReading)
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[’']/gu, "-")
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-+|-+$/gu, "");

    if (!safeVoiceSlug.test(slug)) {
      throw new Error(`Cannot create a safe voice filename from reading: ${reading}`);
    }

    return slug;
  }

  function getVocabularyVoiceSlug(entry, converter) {
    const readingSlug = createVocabularyReadingSlug(entry?.reading, converter);

    if (entry?.voiceSlug === undefined) {
      return readingSlug;
    }

    if (typeof entry.voiceSlug !== "string" || !safeVoiceSlug.test(entry.voiceSlug)) {
      throw new Error(`${entry?.id || "Vocabulary entry"}: voiceSlug must be a safe slug.`);
    }

    return entry.voiceSlug;
  }

  function getVocabularyVoicePath(entry, converter) {
    return `assets/voices/vocab/${getVocabularyVoiceSlug(entry, converter)}.m4a`;
  }

  function validateVocabularyVoiceSlugs(vocabulary, converter) {
    if (!Array.isArray(vocabulary)) {
      throw new Error("Vocabulary voice paths need an array.");
    }

    const entriesByReadingSlug = new Map();
    const entriesByVoiceSlug = new Map();

    for (const entry of vocabulary) {
      const readingSlug = createVocabularyReadingSlug(entry?.reading, converter);
      const voiceSlug = getVocabularyVoiceSlug(entry, converter);
      const readingEntries = entriesByReadingSlug.get(readingSlug) || [];

      readingEntries.push(entry);
      entriesByReadingSlug.set(readingSlug, readingEntries);

      const existingEntry = entriesByVoiceSlug.get(voiceSlug);

      if (existingEntry) {
        throw new Error(
          `${entry.id}: voice filename ${voiceSlug}.m4a is already used by ${existingEntry.id}.`
        );
      }

      entriesByVoiceSlug.set(voiceSlug, entry);
    }

    for (const [readingSlug, entries] of entriesByReadingSlug) {
      if (entries.length === 1 && entries[0].voiceSlug !== undefined) {
        throw new Error(`${entries[0].id}: voiceSlug is unnecessary for a unique reading.`);
      }

      if (entries.length > 1) {
        for (const entry of entries) {
          if (
            typeof entry.voiceSlug !== "string" ||
            !entry.voiceSlug.startsWith(`${readingSlug}-`)
          ) {
            throw new Error(
              `${entry.id}: reading collision ${readingSlug} needs a semantic voiceSlug.`
            );
          }
        }
      }
    }

    return entriesByVoiceSlug;
  }

  global.JlptN5VoicePaths = Object.freeze({
    createVocabularyReadingSlug,
    getVocabularyVoiceSlug,
    getVocabularyVoicePath,
    validateVocabularyVoiceSlugs
  });
})(globalThis);
