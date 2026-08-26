import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

await import("../vocabulary.js");

const {
  directions,
  normalizeEnglish,
  normalizeTranslation,
  normalizeJapanese,
  createEnglishAnswers,
  createVocabularyPool,
  getNextDirection,
  chooseExercise,
  gradeAnswer
} = globalThis.JlptN5Vocabulary;

test("vocabulary normalization is case, width, whitespace, and punctuation tolerant", () => {
  assert.equal(normalizeEnglish("  Older BROTHER! "), "older brother");
  assert.equal(normalizeEnglish("bread & butter"), "bread and butter");
  assert.equal(normalizeJapanese(" ～ ご　ろ。 "), "ごろ");
  assert.equal(normalizeJapanese("Ｎ"), "n");
});

test("the vocabulary pool carries only packaged M4A narration paths", () => {
  const baseEntry = {
    term: "雨",
    reading: "あめ",
    meaning: "rain",
    scope: "core"
  };
  const [narrated] = createVocabularyPool([{
    ...baseEntry,
    id: "rain",
    audio: "assets/voices/vocab/rain.m4a"
  }]);
  const [legacyWav] = createVocabularyPool([{
    ...baseEntry,
    id: "rain-wav",
    audio: "assets/voices/vocab/rain.wav"
  }]);

  assert.equal(narrated.audio, "assets/voices/vocab/rain.m4a");
  assert.equal(legacyWav.audio, undefined);
});

test("curated English gloss alternatives are accepted mechanically", () => {
  assert.deepEqual(createEnglishAnswers("to meet, to see"), [
    "to meet to see",
    "meet to see",
    "to meet",
    "meet",
    "to see",
    "see"
  ]);
  assert.ok(createEnglishAnswers("(my) older brother (humble)").includes("older brother"));
  assert.ok(createEnglishAnswers("fall (season)").includes("fall"));
});

test("French vocabulary grading accepts accents, apostrophes, articles, and curated equivalents", () => {
  const [entry] = createVocabularyPool([{
    id: "school",
    term: "学校",
    reading: "がっこう",
    meaning: "école",
    canonicalMeaning: "school",
    acceptedTranslationAnswers: ["école", "l’école"],
    scope: "core",
    partOfSpeech: "noun"
  }], { locale: "fr" });
  const exercise = {
    ...chooseExercise([entry], "school", directions.japaneseToEnglish),
    locale: "fr"
  };

  assert.equal(normalizeTranslation(" ÉCOLE ! ", "fr"), "ecole");
  assert.equal(normalizeTranslation(" SŒUR ! ", "fr"), "soeur");
  assert.equal(gradeAnswer(exercise, "école").correct, true);
  assert.equal(gradeAnswer(exercise, "ecole").correct, true);
  assert.equal(gradeAnswer(exercise, "l’école").correct, true);
  assert.equal(gradeAnswer(exercise, "school").correct, true);
  assert.equal(gradeAnswer(exercise, "université").correct, false);
});

test("localized vocabulary grading accepts a gloss without its explanatory parentheses", () => {
  const [entry] = createVocabularyPool([{
    id: "takes",
    term: "かかる",
    reading: "かかる",
    meaning: "prendre (temps, argent)",
    canonicalMeaning: "it takes (time, money)",
    acceptedTranslationAnswers: ["prendre (temps, argent)"],
    scope: "core",
    partOfSpeech: "verb"
  }], { locale: "fr" });
  const exercise = {
    ...chooseExercise([entry], "takes", directions.japaneseToEnglish),
    locale: "fr"
  };

  assert.equal(gradeAnswer(exercise, "prendre").correct, true);
});

test("French vocabulary recognition accepts the canonical English gloss", () => {
  const [entry] = createVocabularyPool([{
    id: "take-photo",
    term: "撮る",
    reading: "とる",
    meaning: "prendre une photo ; filmer",
    canonicalMeaning: "to take (a photo), to make (a film)",
    acceptedTranslationAnswers: ["prendre une photo", "filmer"],
    scope: "core",
    partOfSpeech: "verb"
  }], { locale: "fr" });
  const exercise = {
    ...chooseExercise([entry], "take-photo", directions.japaneseToEnglish),
    locale: "fr"
  };

  assert.equal(gradeAnswer(exercise, "to take a photo").correct, true);
  assert.equal(gradeAnswer(exercise, "take a photo").correct, true);
  assert.equal(gradeAnswer(exercise, "to borrow").correct, false);
});

