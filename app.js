const introductionId = "introduction";
const characterDelay = 65;
const characterRevealDuration = 280;
const fadeDuration = 180;
const profileMenuContainer = document.querySelector(".profile-menu-container");
const profileMenuButton = document.querySelector("#profile-menu-button");
const profileMenu = document.querySelector("#profile-menu");
const profileMenuItems = [...profileMenu.querySelectorAll('[role="menuitem"]')];
const settingsMenuItem = document.querySelector("#settings-menu-item");
const statisticsMenuItem = document.querySelector("#statistics-menu-item");
const historyMenuItem = document.querySelector("#history-menu-item");
const settingsDialog = document.querySelector("#settings-dialog");
const settingInputs = [...settingsDialog.querySelectorAll("[data-setting]")];
const settingStateElements = [...settingsDialog.querySelectorAll("[data-setting-state]")];
const activityDialog = document.querySelector("#activity-dialog");
const activityTitle = document.querySelector("#activity-title");
const activityPanels = [...activityDialog.querySelectorAll(".activity-panel")];
const statKindButtons = [...activityDialog.querySelectorAll("[data-stat-kind]")];
const statisticsList = document.querySelector("#statistics-list");
const statisticsEmpty = document.querySelector("#statistics-empty");
const historyList = document.querySelector("#history-list");
const historyEmpty = document.querySelector("#history-empty");
const lessonElement = document.querySelector(".lesson");
const sentenceElement = document.querySelector("#lesson-sentence");
const lessonStage = document.querySelector("#lesson-stage");
const speakButton = document.querySelector("#speak-button");
const actionButton = document.querySelector("#action-button");
const translationInput = document.querySelector("#translation-input");
const solutionElement = document.querySelector("#solution");
const vocabularyDataPromise = loadVocabularyData();
const kanjiDataPromise = loadKanjiData();
const exerciseDataPromise = loadExerciseData();
const speechAvailabilityByUrl = new Map();

let characterIndex = 0;
let currentLesson;
let grammarPointById = new Map();
let vocabularyById;
let kanjiById;
let previousExerciseId;
let lessonRequestId = 0;
let speechAudioPromise;
let speechAudioUrl;
let activeAudio;
let speechAvailable = false;
let autoPlayedLesson;
let controlRevealTimer;
let exerciseSubmitted = false;
let grammarRatings = new Map();
let settings = globalThis.JlptN5Settings.readSettings();
let activeStatKind = "grammar";

function applySettings() {
  document.documentElement.dataset.furigana = String(settings.furigana);
  document.documentElement.dataset.tokenColoring = String(settings.tokenColoring);
  document.documentElement.dataset.translationTooltips = String(settings.translationTooltips);

  for (const input of settingInputs) {
    const value = settings[input.dataset.setting];

    if (input.type === "checkbox") {
      input.checked = value;
    } else {
      input.value = value;
    }
  }

  for (const stateElement of settingStateElements) {
    stateElement.textContent = settings[stateElement.dataset.settingState] ? "ON" : "OFF";
  }
}

function handleSettingChange(event) {
  const input = event.target;
  const value = input.type === "checkbox" ? input.checked : input.value;

  settings = globalThis.JlptN5Settings.writeSettings({
    [input.dataset.setting]: value
  });
  applySettings();

  if (
    input.dataset.setting === "autoPlayAudio" &&
    value &&
    currentLesson &&
    lessonElement.classList.contains("controls-visible")
  ) {
    maybeAutoPlaySpeech();
  }
}

function openSettings() {
  closeProfileMenu();
  settingsDialog.showModal();
}

function createStatisticItem(primaryText, secondaryText, count, language, kind) {
  const item = document.createElement("li");
  const description = document.createElement("span");
  const primary = document.createElement("strong");
  const secondary = document.createElement("span");
  const countElement = document.createElement("span");

  item.className = "statistic-item";
  item.dataset.statKind = kind;
  description.className = "statistic-description";
  primary.className = "statistic-primary";
  primary.lang = language;
  primary.textContent = primaryText;
  secondary.className = "statistic-secondary";
  secondary.textContent = secondaryText;
  countElement.className = "statistic-count";
  countElement.textContent = `${count} ${count === 1 ? "time" : "times"}`;
  description.append(primary, secondary);
  item.append(description, countElement);
  return item;
}

