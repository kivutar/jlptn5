const introductionId = "introduction";
const studySections = new Set(["grammar", "hiragana", "katakana", "kanji", "vocabulary"]);
const pathnameSection = window.location.pathname
  .replace(/\/+$/u, "")
  .split("/")
  .at(-1);
const currentStudySection = studySections.has(pathnameSection)
  ? pathnameSection
  : "grammar";
const exerciseTypes = new Set(["recognition", "production"]);
const requestedExerciseType = new URLSearchParams(window.location.search)
  .get("type");
const forcedExerciseType = exerciseTypes.has(requestedExerciseType)
  ? requestedExerciseType
  : undefined;
const characterDelay = 65;
const characterRevealDuration = 280;
const fadeDuration = 180;
const splashWasAlreadyShown = document.documentElement.dataset.splashShown === "true";
const minimumLoadingDuration = splashWasAlreadyShown ? 0 : 1600;
const loadingStartedAt = window.performance.now();
const preferredDarkColorScheme = window.matchMedia("(prefers-color-scheme: dark)");
const loadingScreen = document.querySelector("#loading-screen");
const profileMenuContainer = document.querySelector(".profile-menu-container");
const profileMenuButton = document.querySelector("#profile-menu-button");
const profileMenu = document.querySelector("#profile-menu");
const profileMenuItems = [...profileMenu.querySelectorAll('[role="menuitem"]')];
const currentStudyLabel = document.querySelector("#current-study-label");
const studyMenuItems = [...profileMenu.querySelectorAll("[data-study-section]")];
const settingsMenuItem = document.querySelector("#settings-menu-item");
const statisticsMenuItem = document.querySelector("#statistics-menu-item");
const historyMenuItem = document.querySelector("#history-menu-item");
const privacyMenuItem = document.querySelector("#privacy-menu-item");
const settingsDialog = document.querySelector("#settings-dialog");
const settingInputs = [...settingsDialog.querySelectorAll("[data-setting]")];
const settingStateElements = [...settingsDialog.querySelectorAll("[data-setting-state]")];
const openAiApiKeyInput = document.querySelector("#openai-api-key");
const aiAutoCorrectInput = settingsDialog.querySelector('[data-setting="aiAutoCorrect"]');
const progressExportButton = document.querySelector("#progress-export-button");
const progressImportButton = document.querySelector("#progress-import-button");
const progressImportInput = document.querySelector("#progress-import-input");
const progressResetButton = document.querySelector("#progress-reset-button");
const progressTransferStatus = document.querySelector("#progress-transfer-status");
const reviewReminderTimeInput = document.querySelector("#review-reminder-time");
const activityDialog = document.querySelector("#activity-dialog");
const activityBody = activityDialog.querySelector(".activity-body");
const activityTitle = document.querySelector("#activity-title");
const activityPanels = [...activityDialog.querySelectorAll(".activity-panel")];
const statKindButtons = [...activityDialog.querySelectorAll("[data-stat-kind]")];
const statisticsContent = document.querySelector("#statistics-content");
const historyList = document.querySelector("#history-list");
const historyEmpty = document.querySelector("#history-empty");
const lessonElement = document.querySelector(".lesson");
const sentenceElement = document.querySelector("#lesson-sentence");
const lessonStage = document.querySelector("#lesson-stage");
const exerciseKindLabel = document.querySelector("#exercise-kind-label");
const kanaGuidance = document.querySelector("#kana-guidance");
const kanaWrittenForm = document.querySelector("#kana-written-form");
const kanaGuidanceDivider = document.querySelector("#kana-guidance-divider");
const kanaMeaning = document.querySelector("#kana-meaning");
const katakanaMeaningHint = document.querySelector("#katakana-meaning-hint");
const katakanaMeaning = document.querySelector("#katakana-meaning");
const kanjiGuidance = document.querySelector("#kanji-guidance");
const kanjiReading = document.querySelector("#kanji-reading");
const kanjiGuidanceDivider = document.querySelector("#kanji-guidance-divider");
const kanjiMeaningHint = document.querySelector("#kanji-meaning-hint");
const kanjiMeaning = document.querySelector("#kanji-meaning");
const vocabularyGuidance = document.querySelector("#vocabulary-guidance");
const vocabularyReading = document.querySelector("#vocabulary-reading");
const vocabularyGuidanceDivider = document.querySelector("#vocabulary-guidance-divider");
const vocabularyPartOfSpeech = document.querySelector("#vocabulary-part-of-speech");
const productionGuidance = document.querySelector("#production-guidance");
const productionGrammarTargets = document.querySelector("#production-grammar-targets");
const speakButton = document.querySelector("#speak-button");
const actionButton = document.querySelector("#action-button");
const translationInput = document.querySelector("#translation-input");
const kanjiChoiceGrid = document.querySelector("#kanji-choice-grid");
const solutionElement = document.querySelector("#solution");
const speechAvailabilityByUrl = new Map();
const bundledSpeechPathsPromise = globalThis.JlptN5Native?.isNative
  ? loadBundledSpeechPaths()
  : Promise.resolve(null);

let characterIndex = 0;
let currentLesson;
let grammarPointById = new Map();
let vocabularyById;
let kanjiById;
let hiraganaWords;
let katakanaWords;
let kanjiExercisePool;
let vocabularyItems;
let hiraganaMetadata = [];
let katakanaMetadata = [];
let katakanaPairInventory = [];
let katakanaSingleItems = [];
let pairedHiraganaMetadata = [];
let previousExerciseId;
let previousHiraganaVocabularyId;
let previousKatakanaVocabularyId;
let previousKanjiVocabularyId;
let lessonRequestId = 0;
let speechAudioPromise;
let speechAudioUrl;
let activeAudio;
let speechAvailable = false;
let autoPlayedLesson;
let controlRevealTimer;
let exerciseSubmitted = false;
let grammarRatings = new Map();
let vocabularyRating;
let kanjiRating;
let selectedKanjiAnswer;
let currentAttemptSubmittedAt;
let contextualVocabularyReviewIds = [];
let revealedVocabularyIds = new Set();
let settings = { ...globalThis.JlptN5Settings.defaults };
let openAiApiKey = globalThis.JlptN5Settings.readOpenAiApiKey();
let autoCorrectController;
let activeStatKind = ["hiragana", "katakana", "kanji", "vocabulary"].includes(currentStudySection)
  ? currentStudySection
  : "overview";
let activeGrammarFilter = "all";
let activeExposureSort = "recent";
let historyDayPage = 0;
let expandedHistoryDayKey;
let historyAttemptPage = 0;
let kanaInputMode;
let vocabularyDataPromise;
let kanjiDataPromise;
let kanjiContextDataPromise;
let exerciseDataPromise;
const reviewReminderNotificationId = 1905;

function t(key, parameters) {
  return globalThis.JlptN5I18n.t(key, parameters);
}

function getUserLocale() {
  return globalThis.JlptN5I18n.getLocale();
}

function getAcceptedTranslationLocales() {
  const activeLocale = getUserLocale();

  return [
    activeLocale,
    ...globalThis.JlptN5I18n.supportedLocales.filter((locale) => locale !== activeLocale)
  ];
}

function formatAcceptedTranslationLanguages() {
  const locale = getUserLocale();
  const displayNames = new Intl.DisplayNames([locale], { type: "language" });
  const languageNames = getAcceptedTranslationLocales().map((language) => {
    return displayNames.of(language) || language;
  });

  return new Intl.ListFormat(locale, { style: "long", type: "disjunction" })
    .format(languageNames);
}

function initializeDataPromises() {
  vocabularyDataPromise = loadVocabularyData();
  kanjiDataPromise = loadKanjiData();
  kanjiContextDataPromise = loadKanjiContextData();
  exerciseDataPromise = loadExerciseData();
}

async function giveAnswerHaptic(succeeded) {
  const haptics = globalThis.JlptN5Native?.plugins?.haptics;

  if (!haptics) {
    return;
  }

  try {
    await haptics.notification({ type: succeeded ? "SUCCESS" : "ERROR" });
  } catch {
    // Haptics are enhancement-only and may be disabled by the device.
  }
}

function getStudyUrl(section) {
  const pathname = window.location.pathname;

  if (/\/(?:grammar|hiragana|katakana|kanji|vocabulary)\/?$/u.test(pathname)) {
    return pathname.replace(
      /\/(?:grammar|hiragana|katakana|kanji|vocabulary)\/?$/u,
      `/${section}`
    );
  }

  const directory = pathname.endsWith("/")
    ? pathname.replace(/\/+$/u, "")
    : pathname.slice(0, pathname.lastIndexOf("/"));

  return `${directory}/${section}`.replace(/^\/\//u, "/");
}

function configureStudyNavigation() {
  const label = {
    grammar: t("section.grammar"),
    hiragana: t("section.hiragana"),
    katakana: t("section.katakana"),
    kanji: t("section.kanji"),
    vocabulary: t("section.vocabulary")
  }[currentStudySection];

  currentStudyLabel.textContent = label;
  document.title = `${label} · ChakuChaku`;
  privacyMenuItem.href = `https://kivutar.github.io/jlptn5/privacy.html?lang=${getUserLocale()}`;

  for (const menuItem of studyMenuItems) {
    const isCurrent = menuItem.dataset.studySection === currentStudySection;

    menuItem.href = getStudyUrl(menuItem.dataset.studySection);

    if (isCurrent) {
      menuItem.setAttribute("aria-current", "page");
    } else {
      menuItem.removeAttribute("aria-current");
    }
  }

  for (const kindButton of statKindButtons) {
    kindButton.setAttribute(
      "aria-pressed",
      String(kindButton.dataset.statKind === activeStatKind)
    );
  }

  if (!studySections.has(pathnameSection)) {
    window.history.replaceState(
      null,
      "",
      `${getStudyUrl(currentStudySection)}${window.location.search}${window.location.hash}`
    );
  }
}

function getExerciseType(lesson) {
  return lesson?.type || "recognition";
}

function getJapaneseText(lesson) {
  return getExerciseType(lesson) === "production" ? lesson.solution : lesson.text;
}

function getVocabularyReadingLabel(lesson) {
  return [...new Set([
    lesson?.reading,
    ...(Array.isArray(lesson?.alternateReadings) ? lesson.alternateReadings : [])
  ].filter(Boolean))].join(" / ");
}

function setKanaInputMode(mode) {
  const isEnabled = translationInput.hasAttribute("data-wanakana-id");

  if (isEnabled && kanaInputMode !== mode) {
    globalThis.wanakana.unbind(translationInput);
  }

  if (mode && !translationInput.hasAttribute("data-wanakana-id")) {
    const options = mode === "hiragana"
      ? { IMEMode: "toHiragana" }
      : mode === "katakana"
        ? { IMEMode: "toKatakana" }
        : undefined;

    globalThis.wanakana.bind(translationInput, options);
  }

  kanaInputMode = mode;
}

function resizeTranslationInput() {
  if (!translationInput.value) {
    translationInput.style.height = "";
    return;
  }

  translationInput.style.height = "auto";
  translationInput.style.height = `${translationInput.scrollHeight}px`;
}

function handleTranslationInputResize() {
  window.requestAnimationFrame(resizeTranslationInput);
}

function clearTranslationInput() {
  translationInput.value = "";
  translationInput.style.height = "";
}

function isKanjiChoiceExercise(lesson) {
  return lesson?.section === "kanji" && lesson.direction ===
    globalThis.JlptN5Kanji.directions.readingToKanji;
}

function configureAnswerControls(lesson) {
  const usesKanjiChoices = isKanjiChoiceExercise(lesson);

  translationInput.hidden = usesKanjiChoices;
  kanjiChoiceGrid.hidden = !usesKanjiChoices;
}

function renderKanjiChoices(lesson) {
  selectedKanjiAnswer = undefined;
  kanjiChoiceGrid.replaceChildren();
  delete kanjiChoiceGrid.dataset.submitted;

  if (!isKanjiChoiceExercise(lesson)) {
    return;
  }

  for (const character of lesson.choices || []) {
    const button = document.createElement("button");

    button.type = "button";
    button.lang = "ja";
    button.dataset.kanjiChoice = character;
    button.setAttribute("aria-pressed", "false");
    button.textContent = character;
    kanjiChoiceGrid.append(button);
  }

  actionButton.disabled = true;
}

function selectKanjiChoice(character) {
  if (
    exerciseSubmitted ||
    !isKanjiChoiceExercise(currentLesson) ||
    !currentLesson.choices?.includes(character)
  ) {
    return;
  }

  selectedKanjiAnswer = character;
  translationInput.value = character;

  for (const button of kanjiChoiceGrid.querySelectorAll("button[data-kanji-choice]")) {
    button.setAttribute("aria-pressed", String(button.dataset.kanjiChoice === character));
  }

  actionButton.disabled = false;
}

function handleKanjiChoiceClick(event) {
  const button = event.target.closest("button[data-kanji-choice]");

  if (!button || !kanjiChoiceGrid.contains(button)) {
    return;
  }

  selectKanjiChoice(button.dataset.kanjiChoice);
}

function commitPendingKanaInput() {
  if (!kanaInputMode || !translationInput.value) {
    return;
  }

  const convert = kanaInputMode === "hiragana"
    ? globalThis.wanakana.toHiragana
    : kanaInputMode === "katakana"
      ? globalThis.wanakana.toKatakana
      : globalThis.wanakana.toKana;
  const committedValue = convert(translationInput.value);

  if (committedValue !== translationInput.value) {
    translationInput.value = committedValue;
    resizeTranslationInput();
  }
}

function applySettings() {
  const autoCorrectAvailable = Boolean(openAiApiKey);

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
    const settingName = stateElement.dataset.settingState;
    const enabled = settingName === "aiAutoCorrect"
      ? settings[settingName] && autoCorrectAvailable
      : settings[settingName];

    stateElement.textContent = enabled ? t("common.on") : t("common.off");
  }

  openAiApiKeyInput.value = openAiApiKey;
  aiAutoCorrectInput.disabled = !autoCorrectAvailable;
  aiAutoCorrectInput.closest(".setting-row").classList.toggle(
    "is-disabled",
    !autoCorrectAvailable
  );
  reviewReminderTimeInput.disabled = !settings.reviewReminder;
  reviewReminderTimeInput.closest(".setting-row").classList.toggle(
    "is-disabled",
    !settings.reviewReminder
  );
}

async function synchronizeReviewReminder({ requestPermission = false } = {}) {
  const native = globalThis.JlptN5Native;
  const notifications = native?.plugins?.localNotifications;

  if (!native?.isNative || !notifications) {
    return;
  }

  try {
    await notifications.cancel({
      notifications: [{ id: reviewReminderNotificationId }]
    });

    if (!settings.reviewReminder) {
      return;
    }

    let permission = await notifications.checkPermissions();

    if (permission.display !== "granted" && requestPermission) {
      permission = await notifications.requestPermissions();
    }

    if (permission.display !== "granted") {
      settings = globalThis.JlptN5Settings.writeSettings({ reviewReminder: false });
      applySettings();
      setProgressTransferStatus(
        requestPermission
          ? t("settings.notificationsDenied")
          : t("settings.notificationsPermission"),
        true
      );
      return;
    }

    if (native.platform === "android") {
      await notifications.createChannel({
        id: "study-reminders",
        name: t("settings.reminderChannel"),
        description: t("settings.reminderChannelDescription"),
        importance: 3,
        visibility: 1
      });
    }

    const [hour, minute] = settings.reviewReminderTime.split(":").map(Number);

    await notifications.schedule({
      notifications: [{
        id: reviewReminderNotificationId,
        title: t("settings.reminderTitle"),
        body: t("settings.reminderBody"),
        channelId: native.platform === "android" ? "study-reminders" : undefined,
        schedule: {
          on: { hour, minute },
          repeats: true,
          isExactNotification: false
        }
      }]
    });
    setProgressTransferStatus(t("settings.reminderSet", { time: settings.reviewReminderTime }));
  } catch (error) {
    console.error(error);
    setProgressTransferStatus(t("settings.reminderFailed"), true);
  }
}

