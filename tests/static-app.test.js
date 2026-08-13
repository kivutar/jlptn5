import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { toKana } from "wanakana";
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

async function readJson(path) {
  return JSON.parse(await readFile(join(rootDirectory, path), "utf8"));
}

function assertPreparedLesson(lesson, vocabularyById, kanjiById, kanjiByCharacter) {
  const japaneseText = lesson.type === "production" ? lesson.solution : lesson.text;

  assert.match(lesson.id, /^[a-z0-9-]+$/);
  assert.equal(typeof lesson.text, "string");
  assert.ok(lesson.text.length > 0);
  assert.equal(lesson.audio, `assets/voices/${lesson.id}.wav`);
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

    if (glossCategories.has(token.category)) {
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
  assert.match(browserCode, /できなかった/);
  assert.match(browserCode, /できた/);
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
  assert.match(browserCode, /日本語で書いてください/);
});

test("production input converts IME-style romaji to kana", async () => {
  const [html, browserCode] = await Promise.all([
    readFile(join(rootDirectory, "index.html"), "utf8"),
    readFile(join(rootDirectory, "app.js"), "utf8")
  ]);

  assert.ok(html.indexOf('src="vendor/wanakana.js"') < html.indexOf('src="app.js"'));
  assert.match(browserCode, /wanakana\.bind\(translationInput\)/);
  assert.match(browserCode, /wanakana\.unbind\(translationInput\)/);
  assert.equal(
    toKana("maiasa ha shichiji ni ie wo demasu"),
    "まいあさ は しちじ に いえ を でます"
  );
  assert.equal(toKana("kitte"), "きって");
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
  assert.match(html, /About <span aria-hidden="true">↗<\/span>/);
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
  assert.match(browserCode, /必要なら変更できます/);
  assert.match(browserCode, /手動で評価してください/);
});

test("speaker checks local narration availability before playback", async () => {
  const browserCode = await readFile(join(rootDirectory, "app.js"), "utf8");

  assert.match(browserCode, /fetch\(audioUrl, \{ method: "HEAD" \}\)/);
  assert.match(browserCode, /setSpeakButtonState\(available \? "ready" : "unavailable", button\)/);
  assert.match(browserCode, /if \(!speechAvailable\)/);
  assert.match(browserCode, /getExerciseType\(currentLesson\) === "production"/);
  assert.match(browserCode, /renderFuriganaText\(answer, currentLesson\.solution, currentLesson\.tokens\)/);
  assert.match(browserCode, /answerSpeakButton\.className = "speak-button solution-speak-button"/);
  assert.match(browserCode, /updateSpeechAvailability\(currentLesson, answerSpeakButton, false\)/);
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
  const [html, browserCode, statisticsCode] = await Promise.all([
    readFile(join(rootDirectory, "index.html"), "utf8"),
    readFile(join(rootDirectory, "app.js"), "utf8"),
    readFile(join(rootDirectory, "statistics.js"), "utf8")
  ]);

  assert.match(html, /id="statistics-panel"/);
  assert.match(html, /id="history-panel"/);
  assert.doesNotMatch(html, /role="tab"/);
  assert.match(html, /data-stat-kind="overview"/);
  assert.match(html, /data-stat-kind="grammar"/);
  assert.match(html, /data-stat-kind="vocabulary"/);
  assert.match(html, /data-stat-kind="kanji"/);
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
        "curated-lesson-vocabulary"
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
    ["/app.js", "text/javascript"],
    ["/srs.js", "text/javascript"],
    ["/vendor/ts-fsrs.js", "text/javascript"],
    ["/vendor/wanakana.js", "text/javascript"],
    ["/learning-stats.js", "text/javascript"],
    ["/statistics.js", "text/javascript"],
    ["/settings.js", "text/javascript"],
    ["/autocorrect.js", "text/javascript"],
    ["/styles.css", "text/css"],
    ["/data/introduction.json", "application/json"],
    ["/data/exercises.json", "application/json"],
    ["/data/jlpt-n5-vocabulary.json", "application/json"],
    ["/data/jlpt-n5-grammar.json", "application/json"]
  ]);

  for (const [path, contentType] of expectedTypes) {
    const response = await requestStatic(path);

    assert.equal(response.status, 200, path);
    assert.match(response.headers["Content-Type"], new RegExp(`^${contentType}`));
    assert.ok(response.body.length > 0);
  }
});

test("preview exposes no private files or runtime endpoints", async () => {
  const privatePaths = [
    "/.key",
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