function renderStatistics() {
  const stats = globalThis.JlptN5Stats.readLearningStats();
  const bucket = {
    grammar: stats.grammarPoints,
    vocabulary: stats.vocabulary,
    kanji: stats.kanji
  }[activeStatKind];
  const metadataById = {
    grammar: grammarPointById,
    vocabulary: vocabularyById,
    kanji: kanjiById
  }[activeStatKind];
  const entries = Object.entries(bucket)
    .map(([id, encounter]) => {
      const metadata = metadataById.get(id);

      return metadata ? { metadata, count: encounter.encounterCount } : undefined;
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (left.count !== right.count) {
        return right.count - left.count;
      }

      const leftLabel = activeStatKind === "grammar"
        ? left.metadata.pattern
        : activeStatKind === "vocabulary"
          ? left.metadata.term
          : left.metadata.character;
      const rightLabel = activeStatKind === "grammar"
        ? right.metadata.pattern
        : activeStatKind === "vocabulary"
          ? right.metadata.term
          : right.metadata.character;
      return leftLabel.localeCompare(rightLabel, "ja");
    });

  const items = entries.map(({ metadata, count }) => {
    if (activeStatKind === "grammar") {
      return createStatisticItem(
        metadata.pattern,
        `${metadata.name}: ${metadata.meaning}`,
        count,
        "ja",
        activeStatKind
      );
    }

    if (activeStatKind === "vocabulary") {
      return createStatisticItem(
        `${metadata.term} (${metadata.reading})`,
        metadata.meaning,
        count,
        "ja",
        activeStatKind
      );
    }

    const readings = [
      metadata.onReadings.length > 0 ? `On: ${metadata.onReadings.join("、")}` : "",
      metadata.kunReadings.length > 0 ? `Kun: ${metadata.kunReadings.join("、")}` : ""
    ].filter(Boolean);

    return createStatisticItem(
      metadata.character,
      [metadata.stage, metadata.meaning, ...readings].join(" · "),
      count,
      "ja",
      activeStatKind
    );
  });

  statisticsList.replaceChildren(...items);
  statisticsEmpty.hidden = items.length > 0;
}

function getLocalDayKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function renderHistory() {
  const stats = globalThis.JlptN5Stats.readLearningStats();
  const attempts = [...stats.exerciseHistory].sort((left, right) => {
    return Date.parse(right.submittedAt) - Date.parse(left.submittedAt);
  });
  const dateFormatter = new Intl.DateTimeFormat(settings.userLanguage, { dateStyle: "long" });
  const timeFormatter = new Intl.DateTimeFormat(settings.userLanguage, { timeStyle: "short" });
  const groups = new Map();

  for (const attempt of attempts) {
    const submittedAt = new Date(attempt.submittedAt);
    const dayKey = getLocalDayKey(submittedAt);
    const group = groups.get(dayKey) || { date: submittedAt, attempts: [] };

    group.attempts.push({ ...attempt, date: submittedAt });
    groups.set(dayKey, group);
  }

  const sections = [...groups.values()].map((group) => {
    const section = document.createElement("section");
    const heading = document.createElement("h3");
    const list = document.createElement("ol");

    section.className = "history-day";
    heading.textContent = dateFormatter.format(group.date);
    list.className = "history-attempts";

    for (const attempt of group.attempts) {
      const item = document.createElement("li");
      const time = document.createElement("time");
      const sentence = document.createElement("p");
      const answer = document.createElement("p");
      const answerLabel = document.createElement("span");

      item.className = "history-attempt";
      time.dateTime = attempt.submittedAt;
      time.textContent = timeFormatter.format(attempt.date);
      sentence.className = "history-sentence";
      sentence.lang = "ja";
      sentence.textContent = attempt.text;
      answer.className = "history-answer";
      answerLabel.textContent = "Your answer:";
      answer.append(answerLabel, document.createTextNode(attempt.answer || "No answer"));
      item.append(time, sentence, answer);
      list.append(item);
    }

    section.append(heading, list);
    return section;
  });

  historyList.replaceChildren(...sections);
  historyEmpty.hidden = sections.length > 0;
}