test("English vocabulary recognition accepts the French translation", () => {
  const [entry] = createVocabularyPool([{
    id: "take-photo",
    term: "撮る",
    reading: "とる",
    meaning: "to take (a photo), to make (a film)",
    translations: {
      en: { meaning: "to take (a photo), to make (a film)" },
      fr: {
        meaning: "prendre une photo ; filmer",
        acceptedAnswers: ["prendre une photo", "filmer"]
      }
    },
    scope: "core",
    partOfSpeech: "verb"
  }], { locale: "en" });
  const exercise = {
    ...chooseExercise([entry], "take-photo", directions.japaneseToEnglish),
    locale: "en"
  };

  assert.equal(gradeAnswer(exercise, "prendre une photo").correct, true);
  assert.equal(gradeAnswer(exercise, "filmer").correct, true);
  assert.equal(gradeAnswer(exercise, "emprunter").correct, false);
});

test("vocabulary recognition accepts a newly configured language without grading changes", () => {
  const [entry] = createVocabularyPool([{
    id: "take-photo",
    term: "撮る",
    reading: "とる",
    meaning: "prendre une photo ; filmer",
    canonicalMeaning: "to take (a photo), to make (a film)",
    translations: {
      en: { meaning: "to take (a photo), to make (a film)" },
      fr: {
        meaning: "prendre une photo ; filmer",
        acceptedAnswers: ["prendre une photo", "filmer"]
      },
      es: {
        meaning: "hacer una foto; filmar",
        acceptedAnswers: ["hacer una foto", "filmar"]
      }
    },
    scope: "core",
    partOfSpeech: "verb"
  }], { locale: "fr" });
  const exercise = {
    ...chooseExercise([entry], "take-photo", directions.japaneseToEnglish),
    locale: "fr"
  };

  assert.equal(gradeAnswer(exercise, "hacer una foto").correct, true);
  assert.equal(gradeAnswer(exercise, "filmar").correct, true);
});

test("the vocabulary pool contains the complete curated inventory", async () => {
  const vocabulary = JSON.parse(await readFile(
    new URL("../data/jlpt-n5-vocabulary.json", import.meta.url),
    "utf8"
  ));
  const pool = createVocabularyPool(vocabulary);

  assert.equal(pool.length, 826);
  assert.equal(new Set(pool.map(({ vocabularyId }) => vocabularyId)).size, 826);
  assert.equal(pool.every(({ acceptedAnswersByLocale }) => {
    return acceptedAnswersByLocale.en.length > 0;
  }), true);
  assert.equal(pool.every(({ acceptedJapaneseAnswers }) => acceptedJapaneseAnswers.length > 0), true);

  const dayCounter = pool.find(({ vocabularyId }) => {
    return vocabularyId === "vocab-a759a7d58008";
  });
  const dayCounterRecall = chooseExercise(
    pool,
    dayCounter.vocabularyId,
    directions.englishToJapanese
  );

  assert.deepEqual(dayCounter.alternateReadings, ["～か"]);
  assert.equal(gradeAnswer(dayCounterRecall, "にち").correct, true);
  assert.equal(gradeAnswer(dayCounterRecall, "か").correct, true);

  const expectedReversePrompts = new Map([
    ["vocab-f14c108fc553", "over there (away from both people; casual)"],
    ["vocab-c20b735fa41d", "how (polite); in what way"],
    ["vocab-9567eaf8fe9b", "student (especially at college or university)"],
    ["vocab-5d786dbb29fc", "pupil; school student"],
    ["vocab-3c0f1d5e3156", "that way; over there (near the listener; polite)"],
    ["vocab-5e5184c8d19e", "that way; over there (near the listener; casual)"],
    ["vocab-bffa6c2157d5", "test; quiz"],
    ["vocab-64a7f6bc77c9", "who (polite)"],
    ["vocab-0c4d68e2ec4d", "exam; examination"]
  ]);

  for (const [vocabularyId, prompt] of expectedReversePrompts) {
    assert.equal(
      chooseExercise(pool, vocabularyId, directions.englishToJapanese).prompt,
      prompt
    );
  }

  const dinnerRecall = chooseExercise(
    pool,
    "vocab-696613003517",
    directions.englishToJapanese
  );
  const zeroRecall = chooseExercise(
    pool,
    "vocab-8b4d4e4df6e7",
    directions.englishToJapanese
  );

  assert.equal(gradeAnswer(dinnerRecall, "夕飯").correct, true);
  assert.equal(gradeAnswer(zeroRecall, "零").correct, true);

  for (const entry of pool) {
    const recognition = chooseExercise(
      pool,
      entry.vocabularyId,
      directions.japaneseToEnglish
    );
    const recall = chooseExercise(
      pool,
      entry.vocabularyId,
      directions.englishToJapanese
    );

    assert.equal(gradeAnswer(recognition, entry.meaning).correct, true, entry.vocabularyId);
    assert.equal(gradeAnswer(recall, entry.term).correct, true, entry.vocabularyId);
    assert.equal(gradeAnswer(recall, entry.reading).correct, true, entry.vocabularyId);
  }

  for (const sourceEntry of vocabulary.filter(({ acceptedAnswers }) => {
    return Array.isArray(acceptedAnswers);
  })) {
    const entry = pool.find(({ vocabularyId }) => vocabularyId === sourceEntry.id);
    const recognition = chooseExercise(
      pool,
      sourceEntry.id,
      directions.japaneseToEnglish
    );
    assert.equal(sourceEntry.acceptedAnswers.length > 0, true);
    assert.equal(sourceEntry.acceptedAnswers.every((answer) => {
      return typeof answer === "string" && answer.trim();
    }), true, `${sourceEntry.id} has an invalid hidden answer`);
    const normalizedAliases = sourceEntry.acceptedAnswers.map(normalizeEnglish);

    assert.equal(
      new Set(normalizedAliases).size,
      normalizedAliases.length,
      `${sourceEntry.id} has duplicate hidden answers`
    );
    assert.equal(recognition.solution, sourceEntry.meaning);

    for (const answer of sourceEntry.acceptedAnswers) {
      assert.equal(
        gradeAnswer(recognition, answer).correct,
        true,
        `${sourceEntry.id} should accept ${answer}`
      );
    }
  }
});

