import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { toHiragana, toKana, toKatakana } from "wanakana";
import { handleStaticRequest } from "../scripts/serve.js";

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");
const allowedCategories = new Set([
  "particle",
  "verb",
  "auxiliary",
  "adjective",
  "noun",
  "interjection",
  "adverb",
  "determiner",
  "conjunction"
]);
const glossCategories = new Set(["noun", "verb", "adjective", "adverb", "interjection"]);
const japaneseTokenPattern = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}々ー]/u;

async function readJson(path) {
  return JSON.parse(await readFile(join(rootDirectory, path), "utf8"));
}

function assertPreparedLesson(lesson, vocabularyById, kanjiById, kanjiByCharacter) {
  const japaneseText = lesson.type === "production" ? lesson.solution : lesson.text;

  assert.match(lesson.id, /^[a-z0-9-]+$/);
  assert.equal(typeof lesson.text, "string");
  assert.ok(lesson.text.length > 0);
  assert.equal(lesson.audio, `assets/voices/grammar/${lesson.id}.m4a`);
  assert.ok(Array.isArray(lesson.vocabularyIds));
  assert.equal(new Set(lesson.vocabularyIds).size, lesson.vocabularyIds.length);
  assert.ok(lesson.vocabularyIds.every((id) => vocabularyById.has(id)));
  assert.ok(Array.isArray(lesson.kanjiIds));
  assert.equal(new Set(lesson.kanjiIds).size, lesson.kanjiIds.length);
  assert.ok(lesson.kanjiIds.every((id) => kanjiById.has(id)));
  assert.deepEqual(
    lesson.kanjiIds,
    [...new Set(
      [...japaneseText]
        .map((character) => kanjiByCharacter.get(character)?.id)
        .filter(Boolean)
    )]
  );
  assert.ok(Array.isArray(lesson.tokens));
  assert.equal(
    lesson.tokens.map(({ surface }) => surface).join(""),
    japaneseText,
    `${lesson.id} tokens must reconstruct its Japanese content`
  );

  const usedVocabularyIds = new Set();

  for (const token of lesson.tokens) {
    assert.equal(typeof token.surface, "string");
    assert.equal(token.gloss, undefined);

    if (token.category) {
      assert.ok(allowedCategories.has(token.category));
    }

    if (token.vocabularyId) {
      assert.ok(vocabularyById.has(token.vocabularyId));
      assert.ok(lesson.vocabularyIds.includes(token.vocabularyId));
      usedVocabularyIds.add(token.vocabularyId);
    }

    if (glossCategories.has(token.category) && japaneseTokenPattern.test(token.surface)) {
      assert.ok(token.vocabularyId, `${lesson.id}:${token.surface} must link vocabulary`);
    }
  }

  assert.deepEqual(usedVocabularyIds, new Set(lesson.vocabularyIds));
}