function selectActivityView(viewName) {
  activityTitle.textContent = viewName === "history" ? "History" : "Statistics";

  for (const panel of activityPanels) {
    panel.hidden = panel.id !== `${viewName}-panel`;
  }

  if (viewName === "history") {
    renderHistory();
  } else {
    renderStatistics();
  }
}

async function openActivity(tabName) {
  closeProfileMenu();
  const [, entriesById, kanjiEntriesById] = await Promise.all([
    exerciseDataPromise,
    vocabularyDataPromise,
    kanjiDataPromise
  ]);

  vocabularyById ||= entriesById;
  kanjiById ||= kanjiEntriesById;
  selectActivityView(tabName);
  activityDialog.showModal();
}

function handleStatKindClick(event) {
  const button = event.target.closest("[data-stat-kind]");

  if (!button) {
    return;
  }

  activeStatKind = button.dataset.statKind;

  for (const kindButton of statKindButtons) {
    kindButton.setAttribute("aria-pressed", String(kindButton === button));
  }

  renderStatistics();
}

function handleActivityBackdropClick(event) {
  if (event.target === activityDialog) {
    activityDialog.close();
  }
}

function handleSettingsBackdropClick(event) {
  if (event.target === settingsDialog) {
    settingsDialog.close();
  }
}

function handleProfileMenuClick(event) {
  const menuItem = event.target.closest('[role="menuitem"]');

  if (menuItem === settingsMenuItem) {
    openSettings();
  } else if (menuItem === statisticsMenuItem) {
    void openActivity("statistics");
  } else if (menuItem === historyMenuItem) {
    void openActivity("history");
  } else if (menuItem) {
    closeProfileMenu();
  }
}

function openProfileMenu(itemToFocus = profileMenuItems[0]) {
  profileMenu.hidden = false;
  profileMenuButton.setAttribute("aria-expanded", "true");
  itemToFocus?.focus();
}

function closeProfileMenu(restoreFocus = false) {
  profileMenu.hidden = true;
  profileMenuButton.setAttribute("aria-expanded", "false");

  if (restoreFocus) {
    profileMenuButton.focus();
  }
}

function handleProfileMenuButtonClick() {
  if (profileMenu.hidden) {
    openProfileMenu();
  } else {
    closeProfileMenu(true);
  }
}

function handleProfileMenuButtonKeydown(event) {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    openProfileMenu();
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    openProfileMenu(profileMenuItems.at(-1));
  }
}

function handleProfileMenuKeydown(event) {
  const currentIndex = profileMenuItems.indexOf(document.activeElement);
  let nextIndex;

  if (event.key === "Escape") {
    event.preventDefault();
    closeProfileMenu(true);
    return;
  }

  if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = profileMenuItems.length - 1;
  } else if (event.key === "ArrowDown") {
    nextIndex = (currentIndex + 1) % profileMenuItems.length;
  } else if (event.key === "ArrowUp") {
    nextIndex = (currentIndex - 1 + profileMenuItems.length) % profileMenuItems.length;
  } else {
    return;
  }

  event.preventDefault();
  profileMenuItems[nextIndex].focus();
}

function handleOutsideProfileMenuClick(event) {
  if (!profileMenu.hidden && !profileMenuContainer.contains(event.target)) {
    closeProfileMenu();
  }
}

function handleProfileMenuFocusOut(event) {
  if (!profileMenuContainer.contains(event.relatedTarget)) {
    closeProfileMenu();
  }
}

function createCharacterElement(character) {
  const characterElement = document.createElement("span");
  characterElement.className = "character";
  characterElement.style.setProperty("--delay", `${characterIndex * characterDelay}ms`);
  characterElement.textContent = character;
  characterIndex += 1;
  return characterElement;
}