function handleSettingChange(event) {
  const input = event.target;

  if (input === openAiApiKeyInput) {
    openAiApiKey = globalThis.JlptN5Settings.writeOpenAiApiKey(input.value);

    if (!openAiApiKey && settings.aiAutoCorrect) {
      settings = globalThis.JlptN5Settings.writeSettings({ aiAutoCorrect: false });
    }

    applySettings();
    return;
  }

  if (!input.dataset.setting) {
    return;
  }

  const value = input.type === "checkbox" ? input.checked : input.value;

  settings = globalThis.JlptN5Settings.writeSettings({
    [input.dataset.setting]: value
  });
  applySettings();

  if (input.dataset.setting === "userLanguage") {
    window.location.reload();
    return;
  }

  if (["reviewReminder", "reviewReminderTime"].includes(input.dataset.setting)) {
    void synchronizeReviewReminder({
      requestPermission: input.dataset.setting === "reviewReminder" && value
    });
  }

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

function setProgressTransferStatus(message, isError = false) {
  progressTransferStatus.textContent = message;
  progressTransferStatus.classList.toggle("is-error", isError);
}

function getProgressBackupFilename(now = new Date()) {
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("-");

  return `chakuchaku-progress-${date}.json`;
}

async function exportProgress() {
  progressExportButton.disabled = true;

  try {
    const contents = globalThis.JlptN5Progress.serializeBackup();
    const filename = getProgressBackupFilename();
    const nativePlugins = globalThis.JlptN5Native?.plugins;

    if (globalThis.JlptN5Native?.isNative && nativePlugins?.filesystem && nativePlugins?.share) {
      const file = await nativePlugins.filesystem.writeFile({
        path: filename,
        data: contents,
        directory: nativePlugins.filesystemDirectory.Cache,
        encoding: nativePlugins.filesystemEncoding.UTF8
      });

      await nativePlugins.share.share({
        title: t("progress.backupTitle"),
        files: [file.uri],
        dialogTitle: t("progress.backupDialog")
      });
    } else {
      const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
      const link = document.createElement("a");

      link.href = url;
      link.download = filename;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    }

    setProgressTransferStatus(t("progress.exported"));
  } catch (error) {
    console.error(error);
    setProgressTransferStatus(t("progress.exportFailed"), true);
  } finally {
    progressExportButton.disabled = false;
  }
}

function chooseProgressImport() {
  progressImportInput.value = "";
  progressImportInput.click();
}

async function importProgress() {
  const [file] = progressImportInput.files;

  if (!file) {
    return;
  }

  progressImportButton.disabled = true;
  setProgressTransferStatus(t("progress.checking"));

  try {
    if (file.size > globalThis.JlptN5Progress.maximumImportBytes) {
      throw new Error(t("progress.tooLarge"));
    }

    const result = globalThis.JlptN5Progress.importBackup(await file.text());

    await globalThis.JlptN5Storage.flush();
    setProgressTransferStatus(
      t("progress.imported", { cards: result.cardCount, history: result.historyCount })
    );
    window.setTimeout(() => window.location.reload(), 500);
  } catch (error) {
    console.error(error);
    const localizedError = typeof error.code === "string"
      ? t(`progress.error.${error.code}`)
      : t("progress.importFailed");
    setProgressTransferStatus(localizedError, true);
    progressImportButton.disabled = false;
  }
}

async function resetProgress() {
  const confirmed = window.confirm(
    t("progress.resetConfirm")
  );

  if (!confirmed) {
    return;
  }

  progressResetButton.disabled = true;
  globalThis.JlptN5Progress.clearProgress();
  await globalThis.JlptN5Storage.flush();
  window.location.reload();
}

function formatShortDate(value) {
  return new Intl.DateTimeFormat(getUserLocale(), { dateStyle: "medium" })
    .format(new Date(value));
}

function formatDueDate(value, now = new Date()) {
  const milliseconds = Date.parse(value) - now.getTime();

  if (milliseconds <= 0) {
    return t("statistics.dueNow");
  }

  const minutes = Math.ceil(milliseconds / 60_000);

  if (minutes < 60) {
    return t("statistics.inMinutes", { count: minutes });
  }

  const hours = Math.ceil(milliseconds / 3_600_000);

  if (hours < 24) {
    return t("statistics.inHours", { count: hours });
  }

  const days = Math.ceil(milliseconds / 86_400_000);
  const relative = new Intl.RelativeTimeFormat(getUserLocale(), { numeric: "auto" })
    .format(days, "day");

  return relative.charAt(0).toUpperCase() + relative.slice(1);
}

function formatStability(value) {
  const days = Number(value);

  if (!Number.isFinite(days)) {
    return t("statistics.unknownStability");
  }

  const roundedDays = days < 10
    ? Math.round(days * 10) / 10
    : Math.round(days);
  return t("statistics.stability", { days: roundedDays });
}

function getStatisticDisplayStatus(entry) {
  if (entry.status.key === "due") {
    return entry.status;
  }

  if (
    ["mastered", "mature", "consolidating"].includes(entry.knowledge?.key) ||
    (entry.knowledge?.key === "learning" && entry.status.key === "review")
  ) {
    return entry.knowledge;
  }

  return entry.status;
}

function createSrsFilterChoices(entries) {
  const dueCount = entries.filter(({ status }) => status.key === "due").length;
  const masteredCount = entries.filter(({ knowledge }) => knowledge.key === "mastered").length;
  const matureCount = entries.filter(({ knowledge }) => knowledge.key === "mature").length;
  const consolidatingCount = entries.filter(({ knowledge }) => {
    return knowledge.key === "consolidating";
  }).length;

  return [
    ["all", t("statistics.all")],
    ["mastered", `${t("statistics.mastered")} (${masteredCount})`],
    ["mature", `${t("statistics.mature")} (${matureCount})`],
    ["consolidating", `${t("statistics.consolidating")} (${consolidatingCount})`],
    ["due", `${t("statistics.due")} (${dueCount})`],
    ["learning", t("statistics.learning")],
    ["new", t("statistics.new")]
  ];
}

function filterSrsEntries(entries) {
  return entries.filter((entry) => {
    if (activeGrammarFilter === "due") {
      return entry.status.key === "due";
    }

    if (["mastered", "mature", "consolidating", "learning"].includes(activeGrammarFilter)) {
      return entry.knowledge.key === activeGrammarFilter;
    }

    if (activeGrammarFilter === "new") {
      return !entry.card;
    }

    return true;
  });
}

function createStatisticsSummary(metrics) {
  const summary = document.createElement("dl");

  summary.className = "statistics-summary";

  for (const metric of metrics) {
    const item = document.createElement("div");
    const label = document.createElement("dt");
    const value = document.createElement("dd");
    const detail = document.createElement("span");

    item.className = "statistics-summary-item";
    item.dataset.metric = metric.key;
    label.textContent = metric.label;
    value.textContent = metric.value;
    detail.textContent = metric.detail;
    value.append(detail);
    item.append(label, value);
    summary.append(item);
  }

  return summary;
}

function createResultCounts(results) {
  const counts = document.createElement("span");
  const success = document.createElement("span");
  const failure = document.createElement("span");

  counts.className = "grammar-result-counts";
  counts.setAttribute(
    "aria-label",
    t("statistics.resultsLabel", results)
  );
  success.className = "grammar-result-success";
  success.setAttribute("aria-hidden", "true");
  success.textContent = `✓ ${results.good}`;
  failure.className = "grammar-result-failure";
  failure.setAttribute("aria-hidden", "true");
  failure.textContent = `× ${results.again}`;
  counts.append(success, failure);
  return counts;
}

function createChoiceControl(choices, activeValue, datasetName, ariaLabel) {
  const control = document.createElement("div");

  control.className = "statistics-filter-control";
  control.setAttribute("role", "group");
  control.setAttribute("aria-label", ariaLabel);

  for (const [value, label] of choices) {
    const button = document.createElement("button");

    button.type = "button";
    button.dataset[datasetName] = value;
    button.setAttribute("aria-pressed", String(value === activeValue));
    button.textContent = label;
    control.append(button);
  }

  return control;
}

function createCoverageHeader(
  label,
  encounteredCount,
  totalCount,
  totalEncounters,
  progressBreakdown
) {
  const header = document.createElement("div");
  const line = document.createElement("div");
  const title = document.createElement("strong");
  const value = document.createElement("span");
  const progress = document.createElement("div");
  const legend = document.createElement("ul");
  const detail = document.createElement("p");
  const percentage = totalCount === 0 ? 0 : Math.round(encounteredCount / totalCount * 100);
  const progressStates = [
    ["mastered", t("statistics.mastered")],
    ["mature", t("statistics.mature")],
    ["consolidating", t("statistics.consolidating")],
    ["learning", t("statistics.learning")],
    ["encountered", t("statistics.encountered")],
    ["new", t("statistics.new")]
  ];

  header.className = "statistics-coverage";
  line.className = "statistics-coverage-line";
  title.textContent = label;
  value.textContent = `${encounteredCount} / ${totalCount}`;
  progress.className = "statistics-progress";
  progress.setAttribute("role", "img");
  progress.setAttribute(
    "aria-label",
    t("statistics.progressLabel", { label, ...progressBreakdown })
  );
  legend.className = "statistics-progress-legend";

  for (const [key, stateLabel] of progressStates) {
    const count = progressBreakdown[key];
    const segment = document.createElement("span");
    const legendItem = document.createElement("li");

    segment.className = "statistics-progress-segment";
    segment.dataset.progressState = key;
    segment.style.setProperty("--progress-count", String(count));
    segment.setAttribute("aria-hidden", "true");
    legendItem.dataset.progressState = key;
    legendItem.textContent = `${stateLabel} ${count}`;

    progress.append(segment);
    legend.append(legendItem);
  }

  detail.textContent = t("statistics.coverage", {
    percent: percentage,
    count: totalEncounters
  });
  line.append(title, value);
  header.append(line, progress, legend, detail);
  return header;
}

function createReviewChart(reviewDays) {
  const section = document.createElement("section");
  const header = document.createElement("div");
  const heading = document.createElement("h3");
  const legend = document.createElement("div");
  const successLegend = document.createElement("span");
  const failureLegend = document.createElement("span");
  const chart = document.createElement("div");
  const maximum = Math.max(1, ...reviewDays.map(({ good, again }) => good + again));
  const totals = reviewDays.reduce(
    (counts, day) => ({ good: counts.good + day.good, again: counts.again + day.again }),
    { good: 0, again: 0 }
  );
  const dayFormatter = new Intl.DateTimeFormat(getUserLocale(), { day: "numeric" });
  const titleFormatter = new Intl.DateTimeFormat(getUserLocale(), {
    month: "short",
    day: "numeric"
  });

  section.className = "statistics-section review-activity";
  header.className = "statistics-section-header";
  heading.textContent = t("statistics.last14Days");
  legend.className = "review-chart-legend";
  successLegend.className = "review-chart-success";
  successLegend.textContent = t("statistics.success");
  failureLegend.className = "review-chart-failure";
  failureLegend.textContent = t("statistics.failed");
  legend.append(successLegend, failureLegend);
  header.append(heading, legend);
  chart.className = "review-chart";
  chart.setAttribute("role", "img");
  chart.setAttribute(
    "aria-label",
    t("statistics.chartSummary", totals)
  );

  for (const day of reviewDays) {
    const column = document.createElement("div");
    const meter = document.createElement("div");
    const stack = document.createElement("div");
    const success = document.createElement("span");
    const failure = document.createElement("span");
    const label = document.createElement("span");
    const total = day.good + day.again;
    const date = new Date(day.date);

    column.className = "review-chart-column";
    column.title = t("statistics.dayResults", {
      date: titleFormatter.format(date),
      good: day.good,
      again: day.again
    });
    meter.className = "review-chart-meter";
    stack.className = "review-chart-stack";
    stack.style.height = `${total === 0 ? 0 : Math.max(8, total / maximum * 100)}%`;
    success.className = "review-chart-segment review-chart-success";
    success.style.flexGrow = String(day.good);
    failure.className = "review-chart-segment review-chart-failure";
    failure.style.flexGrow = String(day.again);
    label.className = "review-chart-label";
    label.textContent = dayFormatter.format(date);
    stack.append(success, failure);
    meter.append(stack);
    column.append(meter, label);
    chart.append(column);
  }

  section.append(header, chart);
  return section;
}

function createAttentionItem(entry) {
  const item = document.createElement("li");
  const description = document.createElement("span");
  const pattern = document.createElement("strong");
  const meaning = document.createElement("span");
  const details = document.createElement("span");
  const status = document.createElement("span");

  item.className = "attention-item";
  description.className = "statistic-description";
  pattern.className = "statistic-primary";
  pattern.lang = "ja";
  pattern.textContent = entry.metadata.pattern;
  meaning.className = "statistic-secondary";
  meaning.textContent = `${entry.metadata.name}: ${entry.metadata.meaning}`;
  details.className = "attention-details";
  status.className = "grammar-status";
  status.dataset.status = entry.status.key === "due" ? "due" : "failed";
  status.textContent = entry.status.key === "due"
    ? t("statistics.dueNow")
    : t("statistics.failedLastTime");
  details.append(status, createResultCounts(entry.results));
  description.append(pattern, meaning);
  item.append(description, details);
  return item;
}

function renderOverviewStatistics(model) {
  const { overview } = model;
  const dueDetail = overview.dueCount > 0
    ? t("statistics.readyForReview")
    : overview.nextDue
      ? t("statistics.nextReview", { date: formatDueDate(overview.nextDue) })
      : t("statistics.noReviewsScheduled");
  const fragment = document.createDocumentFragment();

  fragment.append(createStatisticsSummary([
    {
      key: "mastered",
      label: t("statistics.mastered"),
      value: `${overview.knowledge.mastered} / ${overview.knowledge.total}`,
      detail: [
        t("statistics.grammarCount", { count: overview.knowledge.masteredByKind.grammar }),
        t("statistics.kanaCount", { count: overview.knowledge.masteredByKind.kana }),
        t("statistics.kanjiCount", { count: overview.knowledge.masteredByKind.kanji }),
        t("statistics.vocabularyCount", {
          count: overview.knowledge.masteredByKind.vocabulary
        })
      ].join(" · ")
    },
    {
      key: "due",
      label: t("statistics.dueNow"),
      value: String(overview.dueCount),
      detail: dueDetail
    },
    {
      key: "exercises",
      label: t("statistics.exercisesCompleted"),
      value: String(overview.exerciseCounts.total),
      detail: [
        `${overview.exerciseCounts.grammar} ${t("section.grammar").toLocaleLowerCase(getUserLocale())}`,
        `${overview.exerciseCounts.hiragana} hiragana`,
        `${overview.exerciseCounts.katakana} katakana`,
        t("statistics.kanjiCount", { count: overview.exerciseCounts.kanji }),
        t("statistics.vocabularyCount", { count: overview.exerciseCounts.vocabulary })
      ].join(" · ")
    },
    {
      key: "results",
      label: t("statistics.recentResults"),
      value: `✓ ${overview.recentResults.good}  × ${overview.recentResults.again}`,
      detail: overview.recentResultCount > 0
        ? t("statistics.lastRatings")
        : t("statistics.noRatings")
    },
    {
      key: "streak",
      label: t("statistics.studyStreak"),
      value: t("statistics.days", { count: overview.studyStreak }),
      detail: t("statistics.consecutiveDays")
    }
  ]));
  fragment.append(createReviewChart(overview.reviewDays));

  const attentionSection = document.createElement("section");
  const heading = document.createElement("h3");
  const attentionEntries = overview.needsAttention.slice(0, 5);

  attentionSection.className = "statistics-section attention-section";
  heading.textContent = t("statistics.needsAttention");
  attentionSection.append(heading);

  if (attentionEntries.length === 0) {
    const empty = document.createElement("p");

    empty.className = "statistics-inline-empty";
    empty.textContent = overview.reviewedCount === 0
      ? t("statistics.completeToSchedule")
      : overview.dueCount > 0
        ? t("statistics.reviewsReady", { count: overview.dueCount })
        : overview.nextDue
          ? t("statistics.nothingDue", {
            date: formatDueDate(overview.nextDue).toLocaleLowerCase(getUserLocale())
          })
          : t("statistics.noneNeedsAttention");
    attentionSection.append(empty);
  } else {
    const list = document.createElement("ul");

    list.className = "attention-list";
    list.append(...attentionEntries.map(createAttentionItem));
    attentionSection.append(list);
  }

  fragment.append(attentionSection);
  statisticsContent.replaceChildren(fragment);
}

function createGrammarStatisticItem(entry) {
  const item = document.createElement("li");
  const description = document.createElement("span");
  const pattern = document.createElement("strong");
  const meaning = document.createElement("span");
  const details = document.createElement("span");
  const status = document.createElement("span");
  const schedule = document.createElement("span");
  const lastReview = document.createElement("span");
  const displayStatus = getStatisticDisplayStatus(entry);
  const encounterText = t("statistics.seen", { count: entry.encounterCount });

  item.className = "statistic-item grammar-statistic-item";
  item.dataset.statKind = "grammar";
  description.className = "statistic-description";
  pattern.className = "statistic-primary";
  pattern.lang = "ja";
  pattern.textContent = entry.metadata.pattern;
  meaning.className = "statistic-secondary";
  meaning.textContent = `${entry.metadata.name}: ${entry.metadata.meaning} · ${encounterText}`;
  details.className = "grammar-statistic-details";
  status.className = "grammar-status";
  status.dataset.status = displayStatus.key;
  status.textContent = t(`statistics.${displayStatus.key}`);
  schedule.className = "grammar-schedule";
  schedule.textContent = entry.card
    ? `${formatStability(entry.card.stability)} · ${formatDueDate(entry.card.due)}`
    : t("statistics.notScheduled");
  lastReview.className = "grammar-last-review";
  lastReview.textContent = entry.lastReviewedAt
    ? t("statistics.last", { date: formatShortDate(entry.lastReviewedAt) })
    : t("statistics.notReviewed");
  description.append(pattern, meaning);
  details.append(status, createResultCounts(entry.results), schedule, lastReview);
  item.append(description, details);
  return item;
}

function renderGrammarStatistics(model) {
  const reviewedCount = model.grammar.filter(({ card }) => card).length;
  const totalEncounters = model.grammar.reduce((sum, entry) => sum + entry.encounterCount, 0);
  const fragment = document.createDocumentFragment();

  fragment.append(createCoverageHeader(
    t("statistics.grammarReviewed"),
    reviewedCount,
    model.grammar.length,
    totalEncounters,
    globalThis.JlptN5Statistics.createProgressBreakdown(model.grammar)
  ));
  fragment.append(createChoiceControl(
    createSrsFilterChoices(model.grammar),
    activeGrammarFilter,
    "grammarFilter",
    t("statistics.grammarStatus")
  ));

  const entries = filterSrsEntries(model.grammar);

  if (entries.length === 0) {
    const empty = document.createElement("p");

    empty.className = "activity-empty";
    empty.textContent = t("statistics.noGrammar");
    fragment.append(empty);
  } else {
    const list = document.createElement("ul");

    list.className = "statistics-list grammar-statistics-list";
    list.append(...entries.map(createGrammarStatisticItem));
    fragment.append(list);
  }

  statisticsContent.replaceChildren(fragment);
}

function createKanaStatisticItem(entry, kind) {
  const item = document.createElement("li");
  const description = document.createElement("span");
  const kana = document.createElement("strong");
  const romaji = document.createElement("span");
  const details = document.createElement("span");
  const status = document.createElement("span");
  const schedule = document.createElement("span");
  const lastReview = document.createElement("span");
  const displayStatus = getStatisticDisplayStatus(entry);
  const encounterText = t("statistics.seen", { count: entry.encounterCount });

  item.className = "statistic-item grammar-statistic-item kana-statistic-item";
  item.dataset.statKind = kind;
  description.className = "statistic-description";
  kana.className = "statistic-primary";
  kana.lang = "ja";
  kana.textContent = entry.metadata.kana;
  romaji.className = "statistic-secondary";
  romaji.textContent = `${entry.metadata.romaji} · ${encounterText}`;
  details.className = "grammar-statistic-details";
  status.className = "grammar-status";
  status.dataset.status = displayStatus.key;
  status.textContent = t(`statistics.${displayStatus.key}`);
  schedule.className = "grammar-schedule";
  schedule.textContent = entry.card
    ? `${formatStability(entry.card.stability)} · ${formatDueDate(entry.card.due)}`
    : t("statistics.notScheduled");
  lastReview.className = "grammar-last-review";
  lastReview.textContent = entry.lastReviewedAt
    ? t("statistics.last", { date: formatShortDate(entry.lastReviewedAt) })
    : t("statistics.notReviewed");
  description.append(kana, romaji);
  details.append(status, createResultCounts(entry.results), schedule, lastReview);
  item.append(description, details);
  return item;
}

function renderKanaStatistics(model, kind) {
  const label = kind === "katakana" ? t("section.katakana") : t("section.hiragana");
  const entriesForKind = model[kind];
  const reviewedCount = entriesForKind.filter(({ card }) => card).length;
  const totalEncounters = entriesForKind.reduce((sum, entry) => {
    return sum + entry.encounterCount;
  }, 0);
  const fragment = document.createDocumentFragment();

  fragment.append(createCoverageHeader(
    t("statistics.reviewed", { label }),
    reviewedCount,
    entriesForKind.length,
    totalEncounters,
    globalThis.JlptN5Statistics.createProgressBreakdown(entriesForKind)
  ));
  fragment.append(createChoiceControl(
    createSrsFilterChoices(entriesForKind),
    activeGrammarFilter,
    "grammarFilter",
    t("statistics.status", { label })
  ));

  const entries = filterSrsEntries(entriesForKind);

  if (entries.length === 0) {
    const empty = document.createElement("p");

    empty.className = "activity-empty";
    empty.textContent = t("statistics.noKana", {
      script: label.toLocaleLowerCase(getUserLocale())
    });
    fragment.append(empty);
  } else {
    const list = document.createElement("ul");

    list.className = "statistics-list grammar-statistics-list kana-statistics-list";
    list.append(...entries.map((entry) => createKanaStatisticItem(entry, kind)));
    fragment.append(list);
  }

  statisticsContent.replaceChildren(fragment);
}

function createVocabularyStatisticItem(entry) {
  const item = document.createElement("li");
  const description = document.createElement("span");
  const term = document.createElement("strong");
  const meaning = document.createElement("span");
  const details = document.createElement("span");
  const status = document.createElement("span");
  const schedule = document.createElement("span");
  const lastReview = document.createElement("span");
  const displayStatus = getStatisticDisplayStatus(entry);
  const encounterText = t("statistics.seen", { count: entry.encounterCount });

  item.className = "statistic-item grammar-statistic-item vocabulary-statistic-item";
  item.dataset.statKind = "vocabulary";
  description.className = "statistic-description";
  term.className = "statistic-primary";
  term.lang = "ja";
  term.textContent = entry.metadata.term === entry.metadata.reading
    ? entry.metadata.term
    : `${entry.metadata.term} (${entry.metadata.reading})`;
  meaning.className = "statistic-secondary";
  meaning.textContent = [
    entry.metadata.meaning,
    t(`partOfSpeech.${entry.metadata.partOfSpeech}`),
    encounterText
  ].filter(Boolean).join(" · ");
  details.className = "grammar-statistic-details";
  status.className = "grammar-status";
  status.dataset.status = displayStatus.key;
  status.textContent = t(`statistics.${displayStatus.key}`);
  schedule.className = "grammar-schedule";
  schedule.textContent = entry.card
    ? `${formatStability(entry.card.stability)} · ${formatDueDate(entry.card.due)}`
    : t("statistics.notScheduled");
  lastReview.className = "grammar-last-review";
  lastReview.textContent = entry.lastReviewedAt
    ? t("statistics.last", { date: formatShortDate(entry.lastReviewedAt) })
    : t("statistics.notReviewed");
  description.append(term, meaning);
  details.append(status, createResultCounts(entry.results), schedule, lastReview);
  item.append(description, details);
  return item;
}

function renderVocabularyStatistics(model) {
  const entries = model.vocabulary.progressEntries;
  const reviewedCount = entries.filter(({ card }) => card).length;
  const fragment = document.createDocumentFragment();

  fragment.append(createCoverageHeader(
    t("statistics.vocabularyReviewed"),
    reviewedCount,
    entries.length,
    model.vocabulary.totalEncounters,
    globalThis.JlptN5Statistics.createProgressBreakdown(entries)
  ));
  fragment.append(createChoiceControl(
    createSrsFilterChoices(entries),
    activeGrammarFilter,
    "grammarFilter",
    t("statistics.vocabularyStatus")
  ));

  const filteredEntries = filterSrsEntries(entries);

  if (filteredEntries.length === 0) {
    const empty = document.createElement("p");

    empty.className = "activity-empty";
    empty.textContent = t("statistics.noVocabulary");
    fragment.append(empty);
  } else {
    const list = document.createElement("ul");

    list.className = "statistics-list grammar-statistics-list vocabulary-statistics-list";
    list.append(...filteredEntries.map(createVocabularyStatisticItem));
    fragment.append(list);
  }

  statisticsContent.replaceChildren(fragment);
}

function createKanjiStatisticItem(entry) {
  const item = document.createElement("li");
  const description = document.createElement("span");
  const character = document.createElement("strong");
  const meaning = document.createElement("span");
  const details = document.createElement("span");
  const status = document.createElement("span");
  const schedule = document.createElement("span");
  const lastReview = document.createElement("span");
  const displayStatus = getStatisticDisplayStatus(entry);
  const encounterText = t("statistics.seen", { count: entry.encounterCount });
  const readings = [
    entry.metadata.onReadings?.length > 0
      ? `On: ${entry.metadata.onReadings.join("、")}`
      : "",
    entry.metadata.kunReadings?.length > 0
      ? `Kun: ${entry.metadata.kunReadings.join("、")}`
      : ""
  ].filter(Boolean);

  item.className = "statistic-item grammar-statistic-item kanji-statistic-item";
  item.dataset.statKind = "kanji";
  description.className = "statistic-description";
  character.className = "statistic-primary";
  character.lang = "ja";
  character.textContent = entry.metadata.character;
  meaning.className = "statistic-secondary";
  meaning.textContent = [
    entry.metadata.stage,
    entry.metadata.meaning,
    ...readings,
    encounterText
  ].filter(Boolean).join(" · ");
  details.className = "grammar-statistic-details";
  status.className = "grammar-status";
  status.dataset.status = displayStatus.key;
  status.textContent = t(`statistics.${displayStatus.key}`);
  schedule.className = "grammar-schedule";
  schedule.textContent = entry.card
    ? `${formatStability(entry.card.stability)} · ${formatDueDate(entry.card.due)}`
    : t("statistics.notScheduled");
  lastReview.className = "grammar-last-review";
  lastReview.textContent = entry.lastReviewedAt
    ? t("statistics.last", { date: formatShortDate(entry.lastReviewedAt) })
    : t("statistics.notReviewed");
  description.append(character, meaning);
  details.append(status, createResultCounts(entry.results), schedule, lastReview);
  item.append(description, details);
  return item;
}

function renderKanjiStatistics(model) {
  const entries = model.kanji.progressEntries;
  const reviewedCount = entries.filter(({ card }) => card).length;
  const fragment = document.createDocumentFragment();

  fragment.append(createCoverageHeader(
    t("statistics.kanjiReviewed"),
    reviewedCount,
    entries.length,
    model.kanji.totalEncounters,
    globalThis.JlptN5Statistics.createProgressBreakdown(entries)
  ));
  fragment.append(createChoiceControl(
    createSrsFilterChoices(entries),
    activeGrammarFilter,
    "grammarFilter",
    t("statistics.kanjiStatus")
  ));

  const filteredEntries = filterSrsEntries(entries);

  if (filteredEntries.length === 0) {
    const empty = document.createElement("p");

    empty.className = "activity-empty";
    empty.textContent = t("statistics.noKanji");
    fragment.append(empty);
  } else {
    const list = document.createElement("ul");

    list.className = "statistics-list grammar-statistics-list kanji-statistics-list";
    list.append(...filteredEntries.map(createKanjiStatisticItem));
    fragment.append(list);
  }

  statisticsContent.replaceChildren(fragment);
}

function createExposureStatisticItem(entry, kind) {
  const item = document.createElement("li");
  const description = document.createElement("span");
  const primary = document.createElement("strong");
  const secondary = document.createElement("span");
  const details = document.createElement("span");
  const count = document.createElement("strong");
  const lastSeen = document.createElement("span");

  item.className = "statistic-item exposure-statistic-item";
  item.dataset.statKind = kind;
  description.className = "statistic-description";
  primary.className = "statistic-primary";
  primary.lang = "ja";
  secondary.className = "statistic-secondary";
  details.className = "exposure-statistic-details";
  count.textContent = t("statistics.times", { count: entry.encounterCount });
  lastSeen.textContent = t("statistics.last", { date: formatShortDate(entry.lastEncounteredAt) });

  if (kind === "vocabulary") {
    primary.textContent = `${entry.metadata.term} (${entry.metadata.reading})`;
    secondary.textContent = entry.metadata.meaning;
  } else {
    const readings = [
      entry.metadata.onReadings.length > 0
        ? `On: ${entry.metadata.onReadings.join("、")}`
        : "",
      entry.metadata.kunReadings.length > 0
        ? `Kun: ${entry.metadata.kunReadings.join("、")}`
        : ""
    ].filter(Boolean);

    primary.textContent = entry.metadata.character;
    secondary.textContent = [entry.metadata.stage, entry.metadata.meaning, ...readings].join(" · ");
  }

  description.append(primary, secondary);
  details.append(count, lastSeen);
  item.append(description, details);
  return item;
}

function renderExposureStatistics(model, kind) {
  const exposure = model[kind];
  const label = kind === "vocabulary"
    ? t("statistics.vocabularyEncountered")
    : t("statistics.kanjiEncountered");
  const fragment = document.createDocumentFragment();

  fragment.append(createCoverageHeader(
    label,
    exposure.encounteredCount,
    exposure.totalCount,
    exposure.totalEncounters,
    globalThis.JlptN5Statistics.createProgressBreakdown(
      exposure.entries,
      exposure.totalCount
    )
  ));
  fragment.append(createChoiceControl(
    [
      ["recent", t("statistics.recent")],
      ["most", t("statistics.mostSeen")],
      ["least", t("statistics.leastSeen")]
    ],
    activeExposureSort,
    "exposureSort",
    t("statistics.sorting", {
      label: kind === "vocabulary" ? t("section.vocabulary") : t("section.kanji")
    })
  ));

  const entries = [...exposure.entries].sort((left, right) => {
    if (activeExposureSort === "recent") {
      const dateDifference = Date.parse(right.lastEncounteredAt) - Date.parse(left.lastEncounteredAt);

      if (dateDifference !== 0) {
        return dateDifference;
      }
    } else if (left.encounterCount !== right.encounterCount) {
      return activeExposureSort === "most"
        ? right.encounterCount - left.encounterCount
        : left.encounterCount - right.encounterCount;
    }

    const leftLabel = kind === "vocabulary" ? left.metadata.term : left.metadata.character;
    const rightLabel = kind === "vocabulary" ? right.metadata.term : right.metadata.character;
    return leftLabel.localeCompare(rightLabel, "ja");
  });

  if (entries.length === 0) {
    const empty = document.createElement("p");

    empty.className = "activity-empty";
    empty.textContent = t("statistics.noEncountered", {
      kind: kind === "vocabulary"
        ? t("section.vocabulary").toLocaleLowerCase(getUserLocale())
        : t("section.kanji").toLocaleLowerCase(getUserLocale())
    });
    fragment.append(empty);
  } else {
    const list = document.createElement("ul");

    list.className = "statistics-list exposure-statistics-list";
    list.append(...entries.map((entry) => createExposureStatisticItem(entry, kind)));
    fragment.append(list);
  }

  statisticsContent.replaceChildren(fragment);
}

function renderStatistics() {
  const learningStats = globalThis.JlptN5Stats.readLearningStats();
  const srsData = globalThis.JlptN5Srs.readSrsData();
  const activeKanjiStages = new Set(globalThis.JlptN5Kanji.activeStages);
  const model = globalThis.JlptN5Statistics.createStatisticsModel({
    grammarPoints: [...grammarPointById.values()],
    hiragana: [...new Map(
      [...hiraganaMetadata, ...pairedHiraganaMetadata].map((entry) => [entry.id, entry])
    ).values()],
    katakana: katakanaMetadata,
    vocabulary: [...vocabularyById.values()],
    kanji: [...kanjiById.values()],
    activeKanjiIds: [...kanjiById.values()]
      .filter(({ stage }) => activeKanjiStages.has(stage))
      .map(({ id }) => id),
    learningStats,
    srsData
  });

  if (activeStatKind === "overview") {
    renderOverviewStatistics(model);
  } else if (["hiragana", "katakana"].includes(activeStatKind)) {
    renderKanaStatistics(model, activeStatKind);
  } else if (activeStatKind === "vocabulary") {
    renderVocabularyStatistics(model);
  } else if (activeStatKind === "kanji") {
    renderKanjiStatistics(model);
  } else if (activeStatKind === "grammar") {
    renderGrammarStatistics(model);
  } else {
    renderExposureStatistics(model, activeStatKind);
  }
}

function getLocalDayKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createHistoryAttemptItem(attempt, timeFormatter) {
  const item = document.createElement("li");
  const time = document.createElement("time");
  const sentence = document.createElement("p");
  const answer = document.createElement("p");
  const answerLabel = document.createElement("span");
  const ratingList = document.createElement("ul");
  const isKanaAttempt = ["hiragana", "katakana"].includes(attempt.section);
  const isVocabularyAttempt = attempt.section === "vocabulary";
  const isKanjiAttempt = attempt.section === "kanji";
  const attemptLocale = attempt.locale || "en";

  item.className = "history-attempt";
  time.dateTime = attempt.submittedAt;
  time.textContent = timeFormatter.format(attempt.date);
  sentence.className = "history-sentence";
  sentence.lang = isKanjiAttempt
    ? "ja"
    : isKanaAttempt
    ? attempt.direction === "romaji-to-kana" ? "en" : "ja"
    : isVocabularyAttempt && attempt.direction === "english-to-japanese"
      ? attemptLocale
      : getExerciseType(attempt) === "production"
        ? attemptLocale
        : "ja";
  sentence.textContent = attempt.text;
  answer.className = "history-answer";
  answer.lang = isKanjiAttempt
    ? "ja"
    : isKanaAttempt
    ? sentence.lang === "ja" ? "en" : "ja"
    : isVocabularyAttempt
      ? attempt.direction === "english-to-japanese" ? "ja" : attemptLocale
      : getExerciseType(attempt) === "production" ? "ja" : attemptLocale;
  answerLabel.textContent = t("history.yourAnswer");
  answer.append(answerLabel, document.createTextNode(attempt.answer || t("common.noAnswer")));
  ratingList.className = "history-grammar-ratings";

  if (isKanaAttempt || isVocabularyAttempt || isKanjiAttempt) {
    const reference = document.createElement("span");

    reference.className = "history-reference-answer";
    reference.lang = isKanjiAttempt
      ? "ja"
      : isVocabularyAttempt && attempt.direction === "english-to-japanese"
      ? "ja"
      : isKanaAttempt
        ? sentence.lang === "ja" ? "en" : "ja"
        : attemptLocale;
    reference.textContent = t("history.correct", { answer: attempt.solution });
    answer.append(reference);
  }

  for (const rating of attempt.grammarRatings || []) {
    const grammarPoint = grammarPointById.get(rating.grammarPointId);

    if (!grammarPoint) {
      continue;
    }

    const tag = document.createElement("li");
    const mark = document.createElement("span");
    const succeeded = rating.outcome === "good";

    tag.className = "history-grammar-tag";
    tag.dataset.outcome = rating.outcome;
    tag.lang = "ja";
    tag.setAttribute(
      "aria-label",
      `${grammarPoint.name}: ${t(succeeded ? "common.succeeded" : "common.failed")}`
    );
    tag.title = `${grammarPoint.name}: ${grammarPoint.meaning}`;
    mark.className = "history-grammar-tag-mark";
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = succeeded ? "✓" : "×";
    tag.append(mark, document.createTextNode(grammarPoint.pattern));
    ratingList.append(tag);
  }

  for (const rating of attempt.kanaRatings || []) {
    const tag = document.createElement("li");
    const mark = document.createElement("span");
    const succeeded = rating.outcome === "good";
    const metadata = (
      attempt.section === "katakana"
        ? [...katakanaMetadata, ...pairedHiraganaMetadata]
        : hiraganaMetadata
    ).find(({ id }) => id === rating.kana);

    tag.className = "history-grammar-tag history-kana-tag";
    tag.dataset.outcome = rating.outcome;
    tag.lang = "ja";
    tag.setAttribute(
      "aria-label",
      `${rating.kana}: ${t(succeeded ? "common.succeeded" : "common.failed")}`
    );
    tag.title = metadata?.romaji || rating.kana;
    mark.className = "history-grammar-tag-mark";
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = succeeded ? "✓" : "×";
    tag.append(mark, document.createTextNode(rating.kana));
    ratingList.append(tag);
  }

  for (const rating of attempt.kanjiRatings || []) {
    const metadata = kanjiById.get(rating.kanjiId);

    if (!metadata) {
      continue;
    }

    const tag = document.createElement("li");
    const mark = document.createElement("span");
    const succeeded = rating.outcome === "good";

    tag.className = "history-grammar-tag history-kanji-tag";
    tag.dataset.outcome = rating.outcome;
    tag.lang = "ja";
    tag.setAttribute(
      "aria-label",
      `${metadata.character}: ${t(succeeded ? "common.succeeded" : "common.failed")}`
    );
    tag.title = metadata.meaning || metadata.character;
    mark.className = "history-grammar-tag-mark";
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = succeeded ? "✓" : "×";
    tag.append(mark, document.createTextNode(metadata.character));
    ratingList.append(tag);
  }

  if (isVocabularyAttempt && ["again", "good"].includes(attempt.outcome)) {
    const metadata = vocabularyById.get(attempt.vocabularyId);
    const tag = document.createElement("li");
    const mark = document.createElement("span");
    const succeeded = attempt.outcome === "good";
    const term = metadata?.term || attempt.term || attempt.vocabularyId;

    tag.className = "history-grammar-tag history-vocabulary-tag";
    tag.dataset.outcome = attempt.outcome;
    tag.lang = "ja";
    tag.setAttribute(
      "aria-label",
      `${term}: ${t(succeeded ? "common.succeeded" : "common.failed")}`
    );
    tag.title = metadata?.meaning || attempt.meaning || term;
    mark.className = "history-grammar-tag-mark";
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = succeeded ? "✓" : "×";
    tag.append(mark, document.createTextNode(term));
    ratingList.append(tag);
  }

  item.append(time, sentence, answer);

  if (ratingList.hasChildNodes()) {
    item.append(ratingList);
  }

  return item;
}

function createHistoryPagination(kind, page, statusText) {
  const navigation = document.createElement("nav");
  const newer = document.createElement("button");
  const status = document.createElement("span");
  const older = document.createElement("button");
  const isDayNavigation = kind === "days";

  navigation.className = `history-pagination history-${kind}-pagination`;
  navigation.setAttribute(
    "aria-label",
    t(isDayNavigation ? "history.dayNavigation" : "history.attemptNavigation")
  );
  newer.type = "button";
  newer.dataset.historyPageKind = kind;
  newer.dataset.historyPageDirection = "newer";
  newer.disabled = !page.hasNewer;
  newer.textContent = t(isDayNavigation ? "history.newerDays" : "history.newerAttempts");
  status.className = "history-pagination-status";
  status.setAttribute("aria-live", "polite");
  status.textContent = statusText;
  older.type = "button";
  older.dataset.historyPageKind = kind;
  older.dataset.historyPageDirection = "older";
  older.disabled = !page.hasOlder;
  older.textContent = t(isDayNavigation ? "history.olderDays" : "history.olderAttempts");
  navigation.append(newer, status, older);
  return navigation;
}

function formatHistoryDaySummary(group) {
  const resultCount = group.results.good + group.results.again;
  const parts = [t("history.exerciseCount", { count: group.attempts.length })];

  if (resultCount > 0) {
    parts.push(t("history.successRate", {
      percent: Math.round(group.results.good / resultCount * 100)
    }));
  }

  return parts.join(" · ");
}

function createHistoryDaySection(group, dateFormatter, timeFormatter) {
  const section = document.createElement("section");
  const heading = document.createElement("h3");
  const toggle = document.createElement("button");
  const headingText = document.createElement("span");
  const date = document.createElement("span");
  const summary = document.createElement("span");
  const chevron = document.createElement("span");
  const content = document.createElement("div");
  const expanded = expandedHistoryDayKey === group.key;
  const contentId = `history-day-${group.key}`;

  section.className = "history-day";
  section.dataset.historyDay = group.key;
  heading.className = "history-day-heading";
  toggle.className = "history-day-toggle";
  toggle.type = "button";
  toggle.dataset.historyDayKey = group.key;
  toggle.setAttribute("aria-expanded", String(expanded));
  toggle.setAttribute("aria-controls", contentId);
  headingText.className = "history-day-heading-text";
  date.className = "history-day-date";
  date.textContent = dateFormatter.format(group.date);
  summary.className = "history-day-summary";
  summary.textContent = formatHistoryDaySummary(group);
  chevron.className = "history-day-chevron";
  chevron.setAttribute("aria-hidden", "true");
  chevron.textContent = "⌄";
  headingText.append(date, summary);
  toggle.append(headingText, chevron);
  heading.append(toggle);
  content.id = contentId;
  content.className = "history-day-content";
  content.hidden = !expanded;

  if (expanded) {
    const attemptPage = globalThis.JlptN5History.createPage(
      group.attempts,
      historyAttemptPage,
      globalThis.JlptN5History.attemptsPerPage
    );
    const list = document.createElement("ol");

    historyAttemptPage = attemptPage.page;
    list.className = "history-attempts";
    list.append(...attemptPage.items.map((attempt) => {
      return createHistoryAttemptItem(attempt, timeFormatter);
    }));
    content.append(list);

    if (attemptPage.pageCount > 1) {
      content.append(createHistoryPagination(
        "attempts",
        attemptPage,
        t("history.attemptRange", {
          start: attemptPage.start + 1,
          end: attemptPage.end,
          total: attemptPage.total
        })
      ));
    }
  }

  section.append(heading, content);
  return section;
}

function resetHistoryView() {
  historyDayPage = 0;
  expandedHistoryDayKey = undefined;
  historyAttemptPage = 0;
}

function renderHistory() {
  const stats = globalThis.JlptN5Stats.readLearningStats();
  const dateFormatter = new Intl.DateTimeFormat(getUserLocale(), { dateStyle: "long" });
  const pageDateFormatter = new Intl.DateTimeFormat(getUserLocale(), { dateStyle: "medium" });
  const timeFormatter = new Intl.DateTimeFormat(getUserLocale(), { timeStyle: "short" });
  const days = globalThis.JlptN5History.createHistoryDays(
    stats.exerciseHistory,
    getLocalDayKey
  );
  const dayPage = globalThis.JlptN5History.createPage(
    days,
    historyDayPage,
    globalThis.JlptN5History.daysPerPage
  );
  const visibleDayKeys = new Set(dayPage.items.map(({ key }) => key));

  historyDayPage = dayPage.page;

  if (
    expandedHistoryDayKey === undefined ||
    (expandedHistoryDayKey !== null && !visibleDayKeys.has(expandedHistoryDayKey))
  ) {
    expandedHistoryDayKey = dayPage.items[0]?.key ?? null;
    historyAttemptPage = 0;
  }

  const sections = dayPage.items.map((group) => {
    return createHistoryDaySection(group, dateFormatter, timeFormatter);
  });

  if (dayPage.pageCount > 1) {
    const newestDate = dayPage.items[0]?.date;
    const oldestDate = dayPage.items.at(-1)?.date;

    sections.push(createHistoryPagination(
      "days",
      dayPage,
      t("history.dayRange", {
        start: pageDateFormatter.format(oldestDate),
        end: pageDateFormatter.format(newestDate)
      })
    ));
  }

  historyList.replaceChildren(...sections);
  historyEmpty.hidden = days.length > 0;
}

function handleHistoryListClick(event) {
  const dayToggle = event.target.closest("button[data-history-day-key]");

  if (dayToggle) {
    const dayKey = dayToggle.dataset.historyDayKey;

    expandedHistoryDayKey = expandedHistoryDayKey === dayKey ? null : dayKey;
    historyAttemptPage = 0;
    renderHistory();
    historyList.querySelector(`button[data-history-day-key="${dayKey}"]`)?.focus({
      preventScroll: true
    });
    return;
  }

  const pageButton = event.target.closest("button[data-history-page-kind]");

  if (!pageButton || pageButton.disabled) {
    return;
  }

  const delta = pageButton.dataset.historyPageDirection === "older" ? 1 : -1;

  if (pageButton.dataset.historyPageKind === "days") {
    historyDayPage += delta;
    expandedHistoryDayKey = undefined;
    historyAttemptPage = 0;
    renderHistory();
    activityBody.scrollTop = 0;
  } else {
    historyAttemptPage += delta;
    renderHistory();
  }

  historyList.querySelector("button[data-history-day-key][aria-expanded=\"true\"]")?.focus({
    preventScroll: true
  });
}

function selectActivityView(viewName) {
  activityTitle.textContent = viewName === "history"
    ? t("history.title")
    : t("statistics.title");

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
  prepareHiraganaWords(entriesById);
  prepareKatakanaWords(entriesById);
  prepareVocabularyItems(entriesById);

  if (tabName === "history") {
    resetHistoryView();
  }

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

function handleStatisticsContentClick(event) {
  const grammarFilterButton = event.target.closest("[data-grammar-filter]");
  const exposureSortButton = event.target.closest("[data-exposure-sort]");

  if (grammarFilterButton) {
    activeGrammarFilter = grammarFilterButton.dataset.grammarFilter;
  } else if (exposureSortButton) {
    activeExposureSort = exposureSortButton.dataset.exposureSort;
  } else {
    return;
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

function handleTokenTap(event) {
  const activeToken = sentenceElement.querySelector(".token.is-touch-active");
  const tappedToken = event.currentTarget;

  event.stopPropagation();

  activeToken?.classList.remove("is-touch-active");

  if (tappedToken !== activeToken) {
    tappedToken.classList.add("is-touch-active");
  }
}

function markVocabularyHintRevealed(event) {
  if (exerciseSubmitted || !settings.translationTooltips) {
    return;
  }

  for (const vocabularyId of event.currentTarget.dataset.vocabularyIds?.split(" ") || []) {
    if (vocabularyId) {
      revealedVocabularyIds.add(vocabularyId);
    }
  }
}

function handlePromptVocabularyHintTap(event) {
  markVocabularyHintRevealed(event);
  handleTokenTap(event);
}

function dismissActiveToken() {
  sentenceElement.querySelector(".token.is-touch-active")
    ?.classList.remove("is-touch-active");
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

function createTokenElement(token, newGrammarPointIds = []) {
  const tokenElement = document.createElement("span");
  const vocabularyEntry = vocabularyById.get(token.vocabularyId);
  let exposesVocabularyMeaning = false;
  tokenElement.className = "token";

  if (token.category) {
    tokenElement.dataset.category = token.category;
    tokenElement.addEventListener("click", handleTokenTap);
  }

  if (
    ["noun", "verb", "adjective", "adverb", "interjection"].includes(token.category) &&
    vocabularyEntry
  ) {
    tokenElement.dataset.gloss = vocabularyEntry.meaning;
    exposesVocabularyMeaning = true;
  }

  if (newGrammarPointIds.length > 0) {
    const grammarGlosses = newGrammarPointIds.map((grammarPointId) => {
      const grammarPoint = grammarPointById.get(grammarPointId);

      return `${grammarPoint.pattern}: ${grammarPoint.meaning}`;
    });

    tokenElement.dataset.newGrammar = "";
    tokenElement.dataset.gloss = grammarGlosses.join("\n");
    exposesVocabularyMeaning = false;
  }

  if (exposesVocabularyMeaning) {
    tokenElement.dataset.vocabularyIds = token.vocabularyId;
    tokenElement.addEventListener("pointerenter", markVocabularyHintRevealed);
    tokenElement.addEventListener("click", markVocabularyHintRevealed);
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

function renderSentence(text, tokens, grammarHighlights = []) {
  if (tokens.map(({ surface }) => surface).join("") !== text) {
    throw new Error("Tokenizer output does not match the lesson sentence.");
  }

  sentenceElement.replaceChildren();
  sentenceElement.setAttribute("aria-label", text);
  characterIndex = 0;

  let phraseElement = document.createElement("span");
  phraseElement.className = "phrase";
  const grammarPointIdsByToken = new Map();

  for (const { grammarPointId, tokenStart, tokenEnd } of grammarHighlights) {
    for (let tokenIndex = tokenStart; tokenIndex < tokenEnd; tokenIndex += 1) {
      const grammarPointIds = grammarPointIdsByToken.get(tokenIndex) || [];

      grammarPointIds.push(grammarPointId);
      grammarPointIdsByToken.set(tokenIndex, grammarPointIds);
    }
  }

  for (const [tokenIndex, token] of tokens.entries()) {
    phraseElement.append(createTokenElement(
      token,
      grammarPointIdsByToken.get(tokenIndex)
    ));

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

function getVisibleGrammarHighlights(lesson) {
  if (lesson.id === introductionId) {
    return lesson.grammarHighlights;
  }

  if (getExerciseType(lesson) === "production") {
    return [];
  }

  const encounteredGrammarPoints = globalThis.JlptN5Stats.readLearningStats().grammarPoints;

  return lesson.grammarHighlights.filter(({ grammarPointId }) => {
    return !Object.hasOwn(encounteredGrammarPoints, grammarPointId);
  });
}

function renderFuriganaText(element, text, tokens) {
  if (tokens.map(({ surface }) => surface).join("") !== text) {
    throw new Error("Tokenizer output does not match the solution.");
  }

  element.replaceChildren();
  element.setAttribute("aria-label", text);

  for (const token of tokens) {
    if (token.reading && /\p{Script=Han}/u.test(token.surface)) {
      const ruby = document.createElement("ruby");
      const annotation = document.createElement("rt");

      ruby.append(token.surface);
      annotation.textContent = token.reading;
      ruby.append(annotation);
      element.append(ruby);
    } else {
      element.append(token.surface);
    }
  }
}

function formatVocabularyHint(vocabularyIds) {
  return vocabularyIds.map((vocabularyId) => {
    const entry = vocabularyById.get(vocabularyId);

    if (!entry) {
      return "";
    }

    return entry.reading && entry.reading !== entry.term
      ? `${entry.term}（${entry.reading}）`
      : entry.term;
  }).filter(Boolean).join(" · ");
}

function isPlainWordCharacter(character) {
  return Boolean(character && /[\p{L}\p{N}]/u.test(character));
}

function splitPlainSentenceWithHints(text, vocabularyHints) {
  const locale = getUserLocale();
  const hints = vocabularyHints
    .map((hint) => ({ ...hint, normalizedWord: hint.word.toLocaleLowerCase(locale) }))
    .sort((left, right) => right.word.length - left.word.length);
  const segments = [];
  let plainStart = 0;
  let cursor = 0;

  const appendPlainText = (end) => {
    for (const segment of text.slice(plainStart, end).split(/(\s+|[.,!?;:'"’«»()]+)/u)) {
      if (segment) {
        segments.push({ text: segment });
      }
    }
  };

  while (cursor < text.length) {
    const hint = hints.find(({ word, normalizedWord }) => {
      const candidate = text.slice(cursor, cursor + word.length).toLocaleLowerCase(locale);
      const before = text[cursor - 1];
      const after = text[cursor + word.length];
      const needsBoundaryBefore = isPlainWordCharacter(word[0]);
      const needsBoundaryAfter = isPlainWordCharacter(word[word.length - 1]);

      return candidate === normalizedWord &&
        (!needsBoundaryBefore || !isPlainWordCharacter(before)) &&
        (!needsBoundaryAfter || !isPlainWordCharacter(after));
    });

    if (!hint) {
      cursor += 1;
      continue;
    }

    appendPlainText(cursor);
    segments.push({ text: text.slice(cursor, cursor + hint.word.length), hint });
    cursor += hint.word.length;
    plainStart = cursor;
  }

  appendPlainText(text.length);
  return segments;
}

function renderPlainSentence(text, vocabularyHints = []) {
  sentenceElement.replaceChildren();
  sentenceElement.setAttribute("aria-label", text);
  characterIndex = 0;

  for (const { text: segment, hint } of splitPlainSentenceWithHints(text, vocabularyHints)) {
    if (!segment) {
      continue;
    }

    if (/^\s+$/.test(segment)) {
      sentenceElement.append(document.createTextNode(segment));
      continue;
    }

    const phraseElement = document.createElement("span");
    const contentElement = hint ? document.createElement("span") : phraseElement;

    phraseElement.className = "phrase";

    if (hint) {
      contentElement.className = "token prompt-vocabulary-hint";
      contentElement.dataset.gloss = formatVocabularyHint(hint.vocabularyIds);
      contentElement.dataset.vocabularyIds = hint.vocabularyIds.join(" ");
      contentElement.addEventListener("pointerenter", markVocabularyHintRevealed);
      contentElement.addEventListener("click", handlePromptVocabularyHintTap);
    }

    for (const character of segment) {
      contentElement.append(createCharacterElement(character));
    }

    if (hint) {
      contentElement.style.setProperty(
        "--token-delay",
        `${(characterIndex - 1) * characterDelay + characterRevealDuration}ms`
      );
      phraseElement.append(contentElement);
    }

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

async function fetchContentLocalizations(kind, locale = getUserLocale()) {
  if (locale === "en") {
    return {};
  }

  const localizations = await fetchJson(`data/locales/${locale}/${kind}.json`);

  if (!localizations || typeof localizations !== "object" || Array.isArray(localizations)) {
    throw new Error(`The ${kind} translation catalogue is invalid.`);
  }

  return localizations;
}

async function loadVocabularyData() {
  const { defaultLocale, supportedLocales } = globalThis.JlptN5I18n;
  const { getVocabularyVoicePath, validateVocabularyVoiceSlugs } =
    globalThis.JlptN5VoicePaths;
  const localizedLocales = supportedLocales.filter((locale) => locale !== defaultLocale);
  const [vocabulary, localizedCatalogEntries] = await Promise.all([
    fetchJson("data/jlpt-n5-vocabulary.json"),
    Promise.all(localizedLocales.map(async (locale) => [
      locale,
      await fetchContentLocalizations("vocabulary", locale)
    ]))
  ]);

  validateVocabularyVoiceSlugs(vocabulary);

  const catalogsByLocale = new Map(localizedCatalogEntries);
  const activeLocale = getUserLocale();
  const localizedVocabulary = vocabulary.map((entry) => {
    const translations = Object.fromEntries(supportedLocales.flatMap((locale) => {
      const translation = locale === defaultLocale
        ? {
            meaning: entry.meaning,
            ...(Array.isArray(entry.acceptedAnswers)
              ? { acceptedAnswers: entry.acceptedAnswers }
              : {})
          }
        : catalogsByLocale.get(locale)?.[entry.id];

      return translation ? [[locale, translation]] : [];
    }));
    const localized = translations[activeLocale] || translations[defaultLocale];

    return {
      ...entry,
      audio: getVocabularyVoicePath(entry),
      canonicalMeaning: entry.meaning,
      translations,
      meaning: localized.meaning,
      acceptedTranslationAnswers: localized.acceptedAnswers
    };
  });
  const entriesById = new Map(localizedVocabulary.map((entry) => [entry.id, entry]));

  if (entriesById.size !== localizedVocabulary.length) {
    throw new Error("Vocabulary ids must be unique.");
  }

  return entriesById;
}

async function loadKanjiData() {
  const [kanji, localizations] = await Promise.all([
    fetchJson("data/jlpt-n5-kanji.json"),
    fetchContentLocalizations("kanji")
  ]);
  const localizedKanji = kanji.map((entry) => ({
    ...entry,
    ...(localizations[entry.id] ? { meaning: localizations[entry.id].meaning } : {})
  }));
  const entriesById = new Map(localizedKanji.map((entry) => [entry.id, entry]));

  if (entriesById.size !== localizedKanji.length) {
    throw new Error("Kanji ids must be unique.");
  }

  return entriesById;
}

async function loadKanjiContextData() {
  const [contexts, localizations] = await Promise.all([
    fetchJson("data/kanji-contexts.json"),
    fetchContentLocalizations("kanji-contexts")
  ]);

  return contexts.map((entry) => ({
    ...entry,
    ...(localizations[entry.id] ? { meaning: localizations[entry.id].meaning } : {})
  }));
}

function prepareHiraganaWords(entriesById) {
  if (hiraganaWords) {
    return hiraganaWords;
  }

  hiraganaWords = globalThis.JlptN5Hiragana.createWordPool([
    ...entriesById.values()
  ]);
  hiraganaMetadata = globalThis.JlptN5Hiragana.createKanaInventory(hiraganaWords)
    .map((kana) => ({
      id: kana,
      kana,
      romaji: kana === "っ"
        ? t("exercise.consonantDoubling")
        : globalThis.JlptN5Hiragana.romanizeParts([kana])[0]
    }));

  if (hiraganaWords.length === 0 || hiraganaMetadata.length === 0) {
    throw new Error("No N5 vocabulary is available for hiragana exercises.");
  }

  return hiraganaWords;
}

function createPairedHiraganaMetadata({ hiragana, katakana }) {
  return {
    id: hiragana,
    kana: hiragana,
    romaji: katakana === "ッ"
      ? t("exercise.consonantDoubling")
      : katakana === "ー"
        ? t("exercise.longVowel")
        : globalThis.JlptN5Katakana.romanizeParts([katakana])[0]
  };
}

function prepareKatakanaWords(entriesById) {
  if (katakanaWords) {
    return katakanaWords;
  }

  katakanaWords = globalThis.JlptN5Katakana.createWordPool([
    ...entriesById.values()
  ]);
  katakanaMetadata = globalThis.JlptN5Katakana.createKanaInventory(katakanaWords)
    .map((kana) => ({
      id: kana,
      kana,
      romaji: kana === "ッ"
        ? t("exercise.consonantDoubling")
        : kana === "ー"
          ? t("exercise.longVowel")
          : globalThis.JlptN5Katakana.romanizeParts([kana])[0]
    }));
  katakanaPairInventory = globalThis.JlptN5Katakana.createKanaPairInventory(
    katakanaWords
  );
  katakanaSingleItems = globalThis.JlptN5Katakana.createSingleKanaPool(
    katakanaWords
  );
  pairedHiraganaMetadata = [...new Map(
    katakanaPairInventory.map((pair) => [pair.hiragana, pair])
  ).values()].map(createPairedHiraganaMetadata);

  if (
    katakanaWords.length === 0 ||
    katakanaMetadata.length === 0 ||
    katakanaPairInventory.length === 0 ||
    katakanaSingleItems.length === 0
  ) {
    throw new Error("No N5 vocabulary is available for katakana exercises.");
  }

  return katakanaWords;
}

function prepareKanjiExercises(entriesById, kanjiEntriesById, kanjiContexts) {
  if (kanjiExercisePool) {
    return kanjiExercisePool;
  }

  kanjiExercisePool = globalThis.JlptN5Kanji.createExercisePool(
    [...kanjiEntriesById.values()],
    [...entriesById.values(), ...kanjiContexts]
  );
  const inventory = globalThis.JlptN5Kanji.getKanjiInventory(kanjiExercisePool);
  const activeStages = new Set(globalThis.JlptN5Kanji.activeStages);
  const expectedInventoryCount = [...kanjiEntriesById.values()]
    .filter(({ stage }) => activeStages.has(stage))
    .length;

  if (inventory.length !== expectedInventoryCount) {
    throw new Error(
      `The active kanji curriculum needs ${expectedInventoryCount} contextual exercise items.`
    );
  }

  return kanjiExercisePool;
}

function prepareVocabularyItems(entriesById) {
  if (vocabularyItems) {
    return vocabularyItems;
  }

  vocabularyItems = globalThis.JlptN5Vocabulary.createVocabularyPool(
    [...entriesById.values()],
    { locale: getUserLocale() }
  ).map((entry) => ({ ...entry, locale: getUserLocale() }));

  if (vocabularyItems.length === 0) {
    throw new Error("No N5 vocabulary is available for vocabulary exercises.");
  }

  return vocabularyItems;
}

async function loadExerciseData() {
  const { defaultLocale, supportedLocales } = globalThis.JlptN5I18n;
  const localizedLocales = supportedLocales.filter((locale) => locale !== defaultLocale);
  const [baseGrammarPoints, baseExercises, grammarLocalizations, exerciseCatalogEntries,
    entriesById, kanjiEntriesById] = await Promise.all([
    fetchJson("data/jlpt-n5-grammar.json"),
    fetchJson("data/exercises.json"),
    fetchContentLocalizations("grammar"),
    Promise.all(localizedLocales.map(async (locale) => [
      locale,
      await fetchContentLocalizations("exercises", locale)
    ])),
    vocabularyDataPromise,
    kanjiDataPromise
  ]);
  const exerciseCatalogsByLocale = new Map(exerciseCatalogEntries);
  const exerciseLocalizations = exerciseCatalogsByLocale.get(getUserLocale()) || {};
  const grammarPoints = baseGrammarPoints.map((entry) => ({
    ...entry,
    ...(grammarLocalizations[entry.id] || {})
  }));
  const exercises = baseExercises.map((exercise) => {
    const localized = exerciseLocalizations[exercise.id];

    if (getExerciseType(exercise) === "production") {
      return localized
        ? {
          ...exercise,
          text: localized.translation,
          promptVocabularyHints: localized.promptVocabularyHints
        }
        : exercise;
    }

    const referenceTranslations = Object.fromEntries([
      [defaultLocale, exercise.solution],
      ...localizedLocales.flatMap((locale) => {
        const translation = exerciseCatalogsByLocale.get(locale)?.[exercise.id]?.translation;

        return translation ? [[locale, translation]] : [];
      })
    ]);

    return {
      ...exercise,
      referenceTranslations,
      solution: localized?.translation || exercise.solution
    };
  });
  const grammarPointIds = new Set(grammarPoints.map(({ id }) => id));
  const validExercises = exercises.filter((exercise) => {
    return (
      typeof exercise.solution === "string" &&
      exercise.solution.trim().length > 0 &&
      (exercise.type === undefined || exerciseTypes.has(exercise.type)) &&
      (exercise.promptVocabularyHints === undefined || (
        getExerciseType(exercise) === "production" &&
        Array.isArray(exercise.promptVocabularyHints) &&
        exercise.promptVocabularyHints.every((hint) => {
          const { word, vocabularyIds } = hint || {};

          return (
            typeof word === "string" &&
            word.length > 0 &&
            Array.isArray(vocabularyIds) &&
            vocabularyIds.length > 0 &&
            vocabularyIds.every((id) => entriesById.has(id))
          );
        })
      )) &&
      Array.isArray(exercise.tokens) &&
      exercise.tokens.map(({ surface }) => surface).join("") === getJapaneseText(exercise) &&
      exercise.tokens.every(({ vocabularyId }) => {
        return !vocabularyId || entriesById.has(vocabularyId);
      }) &&
      Array.isArray(exercise.kanjiIds) &&
      exercise.kanjiIds.every((id) => kanjiEntriesById.has(id)) &&
      Array.isArray(exercise.grammarPointIds) &&
      exercise.grammarPointIds.length >= (getExerciseType(exercise) === "production" ? 1 : 2) &&
      exercise.grammarPointIds.every((id) => grammarPointIds.has(id)) &&
      Array.isArray(exercise.grammarHighlights) &&
      exercise.grammarHighlights.every(({ grammarPointId, tokenStart, tokenEnd }) => {
        return (
          exercise.grammarPointIds.includes(grammarPointId) &&
          Number.isInteger(tokenStart) &&
          Number.isInteger(tokenEnd) &&
          tokenStart >= 0 &&
          tokenStart < tokenEnd &&
          tokenEnd <= exercise.tokens.length
        );
      })
    );
  });

  if (validExercises.length === 0) {
    throw new Error("No exercise references the required known grammar points.");
  }

  grammarPointById = new Map(
    grammarPoints.map((grammarPoint) => [grammarPoint.id, grammarPoint])
  );
  return validExercises;
}

async function pickNextExercise() {
  const exercises = await exerciseDataPromise;
  const exerciseHistory = globalThis.JlptN5Stats.readLearningStats().exerciseHistory;
  const typeExercises = forcedExerciseType
    ? exercises.filter((exercise) => {
      return getExerciseType(exercise) === forcedExerciseType;
    })
    : exercises;

  if (typeExercises.length === 0) {
    throw new Error(`No exercises are available for ${forcedExerciseType}.`);
  }

  const choices = typeExercises.filter(({ id }) => id !== previousExerciseId);
  const availableExercises = choices.length > 0 ? choices : typeExercises;
  const selectedTypePool = globalThis.JlptN5ExerciseSelection.selectExercisePool({
    exercises,
    candidates: availableExercises,
    exerciseHistory,
    forcedExerciseType
  });

  if (selectedTypePool.length === 0) {
    throw new Error("No exercise is available for the selected exercise type.");
  }

  const availableGrammarPointIds = [
    ...new Set(selectedTypePool.flatMap(({ grammarPointIds }) => grammarPointIds))
  ];
  const targetGrammarPointId = globalThis.JlptN5Srs.pickNextGrammarPoint(
    availableGrammarPointIds
  );
  const exercisePool = selectedTypePool.filter(({ grammarPointIds }) => {
    return grammarPointIds.includes(targetGrammarPointId);
  });

  if (exercisePool.length === 0) {
    throw new Error(`No exercise is available for ${targetGrammarPointId}.`);
  }

  const exercise = exercisePool[Math.floor(Math.random() * exercisePool.length)];

  previousExerciseId = exercise.id;
  return exercise;
}

async function pickNextHiraganaExercise() {
  const [entriesById, kanjiEntriesById] = await Promise.all([
    vocabularyDataPromise,
    kanjiDataPromise
  ]);
  const words = prepareHiraganaWords(entriesById);
  const exerciseHistory = globalThis.JlptN5Stats.readLearningStats().exerciseHistory;
  const direction = globalThis.JlptN5Hiragana.getNextDirection(exerciseHistory);
  const targetKana = globalThis.JlptN5Srs.pickNextKana(
    hiraganaMetadata.map(({ id }) => id)
  );
  const exercise = globalThis.JlptN5Hiragana.chooseExercise(
    words,
    targetKana,
    direction,
    { previousVocabularyId: previousHiraganaVocabularyId }
  );

  if (!exercise) {
    throw new Error(`No hiragana exercise is available for ${targetKana}.`);
  }

  const kanjiIdByCharacter = new Map(
    [...kanjiEntriesById.values()].map((entry) => [entry.character, entry.id])
  );

  exercise.kanjiIds = [...new Set(
    [...exercise.writtenForm]
      .map((character) => kanjiIdByCharacter.get(character))
      .filter(Boolean)
  )];
  previousHiraganaVocabularyId = exercise.vocabularyId;
  vocabularyById ||= entriesById;
  kanjiById ||= kanjiEntriesById;
  return exercise;
}

async function pickNextKatakanaExercise() {
  const [entriesById, kanjiEntriesById] = await Promise.all([
    vocabularyDataPromise,
    kanjiDataPromise
  ]);
  const words = prepareKatakanaWords(entriesById);
  const exerciseHistory = globalThis.JlptN5Stats.readLearningStats().exerciseHistory;
  const { direction, exerciseKind } = globalThis.JlptN5Katakana
    .getNextExerciseMode(exerciseHistory);
  const isSingleKana = exerciseKind ===
    globalThis.JlptN5Katakana.exerciseKinds.singleKana;
  const targetInventory = isSingleKana
    ? katakanaSingleItems.map(({ katakana }) => katakana)
    : direction === globalThis.JlptN5Katakana.directions.hiraganaToKatakana
      ? katakanaPairInventory.flatMap(({ hiragana, katakana }) => [hiragana, katakana])
      : katakanaMetadata.map(({ id }) => id);
  const targetKana = globalThis.JlptN5Srs.pickNextKana(
    [...new Set(targetInventory)]
  );
  const exercise = isSingleKana
    ? globalThis.JlptN5Katakana.chooseSingleKanaExercise(
      katakanaSingleItems,
      targetKana
    )
    : globalThis.JlptN5Katakana.chooseExercise(
      words,
      targetKana,
      direction,
      { previousVocabularyId: previousKatakanaVocabularyId }
    );

  if (!exercise) {
    throw new Error(`No katakana exercise is available for ${targetKana}.`);
  }

  exercise.kanjiIds = [];
  if (exercise.vocabularyId) {
    previousKatakanaVocabularyId = exercise.vocabularyId;
  }
  vocabularyById ||= entriesById;
  kanjiById ||= kanjiEntriesById;
  return exercise;
}

async function pickNextVocabularyExercise() {
  const [entriesById, kanjiEntriesById] = await Promise.all([
    vocabularyDataPromise,
    kanjiDataPromise
  ]);
  const items = prepareVocabularyItems(entriesById);
  const exerciseHistory = globalThis.JlptN5Stats.readLearningStats().exerciseHistory;
  const direction = globalThis.JlptN5Vocabulary.getNextDirection(exerciseHistory);
  const targetVocabularyId = globalThis.JlptN5Srs.pickNextVocabulary(
    items.map(({ vocabularyId }) => vocabularyId)
  );
  const exercise = globalThis.JlptN5Vocabulary.chooseExercise(
    items,
    targetVocabularyId,
    direction
  );

  if (!exercise) {
    throw new Error(`No vocabulary exercise is available for ${targetVocabularyId}.`);
  }

  const kanjiIdByCharacter = new Map(
    [...kanjiEntriesById.values()].map((entry) => [entry.character, entry.id])
  );

  exercise.kanjiIds = [...new Set(
    [...exercise.term]
      .map((character) => kanjiIdByCharacter.get(character))
      .filter(Boolean)
  )];
  vocabularyById ||= entriesById;
  kanjiById ||= kanjiEntriesById;
  return exercise;
}

async function pickNextKanjiExercise() {
  const [entriesById, kanjiEntriesById, kanjiContexts] = await Promise.all([
    vocabularyDataPromise,
    kanjiDataPromise,
    kanjiContextDataPromise
  ]);
  const pool = prepareKanjiExercises(entriesById, kanjiEntriesById, kanjiContexts);
  const exerciseHistory = globalThis.JlptN5Stats.readLearningStats().exerciseHistory;
  const direction = globalThis.JlptN5Kanji.getNextDirection(exerciseHistory);
  const inventory = globalThis.JlptN5Kanji.getKanjiInventory(pool);
  const targetKanjiId = globalThis.JlptN5Srs.pickNextKanji(
    inventory.map(({ id }) => id)
  );
  const exercise = globalThis.JlptN5Kanji.chooseExercise(
    pool,
    targetKanjiId,
    direction,
    { previousVocabularyId: previousKanjiVocabularyId }
  );

  if (!exercise) {
    throw new Error(`No kanji exercise is available for ${targetKanjiId}.`);
  }

  previousKanjiVocabularyId = exercise.vocabularyId || exercise.kanjiContextId;
  vocabularyById ||= entriesById;
  kanjiById ||= kanjiEntriesById;
  return exercise;
}

function pickNextStudyExercise() {
  if (currentStudySection === "hiragana") {
    return pickNextHiraganaExercise();
  }

  if (currentStudySection === "katakana") {
    return pickNextKatakanaExercise();
  }

  if (currentStudySection === "vocabulary") {
    return pickNextVocabularyExercise();
  }

  if (currentStudySection === "kanji") {
    return pickNextKanjiExercise();
  }

  return pickNextExercise();
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
    const availability = globalThis.JlptN5Native?.isNative
      ? bundledSpeechPathsPromise.then((paths) => paths.has(audioUrl)).catch(() => false)
      : fetch(audioUrl, { method: "HEAD" })
        .then((response) => response.ok)
        .catch(() => false);

    speechAvailabilityByUrl.set(audioUrl, availability);
  }

  return speechAvailabilityByUrl.get(audioUrl);
}

async function loadBundledSpeechPaths() {
  const response = await fetch("data/available-voices.json");

  if (!response.ok) {
    throw new Error("Bundled speech catalogue could not be loaded.");
  }

  const paths = await response.json();

  if (!Array.isArray(paths) || paths.some((path) => typeof path !== "string")) {
    throw new Error("Bundled speech catalogue is invalid.");
  }

  return new Set(paths);
}

async function updateSpeechAvailability(lesson, button = speakButton, autoPlay = true) {
  setSpeakButtonState("checking", button);
  const available = await getSpeechAvailability(lesson.audio);

  if (currentLesson !== lesson) {
    return;
  }

  speechAvailable = available;
  setSpeakButtonState(available ? "ready" : "unavailable", button);

  if (autoPlay) {
    maybeAutoPlaySpeech();
  }
}

function maybeAutoPlaySpeech() {
  if (
    settings.autoPlayAudio &&
    speechAvailable &&
    autoPlayedLesson !== currentLesson &&
    (!shouldDelayKanaPromptAudio(currentLesson) || exerciseSubmitted) &&
    lessonElement.classList.contains("controls-visible")
  ) {
    autoPlayedLesson = currentLesson;
    void speakSentence();
  }
}

async function updateSolutionSpeech(lesson, button) {
  const shouldAutoPlay = settings.autoPlayAudio;

  if (shouldAutoPlay) {
    // Reserve this lesson's automatic playback so a pending prompt availability
    // check cannot race the solution and start the same recording twice.
    autoPlayedLesson = lesson;
  }

  await updateSpeechAvailability(lesson, button, false);

  if (
    shouldAutoPlay &&
    settings.autoPlayAudio &&
    currentLesson === lesson &&
    speechAvailable
  ) {
    void speakSentence(button);
  }
}

function shouldDelayKanaPromptAudio(lesson) {
  return lesson?.section === "hiragana" && lesson.direction ===
    globalThis.JlptN5Hiragana.directions.kanaToRomaji;
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
    } else if (!kanjiChoiceGrid.hidden) {
      kanjiChoiceGrid.querySelector("button")?.focus({ preventScroll: true });
    }
  }, effectiveDelay);
}

function cancelAutoCorrect() {
  autoCorrectController?.abort();
  autoCorrectController = undefined;
}

function setMeaningHintExpanded(button, content, expanded) {
  const isExpanded = Boolean(expanded);

  button.classList.toggle("is-expanded", isExpanded);
  button.setAttribute("aria-expanded", String(isExpanded));
  button.setAttribute(
    "aria-label",
    isExpanded
      ? t("common.hideMeaning", { meaning: content.textContent })
      : t("common.revealMeaning")
  );
  content.setAttribute("aria-hidden", String(!isExpanded));
}

function setKatakanaMeaningHintExpanded(expanded) {
  setMeaningHintExpanded(katakanaMeaningHint, katakanaMeaning, expanded);
}

function handleKatakanaMeaningHintClick() {
  setKatakanaMeaningHintExpanded(
    katakanaMeaningHint.getAttribute("aria-expanded") !== "true"
  );
}

function setKanjiMeaningHintExpanded(expanded) {
  setMeaningHintExpanded(kanjiMeaningHint, kanjiMeaning, expanded);
}

function handleKanjiMeaningHintClick() {
  setKanjiMeaningHintExpanded(
    kanjiMeaningHint.getAttribute("aria-expanded") !== "true"
  );
}

function displayLesson(lesson) {
  lesson.locale = getUserLocale();
  const isKana = ["hiragana", "katakana"].includes(lesson.section);
  const isKatakana = lesson.section === "katakana";
  const isKanji = lesson.section === "kanji";
  const isVocabulary = lesson.section === "vocabulary";
  const kanaApi = isKatakana
    ? globalThis.JlptN5Katakana
    : globalThis.JlptN5Hiragana;
  const kanaValue = isKatakana ? lesson.katakana : lesson.reading;
  const isProduction = getExerciseType(lesson) === "production";
  const isRomajiToKana = isKana &&
    lesson.direction === kanaApi.directions.romajiToKana;
  const isHiraganaToKatakana = isKatakana &&
    lesson.direction === kanaApi.directions.hiraganaToKatakana;
  const isSingleKatakana = isKatakana && lesson.exerciseKind ===
    globalThis.JlptN5Katakana.exerciseKinds.singleKana;
  const expectsKana = isRomajiToKana || isHiraganaToKatakana;
  const isEnglishToJapanese = isVocabulary && lesson.direction ===
    globalThis.JlptN5Vocabulary.directions.englishToJapanese;
  const isKanjiToReading = isKanji && lesson.direction ===
    globalThis.JlptN5Kanji.directions.kanjiToReading;

  cancelAutoCorrect();
  hideControls();
  resetSpeechAudio();
  currentLesson = lesson;
  speechAvailable = false;
  autoPlayedLesson = undefined;
  exerciseSubmitted = false;
  grammarRatings = new Map();
  vocabularyRating = undefined;
  kanjiRating = undefined;
  selectedKanjiAnswer = undefined;
  currentAttemptSubmittedAt = undefined;
  contextualVocabularyReviewIds = [];
  revealedVocabularyIds = new Set();
  translationInput.disabled = false;
  solutionElement.classList.remove("is-visible");
  solutionElement.textContent = "";
  sentenceElement.classList.toggle("is-single-kana", isSingleKatakana);
  actionButton.textContent = lesson.id === introductionId
    ? t("common.next")
    : t("common.submit");
  setKanaInputMode(
    isKanjiToReading
      ? "hiragana"
      : isProduction || isEnglishToJapanese
      ? "mixed"
      : expectsKana
        ? lesson.section
        : undefined
  );
  exerciseKindLabel.hidden = !isKana && !isKanji && !isVocabulary;
  kanaGuidance.hidden = !isKana || isSingleKatakana;
  kanjiGuidance.hidden = !isKanji;
  kanjiReading.hidden = !isKanji || isKanjiToReading;
  kanjiGuidanceDivider.hidden = !isKanji || isKanjiToReading;
  vocabularyGuidance.hidden = !isVocabulary;
  productionGuidance.hidden = !isProduction;
  productionGrammarTargets.replaceChildren();
  kanaMeaning.hidden = isKatakana;
  katakanaMeaningHint.hidden = !isKatakana || isSingleKatakana;
  setKatakanaMeaningHintExpanded(false);
  setKanjiMeaningHintExpanded(false);
  renderKanjiChoices(lesson);

  if (isKanji) {
    exerciseKindLabel.textContent = isKanjiToReading
      ? t("exercise.kanjiToReading")
      : t("exercise.readingToKanji");
    kanjiReading.textContent = lesson.reading;
    kanjiMeaning.textContent = lesson.meaning;
    sentenceElement.lang = "ja";
    translationInput.lang = "ja";
    translationInput.placeholder = isKanjiToReading
      ? t("exercise.writeHiragana")
      : t("exercise.chooseMissingKanji");
    translationInput.setAttribute(
      "aria-label",
      isKanjiToReading ? t("exercise.hiraganaAnswer") : t("exercise.missingKanjiAnswer")
    );
    speakButton.hidden = true;
    setSpeakButtonState("unavailable");
    const sentenceDrawDuration = renderPlainSentence(lesson.prompt);

    globalThis.JlptN5Stats.recordKanjiEncounter(lesson);
    revealControlsAfter(sentenceDrawDuration);
    return;
  }

  if (isVocabulary) {
    const readingLabel = getVocabularyReadingLabel(lesson);
    const showReading = !isEnglishToJapanese && readingLabel !== lesson.term;

    exerciseKindLabel.textContent = isEnglishToJapanese
      ? t(`exercise.vocabularyToJapanese.${getUserLocale()}`)
      : t(`exercise.vocabularyFromJapanese.${getUserLocale()}`);
    vocabularyReading.hidden = !showReading;
    vocabularyReading.textContent = showReading ? readingLabel : "";
    vocabularyGuidanceDivider.hidden = !showReading;
    vocabularyPartOfSpeech.textContent = t(`partOfSpeech.${lesson.partOfSpeech}`);
    sentenceElement.lang = isEnglishToJapanese ? getUserLocale() : "ja";
    translationInput.lang = isEnglishToJapanese ? "ja" : getUserLocale();
    translationInput.placeholder = isEnglishToJapanese
      ? t("exercise.writeJapanese")
      : t("exercise.translateToAcceptedLanguages", {
        languages: formatAcceptedTranslationLanguages()
      });
    translationInput.setAttribute(
      "aria-label",
      isEnglishToJapanese
        ? t("exercise.japaneseAnswer")
        : t("exercise.acceptedTranslationAnswer", {
          languages: formatAcceptedTranslationLanguages()
        })
    );
    speakButton.hidden = isEnglishToJapanese || !lesson.audio;
    const sentenceDrawDuration = renderPlainSentence(lesson.prompt);

    globalThis.JlptN5Stats.recordVocabularyEncounter(lesson);

    if (!isEnglishToJapanese && lesson.audio) {
      void updateSpeechAvailability(lesson);
    } else {
      setSpeakButtonState("unavailable");
    }

    revealControlsAfter(sentenceDrawDuration);
    return;
  }

  if (isKana) {
    const scriptLabel = isKatakana ? t("section.katakana") : t("section.hiragana");
    const prompt = isRomajiToKana
      ? lesson.romaji
      : isHiraganaToKatakana
        ? lesson.hiragana
        : kanaValue;
    const showWrittenForm = Boolean(
      lesson.writtenForm && lesson.writtenForm !== kanaValue
    );

    exerciseKindLabel.textContent = isSingleKatakana
      ? t("exercise.singleKatakana")
      : isHiraganaToKatakana
        ? t("exercise.hiraganaToKatakana")
        : isRomajiToKana
          ? t("exercise.romajiToScript", { script: scriptLabel })
          : t("exercise.scriptToRomaji", { script: scriptLabel });
    kanaWrittenForm.hidden = !showWrittenForm;
    kanaWrittenForm.textContent = showWrittenForm ? lesson.writtenForm : "";
    kanaGuidanceDivider.hidden = !showWrittenForm;
    kanaMeaning.textContent = isKatakana ? "" : lesson.meaning;
    katakanaMeaning.textContent = isKatakana ? lesson.meaning : "";
    sentenceElement.lang = isRomajiToKana ? "en" : "ja";
    translationInput.lang = expectsKana ? "ja" : "en";
    translationInput.placeholder = expectsKana
      ? t(isKatakana ? "exercise.writeKatakana" : "exercise.writeHiragana")
      : t("exercise.writeRomaji");
    translationInput.setAttribute(
      "aria-label",
      expectsKana
        ? t(isKatakana ? "exercise.katakanaAnswer" : "exercise.hiraganaAnswer")
        : t("exercise.romajiAnswer")
    );
    const delayKanaPromptAudio = shouldDelayKanaPromptAudio(lesson);

    speakButton.hidden = !lesson.audio || delayKanaPromptAudio;
    const sentenceDrawDuration = renderPlainSentence(prompt);

    globalThis.JlptN5Stats.recordKanaEncounter(lesson);

    if (lesson.audio) {
      void updateSpeechAvailability(lesson, speakButton, !delayKanaPromptAudio);
    } else {
      setSpeakButtonState("unavailable");
    }

    revealControlsAfter(sentenceDrawDuration);
    return;
  }

  sentenceElement.lang = isProduction ? getUserLocale() : "ja";
  translationInput.lang = isProduction ? "ja" : getUserLocale();
  translationInput.placeholder = isProduction
    ? t("exercise.writeJapanese")
    : t("exercise.translateToAcceptedLanguages", {
      languages: formatAcceptedTranslationLanguages()
    });
  translationInput.setAttribute(
    "aria-label",
    isProduction
      ? t("exercise.japaneseAnswer")
      : t("exercise.acceptedTranslationAnswer", {
        languages: formatAcceptedTranslationLanguages()
      })
  );
  speakButton.hidden = isProduction;

  if (isProduction) {
    for (const grammarPointId of lesson.grammarPointIds) {
      const grammarPoint = grammarPointById.get(grammarPointId);

      if (!grammarPoint) {
        continue;
      }

      const target = document.createElement("span");

      target.className = "production-grammar-target";
      target.textContent = grammarPoint.pattern;
      productionGrammarTargets.append(target);
    }
  }

  const sentenceDrawDuration = isProduction
    ? renderPlainSentence(lesson.text, lesson.promptVocabularyHints)
    : renderSentence(
      lesson.text,
      lesson.tokens,
      getVisibleGrammarHighlights(lesson)
    );

  if (lesson.id !== introductionId) {
    globalThis.JlptN5Stats?.recordExerciseEncounter(lesson);
  }

  if (isProduction) {
    setSpeakButtonState("unavailable");
  } else {
    void updateSpeechAvailability(lesson);
  }
  revealControlsAfter(sentenceDrawDuration);
}

async function displayInitialLesson() {
  const requestId = ++lessonRequestId;

  try {
    const [introduction, entriesById] = await Promise.all([
      fetchJson("data/introduction.json"),
      vocabularyDataPromise,
      exerciseDataPromise
    ]);

    if (
      !Array.isArray(introduction.tokens) ||
      introduction.tokens.map(({ surface }) => surface).join("") !== introduction.text ||
      !Array.isArray(introduction.grammarHighlights)
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

async function displayInitialHiraganaExercise() {
  const requestId = ++lessonRequestId;

  try {
    const exercise = await pickNextHiraganaExercise();

    if (requestId === lessonRequestId) {
      displayLesson(exercise);
      clearTranslationInput();
      configureAnswerControls(exercise);
    }
  } catch (error) {
    console.error(error);
  }
}

async function displayInitialKatakanaExercise() {
  const requestId = ++lessonRequestId;

  try {
    const exercise = await pickNextKatakanaExercise();

    if (requestId === lessonRequestId) {
      displayLesson(exercise);
      clearTranslationInput();
      configureAnswerControls(exercise);
    }
  } catch (error) {
    console.error(error);
  }
}

async function displayInitialKanjiExercise() {
  const requestId = ++lessonRequestId;

  try {
    const exercise = await pickNextKanjiExercise();

    if (requestId === lessonRequestId) {
      displayLesson(exercise);
      clearTranslationInput();
      configureAnswerControls(exercise);
    }
  } catch (error) {
    console.error(error);
  }
}

async function displayInitialVocabularyExercise() {
  const requestId = ++lessonRequestId;

  try {
    const exercise = await pickNextVocabularyExercise();

    if (requestId === lessonRequestId) {
      displayLesson(exercise);
      clearTranslationInput();
      configureAnswerControls(exercise);
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
  cancelAutoCorrect();
  const requestId = ++lessonRequestId;
  hideControls();
  actionButton.disabled = true;
  lessonStage.classList.add("is-leaving");

  try {
    const exercise = await pickNextStudyExercise();

    await waitForFadeOut();

    if (requestId !== lessonRequestId) {
      return;
    }

    displayLesson(exercise);
    clearTranslationInput();
    configureAnswerControls(exercise);
    lessonStage.classList.remove("is-leaving");
  } catch (error) {
    console.error(error);
    lessonStage.classList.remove("is-leaving");
    revealControlsAfter(0);
  } finally {
    actionButton.disabled = isKanjiChoiceExercise(currentLesson) &&
      !exerciseSubmitted && !selectedKanjiAnswer;
  }
}

function revealKanaSolution() {
  const isKatakana = currentLesson.section === "katakana";
  const kanaApi = isKatakana
    ? globalThis.JlptN5Katakana
    : globalThis.JlptN5Hiragana;
  const kanaValue = isKatakana ? currentLesson.katakana : currentLesson.reading;
  const result = kanaApi.gradeAnswer({
    ...(isKatakana
      ? { katakana: kanaValue, hiragana: currentLesson.hiragana }
      : { reading: kanaValue }),
    direction: currentLesson.direction,
    answer: translationInput.value
  });
  const answerRow = document.createElement("div");
  const answer = document.createElement("p");
  const kanaSection = document.createElement("section");
  const summary = document.createElement("p");
  const kanaList = document.createElement("ol");
  const srsKanaRatings = kanaApi.summarizeKanaRatings(result.parts);
  const kanaRatings = kanaApi.createKanaRatings(result.parts);
  const isRomajiToKana = currentLesson.direction ===
    kanaApi.directions.romajiToKana;
  const isHiraganaToKatakana = isKatakana && currentLesson.direction ===
    kanaApi.directions.hiraganaToKatakana;
  const expectsKana = isRomajiToKana || isHiraganaToKatakana;

  globalThis.JlptN5Srs.recordKanaReviews(srsKanaRatings);
  globalThis.JlptN5Stats.recordKanaAttempt(
    currentLesson,
    translationInput.value,
    kanaRatings
  );
  void giveAnswerHaptic(result.correct);
  exerciseSubmitted = true;
  translationInput.disabled = true;
  answerRow.className = "solution-answer-row";
  answer.className = "solution-answer";
  answer.lang = expectsKana ? "ja" : "en";
  answer.textContent = result.expectedAnswer;
  answerRow.append(answer);
  kanaSection.className = "solution-kana";
  summary.className = "solution-kana-summary";
  summary.dataset.outcome = result.correct ? "good" : "again";
  summary.textContent = result.correct ? t("common.correct") : t("common.checkEachPart");
  kanaList.className = "solution-kana-list";

  for (const part of result.parts) {
    const item = document.createElement("li");
    const mark = document.createElement("span");
    const kana = document.createElement("strong");
    const romaji = document.createElement("span");
    const succeeded = part.outcome === "good";

    item.className = "solution-kana-item";
    item.dataset.outcome = part.outcome;
    const partLabel = part.pairedKana
      ? t("exercise.kanaPair", { from: part.pairedKana, to: part.kana })
      : part.kana;

    item.setAttribute("aria-label", t("exercise.partResult", {
      part: partLabel,
      result: t(succeeded ? "common.correct" : "common.incorrect")
    }));
    mark.className = "solution-kana-mark";
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = succeeded ? "✓" : "×";
    kana.lang = "ja";
    kana.textContent = part.pairedKana || part.kana;
    romaji.lang = part.pairedKana ? "ja" : "en";
    romaji.textContent = part.pairedKana ? `→ ${part.kana}` : part.romaji;
    item.append(mark, kana, romaji);
    kanaList.append(item);
  }

  kanaSection.append(summary, kanaList);
  solutionElement.replaceChildren(answerRow, kanaSection);
  actionButton.textContent = t("common.next");
  actionButton.disabled = false;

  if (shouldDelayKanaPromptAudio(currentLesson) && currentLesson.audio) {
    speakButton.hidden = false;
    void updateSolutionSpeech(currentLesson, speakButton);
  }

  window.requestAnimationFrame(() => {
    solutionElement.classList.add("is-visible");
  });
}

function revealVocabularySolution() {
  const result = globalThis.JlptN5Vocabulary.gradeAnswer(
    currentLesson,
    translationInput.value
  );
  const answerRow = document.createElement("div");
  const answer = document.createElement("p");
  const summary = document.createElement("p");
  const ratingControl = document.createElement("div");
  let solutionSpeakButton = speakButton;
  const isEnglishToJapanese = currentLesson.direction ===
    globalThis.JlptN5Vocabulary.directions.englishToJapanese;

  const stats = globalThis.JlptN5Stats.recordVocabularyAttempt(
    currentLesson,
    translationInput.value,
    result.outcome
  );
  currentAttemptSubmittedAt = stats.exerciseHistory.at(-1)?.submittedAt;
  void giveAnswerHaptic(result.correct);
  exerciseSubmitted = true;
  translationInput.disabled = true;
  answerRow.className = "solution-answer-row";
  answer.className = "solution-answer";
  answer.lang = isEnglishToJapanese ? "ja" : getUserLocale();
  answer.textContent = result.expectedAnswer;

  if (
    isEnglishToJapanese &&
    currentLesson.reading &&
    currentLesson.reading !== currentLesson.term
  ) {
    const reading = document.createElement("span");

    reading.className = "vocabulary-solution-reading";
    reading.lang = "ja";
    reading.textContent = getVocabularyReadingLabel(currentLesson);
    answer.append(reading);
  }

  answerRow.append(answer);

  if (isEnglishToJapanese && currentLesson.audio) {
    const answerSpeakButton = speakButton.cloneNode(true);

    answerSpeakButton.removeAttribute("id");
    answerSpeakButton.hidden = false;
    answerSpeakButton.className = "speak-button solution-speak-button";
    answerSpeakButton.addEventListener("click", () => {
      void speakSentence(answerSpeakButton);
    });
    answerRow.append(answerSpeakButton);
    solutionSpeakButton = answerSpeakButton;
  }

  if (currentLesson.audio) {
    void updateSolutionSpeech(currentLesson, solutionSpeakButton);
  }

  summary.className = "solution-kana-summary solution-vocabulary-summary";
  summary.dataset.outcome = result.outcome;
  summary.textContent = result.correct ? t("common.correct") : t("common.referenceAnswer");
  ratingControl.className = "solution-grammar-rating solution-vocabulary-rating";
  ratingControl.setAttribute("role", "group");
  ratingControl.setAttribute(
    "aria-label",
    t("exercise.selfAssessment", { name: currentLesson.term })
  );

  for (const [outcome, label] of [
    ["again", t("exercise.again")],
    ["good", t("exercise.good")]
  ]) {
    const ratingButton = document.createElement("button");

    ratingButton.type = "button";
    ratingButton.lang = getUserLocale();
    ratingButton.dataset.vocabularyRating = outcome;
    ratingButton.setAttribute("aria-pressed", "false");
    ratingButton.textContent = label;
    ratingControl.append(ratingButton);
  }

  solutionElement.replaceChildren(answerRow, summary, ratingControl);
  selectVocabularyRating(result.outcome, false);
  actionButton.textContent = t("common.next");
  actionButton.disabled = false;

  window.requestAnimationFrame(() => {
    solutionElement.classList.add("is-visible");
  });
}

function selectVocabularyRating(outcome, persist = true) {
  const ratingControl = solutionElement.querySelector(".solution-vocabulary-rating");

  if (!ratingControl || !["again", "good"].includes(outcome)) {
    return;
  }

  vocabularyRating = outcome;

  for (const button of ratingControl.querySelectorAll("button[data-vocabulary-rating]")) {
    button.setAttribute("aria-pressed", String(button.dataset.vocabularyRating === outcome));
  }

  const summary = solutionElement.querySelector(".solution-vocabulary-summary");

  if (summary) {
    summary.dataset.outcome = outcome;
    summary.textContent = outcome === "good"
      ? t("common.correct")
      : t("common.referenceAnswer");
  }

  if (persist && currentAttemptSubmittedAt) {
    globalThis.JlptN5Stats.recordVocabularyAttemptOutcome(
      currentLesson.id,
      currentAttemptSubmittedAt,
      outcome
    );
  }
}

function handleVocabularyRating(event) {
  const ratingButton = event.target.closest("button[data-vocabulary-rating]");

  if (!ratingButton || !solutionElement.contains(ratingButton)) {
    return;
  }

  selectVocabularyRating(ratingButton.dataset.vocabularyRating);
  void giveAnswerHaptic(ratingButton.dataset.vocabularyRating === "good");
}

function recordCurrentVocabularyReview() {
  if (!["again", "good"].includes(vocabularyRating)) {
    return;
  }

  globalThis.JlptN5Srs.recordVocabularyReviews([{
    vocabularyId: currentLesson.vocabularyId,
    outcome: vocabularyRating
  }]);
  globalThis.JlptN5Stats.recordVocabularyAttemptOutcome(
    currentLesson.id,
    currentAttemptSubmittedAt,
    vocabularyRating
  );
}

function revealKanjiSolution() {
  const submittedAnswer = isKanjiChoiceExercise(currentLesson)
    ? selectedKanjiAnswer || ""
    : translationInput.value;
  const result = globalThis.JlptN5Kanji.gradeAnswer(
    currentLesson,
    submittedAnswer
  );
  const answerRow = document.createElement("div");
  const answer = document.createElement("p");
  const term = document.createElement("span");
  const reading = document.createElement("span");
  const meaning = document.createElement("span");
  const summary = document.createElement("p");
  const ratingControl = document.createElement("div");
  let solutionSpeakButton = speakButton;
  const stats = globalThis.JlptN5Stats.recordKanjiAttempt(
    currentLesson,
    submittedAnswer,
    result.outcome
  );

  currentAttemptSubmittedAt = stats.exerciseHistory.at(-1)?.submittedAt;
  void giveAnswerHaptic(result.correct);
  exerciseSubmitted = true;
  translationInput.disabled = true;

  if (isKanjiChoiceExercise(currentLesson)) {
    kanjiChoiceGrid.dataset.submitted = "true";

    for (const button of kanjiChoiceGrid.querySelectorAll("button[data-kanji-choice]")) {
      button.disabled = true;
    }
  }

  answerRow.className = "solution-answer-row";
  answer.className = "solution-answer solution-kanji-answer";
  answer.lang = "ja";
  term.className = "kanji-solution-term";

  for (const character of currentLesson.term) {
    if (character === currentLesson.character) {
      const target = document.createElement("strong");

      target.className = "kanji-solution-target";
      target.textContent = character;
      term.append(target);
    } else {
      term.append(character);
    }
  }

  reading.className = "vocabulary-solution-reading";
  reading.textContent = currentLesson.reading;
  meaning.className = "kanji-solution-meaning";
  meaning.lang = getUserLocale();
  meaning.textContent = currentLesson.meaning;
  answer.append(term, reading, meaning);
  answerRow.append(answer);

  if (currentLesson.audio) {
    const answerSpeakButton = speakButton.cloneNode(true);

    answerSpeakButton.removeAttribute("id");
    answerSpeakButton.hidden = false;
    answerSpeakButton.className = "speak-button solution-speak-button";
    answerSpeakButton.addEventListener("click", () => {
      void speakSentence(answerSpeakButton);
    });
    answerRow.append(answerSpeakButton);
    solutionSpeakButton = answerSpeakButton;
    void updateSolutionSpeech(currentLesson, solutionSpeakButton);
  }

  summary.className = "solution-kana-summary solution-vocabulary-summary solution-kanji-summary";
  summary.dataset.outcome = result.outcome;
  summary.textContent = result.correct ? t("common.correct") : t("common.referenceAnswer");
  ratingControl.className = "solution-grammar-rating solution-vocabulary-rating solution-kanji-rating";
  ratingControl.setAttribute("role", "group");
  ratingControl.setAttribute(
    "aria-label",
    t("exercise.selfAssessment", { name: currentLesson.character })
  );

  for (const [outcome, label] of [
    ["again", t("exercise.again")],
    ["good", t("exercise.good")]
  ]) {
    const ratingButton = document.createElement("button");

    ratingButton.type = "button";
    ratingButton.lang = getUserLocale();
    ratingButton.dataset.kanjiRating = outcome;
    ratingButton.setAttribute("aria-pressed", "false");
    ratingButton.textContent = label;
    ratingControl.append(ratingButton);
  }

  solutionElement.replaceChildren(answerRow, summary, ratingControl);
  selectKanjiRating(result.outcome, false);
  actionButton.textContent = t("common.next");
  actionButton.disabled = false;

  if (isKanjiChoiceExercise(currentLesson)) {
    actionButton.focus({ preventScroll: true });
  }

  window.requestAnimationFrame(() => {
    solutionElement.classList.add("is-visible");
  });
}

function selectKanjiRating(outcome, persist = true) {
  const ratingControl = solutionElement.querySelector(".solution-kanji-rating");

  if (!ratingControl || !["again", "good"].includes(outcome)) {
    return;
  }

  kanjiRating = outcome;

  for (const button of ratingControl.querySelectorAll("button[data-kanji-rating]")) {
    button.setAttribute("aria-pressed", String(button.dataset.kanjiRating === outcome));
  }

  const summary = solutionElement.querySelector(".solution-kanji-summary");

  if (summary) {
    summary.dataset.outcome = outcome;
    summary.textContent = outcome === "good"
      ? t("common.correct")
      : t("common.referenceAnswer");
  }

  if (persist && currentAttemptSubmittedAt) {
    globalThis.JlptN5Stats.recordKanjiAttemptOutcome(
      currentLesson.id,
      currentAttemptSubmittedAt,
      outcome
    );
  }
}

function handleKanjiRating(event) {
  const ratingButton = event.target.closest("button[data-kanji-rating]");

  if (!ratingButton || !solutionElement.contains(ratingButton)) {
    return;
  }

  selectKanjiRating(ratingButton.dataset.kanjiRating);
  void giveAnswerHaptic(ratingButton.dataset.kanjiRating === "good");
}

function recordCurrentKanjiReview() {
  if (!["again", "good"].includes(kanjiRating)) {
    return;
  }

  globalThis.JlptN5Srs.recordKanjiReviews([{
    kanjiId: currentLesson.kanjiId,
    outcome: kanjiRating
  }]);
  globalThis.JlptN5Stats.recordKanjiAttemptOutcome(
    currentLesson.id,
    currentAttemptSubmittedAt,
    kanjiRating
  );

  const positiveVocabularyRating = globalThis.JlptN5Kanji.createPositiveVocabularyRating(
    currentLesson,
    kanjiRating
  );

  if (
    positiveVocabularyRating &&
    globalThis.JlptN5Srs.filterNewOrDueVocabulary([
      positiveVocabularyRating.vocabularyId
    ]).length > 0
  ) {
    globalThis.JlptN5Srs.recordVocabularyReviews([positiveVocabularyRating]);
  }
}

function revealSolution() {
  const isProduction = getExerciseType(currentLesson) === "production";

  contextualVocabularyReviewIds = isProduction
    ? globalThis.JlptN5Vocabulary.findContextualVocabularyIds({
      tokens: currentLesson.tokens,
      answer: translationInput.value,
      vocabulary: vocabularyById,
      excludedVocabularyIds: revealedVocabularyIds
    })
    : globalThis.JlptN5Vocabulary.findRecognizedVocabularyIds({
      tokens: currentLesson.tokens,
      answer: translationInput.value,
      referenceTranslations: currentLesson.referenceTranslations,
      vocabulary: vocabularyById,
      acceptedLocales: getAcceptedTranslationLocales(),
      excludedVocabularyIds: revealedVocabularyIds
    });
  const stats = globalThis.JlptN5Stats.recordExerciseAttempt(
    currentLesson,
    translationInput.value
  );

  currentAttemptSubmittedAt = stats.exerciseHistory.at(-1)?.submittedAt;
  exerciseSubmitted = true;
  const answer = document.createElement("p");
  const answerRow = document.createElement("div");
  const grammarSection = document.createElement("section");
  const grammarList = document.createElement("ul");
  const autoCorrectEnabled = settings.aiAutoCorrect && openAiApiKey;
  const autoCorrectStatus = autoCorrectEnabled ? document.createElement("p") : undefined;

  answer.className = "solution-answer";
  answer.lang = isProduction ? "ja" : getUserLocale();

  if (isProduction) {
    renderFuriganaText(answer, currentLesson.solution, currentLesson.tokens);
  } else {
    answer.textContent = currentLesson.solution;
  }

  answerRow.className = "solution-answer-row";
  answerRow.append(answer);

  if (isProduction) {
    const answerSpeakButton = speakButton.cloneNode(true);

    answerSpeakButton.removeAttribute("id");
    answerSpeakButton.hidden = false;
    answerSpeakButton.className = "speak-button solution-speak-button";
    answerSpeakButton.addEventListener("click", () => {
      void speakSentence(answerSpeakButton);
    });
    answerRow.append(answerSpeakButton);
    void updateSpeechAvailability(currentLesson, answerSpeakButton, false);
  }
  grammarSection.className = "solution-grammar";
  grammarList.className = "solution-grammar-list";

  if (autoCorrectStatus) {
    autoCorrectStatus.className = "solution-autocorrect-status";
    autoCorrectStatus.lang = getUserLocale();
    autoCorrectStatus.dataset.state = "loading";
    autoCorrectStatus.textContent = t("autocorrect.checking");
  }

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
    ratingControl.setAttribute(
      "aria-label",
      t("exercise.selfAssessment", { name: grammarPoint.name })
    );

    for (const [outcome, label] of [
      ["again", t("exercise.again")],
      ["good", t("exercise.good")]
    ]) {
      const ratingButton = document.createElement("button");

      ratingButton.type = "button";
      ratingButton.lang = getUserLocale();
      ratingButton.dataset.grammarRating = outcome;
      ratingButton.setAttribute("aria-pressed", "false");
      ratingButton.textContent = label;
      ratingControl.append(ratingButton);
    }

    description.append(name, meaning);
    item.append(pattern, description, ratingControl);
    grammarList.append(item);
  }

  if (autoCorrectStatus) {
    grammarSection.append(autoCorrectStatus);
  }

  grammarSection.append(grammarList);
  solutionElement.replaceChildren(answerRow, grammarSection);
  actionButton.textContent = t("common.next");
  actionButton.disabled = true;

  window.requestAnimationFrame(() => {
    solutionElement.classList.add("is-visible");
  });

  if (autoCorrectEnabled) {
    void autoCorrectGrammarRatings();
  }
}

function updateGrammarRatingSummary() {
  const ratedCount = grammarRatings.size;
  const totalCount = currentLesson.grammarPointIds.length;
  actionButton.disabled = ratedCount !== totalCount;
}

function selectGrammarRating(grammarPointId, outcome, updateSummary = true) {
  const ratingControl = [...solutionElement.querySelectorAll(".solution-grammar-rating")]
    .find((control) => control.dataset.grammarPointId === grammarPointId);

  if (!ratingControl || !["again", "good"].includes(outcome)) {
    return;
  }

  grammarRatings.set(grammarPointId, outcome);

  for (const button of ratingControl.querySelectorAll("button[data-grammar-rating]")) {
    button.setAttribute("aria-pressed", String(button.dataset.grammarRating === outcome));
  }

  if (updateSummary) {
    updateGrammarRatingSummary();
  }
}

async function autoCorrectGrammarRatings() {
  const lesson = currentLesson;
  const controller = new AbortController();
  const status = solutionElement.querySelector(".solution-autocorrect-status");
  const grammarPoints = lesson.grammarPointIds
    .map((grammarPointId) => grammarPointById.get(grammarPointId))
    .filter(Boolean);

  cancelAutoCorrect();
  autoCorrectController = controller;

  try {
    const ratings = await globalThis.JlptN5AutoCorrect.assessGrammarPoints({
      apiKey: openAiApiKey,
      lesson,
      grammarPoints,
      userAnswer: translationInput.value,
      locale: getUserLocale(),
      acceptedLocales: getAcceptedTranslationLocales(),
      signal: controller.signal
    });

    if (controller.signal.aborted || currentLesson !== lesson || !exerciseSubmitted) {
      return;
    }

    for (const { grammarPointId, outcome } of ratings) {
      if (!grammarRatings.has(grammarPointId)) {
        selectGrammarRating(grammarPointId, outcome, false);
      }
    }

    updateGrammarRatingSummary();
    status.dataset.state = "success";
    status.textContent = t("autocorrect.done");
  } catch (error) {
    if (error.name === "AbortError" || controller.signal.aborted) {
      return;
    }

    console.warn(error);
    status.dataset.state = "error";
    if (error.status === 401) {
      status.textContent = t("autocorrect.badKey");
    } else if (error.code === "max_output_tokens") {
      status.textContent = t("autocorrect.limit");
    } else {
      status.textContent = t("autocorrect.failed");
    }
  } finally {
    if (autoCorrectController === controller) {
      autoCorrectController = undefined;
    }
  }
}

function handleGrammarRating(event) {
  const ratingButton = event.target.closest("button[data-grammar-rating]");

  if (!ratingButton || !solutionElement.contains(ratingButton)) {
    return;
  }

  const ratingControl = ratingButton.closest(".solution-grammar-rating");

  selectGrammarRating(
    ratingControl.dataset.grammarPointId,
    ratingButton.dataset.grammarRating
  );
  void giveAnswerHaptic(ratingButton.dataset.grammarRating === "good");
}

function recordCurrentGrammarReviews() {
  const reviews = currentLesson.grammarPointIds.map((grammarPointId) => ({
    grammarPointId,
    outcome: grammarRatings.get(grammarPointId)
  }));

  globalThis.JlptN5Srs.recordReviews(reviews);
  globalThis.JlptN5Stats.recordExerciseGrammarRatings(
    currentLesson.id,
    currentAttemptSubmittedAt,
    reviews
  );

  const vocabularyIds = globalThis.JlptN5Srs.filterNewOrDueVocabulary(
    contextualVocabularyReviewIds
  );

  globalThis.JlptN5Srs.recordVocabularyReviews(vocabularyIds.map((vocabularyId) => ({
    vocabularyId,
    outcome: "good"
  })));
}

function handleAction() {
  if (!exerciseSubmitted) {
    commitPendingKanaInput();
  }

  if (currentLesson.section === "vocabulary") {
    if (exerciseSubmitted) {
      recordCurrentVocabularyReview();
      showNextExercise();
    } else {
      revealVocabularySolution();
    }
    return;
  }

  if (currentLesson.section === "kanji") {
    if (exerciseSubmitted) {
      recordCurrentKanjiReview();
      showNextExercise();
    } else {
      revealKanjiSolution();
    }
    return;
  }

  if (["hiragana", "katakana"].includes(currentLesson.section)) {
    if (exerciseSubmitted) {
      showNextExercise();
    } else {
      revealKanaSolution();
    }
    return;
  }

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

function handleTranslationInputKeydown(event) {
  if (event.key !== "Enter" || event.isComposing) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  actionButton.click();
}

function handleResultKeydown(event) {
  const canSubmitKanjiChoice = !exerciseSubmitted &&
    isKanjiChoiceExercise(currentLesson) && Boolean(selectedKanjiAnswer);

  if (
    event.key !== "Enter" ||
    event.isComposing ||
    (!exerciseSubmitted && !canSubmitKanjiChoice) ||
    actionButton.disabled ||
    settingsDialog.open ||
    activityDialog.open ||
    !profileMenu.hidden ||
    event.target === actionButton
  ) {
    return;
  }

  event.preventDefault();
  actionButton.click();
}

function setSpeakButtonState(state, button = speakButton) {
  const isLoading = state === "loading";
  const isChecking = state === "checking";
  const isUnavailable = state === "unavailable";
  const hasError = state === "error";
  let label = t("speech.play");

  if (isUnavailable) {
    label = t("speech.unavailable");
  } else if (hasError) {
    label = t("speech.retry");
  } else if (isLoading) {
    label = t("speech.loading");
  } else if (isChecking) {
    label = t("speech.checking");
  }

  button.disabled = isLoading || isChecking || isUnavailable;
  button.classList.toggle("is-loading", isLoading);
  button.classList.toggle("no-audio", isUnavailable);
  button.classList.toggle("has-error", hasError);
  button.setAttribute("aria-busy", String(isLoading || isChecking));
  button.setAttribute("aria-label", label);
  button.title = label;
}

async function loadSpeechAudio() {
  if (globalThis.JlptN5Native?.isNative) {
    return new Audio(new URL(currentLesson.audio, document.baseURI).href);
  }

  const response = await fetch(currentLesson.audio);

  if (!response.ok) {
    throw new Error("Speech could not be loaded.");
  }

  const audioBlob = await response.blob();
  speechAudioUrl = URL.createObjectURL(audioBlob);
  return new Audio(speechAudioUrl);
}

async function speakSentence(button = speakButton) {
  if (!speechAvailable) {
    return;
  }

  setSpeakButtonState("loading", button);

  try {
    speechAudioPromise ||= loadSpeechAudio().catch((error) => {
      speechAudioPromise = undefined;
      throw error;
    });

    activeAudio = await speechAudioPromise;
    activeAudio.currentTime = 0;
    await activeAudio.play();
    setSpeakButtonState("ready", button);
  } catch (error) {
    console.error(error);
    setSpeakButtonState("error", button);
  }
}

profileMenuButton.addEventListener("click", handleProfileMenuButtonClick);
profileMenuButton.addEventListener("keydown", handleProfileMenuButtonKeydown);
profileMenu.addEventListener("keydown", handleProfileMenuKeydown);
profileMenu.addEventListener("click", handleProfileMenuClick);
profileMenuContainer.addEventListener("focusout", handleProfileMenuFocusOut);
document.addEventListener("pointerdown", handleOutsideProfileMenuClick);
document.addEventListener("click", dismissActiveToken);
document.addEventListener("keydown", handleResultKeydown);
settingsDialog.addEventListener("click", handleSettingsBackdropClick);
settingsDialog.addEventListener("close", () => profileMenuButton.focus());
settingsDialog.addEventListener("change", handleSettingChange);
openAiApiKeyInput.addEventListener("input", handleSettingChange);
progressExportButton.addEventListener("click", exportProgress);
progressImportButton.addEventListener("click", chooseProgressImport);
progressImportInput.addEventListener("change", () => {
  void importProgress();
});
progressResetButton.addEventListener("click", () => {
  void resetProgress();
});
activityDialog.addEventListener("click", handleActivityBackdropClick);
activityDialog.addEventListener("close", () => profileMenuButton.focus());
activityDialog.querySelector(".stat-kind-control").addEventListener("click", handleStatKindClick);
statisticsContent.addEventListener("click", handleStatisticsContentClick);
historyList.addEventListener("click", handleHistoryListClick);
actionButton.addEventListener("click", handleAction);
translationInput.addEventListener("keydown", handleTranslationInputKeydown);
translationInput.addEventListener("input", handleTranslationInputResize);
kanjiChoiceGrid.addEventListener("click", handleKanjiChoiceClick);
katakanaMeaningHint.addEventListener("click", handleKatakanaMeaningHintClick);
kanjiMeaningHint.addEventListener("click", handleKanjiMeaningHintClick);
solutionElement.addEventListener("click", handleGrammarRating);
solutionElement.addEventListener("click", handleVocabularyRating);
solutionElement.addEventListener("click", handleKanjiRating);
speakButton.addEventListener("click", () => {
  void speakSentence(speakButton);
});
window.addEventListener("beforeunload", resetSpeechAudio);

async function synchronizeNativeColorScheme() {
  const native = globalThis.JlptN5Native;
  const statusBar = native?.plugins?.statusBar;
  const isDark = preferredDarkColorScheme.matches;

  document.documentElement.dataset.colorScheme = isDark ? "dark" : "light";

  if (!native?.isNative || !statusBar) {
    return;
  }

  try {
    await statusBar.setStyle({ style: isDark ? "DARK" : "LIGHT" });

    if (native.platform === "android") {
      await statusBar.setBackgroundColor({
        color: isDark ? "#101412" : "#fafafa"
      });
    }
  } catch (error) {
    console.warn("The native system bar theme could not be updated.", error);
  }
}

async function configureNativeBehavior() {
  const native = globalThis.JlptN5Native;
  const app = native?.plugins?.app;

  await synchronizeNativeColorScheme();
  preferredDarkColorScheme.addEventListener("change", () => {
    void synchronizeNativeColorScheme();
  });

  if (!native?.isNative || native.platform !== "android" || !app) {
    return;
  }

  await app.addListener("backButton", async ({ canGoBack }) => {
    if (settingsDialog.open) {
      settingsDialog.close();
      return;
    }

    if (activityDialog.open) {
      activityDialog.close();
      return;
    }

    if (!profileMenu.hidden) {
      closeProfileMenu(true);
      return;
    }

    if (sentenceElement.querySelector(".token.is-touch-active")) {
      dismissActiveToken();
      return;
    }

    if (canGoBack) {
      window.history.back();
    } else {
      await app.exitApp();
    }
  });
}

async function dismissLoadingScreen() {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const nativeSplash = globalThis.JlptN5Native?.plugins?.splashScreen;
  const elapsedLoadingDuration = window.performance.now() - loadingStartedAt;
  const remainingDelay = Math.max(
    0,
    minimumLoadingDuration - elapsedLoadingDuration
  );

  if (remainingDelay > 0) {
    await new Promise((resolve) => window.setTimeout(resolve, remainingDelay));
  }

  document.documentElement.dataset.splashShown = "true";

  try {
    sessionStorage.setItem("chakuchaku:splash-shown", "true");
  } catch {
    // The next page can show the splash again if session storage is unavailable.
  }

  document.body.classList.remove("app-loading");

  if (nativeSplash) {
    loadingScreen.remove();

    try {
      await nativeSplash.hide({ fadeOutDuration: reduceMotion ? 0 : 220 });
    } catch (error) {
      console.warn("The native splash screen could not be hidden cleanly.", error);
    }
    return;
  }

  if (reduceMotion) {
    loadingScreen.remove();
    return;
  }

  loadingScreen.classList.add("is-hiding");
  await new Promise((resolve) => {
    const fallbackTimer = window.setTimeout(resolve, 300);

    loadingScreen.addEventListener("transitionend", () => {
      window.clearTimeout(fallbackTimer);
      resolve();
    }, { once: true });
  });
  loadingScreen.remove();
}

async function startApp() {
  try {
    await globalThis.JlptN5Storage.ready();
    settings = globalThis.JlptN5Settings.readSettings();
    await globalThis.JlptN5I18n.initialize(settings.userLanguage);
    globalThis.JlptN5I18n.applyDocument();
    initializeDataPromises();
    await configureNativeBehavior();

    if (!openAiApiKey && settings.aiAutoCorrect) {
      settings = globalThis.JlptN5Settings.writeSettings({ aiAutoCorrect: false });
    }

    configureStudyNavigation();
    applySettings();

    if (settings.reviewReminder) {
      void synchronizeReviewReminder();
    }

    if (currentStudySection === "hiragana") {
      await displayInitialHiraganaExercise();
    } else if (currentStudySection === "katakana") {
      await displayInitialKatakanaExercise();
    } else if (currentStudySection === "kanji") {
      await displayInitialKanjiExercise();
    } else if (currentStudySection === "vocabulary") {
      await displayInitialVocabularyExercise();
    } else {
      await displayInitialLesson();
    }
  } finally {
    await dismissLoadingScreen();
  }
}

void startApp();