test("generated lessons match their authored sources", async () => {
  const [
    introductionSource,
    exerciseSources,
    introduction,
    exercises,
    grammarPoints,
    vocabulary,
    kanji
  ] =
    await Promise.all([
      readJson("data/source/introduction.json"),
      readJson("data/source/exercises.json"),
      readJson("data/introduction.json"),
      readJson("data/exercises.json"),
      readJson("data/jlpt-n5-grammar.json"),
      readJson("data/jlpt-n5-vocabulary.json"),
      readJson("data/jlpt-n5-kanji.json")
    ]);
  const grammarPointIds = new Set(grammarPoints.map(({ id }) => id));
  const vocabularyById = new Map(vocabulary.map((entry) => [entry.id, entry]));
  const kanjiById = new Map(kanji.map((entry) => [entry.id, entry]));
  const kanjiByCharacter = new Map(kanji.map((entry) => [entry.character, entry]));

  assert.equal(introduction.id, introductionSource.id);
  assert.equal(introduction.text, introductionSource.text);
  assert.equal(introductionSource.vocabularyIds, undefined);
  assert.equal(introductionSource.kanjiIds, undefined);
  assert.equal(introductionSource.readings, undefined);
  assert.equal(introductionSource.glosses, undefined);
  assert.equal(introduction.tokenOverrides, undefined);
  assert.deepEqual(introduction.grammarPointIds, introductionSource.grammarPointIds);
  assert.deepEqual(introduction.grammarHighlights, [
    { grammarPointId: "no-possession", tokenStart: 5, tokenEnd: 6 },
    { grammarPointId: "e-direction", tokenStart: 7, tokenEnd: 8 },
    { grammarPointId: "mashou", tokenStart: 13, tokenEnd: 15 }
  ]);
  assertPreparedLesson(introduction, vocabularyById, kanjiById, kanjiByCharacter);
  assert.equal(exercises.length, exerciseSources.length);

  const sourceById = new Map(exerciseSources.map((exercise) => [exercise.id, exercise]));
  const ids = new Set([introduction.id]);

  for (const exercise of exercises) {
    const source = sourceById.get(exercise.id);

    assert.ok(source, `Missing source for ${exercise.id}`);
    assert.ok(!ids.has(exercise.id), `Duplicate lesson id ${exercise.id}`);
    ids.add(exercise.id);
    assert.equal(exercise.text, source.text);
    assert.equal(exercise.solution, source.solution);
    assert.equal(exercise.type, source.type);
    assert.deepEqual(exercise.promptVocabularyHints, source.promptVocabularyHints);
    assert.deepEqual(exercise.grammarPointIds, source.grammarPointIds);
    assert.equal(source.grammarHighlights, undefined);
    assert.equal(source.vocabularyIds, undefined);
    assert.equal(source.kanjiIds, undefined);
    assert.equal(source.readings, undefined);
    assert.equal(source.glosses, undefined);
    assert.equal(exercise.tokenOverrides, undefined);
    assert.ok(
      exercise.grammarPointIds.length >= (exercise.type === "production" ? 1 : 2)
    );
    assert.equal(new Set(exercise.grammarPointIds).size, exercise.grammarPointIds.length);
    assert.ok(exercise.grammarPointIds.every((id) => grammarPointIds.has(id)));
    assert.ok(Array.isArray(exercise.grammarHighlights));
    assert.ok(exercise.grammarHighlights.every(({ grammarPointId, tokenStart, tokenEnd }) => {
      return (
        exercise.grammarPointIds.includes(grammarPointId) &&
        Number.isInteger(tokenStart) &&
        Number.isInteger(tokenEnd) &&
        tokenStart >= 0 &&
        tokenStart < tokenEnd &&
        tokenEnd <= exercise.tokens.length
      );
    }));
    assertPreparedLesson(exercise, vocabularyById, kanjiById, kanjiByCharacter);
  }

  const productionExercises = exercises.filter(({ type }) => type === "production");

  assert.equal(productionExercises.length, 173);
  assert.ok(productionExercises.every(({ id }) => id.startsWith("production-")));
  assert.ok(productionExercises.every(({ text, promptVocabularyHints }) => {
    return (
      Array.isArray(promptVocabularyHints) &&
      promptVocabularyHints.length > 0 &&
      promptVocabularyHints.every(({ word, vocabularyIds }) => (
        new RegExp(`\\b${word}\\b`, "i").test(text) &&
        vocabularyIds.length > 0 &&
        vocabularyIds.every((id) => vocabularyById.has(id))
      ))
    );
  }));
  assert.ok(exercises.every(({ type }) => {
    return type === undefined || type === "production";
  }));

  const preparedById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const token = (exerciseId, surface) => {
    return preparedById.get(exerciseId).tokens.find((candidate) => candidate.surface === surface);
  };

  assert.equal(token("sister-not-eaten-yet", "何").reading, "なに");
  assert.equal(token("sister-not-eaten-yet", "い").category, "auxiliary");
  assert.equal(token("sister-not-eaten-yet", "い").vocabularyId, undefined);
  assert.equal(token("cat-under-table", "い").category, "verb");
  assert.ok(token("cat-under-table", "い").vocabularyId);
  assert.equal(token("library-weekday-hours", "開い").reading, "あい");
  assert.equal(token("swim-three-times-weekly", "週間").reading, "しゅうかん");
  assert.equal(token("swim-three-times-weekly", "回").reading, "かい");
  assert.equal(token("game-after-homework", "後").reading, "あと");
  assert.equal(token("siblings-study-english", "勉強").category, "noun");
  assert.ok(token("siblings-study-english", "勉強").vocabularyId);
  assert.ok(token("no-school-tomorrow", "あり").vocabularyId);
  assert.equal(token("been-to-japan", "日本").reading, "にほん");
  assert.equal(
    token("birthday-book-gift", "誕生").vocabularyId,
    token("birthday-book-gift", "日").vocabularyId
  );
  assert.ok(token("birthday-book-gift", "くれ").vocabularyId);
  assert.ok(token("order-hot-tea", "ください").vocabularyId);
  assert.equal(token("photography-and-camera", "の").category, "particle");
  assert.equal(token("photography-and-camera", "の").vocabularyId, undefined);
  assert.equal(token("photography-and-camera", "欲しい").category, "adjective");
  assert.ok(token("photography-and-camera", "欲しい").vocabularyId);
  assert.equal(token("meet-around-three", "時").reading, "じ");
  assert.ok(token("meet-around-three", "時").vocabularyId);
  assert.equal(token("meet-around-three", "ごろ").category, "particle");
  assert.equal(token("meet-around-three", "ごろ").vocabularyId, undefined);

  assert.deepEqual(
    preparedById.get("open-window-empty-room").grammarHighlights,
    [
      { grammarPointId: "kedo-contrast", tokenStart: 6, tokenEnd: 7 },
      { grammarPointId: "verb-nakatta", tokenStart: 11, tokenEnd: 13 },
      { grammarPointId: "te-aru-result-state", tokenStart: 3, tokenEnd: 6 },
      { grammarPointId: "dare", tokenStart: 8, tokenEnd: 9 },
      { grammarPointId: "question-word-mo", tokenStart: 9, tokenEnd: 10 }
    ]
  );
  assert.equal(token("spring-gets-warmer", "段々").category, "adverb");
  assert.ok(token("spring-gets-warmer", "段々").vocabularyId);
  assert.equal(
    token("umbrella-belongs-to-sister", "私").vocabularyId,
    "vocab-b6944a5fe271"
  );
  assert.ok(token("siblings-occupations", "員").vocabularyId);
  assert.ok(token("mother-teaches-cake-recipe", "作り方").vocabularyId);
  assert.equal(token("try-hot-soup", "熱そ").category, "adjective");
  assert.equal(token("try-hot-soup", "熱そ").reading, "あつそ");
  assert.ok(token("try-hot-soup", "熱そ").vocabularyId);
  assert.ok(token("try-hot-soup", "スープ").vocabularyId);
  assert.equal(token("umbrella-for-possible-rain", "しれ").category, "auxiliary");
  assert.equal(token("umbrella-for-possible-rain", "しれ").vocabularyId, undefined);
  assert.equal(token("walk-on-mild-day", "あまり").category, "adverb");
  assert.ok(token("walk-on-mild-day", "あまり").vocabularyId);
  assert.equal(token("pack-homework-to-remember", "よう").category, "auxiliary");
  assert.equal(token("pack-homework-to-remember", "よう").vocabularyId, undefined);
  assert.equal(token("snow-forecast-hearsay", "そう").category, "auxiliary");
  assert.equal(token("snow-forecast-hearsay", "そう").vocabularyId, undefined);
  assert.equal(token("breakfast-then-school", "ご飯").reading, "ごはん");
  assert.ok(token("breakfast-then-school", "ご飯").vocabularyId);
  assert.equal(token("brother-owns-three-cars", "台").reading, "だい");
  assert.ok(token("brother-owns-three-cars", "台").vocabularyId);
  assert.ok(token("ask-japanese-test-date", "いつ").vocabularyId);
  assert.equal(token("ask-route-to-station", "やっ").category, "auxiliary");
  assert.equal(token("ask-route-to-station", "やっ").vocabularyId, undefined);
  assert.equal(token("ask-route-to-station", "行き").category, "verb");
  assert.ok(token("ask-route-to-station", "行き").vocabularyId);
  assert.deepEqual(sourceById.get("ask-route-to-station").tokenOverrides, {
    "やっ": { category: "auxiliary" },
    "行き": { category: "verb" }
  });
  assert.equal(token("sister-draws-beautiful-cards", "きれい").reading, "きれい");
  assert.ok(token("sister-draws-beautiful-cards", "きれい").vocabularyId);
  assert.equal(token("explain-missed-call", "ん").category, "auxiliary");
  assert.equal(token("explain-missed-call", "ん").vocabularyId, undefined);
  assert.equal(token("uncertain-help-start-alone", "自分").reading, "じぶん");
  assert.ok(token("uncertain-help-start-alone", "自分").vocabularyId);
  assert.ok(token("ask-reason-for-absence", "なんで").vocabularyId);
  assert.equal(
    token("ask-polite-person-and-opinion", "方").vocabularyId,
    "vocab-22d08b21620a"
  );
  assert.equal(token("ask-polite-person-and-opinion", "方").reading, "かた");
  assert.equal(token("ask-party-schedule-and-age", "何").reading, "なん");
  assert.equal(token("ask-party-schedule-and-age", "曜日").reading, "ようび");
  assert.ok(token("ask-party-schedule-and-age", "曜日").vocabularyId);
  assert.equal(token("ask-party-schedule-and-age", "歳").reading, "さい");
  assert.ok(token("ask-party-schedule-and-age", "歳").vocabularyId);
});

test("the learning interface opts out of browser translation", async () => {
  const html = await readFile(join(rootDirectory, "index.html"), "utf8");

  assert.match(html, /<html class="notranslate" lang="en" translate="no">/);
  assert.match(html, /<meta name="google" content="notranslate">/);
  assert.match(html, /<meta name="robots" content="notranslate">/);
});