test("every curated French vocabulary alias is unique and accepted", async () => {
  const [vocabulary, frenchCatalog] = await Promise.all([
    readFile(new URL("../data/jlpt-n5-vocabulary.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../data/locales/fr/vocabulary.json", import.meta.url), "utf8").then(JSON.parse)
  ]);
  const localizedVocabulary = vocabulary.map((entry) => ({
    ...entry,
    canonicalMeaning: entry.meaning,
    meaning: frenchCatalog[entry.id].meaning,
    acceptedTranslationAnswers: frenchCatalog[entry.id].acceptedAnswers,
    translations: {
      en: {
        meaning: entry.meaning,
        acceptedAnswers: entry.acceptedAnswers
      },
      fr: frenchCatalog[entry.id]
    }
  }));
  const pool = createVocabularyPool(localizedVocabulary, { locale: "fr" });
  const expectedReversePrompts = new Map([
    ["vocab-f5f2c2dca175", "café (boisson)"],
    ["vocab-caa3749b479b", "café (établissement)"],
    ["vocab-c7012a730acb", "appartement dans un petit immeuble locatif"],
    ["vocab-27c6bc8b49e4", "appartement en résidence moderne ; immeuble résidentiel"],
    ["vocab-ca8d0efe19a3", "bibliothèque"],
    ["vocab-1ff0ae81b873", "étagère à livres"],
    ["vocab-3c687e40b035", "carte géographique ; plan"],
    ["vocab-a586e52ce913", "carte"],
    ["vocab-fbb71c77ac0e", "salle de classe"],
    ["vocab-387efc2c5389", "classe ; groupe"],
    ["vocab-032ac6757485", "commencer (intransitif)"],
    ["vocab-79261a065ba5", "commencer (transitif)"],
    ["vocab-bffa6c2157d5", "test ; contrôle"],
    ["vocab-0c4d68e2ec4d", "examen"]
  ]);

  assert.ok(
    frenchCatalog["vocab-367ca325e078"].acceptedAnswers.includes("le premier jour"),
    "ついたち should accept le premier jour"
  );

  for (const [vocabularyId, prompt] of expectedReversePrompts) {
    assert.equal(
      chooseExercise(pool, vocabularyId, directions.englishToJapanese).prompt,
      prompt
    );
  }

  for (const entry of pool) {
    const aliases = frenchCatalog[entry.vocabularyId].acceptedAnswers;
    const normalizedAliases = aliases.map((answer) => normalizeTranslation(answer, "fr"));
    const recognition = {
      ...chooseExercise(
        pool,
        entry.vocabularyId,
        directions.japaneseToEnglish
      ),
      locale: "fr"
    };

    assert.equal(
      new Set(normalizedAliases).size,
      normalizedAliases.length,
      `${entry.vocabularyId} has duplicate French answers`
    );

    for (const answer of aliases) {
      assert.equal(
        gradeAnswer(recognition, answer).correct,
        true,
        `${entry.vocabularyId} should accept ${answer}`
      );
    }

    for (const answer of aliases.filter((candidate) => candidate.includes("œ"))) {
      const keyboardAnswer = answer.replace(/œ/gu, "oe");

      assert.equal(
        gradeAnswer(recognition, keyboardAnswer).correct,
        true,
        `${entry.vocabularyId} should accept ${keyboardAnswer} without requiring the œ ligature`
      );
    }
  }
});