function createTokenElement(token) {
  const tokenElement = document.createElement("span");
  const vocabularyEntry = vocabularyById.get(token.vocabularyId);
  tokenElement.className = "token";

  if (token.category) {
    tokenElement.dataset.category = token.category;
  }

  if (["noun", "verb", "adjective", "adverb"].includes(token.category) && vocabularyEntry) {
    tokenElement.dataset.gloss = vocabularyEntry.meaning;
  }

  if (token.reading && /\p{Script=Han}/u.test(token.surface)) {
    const ruby = document.createElement("ruby");
    const annotation = document.createElement("rt");

    for (const character of token.surface) {
      ruby.append(createCharacterElement(character));
    }

    annotation.textContent = token.reading;
    annotation.style.setProperty(
      "--delay",
      `${(characterIndex - 1) * characterDelay + characterRevealDuration}ms`
    );
    ruby.append(annotation);
    tokenElement.append(ruby);
  } else {
    for (const character of token.surface) {
      tokenElement.append(createCharacterElement(character));
    }
  }

  tokenElement.style.setProperty(
    "--token-delay",
    `${(characterIndex - 1) * characterDelay + characterRevealDuration}ms`
  );

  return tokenElement;
}

function renderSentence(text, tokens) {
  if (tokens.map(({ surface }) => surface).join("") !== text) {
    throw new Error("Tokenizer output does not match the lesson sentence.");
  }

  sentenceElement.replaceChildren();
  sentenceElement.setAttribute("aria-label", text);
  characterIndex = 0;

  let phraseElement = document.createElement("span");
  phraseElement.className = "phrase";

  for (const token of tokens) {
    phraseElement.append(createTokenElement(token));

    if (token.surface.endsWith("。")) {
      sentenceElement.append(phraseElement);
      phraseElement = document.createElement("span");
      phraseElement.className = "phrase";
    }
  }

  if (phraseElement.hasChildNodes()) {
    sentenceElement.append(phraseElement);
  }

  return characterIndex === 0
    ? 0
    : (characterIndex - 1) * characterDelay + characterRevealDuration;
}

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`${url} could not be loaded.`);
  }

  return response.json();
}

async function loadVocabularyData() {
  const vocabulary = await fetchJson("data/jlpt-n5-vocabulary.json");
  const entriesById = new Map(vocabulary.map((entry) => [entry.id, entry]));

  if (entriesById.size !== vocabulary.length) {
    throw new Error("Vocabulary ids must be unique.");
  }

  return entriesById;
}

async function loadKanjiData() {
  const kanji = await fetchJson("data/jlpt-n5-kanji.json");
  const entriesById = new Map(kanji.map((entry) => [entry.id, entry]));

  if (entriesById.size !== kanji.length) {
    throw new Error("Kanji ids must be unique.");
  }

  return entriesById;
}

async function loadExerciseData() {
  const [grammarPoints, exercises, entriesById, kanjiEntriesById] = await Promise.all([
    fetchJson("data/jlpt-n5-grammar.json"),
    fetchJson("data/exercises.json"),
    vocabularyDataPromise,
    kanjiDataPromise
  ]);
  const grammarPointIds = new Set(grammarPoints.map(({ id }) => id));
  const validExercises = exercises.filter((exercise) => {
    return (
      typeof exercise.solution === "string" &&
      exercise.solution.trim().length > 0 &&
      Array.isArray(exercise.tokens) &&
      exercise.tokens.map(({ surface }) => surface).join("") === exercise.text &&
      exercise.tokens.every(({ vocabularyId }) => {
        return !vocabularyId || entriesById.has(vocabularyId);
      }) &&
      Array.isArray(exercise.kanjiIds) &&
      exercise.kanjiIds.every((id) => kanjiEntriesById.has(id)) &&
      Array.isArray(exercise.grammarPointIds) &&
      exercise.grammarPointIds.length >= 2 &&
      exercise.grammarPointIds.every((id) => grammarPointIds.has(id))
    );
  });

  if (validExercises.length === 0) {
    throw new Error("No exercise references at least two known grammar points.");
  }

  grammarPointById = new Map(
    grammarPoints.map((grammarPoint) => [grammarPoint.id, grammarPoint])
  );
  return validExercises;
}