test("grammar coverage checklist matches authored exercises", async () => {
  const [grammarPoints, exercises, coverage] = await Promise.all([
    readJson("data/jlpt-n5-grammar.json"),
    readJson("data/source/exercises.json"),
    readFile(join(rootDirectory, "data", "grammar-coverage.md"), "utf8")
  ]);
  const exerciseIdsByGrammarPoint = new Map();

  for (const exercise of exercises) {
    for (const grammarPointId of exercise.grammarPointIds) {
      const exerciseIds = exerciseIdsByGrammarPoint.get(grammarPointId) || [];

      exerciseIds.push(exercise.id);
      exerciseIdsByGrammarPoint.set(grammarPointId, exerciseIds);
    }
  }

  const bullets = coverage.split("\n").filter((line) => line.startsWith("- ["));

  assert.match(
    coverage,
    new RegExp(`Covered: \\*\\*${exerciseIdsByGrammarPoint.size} / ${grammarPoints.length}\\*\\*`)
  );
  assert.equal(bullets.length, grammarPoints.length);

  grammarPoints.forEach((grammarPoint, index) => {
    const exerciseIds = exerciseIdsByGrammarPoint.get(grammarPoint.id) || [];
    const checkbox = exerciseIds.length > 0 ? "x" : " ";

    assert.ok(
      bullets[index].startsWith(`- [${checkbox}] \`${grammarPoint.id}\` - `),
      grammarPoint.id
    );

    for (const exerciseId of exerciseIds) {
      assert.ok(bullets[index].includes(`\`${exerciseId}\``), exerciseId);
    }
  });
});

test("authored exercises cover the core question-word surfaces", async () => {
  const exercises = await readJson("data/source/exercises.json");
  const corpus = exercises.map(({ text }) => text).join("\n");
  const requiredQuestionForms = [
    "何を",
    "誰の",
    "いつ",
    "どこ",
    "どれ",
    "どの",
    "どちら",
    "どっち",
    "どなた",
    "どう",
    "どうやって",
    "どんな",
    "なぜ",
    "どうして",
    "なんで",
    "いかが",
    "いくら",
    "いくつ",
    "何人",
    "何時",
    "何曜日",
    "何歳",
    "どのくらい"
  ];

  for (const form of requiredQuestionForms) {
    assert.ok(corpus.includes(form), `Missing question-word exercise for ${form}`);
  }
});