test("Japanese-to-English grading accepts individual curated glosses", () => {
  const [entry] = createVocabularyPool([{
    id: "meet",
    term: "会う",
    reading: "あう",
    meaning: "to meet, to see",
    scope: "core",
    partOfSpeech: "verb"
  }]);
  const exercise = chooseExercise(
    [entry],
    "meet",
    directions.japaneseToEnglish
  );

  assert.equal(gradeAnswer(exercise, "meet").correct, true);
  assert.equal(gradeAnswer(exercise, "to see!").correct, true);
  assert.equal(gradeAnswer(exercise, "meeting").correct, false);
});

test("hidden English vocabulary aliases are accepted without changing the displayed answer", () => {
  const [entry] = createVocabularyPool([{
    id: "grandfather",
    term: "おじいさん",
    reading: "おじいさん",
    meaning: "grandfather, male senior citizen",
    acceptedAnswers: ["granddad", "grand dad", "grandpa", "old man"],
    scope: "core",
    partOfSpeech: "noun"
  }]);
  const exercise = chooseExercise(
    [entry],
    "grandfather",
    directions.japaneseToEnglish
  );

  assert.equal(exercise.solution, "grandfather, male senior citizen");
  assert.equal(gradeAnswer(exercise, "grand dad").correct, true);
  assert.equal(gradeAnswer(exercise, "old man").correct, true);
  assert.equal(gradeAnswer(exercise, "young man").correct, false);
});

test("English-to-Japanese grading accepts readings, variants, and unambiguous synonyms", () => {
  const pool = createVocabularyPool([
    {
      id: "milk-kanji",
      term: "牛乳",
      reading: "ぎゅうにゅう",
      meaning: "milk",
      scope: "core",
      partOfSpeech: "noun"
    },
    {
      id: "milk-katakana",
      term: "ミルク",
      reading: "みるく",
      meaning: "milk",
      scope: "core",
      partOfSpeech: "noun"
    },
    {
      id: "blue-noun",
      term: "青",
      reading: "あお",
      meaning: "blue",
      scope: "core",
      partOfSpeech: "noun"
    },
    {
      id: "blue-adjective",
      term: "青い",
      reading: "あおい",
      meaning: "blue",
      scope: "core",
      partOfSpeech: "adjective"
    }
  ]);
  const milk = chooseExercise(pool, "milk-kanji", directions.englishToJapanese);
  const blue = chooseExercise(pool, "blue-noun", directions.englishToJapanese);

  assert.equal(gradeAnswer(milk, "牛乳").correct, true);
  assert.equal(gradeAnswer(milk, "ぎゅうにゅう").correct, true);
  assert.equal(gradeAnswer(milk, "ミルク").correct, true);
  assert.equal(gradeAnswer(blue, "あお").correct, true);
  assert.equal(gradeAnswer(blue, "青い").correct, false);
});

test("vocabulary directions alternate independently from other sections", () => {
  const vocabularyAttempt = { section: "vocabulary", outcome: "good" };

  assert.equal(getNextDirection([]), directions.japaneseToEnglish);
  assert.equal(getNextDirection([
    { section: "katakana", kanaRatings: [{ kana: "コ", outcome: "good" }] }
  ]), directions.japaneseToEnglish);
  assert.deepEqual(
    Array.from({ length: 4 }, (_, count) => {
      return getNextDirection(Array(count).fill(vocabularyAttempt));
    }),
    [
      directions.japaneseToEnglish,
      directions.englishToJapanese,
      directions.japaneseToEnglish,
      directions.englishToJapanese
    ]
  );
});