async function pickNextExercise() {
  const exercises = await exerciseDataPromise;
  const choices = exercises.filter(({ id }) => id !== previousExerciseId);
  const availableExercises = choices.length > 0 ? choices : exercises;
  const availableGrammarPointIds = [
    ...new Set(availableExercises.flatMap(({ grammarPointIds }) => grammarPointIds))
  ];
  const targetGrammarPointId = globalThis.JlptN5Srs.pickNextGrammarPoint(
    availableGrammarPointIds
  );
  const matchingExercises = availableExercises.filter(({ grammarPointIds }) => {
    return grammarPointIds.includes(targetGrammarPointId);
  });
  const exercisePool = matchingExercises.length > 0 ? matchingExercises : availableExercises;
  const exercise = exercisePool[Math.floor(Math.random() * exercisePool.length)];

  previousExerciseId = exercise.id;
  return exercise;
}

function resetSpeechAudio() {
  activeAudio?.pause();
  activeAudio = undefined;
  speechAudioPromise = undefined;

  if (speechAudioUrl) {
    URL.revokeObjectURL(speechAudioUrl);
    speechAudioUrl = undefined;
  }
}

function getSpeechAvailability(audioUrl) {
  if (!speechAvailabilityByUrl.has(audioUrl)) {
    const availability = fetch(audioUrl, { method: "HEAD" })
      .then((response) => response.ok)
      .catch(() => false);

    speechAvailabilityByUrl.set(audioUrl, availability);
  }

  return speechAvailabilityByUrl.get(audioUrl);
}

async function updateSpeechAvailability(lesson) {
  setSpeakButtonState("checking");
  const available = await getSpeechAvailability(lesson.audio);

  if (currentLesson !== lesson) {
    return;
  }

  speechAvailable = available;
  setSpeakButtonState(available ? "ready" : "unavailable");
  maybeAutoPlaySpeech();
}

function maybeAutoPlaySpeech() {
  if (
    settings.autoPlayAudio &&
    speechAvailable &&
    autoPlayedLesson !== currentLesson &&
    lessonElement.classList.contains("controls-visible")
  ) {
    autoPlayedLesson = currentLesson;
    void speakSentence();
  }
}

function hideControls() {
  window.clearTimeout(controlRevealTimer);
  lessonElement.classList.remove("controls-visible");
}

function revealControlsAfter(delay) {
  hideControls();
  const effectiveDelay = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? 0
    : delay;

  controlRevealTimer = window.setTimeout(() => {
    lessonElement.classList.add("controls-visible");

    maybeAutoPlaySpeech();

    if (!translationInput.hidden) {
      translationInput.focus({ preventScroll: true });
    }
  }, effectiveDelay);
}

function displayLesson(lesson) {
  hideControls();
  resetSpeechAudio();
  currentLesson = lesson;
  speechAvailable = false;
  autoPlayedLesson = undefined;
  exerciseSubmitted = false;
  grammarRatings = new Map();
  solutionElement.classList.remove("is-visible");
  solutionElement.textContent = "";
  actionButton.textContent = lesson.id === introductionId ? "次へ" : "送信";
  const sentenceDrawDuration = renderSentence(lesson.text, lesson.tokens);

  if (lesson.id !== introductionId) {
    globalThis.JlptN5Stats?.recordExerciseEncounter(lesson);
  }

  void updateSpeechAvailability(lesson);
  revealControlsAfter(sentenceDrawDuration);
}

async function displayInitialLesson() {
  const requestId = ++lessonRequestId;

  try {
    const [introduction, entriesById] = await Promise.all([
      fetchJson("data/introduction.json"),
      vocabularyDataPromise
    ]);

    if (
      !Array.isArray(introduction.tokens) ||
      introduction.tokens.map(({ surface }) => surface).join("") !== introduction.text
    ) {
      throw new Error("The introduction has invalid prepared tokens.");
    }

    if (requestId === lessonRequestId) {
      vocabularyById = entriesById;
      displayLesson(introduction);
    }
  } catch (error) {
    console.error(error);
  }
}