test("browser code has no application backend or embedded API key", async () => {
  const browserCode = await Promise.all([
    readFile(join(rootDirectory, "app.js"), "utf8"),
    readFile(join(rootDirectory, "autocorrect.js"), "utf8"),
    readFile(join(rootDirectory, "srs.js"), "utf8"),
    readFile(join(rootDirectory, "learning-stats.js"), "utf8"),
    readFile(join(rootDirectory, "hiragana.js"), "utf8"),
    readFile(join(rootDirectory, "katakana.js"), "utf8"),
    readFile(join(rootDirectory, "kanji.js"), "utf8"),
    readFile(join(rootDirectory, "vocabulary.js"), "utf8"),
    readFile(join(rootDirectory, "exercise-selection.js"), "utf8"),
    readFile(join(rootDirectory, "statistics.js"), "utf8"),
    readFile(join(rootDirectory, "settings.js"), "utf8")
  ]).then((files) => files.join("\n"));

  assert.doesNotMatch(browserCode, /\/api\//);
  assert.doesNotMatch(browserCode, /["']\.key["']/);
  assert.doesNotMatch(browserCode, /sk-[a-zA-Z0-9_-]{20,}/);
  assert.match(browserCode, /https:\/\/api\.openai\.com\/v1\/responses/);
});

test("FSRS loads before the app and schedules assessed grammar", async () => {
  const [html, browserCode] = await Promise.all([
    readFile(join(rootDirectory, "index.html"), "utf8"),
    readFile(join(rootDirectory, "app.js"), "utf8")
  ]);

  assert.ok(html.indexOf('src="vendor/ts-fsrs.js"') < html.indexOf('src="srs.js"'));
  assert.ok(html.indexOf('src="srs.js"') < html.indexOf('src="app.js"'));
  assert.ok(html.indexOf('src="exercise-selection.js"') < html.indexOf('src="app.js"'));
  assert.match(browserCode, /pickNextGrammarPoint/);
  assert.match(browserCode, /recordReviews/);
  assert.match(browserCode, /grammarSection\.append\(grammarList\)/);
  assert.match(browserCode, /data-grammar-rating/);
  assert.match(browserCode, /t\("exercise\.again"\)/);
  assert.match(browserCode, /t\("exercise\.good"\)/);
});

test("the main menu links every implemented study route", async () => {
  const [html, browserCode] = await Promise.all([
    readFile(join(rootDirectory, "index.html"), "utf8"),
    readFile(join(rootDirectory, "app.js"), "utf8")
  ]);

  assert.match(html, /data-study-section="hiragana"/);
  assert.match(html, /data-study-section="katakana"/);
  assert.match(html, /data-study-section="kanji"/);
  assert.match(html, /data-study-section="vocabulary"/);
  assert.match(html, /data-study-section="grammar"/);
  assert.match(html, /id="current-study-label"/);
  assert.ok(html.indexOf('src="hiragana.js"') < html.indexOf('src="app.js"'));
  assert.ok(html.indexOf('src="katakana.js"') < html.indexOf('src="app.js"'));
  assert.ok(html.indexOf('src="kanji.js"') < html.indexOf('src="app.js"'));
  assert.ok(html.indexOf('src="vocabulary.js"') < html.indexOf('src="app.js"'));
  assert.match(browserCode, /currentStudySection/);
  assert.match(browserCode, /pickNextHiraganaExercise/);
  assert.match(browserCode, /pickNextKatakanaExercise/);
  assert.match(browserCode, /pickNextKanjiExercise/);
  assert.match(browserCode, /pickNextVocabularyExercise/);
  assert.match(browserCode, /recordKanaReviews/);
  assert.match(browserCode, /recordKanaAttempt/);
  assert.match(browserCode, /solution-kana-item/);
});

test("Vocabulary alternates deterministic translation directions and reviews one word", async () => {
  const [html, browserCode, vocabularyCode, srsCode, statsCode] = await Promise.all([
    readFile(join(rootDirectory, "index.html"), "utf8"),
    readFile(join(rootDirectory, "app.js"), "utf8"),
    readFile(join(rootDirectory, "vocabulary.js"), "utf8"),
    readFile(join(rootDirectory, "srs.js"), "utf8"),
    readFile(join(rootDirectory, "learning-stats.js"), "utf8")
  ]);

  assert.match(html, /id="vocabulary-guidance"/);
  assert.match(vocabularyCode, /japaneseToEnglish: "japanese-to-english"/);
  assert.match(vocabularyCode, /englishToJapanese: "english-to-japanese"/);
  assert.match(vocabularyCode, /completedCount % 2 === 0/);
  assert.match(vocabularyCode, /function gradeAnswer\(exercise, answer\)/);
  assert.match(browserCode, /recordVocabularyEncounter\(lesson\)/);
  assert.match(browserCode, /recordVocabularyReviews/);
  assert.match(browserCode, /recordVocabularyAttempt/);
  assert.match(browserCode, /data-vocabulary-rating/);
  assert.match(browserCode, /recordCurrentVocabularyReview/);
  assert.match(browserCode, /exercise\.vocabularyToJapanese/);
  assert.match(browserCode, /exercise\.vocabularyFromJapanese/);
  assert.match(srsCode, /vocabularyCards/);
  assert.match(statsCode, /section: "vocabulary"/);
});

test("Grammar answers silently reinforce unrevealed due vocabulary", async () => {
  const [browserCode, vocabularyCode, srsCode] = await Promise.all([
    readFile(join(rootDirectory, "app.js"), "utf8"),
    readFile(join(rootDirectory, "vocabulary.js"), "utf8"),
    readFile(join(rootDirectory, "srs.js"), "utf8")
  ]);

  assert.match(vocabularyCode, /function findContextualVocabularyIds/);
  assert.match(vocabularyCode, /function findRecognizedVocabularyIds/);
  assert.match(browserCode, /excludedVocabularyIds: revealedVocabularyIds/);
  assert.match(browserCode, /markVocabularyHintRevealed/);
  assert.match(browserCode, /filterNewOrDueVocabulary/);
  assert.match(browserCode, /outcome: "good"/);
  assert.match(srsCode, /function filterNewOrDueVocabulary/);
});

test("Kanji uses contextual bidirectional prompts and schedules one target character", async () => {
  const [html, browserCode, kanjiCode, srsCode, statsCode] = await Promise.all([
    readFile(join(rootDirectory, "index.html"), "utf8"),
    readFile(join(rootDirectory, "app.js"), "utf8"),
    readFile(join(rootDirectory, "kanji.js"), "utf8"),
    readFile(join(rootDirectory, "srs.js"), "utf8"),
    readFile(join(rootDirectory, "learning-stats.js"), "utf8")
  ]);

  assert.match(html, /id="kanji-guidance"/);
  assert.match(html, /id="kanji-meaning-hint"[\s\S]*aria-expanded="false"/);
  assert.match(html, /id="kanji-choice-grid"[\s\S]*role="group"/);
  assert.match(kanjiCode, /kanjiToReading: "kanji-to-reading"/);
  assert.match(kanjiCode, /readingToKanji: "reading-to-kanji"/);
  assert.match(kanjiCode, /const activeStages = Object\.freeze\(\["B6"\]\)/);
  assert.match(kanjiCode, /maskedTerm: term\.replaceAll\(character, "□"\)/);
  assert.match(kanjiCode, /function gradeAnswer\(exercise, answer, converter\)/);
  assert.match(kanjiCode, /function createAnswerChoices\(/);
  assert.match(browserCode, /recordKanjiEncounter\(lesson\)/);
  assert.match(browserCode, /recordKanjiReviews/);
  assert.match(browserCode, /createPositiveVocabularyRating/);
  assert.match(browserCode, /filterNewOrDueVocabulary/);
  assert.match(browserCode, /recordKanjiAttempt/);
  assert.match(browserCode, /data-kanji-rating/);
  assert.match(browserCode, /function selectKanjiChoice\(character\)/);
  assert.match(browserCode, /kanjiChoiceGrid\.addEventListener\("click", handleKanjiChoiceClick\)/);
  assert.match(browserCode, /expectedInventoryCount/);
  assert.doesNotMatch(browserCode, /inventory\.length !== 73/);
  assert.match(browserCode, /activeKanjiIds/);
  assert.match(browserCode, /updateSolutionSpeech\(currentLesson, solutionSpeakButton\)/);
  assert.match(srsCode, /kanjiCards/);
  assert.match(statsCode, /section: "kanji"/);
});

test("Katakana meanings use an accessible secret hint", async () => {
  const [html, browserCode, styles] = await Promise.all([
    readFile(join(rootDirectory, "index.html"), "utf8"),
    readFile(join(rootDirectory, "app.js"), "utf8"),
    readFile(join(rootDirectory, "styles.css"), "utf8")
  ]);

  assert.match(html, /id="katakana-meaning-hint"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /id="katakana-meaning"[\s\S]*aria-hidden="true"/);
  assert.match(browserCode, /function setKatakanaMeaningHintExpanded\(expanded\)/);
  assert.match(browserCode, /kanaMeaning\.hidden = isKatakana/);
  assert.match(browserCode, /katakanaMeaningHint\.hidden = !isKatakana/);
  assert.match(browserCode, /katakanaMeaningHint\.addEventListener\("click"/);
  assert.match(styles, /\.katakana-meaning-hint:hover/);
  assert.match(styles, /\.katakana-meaning-hint:focus/);
  assert.match(styles, /\.katakana-meaning-hint\.is-expanded/);
});

test("Katakana includes paired Hiragana-to-Katakana reviews", async () => {
  const [browserCode, katakanaCode, statsCode] = await Promise.all([
    readFile(join(rootDirectory, "app.js"), "utf8"),
    readFile(join(rootDirectory, "katakana.js"), "utf8"),
    readFile(join(rootDirectory, "learning-stats.js"), "utf8")
  ]);

  assert.match(katakanaCode, /hiraganaToKatakana: "hiragana-to-katakana"/);
  assert.match(katakanaCode, /createKanaPairInventory/);
  assert.match(katakanaCode, /word\.kanaPairs\.flatMap/);
  assert.match(katakanaCode, /function createKanaRatings\(partResults\)/);
  assert.match(
    browserCode,
    /exerciseKindLabel\.textContent = isSingleKatakana[\s\S]*: isHiraganaToKatakana/
  );
  assert.match(browserCode, /t\("exercise\.hiraganaToKatakana"\)/);
  assert.match(browserCode, /hiragana: currentLesson\.hiragana/);
  assert.match(browserCode, /kanaApi\.createKanaRatings\(result\.parts\)/);
  assert.match(browserCode, /\.\.\.hiraganaMetadata, \.\.\.pairedHiraganaMetadata/);
  assert.match(statsCode, /Array\.isArray\(exercise\.reviewKanaParts\)/);
  assert.match(statsCode, /hiraganaToKatakana\s*\? exercise\.hiragana/);
});

test("Katakana includes standalone item-to-rōmaji reviews", async () => {
  const [browserCode, katakanaCode, styles] = await Promise.all([
    readFile(join(rootDirectory, "app.js"), "utf8"),
    readFile(join(rootDirectory, "katakana.js"), "utf8"),
    readFile(join(rootDirectory, "styles.css"), "utf8")
  ]);

  assert.match(katakanaCode, /singleKana: "single-kana"/);
  assert.match(katakanaCode, /function createSingleKanaPool\(words, converter\)/);
  assert.match(katakanaCode, /!\["ッ", "ー"\]\.includes\(katakana\)/);
  assert.match(katakanaCode, /cycleIndex === 2 \? exerciseKinds\.singleKana/);
  assert.match(katakanaCode, /function chooseSingleKanaExercise\(singleKanaPool, targetKana\)/);
  assert.match(browserCode, /getNextExerciseMode\(exerciseHistory\)/);
  assert.match(browserCode, /chooseSingleKanaExercise/);
  assert.match(browserCode, /t\("exercise\.singleKatakana"\)/);
  assert.match(browserCode, /kanaGuidance\.hidden = !isKana \|\| isSingleKatakana/);
  assert.match(browserCode, /classList\.toggle\("is-single-kana", isSingleKatakana\)/);
  assert.match(styles, /\.lesson-sentence\.is-single-kana/);
});

test("production cadence uses completed recognition history", async () => {
  const [html, browserCode, selectionCode] = await Promise.all([
    readFile(join(rootDirectory, "index.html"), "utf8"),
    readFile(join(rootDirectory, "app.js"), "utf8"),
    readFile(join(rootDirectory, "exercise-selection.js"), "utf8")
  ]);

  assert.ok(html.indexOf('src="learning-stats.js"') < html.indexOf('src="exercise-selection.js"'));
  assert.match(browserCode, /JlptN5ExerciseSelection\.selectExercisePool/);
  assert.match(selectionCode, /productionInterval = 5/);
  assert.match(selectionCode, /recognitionThreshold = 2/);
  assert.match(selectionCode, /newGrammarPointLimit = 1/);
  assert.match(selectionCode, /limitNewGrammarPoints/);
  assert.match(selectionCode, /productionExercises\.length > 0\s*\?\s*productionExercises/);
  assert.ok(
    browserCode.indexOf("selectExercisePool") < browserCode.indexOf("pickNextGrammarPoint(")
  );
});

test("query parameter can force production exercises", async () => {
  const browserCode = await readFile(join(rootDirectory, "app.js"), "utf8");

  assert.match(browserCode, /URLSearchParams\(window\.location\.search\)/);
  assert.match(browserCode, /get\("type"\)/);
  assert.match(browserCode, /forcedExerciseType/);
  assert.match(browserCode, /getExerciseType\(lesson\) === "production"/);
  assert.match(browserCode, /promptVocabularyHints/);
  assert.match(browserCode, /productionGrammarTargets/);
  assert.match(browserCode, /t\("exercise\.writeJapanese"\)/);
});

test("study inputs use the appropriate IME mode", async () => {
  const [html, browserCode] = await Promise.all([
    readFile(join(rootDirectory, "index.html"), "utf8"),
    readFile(join(rootDirectory, "app.js"), "utf8")
  ]);

  assert.ok(html.indexOf('src="vendor/wanakana.js"') < html.indexOf('src="app.js"'));
  assert.ok(html.indexOf('src="voice-paths.js"') < html.indexOf('src="app.js"'));
  assert.match(browserCode, /wanakana\.bind\(translationInput, options\)/);
  assert.match(browserCode, /wanakana\.unbind\(translationInput\)/);
  assert.match(browserCode, /IMEMode: "toHiragana"/);
  assert.match(browserCode, /IMEMode: "toKatakana"/);
  assert.equal(
    toKana("maiasa ha shichiji ni ie wo demasu"),
    "まいあさ は しちじ に いえ を でます"
  );
  assert.equal(toKana("kitte"), "きって");
});

test("vocabulary prompts display alternate readings", async () => {
  const browserCode = await readFile(join(rootDirectory, "app.js"), "utf8");

  assert.match(browserCode, /function getVocabularyReadingLabel\(lesson\)/);
  assert.match(browserCode, /lesson\?\.alternateReadings/);
  assert.match(browserCode, /getVocabularyReadingLabel\(currentLesson\)/);
});

test("submitting commits unfinished romaji in Japanese answers", async () => {
  const browserCode = await readFile(join(rootDirectory, "app.js"), "utf8");

  assert.match(browserCode, /function commitPendingKanaInput\(\)/);
  assert.match(browserCode, /wanakana\.toHiragana/);
  assert.match(browserCode, /wanakana\.toKatakana/);
  assert.match(browserCode, /wanakana\.toKana/);
  assert.match(
    browserCode,
    /if \(!exerciseSubmitted\) \{\s*commitPendingKanaInput\(\);\s*\}/
  );
  assert.equal(toKana("ばんごはn"), "ばんごはん");
  assert.equal(toHiragana("ばんごはn"), "ばんごはん");
  assert.equal(toKatakana("パn"), "パン");
});

test("Enter submits an answer without interrupting IME composition", async () => {
  const browserCode = await readFile(join(rootDirectory, "app.js"), "utf8");

  assert.match(browserCode, /function handleTranslationInputKeydown\(event\)/);
  assert.match(browserCode, /event\.key !== "Enter" \|\| event\.isComposing/);
  assert.match(browserCode, /event\.stopPropagation\(\)/);
  assert.match(browserCode, /actionButton\.click\(\)/);
  assert.match(
    browserCode,
    /translationInput\.addEventListener\("keydown", handleTranslationInputKeydown\)/
  );
  assert.match(browserCode, /function handleResultKeydown\(event\)/);
  assert.match(browserCode, /!exerciseSubmitted/);
  assert.match(browserCode, /actionButton\.disabled/);
  assert.match(browserCode, /document\.addEventListener\("keydown", handleResultKeydown\)/);
});

test("the reply field wraps and grows to show long sentences", async () => {
  const [html, browserCode, styles] = await Promise.all([
    readFile(join(rootDirectory, "index.html"), "utf8"),
    readFile(join(rootDirectory, "app.js"), "utf8"),
    readFile(join(rootDirectory, "styles.css"), "utf8")
  ]);

  assert.match(html, /<textarea[\s\S]*id="translation-input"[\s\S]*rows="1"/);
  assert.match(browserCode, /function resizeTranslationInput\(\)/);
  assert.match(browserCode, /translationInput\.scrollHeight/);
  assert.match(
    browserCode,
    /translationInput\.addEventListener\("input", handleTranslationInputResize\)/
  );
  assert.match(styles, /\.translation-input \{[\s\S]*width: min\(48rem, 100%\)/);
  assert.match(styles, /\.translation-input \{[\s\S]*overflow: hidden/);
  assert.match(styles, /\.translation-input \{[\s\S]*resize: none/);
});

test("browser records exercise encounters after loading the stats layer", async () => {
  const [html, browserCode] = await Promise.all([
    readFile(join(rootDirectory, "index.html"), "utf8"),
    readFile(join(rootDirectory, "app.js"), "utf8")
  ]);

  assert.ok(html.indexOf('src="learning-stats.js"') < html.indexOf('src="app.js"'));
  assert.match(browserCode, /lesson\.id !== introductionId/);
  assert.match(browserCode, /recordExerciseEncounter\(lesson\)/);
  assert.match(
    browserCode,
    /recordExerciseAttempt\(\s*currentLesson,\s*translationInput\.value\s*\)/
  );
});

test("global statistics count every study section", async () => {
  const [browserCode, statisticsCode] = await Promise.all([
    readFile(join(rootDirectory, "app.js"), "utf8"),
    readFile(join(rootDirectory, "statistics.js"), "utf8")
  ]);

  assert.match(browserCode, /label: t\("statistics\.exercisesCompleted"\)/);
  assert.match(browserCode, /overview\.exerciseCounts\.total/);
  assert.match(browserCode, /overview\.exerciseCounts\.hiragana/);
  assert.match(browserCode, /overview\.exerciseCounts\.katakana/);
  assert.match(browserCode, /overview\.exerciseCounts\.kanji/);
  assert.match(browserCode, /overview\.exerciseCounts\.vocabulary/);
  assert.match(statisticsCode, /function countCompletedExercises\(exerciseHistory\)/);
  assert.match(statisticsCode, /kana: counts\.hiragana \+ counts\.katakana/);
  assert.match(
    statisticsCode,
    /const globalReviewEvents = \[\.\.\.events, \.\.\.kanaEvents, \.\.\.vocabularyEvents, \.\.\.kanjiEvents\]/
  );
  assert.match(statisticsCode, /createReviewDays\(globalReviewEvents, currentTime\)/);
});

test("touch devices activate one sentence token at a time", async () => {
  const [browserCode, styles] = await Promise.all([
    readFile(join(rootDirectory, "app.js"), "utf8"),
    readFile(join(rootDirectory, "styles.css"), "utf8")
  ]);

  assert.match(browserCode, /function handleTokenTap\(event\)/);
  assert.match(browserCode, /const tappedToken = event\.currentTarget/);
  assert.match(browserCode, /tokenElement\.addEventListener\("click", handleTokenTap\)/);
  assert.match(browserCode, /\.token\.is-touch-active/);
  assert.doesNotMatch(browserCode, /touchTokenQuery/);
  assert.match(browserCode, /document\.addEventListener\("click", dismissActiveToken\)/);
  assert.match(styles, /@media \(hover: none\), \(pointer: coarse\)/);
  assert.match(styles, /\.token\[data-category\] \{\s+cursor: pointer/);
  assert.match(styles, /\.token\[data-category="noun"\]\.is-touch-active/);
  assert.match(styles, /\.is-touch-active::after/);
  assert.match(styles, /\)::after \{\s+display: none;/);
  assert.match(styles, /\.is-touch-active::after \{\s+display: block;/);
});

test("user menu exposes accessible navigation placeholders", async () => {
  const [html, browserCode] = await Promise.all([
    readFile(join(rootDirectory, "index.html"), "utf8"),
    readFile(join(rootDirectory, "app.js"), "utf8")
  ]);

  assert.match(html, /id="profile-menu-button"/);
  assert.match(html, /aria-haspopup="menu"/);
  assert.match(html, /id="profile-menu"[^>]*role="menu"[^>]*hidden/);
  assert.match(html, />Settings<[^>]*>/);
  assert.match(html, />Statistics<[^>]*>/);
  assert.match(html, /id="history-menu-item"/);
  assert.match(html, /href="https:\/\/github\.com\/kivutar\/jlptn5"/);
  assert.match(html, /data-i18n="menu\.about">About<\/span> <span aria-hidden="true">↗<\/span>/);
  assert.match(browserCode, /event\.key === "Escape"/);
  assert.match(browserCode, /event\.key === "ArrowDown"/);
  assert.match(browserCode, /handleOutsideProfileMenuClick/);
  assert.match(browserCode, /openActivity\("history"\)/);
});

test("settings layer loads before the app and exposes every initial control", async () => {
  const [html, browserCode] = await Promise.all([
    readFile(join(rootDirectory, "index.html"), "utf8"),
    readFile(join(rootDirectory, "app.js"), "utf8")
  ]);

  assert.ok(html.indexOf('src="settings.js"') < html.indexOf('src="app.js"'));
  assert.ok(html.indexOf('src="i18n.js"') < html.indexOf('src="app.js"'));

  for (const settingName of [
    "userLanguage",
    "furigana",
    "autoPlayAudio",
    "tokenColoring",
    "translationTooltips",
    "aiAutoCorrect"
  ]) {
    assert.match(html, new RegExp(`data-setting="${settingName}"`));
  }

  assert.match(browserCode, /JlptN5Settings\.writeSettings/);
  assert.match(browserCode, /settingsDialog\.showModal\(\)/);
  assert.match(html, /id="openai-api-key"[^>]*type="password"/);
  assert.match(html, /Stored only in this tab/);
  assert.match(browserCode, /readOpenAiApiKey/);
  assert.match(browserCode, /openAiApiKeyInput\.addEventListener\("input", handleSettingChange\)/);
});

test("AI autocorrect uses one bounded structured classification request", async () => {
  const [html, browserCode, autoCorrectCode] = await Promise.all([
    readFile(join(rootDirectory, "index.html"), "utf8"),
    readFile(join(rootDirectory, "app.js"), "utf8"),
    readFile(join(rootDirectory, "autocorrect.js"), "utf8")
  ]);

  assert.ok(html.indexOf('src="autocorrect.js"') < html.indexOf('src="app.js"'));
  assert.match(html, /maxlength="500"/);
  assert.match(autoCorrectCode, /gpt-4\.1-mini/);
  assert.doesNotMatch(autoCorrectCode, /reasoning: \{ effort:/);
  assert.match(autoCorrectCode, /max_output_tokens: 100/);
  assert.match(autoCorrectCode, /service_tier: "default"/);
  assert.match(autoCorrectCode, /store: false/);
  assert.match(autoCorrectCode, /type: "json_schema"/);
  assert.match(browserCode, /assessGrammarPoints/);
  assert.match(browserCode, /t\("autocorrect\.done"\)/);
  assert.match(browserCode, /t\("autocorrect\.failed"\)/);
});

test("speaker checks local narration availability before playback", async () => {
  const [browserCode, styles] = await Promise.all([
    readFile(join(rootDirectory, "app.js"), "utf8"),
    readFile(join(rootDirectory, "styles.css"), "utf8")
  ]);

  assert.match(browserCode, /fetch\(audioUrl, \{ method: "HEAD" \}\)/);
  assert.match(browserCode, /fetch\("data\/available-voices\.json"\)/);
  assert.match(browserCode, /getVocabularyVoicePath\(entry\)/);
  assert.match(browserCode, /bundledSpeechPathsPromise\.then\(\(paths\) => paths\.has\(audioUrl\)\)/);
  assert.match(browserCode, /return new Audio\(new URL\(currentLesson\.audio, document\.baseURI\)\.href\)/);
  assert.match(browserCode, /setSpeakButtonState\(available \? "ready" : "unavailable", button\)/);
  assert.match(browserCode, /if \(!speechAvailable\)/);
  assert.match(browserCode, /getExerciseType\(currentLesson\) === "production"/);
  assert.match(browserCode, /isEnglishToJapanese && currentLesson\.audio/);
  assert.match(browserCode, /renderFuriganaText\(answer, currentLesson\.solution, currentLesson\.tokens\)/);
  assert.match(browserCode, /answerSpeakButton\.className = "speak-button solution-speak-button"/);
  assert.match(browserCode, /async function updateSolutionSpeech\(lesson, button\)/);
  assert.match(browserCode, /updateSpeechAvailability\(lesson, button, false\)/);
  assert.match(browserCode, /updateSolutionSpeech\(currentLesson, solutionSpeakButton\)/);
  assert.match(styles, /\.speak-button\[hidden\] \{\s+display: none/);
});

test("Hiragana-to-Romaji audio waits until the answer is submitted", async () => {
  const browserCode = await readFile(join(rootDirectory, "app.js"), "utf8");

  assert.match(browserCode, /function shouldDelayKanaPromptAudio\(lesson\)/);
  assert.match(browserCode, /lesson\?\.section === "hiragana"/);
  assert.match(browserCode, /directions\.kanaToRomaji/);
  assert.match(
    browserCode,
    /!shouldDelayKanaPromptAudio\(currentLesson\) \|\| exerciseSubmitted/
  );
  assert.match(browserCode, /speakButton\.hidden = !lesson\.audio \|\| delayKanaPromptAudio/);
  assert.match(browserCode, /updateSpeechAvailability\(lesson, speakButton, !delayKanaPromptAudio\)/);
  assert.match(
    browserCode,
    /shouldDelayKanaPromptAudio\(currentLesson\)[\s\S]*updateSolutionSpeech\(currentLesson, speakButton\)/
  );
});

test("grammar ratings are always visible instead of using a disclosure", async () => {
  const browserCode = await readFile(join(rootDirectory, "app.js"), "utf8");

  assert.match(browserCode, /document\.createElement\("section"\)/);
  assert.match(browserCode, /grammarList\.className = "solution-grammar-list"/);
  assert.doesNotMatch(browserCode, /文法を評価済み/);
  assert.doesNotMatch(browserCode, /文法を評価（/);
  assert.doesNotMatch(browserCode, /document\.createElement\("details"\)/);
  assert.doesNotMatch(browserCode, /document\.createElement\("summary"\)/);
});

test("statistics UI combines SRS progress, outcomes, and exposure coverage", async () => {
  const [html, browserCode, statisticsCode, styles] = await Promise.all([
    readFile(join(rootDirectory, "index.html"), "utf8"),
    readFile(join(rootDirectory, "app.js"), "utf8"),
    readFile(join(rootDirectory, "statistics.js"), "utf8"),
    readFile(join(rootDirectory, "styles.css"), "utf8")
  ]);

  assert.match(html, /id="statistics-panel"/);
  assert.match(html, /id="history-panel"/);
  assert.doesNotMatch(html, /role="tab"/);
  assert.match(html, /data-stat-kind="overview"/);
  assert.match(html, /data-stat-kind="grammar"/);
  assert.match(html, /data-stat-kind="vocabulary"/);
  assert.match(html, /data-stat-kind="kanji"/);
  assert.match(html, /data-stat-kind="hiragana"[\s\S]*aria-label="Hiragana"[\s\S]*>あ</);
  assert.match(html, /data-stat-kind="katakana"[\s\S]*aria-label="Katakana"[\s\S]*>ア</);
  assert.match(html, /data-stat-kind="grammar"[\s\S]*aria-label="Grammar"[\s\S]*>文</);
  assert.match(html, /data-stat-kind="vocabulary"[\s\S]*aria-label="Vocabulary"[\s\S]*>語</);
  assert.match(html, /data-stat-kind="kanji"[\s\S]*aria-label="Kanji"[\s\S]*>漢</);
  assert.ok(html.indexOf('src="statistics.js"') < html.indexOf('src="app.js"'));
  assert.match(browserCode, /readSrsData/);
  assert.match(browserCode, /createStatisticsModel/);
  assert.match(browserCode, /data-grammar-filter/);
  assert.match(browserCode, /data-exposure-sort/);
  assert.match(browserCode, /stats\.exerciseHistory/);
  assert.match(browserCode, /attempt\.grammarRatings/);
  assert.match(browserCode, /recordExerciseGrammarRatings/);
  assert.match(browserCode, /getLocalDayKey/);
  assert.match(statisticsCode, /recentResults/);
  assert.match(statisticsCode, /needsAttention/);
  assert.match(statisticsCode, /createExposureModel/);
  assert.match(statisticsCode, /function createProgressBreakdown/);
  assert.match(statisticsCode, /masteredStabilityDays = 90/);
  assert.match(statisticsCode, /masteredRetrievability = 0\.8/);
  assert.match(browserCode, /statistics-progress-segment/);
  assert.match(browserCode, /t\("statistics\.mastered"\)/);
  assert.match(browserCode, /t\("statistics\.mature"\)/);
  assert.match(browserCode, /t\("statistics\.almostMature"\)/);
  assert.match(browserCode, /t\("statistics\.learningDue"\)/);
  assert.match(styles, /data-progress-state="mastered"/);
  assert.match(styles, /data-progress-state="mature"/);
  assert.match(styles, /data-progress-state="almost-mature"/);
  assert.match(styles, /data-progress-state="learning-due"/);
  assert.match(styles, /rgb\(77 130 96 \/ 30%\)/);
  assert.match(styles, /@media \(max-width: 32rem\) \{[\s\S]*\.app-dialog \{[\s\S]*width: 100%;[\s\S]*max-width: 100%/);
  assert.match(styles, /\.stat-kind-label \{\s+display: none;/);
  assert.match(styles, /\.dialog-header \{[\s\S]*flex: 0 0 auto;/);
});

test("history lazily folds days and keeps both navigation levels bounded", async () => {
  const [html, browserCode, historyCode, styles] = await Promise.all([
    readFile(join(rootDirectory, "index.html"), "utf8"),
    readFile(join(rootDirectory, "app.js"), "utf8"),
    readFile(join(rootDirectory, "history.js"), "utf8"),
    readFile(join(rootDirectory, "styles.css"), "utf8")
  ]);

  assert.ok(html.indexOf('src="history.js"') < html.indexOf('src="app.js"'));
  assert.match(historyCode, /const daysPerPage = 7/);
  assert.match(historyCode, /const attemptsPerPage = 50/);
  assert.match(historyCode, /function createHistoryDays\(exerciseHistory, getDayKey\)/);
  assert.match(historyCode, /function createPage\(items, requestedPage, pageSize\)/);
  assert.match(browserCode, /content\.hidden = !expanded/);
  assert.match(browserCode, /if \(expanded\) \{[\s\S]*attemptsPerPage/);
  assert.match(browserCode, /newer\.dataset\.historyPageKind = kind/);
  assert.match(browserCode, /older\.dataset\.historyPageKind = kind/);
  assert.match(browserCode, /historyList\.addEventListener\("click", handleHistoryListClick\)/);
  assert.match(styles, /\.history-day-toggle\[aria-expanded="true"\]/);
  assert.match(styles, /\.history-pagination/);
  assert.match(styles, /grid-template-areas:[\s\S]*"newer older"[\s\S]*"status status"/);
});

test("the branded web loading screen appears once per browser session and never natively", async () => {
  const [html, browserCode, styles] = await Promise.all([
    readFile(join(rootDirectory, "index.html"), "utf8"),
    readFile(join(rootDirectory, "app.js"), "utf8"),
    readFile(join(rootDirectory, "styles.css"), "utf8")
  ]);

  assert.match(html, /sessionStorage\.getItem\("chakuchaku:splash-shown"\)/);
  assert.match(html, /document\.documentElement\.dataset\.splashShown = "true"/);
  assert.match(html, /<script src="vendor\/capacitor\.js"><\/script>/);
  assert.match(html, /Capacitor\?\.isNativePlatform\?\.\(\)/);
  assert.match(browserCode, /splashWasAlreadyShown \? 0 : 1600/);
  assert.match(browserCode, /sessionStorage\.setItem\("chakuchaku:splash-shown", "true"\)/);
  assert.match(styles, /html\[data-splash-shown="true"\] \.loading-screen \{\s+display: none;/);
  assert.match(styles, /html\[data-native-platform\] \.loading-screen \{\s+display: none;/);
});

test("the interface follows the operating system color scheme", async () => {
  const [html, privacyHtml, browserCode, styles] = await Promise.all([
    readFile(join(rootDirectory, "index.html"), "utf8"),
    readFile(join(rootDirectory, "privacy.html"), "utf8"),
    readFile(join(rootDirectory, "app.js"), "utf8"),
    readFile(join(rootDirectory, "styles.css"), "utf8")
  ]);

  for (const document of [html, privacyHtml]) {
    assert.match(document, /name="color-scheme" content="light dark"/);
    assert.match(document, /content="#101412" media="\(prefers-color-scheme: dark\)"/);
  }

  assert.match(styles, /@media \(prefers-color-scheme: dark\)/);
  assert.match(styles, /color-scheme: dark;/);
  assert.match(styles, /background: #101412;/);
  assert.match(browserCode, /matchMedia\("\(prefers-color-scheme: dark\)"\)/);
  assert.match(browserCode, /statusBar\.setStyle\(\{ style: isDark \? "DARK" : "LIGHT" \}\)/);
  assert.match(browserCode, /preferredDarkColorScheme\.addEventListener\("change"/);
});

test("native reminder settings keep the toggle and time on separate rows", async () => {
  const [html, browserCode] = await Promise.all([
    readFile(join(rootDirectory, "index.html"), "utf8"),
    readFile(join(rootDirectory, "app.js"), "utf8")
  ]);

  assert.match(html, /data-i18n="settings\.reviewReminder">Review reminder<\/span>/);
  assert.match(html, /data-i18n="settings\.reviewReminderDescription">Daily notification\.<\/small>/);
  assert.match(html, /class="setting-row native-setting-row setting-row-reminder-time"/);
  assert.match(html, /<label for="review-reminder-time" data-i18n="settings\.reminderTime">Reminder time<\/label>/);
  assert.doesNotMatch(html, /setting-reminder-controls/);
  assert.match(browserCode, /reviewReminderTimeInput\.closest\("\.setting-row"\)\.classList\.toggle/);
});

test("vocabulary inventory has a substantial core and labeled learner favorites", async () => {
  const vocabulary = await readJson("data/jlpt-n5-vocabulary.json");
  const allowedPartsOfSpeech = new Set([
    "adjective",
    "adverb",
    "affix",
    "conjunction",
    "counter",
    "determiner",
    "expression",
    "interjection",
    "noun",
    "number",
    "particle",
    "pronoun",
    "verb"
  ]);
  const ids = new Set();
  const core = vocabulary.filter(({ scope }) => scope === "core");
  const supplemental = vocabulary.filter(({ scope }) => scope === "supplemental");

  assert.ok(core.length >= 700);
  assert.ok(supplemental.length > 0);
  assert.equal(vocabulary.some(({ term }) => term === "N"), false);

  for (const entry of vocabulary) {
    assert.match(entry.id, /^vocab-[a-f0-9]{12}$/);
    assert.ok(!ids.has(entry.id), `Duplicate vocabulary id ${entry.id}`);
    ids.add(entry.id);
    assert.ok(entry.term);
    assert.ok(entry.reading);
    assert.ok(entry.meaning);
    assert.ok(allowedPartsOfSpeech.has(entry.partOfSpeech));
    assert.ok(["core", "supplemental"].includes(entry.scope));
    assert.ok(
      [
        "open-anki-jlpt-decks",
        "curated-learner-favorites",
        "curated-lesson-vocabulary",
        "former-jlpt-level-4",
        "curated-katakana-curriculum"
      ].includes(entry.source)
    );

    if (entry.variants) {
      assert.ok(Array.isArray(entry.variants));
      assert.ok(entry.variants.every(Boolean));
    }

    if (entry.inflections) {
      assert.ok(Array.isArray(entry.inflections));
      assert.ok(entry.inflections.every(({ surface, reading }) => surface && reading));
      assert.ok(entry.inflections.every(({ allowPartOfSpeechMismatch }) => {
        return (
          allowPartOfSpeechMismatch === undefined ||
          typeof allowPartOfSpeechMismatch === "boolean"
        );
      }));
    }
  }

  const supplementalTerms = new Set(supplemental.map(({ term }) => term));

  for (const term of ["ラーメン", "寿司", "アニメ", "漫画", "ゲーム", "スマホ"]) {
    assert.ok(supplementalTerms.has(term), `Missing learner favorite ${term}`);
  }
});

async function requestStatic(path, method = "GET") {
  const result = {};
  const request = {
    method,
    url: path,
    headers: { host: "127.0.0.1" }
  };
  const response = {
    writeHead(status, headers = {}) {
      result.status = status;
      result.headers = headers;
    },
    end(body) {
      result.body = body;
    }
  };

  await handleStaticRequest(request, response);
  return result;
}

test("preview serves the committed static application", async () => {
  const expectedTypes = new Map([
    ["/", "text/html"],
    ["/privacy.html", "text/html"],
    ["/grammar", "text/html"],
    ["/hiragana", "text/html"],
    ["/katakana", "text/html"],
    ["/kanji", "text/html"],
    ["/vocabulary", "text/html"],
    ["/app.js", "text/javascript"],
    ["/native.js", "text/javascript"],
    ["/native-synapse.js", "text/javascript"],
    ["/pwa.js", "text/javascript"],
    ["/service-worker.js", "text/javascript"],
    ["/manifest.webmanifest", "application/manifest+json"],
    ["/storage.js", "text/javascript"],
    ["/voice-paths.js", "text/javascript"],
    ["/srs.js", "text/javascript"],
    ["/hiragana.js", "text/javascript"],
    ["/katakana.js", "text/javascript"],
    ["/kanji.js", "text/javascript"],
    ["/vocabulary.js", "text/javascript"],
    ["/vendor/ts-fsrs.js", "text/javascript"],
    ["/vendor/wanakana.js", "text/javascript"],
    ["/vendor/capacitor.js", "text/javascript"],
    ["/vendor/capacitor-preferences.js", "text/javascript"],
    ["/vendor/capacitor-haptics.js", "text/javascript"],
    ["/vendor/capacitor-local-notifications.js", "text/javascript"],
    ["/vendor/capacitor-splash-screen.js", "text/javascript"],
    ["/vendor/capacitor-status-bar.js", "text/javascript"],
    ["/vendor/capacitor-keyboard.js", "text/javascript"],
    ["/vendor/capacitor-app.js", "text/javascript"],
    ["/vendor/capacitor-synapse.js", "text/javascript"],
    ["/vendor/capacitor-filesystem.js", "text/javascript"],
    ["/vendor/capacitor-share.js", "text/javascript"],
    ["/learning-stats.js", "text/javascript"],
    ["/exercise-selection.js", "text/javascript"],
    ["/statistics.js", "text/javascript"],
    ["/history.js", "text/javascript"],
    ["/settings.js", "text/javascript"],
    ["/progress.js", "text/javascript"],
    ["/autocorrect.js", "text/javascript"],
    ["/styles.css", "text/css"],
    ["/assets/branding/logo.png", "image/png"],
    ["/assets/branding/icon-192.png", "image/png"],
    ["/assets/branding/icon-512.png", "image/png"],
    ["/assets/branding/icon-maskable-512.png", "image/png"],
    ["/assets/branding/apple-touch-icon.png", "image/png"],
    ["/assets/voices/grammar/introduction.m4a", "audio/mp4"],
    ["/assets/voices/vocab/aa.m4a", "audio/mp4"],
    ["/data/introduction.json", "application/json"],
    ["/data/exercises.json", "application/json"],
    ["/data/jlpt-n5-vocabulary.json", "application/json"],
    ["/data/jlpt-n5-grammar.json", "application/json"]
  ]);

  for (const [path, contentType] of expectedTypes) {
    const response = await requestStatic(path);

    assert.equal(response.status, 200, path);
    const escapedContentType = contentType.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

    assert.match(response.headers["Content-Type"], new RegExp(`^${escapedContentType}`));
    assert.ok(response.body.length > 0);
  }
});

test("preview exposes no private files or runtime endpoints", async () => {
  const privatePaths = [
    "/.key",
    "/assets/voices/introduction.m4a",
    "/data/source/introduction.json",
    "/scripts/generate-voices.js",
    "/node_modules/ts-fsrs/dist/index.umd.js",
    "/node_modules/wanakana/wanakana.min.js",
    "/package.json"
  ];

  for (const path of privatePaths) {
    assert.equal((await requestStatic(path)).status, 404, path);
  }

  for (const path of ["/api/speech", "/api/tokenize"]) {
    const response = await requestStatic(path, "POST");

    assert.equal(response.status, 405, path);
    assert.equal(response.headers.Allow, "GET, HEAD");
  }
});