function waitForFadeOut() {
  const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? 0
    : fadeDuration;
  return new Promise((resolve) => window.setTimeout(resolve, delay));
}

async function showNextExercise() {
  const requestId = ++lessonRequestId;
  hideControls();
  actionButton.disabled = true;
  lessonStage.classList.add("is-leaving");

  try {
    const exercise = await pickNextExercise();

    await waitForFadeOut();

    if (requestId !== lessonRequestId) {
      return;
    }

    displayLesson(exercise);
    translationInput.value = "";
    translationInput.hidden = false;
    lessonStage.classList.remove("is-leaving");
  } catch (error) {
    console.error(error);
    lessonStage.classList.remove("is-leaving");
    revealControlsAfter(0);
  } finally {
    actionButton.disabled = false;
  }
}

function revealSolution() {
  globalThis.JlptN5Stats.recordExerciseAttempt(currentLesson, translationInput.value);
  exerciseSubmitted = true;
  const answer = document.createElement("p");
  const grammarSection = document.createElement("details");
  const grammarSummary = document.createElement("summary");
  const grammarList = document.createElement("ul");

  answer.className = "solution-answer";
  answer.textContent = currentLesson.solution;
  grammarSection.className = "solution-grammar";
  grammarSection.open = true;
  grammarSummary.className = "solution-grammar-summary";
  grammarSummary.lang = "ja";
  grammarList.className = "solution-grammar-list";

  for (const grammarPointId of currentLesson.grammarPointIds) {
    const grammarPoint = grammarPointById.get(grammarPointId);

    if (!grammarPoint) {
      continue;
    }

    const item = document.createElement("li");
    const pattern = document.createElement("span");
    const description = document.createElement("span");
    const name = document.createElement("strong");
    const meaning = document.createElement("span");
    const ratingControl = document.createElement("div");

    item.className = "solution-grammar-item";
    pattern.className = "solution-grammar-pattern";
    pattern.lang = "ja";
    pattern.textContent = grammarPoint.pattern;
    description.className = "solution-grammar-description";
    name.className = "solution-grammar-name";
    name.textContent = grammarPoint.name;
    meaning.className = "solution-grammar-meaning";
    meaning.textContent = grammarPoint.meaning;
    ratingControl.className = "solution-grammar-rating";
    ratingControl.dataset.grammarPointId = grammarPointId;
    ratingControl.setAttribute("role", "group");
    ratingControl.setAttribute("aria-label", `${grammarPoint.name} の自己評価`);

    for (const [outcome, label] of [
      ["again", "できなかった"],
      ["good", "できた"]
    ]) {
      const ratingButton = document.createElement("button");

      ratingButton.type = "button";
      ratingButton.lang = "ja";
      ratingButton.dataset.grammarRating = outcome;
      ratingButton.setAttribute("aria-pressed", "false");
      ratingButton.textContent = label;
      ratingControl.append(ratingButton);
    }

    description.append(name, meaning);
    item.append(pattern, description, ratingControl);
    grammarList.append(item);
  }

  grammarSummary.textContent = `文法を評価（0/${grammarList.childElementCount}）`;
  grammarSection.append(grammarSummary, grammarList);
  solutionElement.replaceChildren(answer, grammarSection);
  actionButton.textContent = "次へ";
  actionButton.disabled = true;

  window.requestAnimationFrame(() => {
    solutionElement.classList.add("is-visible");
  });
}

function handleGrammarRating(event) {
  const ratingButton = event.target.closest("button[data-grammar-rating]");

  if (!ratingButton || !solutionElement.contains(ratingButton)) {
    return;
  }

  const ratingControl = ratingButton.closest(".solution-grammar-rating");
  const grammarPointId = ratingControl.dataset.grammarPointId;

  grammarRatings.set(grammarPointId, ratingButton.dataset.grammarRating);

  for (const button of ratingControl.querySelectorAll("button[data-grammar-rating]")) {
    button.setAttribute("aria-pressed", String(button === ratingButton));
  }

  const ratedCount = grammarRatings.size;
  const totalCount = currentLesson.grammarPointIds.length;
  const grammarSummary = solutionElement.querySelector(".solution-grammar-summary");

  grammarSummary.textContent = ratedCount === totalCount
    ? `文法を評価済み（${ratedCount}/${totalCount}）`
    : `文法を評価（${ratedCount}/${totalCount}）`;
  actionButton.disabled = ratedCount !== totalCount;
}

function recordCurrentGrammarReviews() {
  const reviews = currentLesson.grammarPointIds.map((grammarPointId) => ({
    grammarPointId,
    outcome: grammarRatings.get(grammarPointId)
  }));

  globalThis.JlptN5Srs.recordReviews(reviews);
}

function handleAction() {
  if (currentLesson.id === introductionId) {
    showNextExercise();
    return;
  }

  if (exerciseSubmitted) {
    recordCurrentGrammarReviews();
    showNextExercise();
    return;
  }

  revealSolution();
}

function setSpeakButtonState(state) {
  const isLoading = state === "loading";
  const isChecking = state === "checking";
  const isUnavailable = state === "unavailable";
  const hasError = state === "error";
  let label = "音声を再生";

  if (isUnavailable) {
    label = "音声はありません";
  } else if (hasError) {
    label = "音声を再試行";
  } else if (isLoading) {
    label = "音声を読み込み中";
  } else if (isChecking) {
    label = "音声を確認中";
  }

  speakButton.disabled = isLoading || isChecking || isUnavailable;
  speakButton.classList.toggle("is-loading", isLoading);
  speakButton.classList.toggle("no-audio", isUnavailable);
  speakButton.classList.toggle("has-error", hasError);
  speakButton.setAttribute("aria-busy", String(isLoading || isChecking));
  speakButton.setAttribute("aria-label", label);
  speakButton.title = label;
}

async function loadSpeechAudio() {
  const response = await fetch(currentLesson.audio);

  if (!response.ok) {
    throw new Error("Speech could not be loaded.");
  }

  const audioBlob = await response.blob();
  speechAudioUrl = URL.createObjectURL(audioBlob);
  return new Audio(speechAudioUrl);
}

async function speakSentence() {
  if (!speechAvailable) {
    return;
  }

  setSpeakButtonState("loading");

  try {
    speechAudioPromise ||= loadSpeechAudio().catch((error) => {
      speechAudioPromise = undefined;
      throw error;
    });

    activeAudio = await speechAudioPromise;
    activeAudio.currentTime = 0;
    await activeAudio.play();
    setSpeakButtonState("ready");
  } catch (error) {
    console.error(error);
    setSpeakButtonState("error");
  }
}

profileMenuButton.addEventListener("click", handleProfileMenuButtonClick);
profileMenuButton.addEventListener("keydown", handleProfileMenuButtonKeydown);
profileMenu.addEventListener("keydown", handleProfileMenuKeydown);
profileMenu.addEventListener("click", handleProfileMenuClick);
profileMenuContainer.addEventListener("focusout", handleProfileMenuFocusOut);
document.addEventListener("pointerdown", handleOutsideProfileMenuClick);
settingsDialog.addEventListener("click", handleSettingsBackdropClick);
settingsDialog.addEventListener("close", () => profileMenuButton.focus());
settingsDialog.addEventListener("change", handleSettingChange);
activityDialog.addEventListener("click", handleActivityBackdropClick);
activityDialog.addEventListener("close", () => profileMenuButton.focus());
activityDialog.querySelector(".stat-kind-control").addEventListener("click", handleStatKindClick);
actionButton.addEventListener("click", handleAction);
solutionElement.addEventListener("click", handleGrammarRating);
speakButton.addEventListener("click", speakSentence);
window.addEventListener("beforeunload", resetSpeechAudio);
applySettings();
displayInitialLesson();
