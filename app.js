const introductionId = "introduction";
const studySections = new Set(["grammar", "hiragana", "katakana", "vocabulary"]);
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
const minimumLoadingDuration = 1600;
const loadingStartedAt = window.performance.now();
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
const vocabularyGuidance = document.querySelector("#vocabulary-guidance");
const vocabularyReading = document.querySelector("#vocabulary-reading");
const vocabularyGuidanceDivider = document.querySelector("#vocabulary-guidance-divider");
const vocabularyPartOfSpeech = document.querySelector("#vocabulary-part-of-speech");
const productionGuidance = document.querySelector("#production-guidance");
const productionGrammarTargets = document.querySelector("#production-grammar-targets");
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
let hiraganaWords;
let katakanaWords;
let vocabularyItems;
let hiraganaMetadata = [];
let katakanaMetadata = [];
let katakanaPairInventory = [];
let katakanaSingleItems = [];
let pairedHiraganaMetadata = [];
let previousExerciseId;
let previousHiraganaVocabularyId;
let previousKatakanaVocabularyId;
let lessonRequestId = 0;
let speechAudioPromise;
let speechAudioUrl;
let activeAudio;
let speechAvailable = false;
let autoPlayedLesson;
let controlRevealTimer;
let exerciseSubmitted = false;
let grammarRatings = new Map();
let currentAttemptSubmittedAt;
let settings = { ...globalThis.JlptN5Settings.defaults };
let openAiApiKey = globalThis.JlptN5Settings.readOpenAiApiKey();
let autoCorrectController;
let activeStatKind = ["hiragana", "katakana", "vocabulary"].includes(currentStudySection)
  ? currentStudySection
  : "overview";
let activeGrammarFilter = "all";
let activeExposureSort = "recent";
let kanaInputMode;
const reviewReminderNotificationId = 1905;

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

  if (/\/(?:grammar|hiragana|katakana|vocabulary)\/?$/u.test(pathname)) {
    return pathname.replace(
      /\/(?:grammar|hiragana|katakana|vocabulary)\/?$/u,
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
    grammar: "Grammar",
    hiragana: "Hiragana",
    katakana: "Katakana",
    vocabulary: "Vocabulary"
  }[currentStudySection];

  currentStudyLabel.textContent = label;
  document.title = `${label} · ChakuChaku`;

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

    stateElement.textContent = enabled ? "ON" : "OFF";
  }

  openAiApiKeyInput.value = openAiApiKey;
  aiAutoCorrectInput.disabled = !autoCorrectAvailable;
  aiAutoCorrectInput.closest(".setting-row").classList.toggle(
    "is-disabled",
    !autoCorrectAvailable
  );
  reviewReminderTimeInput.disabled = !settings.reviewReminder;
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
          ? "Notifications were not enabled. No reminder was scheduled."
          : "Open Settings and enable the reminder to grant notification access.",
        true
      );
      return;
    }

    if (native.platform === "android") {
      await notifications.createChannel({
        id: "study-reminders",
        name: "Study reminders",
        description: "Optional daily ChakuChaku review reminders",
        importance: 3,
        visibility: 1
      });
    }

    const [hour, minute] = settings.reviewReminderTime.split(":").map(Number);

    await notifications.schedule({
      notifications: [{
        id: reviewReminderNotificationId,
        title: "チャクチャク — time to review",
        body: "A short Japanese review keeps your progress moving.",
        channelId: native.platform === "android" ? "study-reminders" : undefined,
        schedule: {
          on: { hour, minute },
          repeats: true,
          isExactNotification: false
        }
      }]
    });
    setProgressTransferStatus(`Daily reminder set for ${settings.reviewReminderTime}.`);
  } catch (error) {
    console.error(error);
    setProgressTransferStatus("The daily reminder could not be scheduled.", true);
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
        title: "ChakuChaku progress backup",
        files: [file.uri],
        dialogTitle: "Save or share progress backup"
      });
    } else {
      const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
      const link = document.createElement("a");

      link.href = url;
      link.download = filename;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    }

    setProgressTransferStatus("Progress backup exported. Keep it somewhere safe.");
  } catch (error) {
    console.error(error);
    setProgressTransferStatus("Progress could not be exported.", true);
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
  setProgressTransferStatus("Checking progress backup…");

  try {
    if (file.size > globalThis.JlptN5Progress.maximumImportBytes) {
      throw new Error("The selected progress backup is too large.");
    }

    const result = globalThis.JlptN5Progress.importBackup(await file.text());

    await globalThis.JlptN5Storage.flush();
    setProgressTransferStatus(
      `Imported ${result.cardCount} SRS cards and ${result.historyCount} history entries. ` +
      "Reloading…"
    );
    window.setTimeout(() => window.location.reload(), 500);
  } catch (error) {
    console.error(error);
    setProgressTransferStatus(error.message || "Progress could not be imported.", true);
    progressImportButton.disabled = false;
  }
}

async function resetProgress() {
  const confirmed = window.confirm(
    "Reset all SRS cards, statistics, and exercise history? This cannot be undone without a backup."
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
  return new Intl.DateTimeFormat(settings.userLanguage, { dateStyle: "medium" })
    .format(new Date(value));
}

function formatDueDate(value, now = new Date()) {
  const milliseconds = Date.parse(value) - now.getTime();

  if (milliseconds <= 0) {
    return "Due now";
  }

  const minutes = Math.ceil(milliseconds / 60_000);

  if (minutes < 60) {
    return `In ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  }

  const hours = Math.ceil(milliseconds / 3_600_000);

  if (hours < 24) {
    return `In ${hours} ${hours === 1 ? "hour" : "hours"}`;
  }

  const days = Math.ceil(milliseconds / 86_400_000);
  const relative = new Intl.RelativeTimeFormat(settings.userLanguage, { numeric: "auto" })
    .format(days, "day");

  return relative.charAt(0).toUpperCase() + relative.slice(1);
}

function formatStability(value) {
  const days = Number(value);

  if (!Number.isFinite(days)) {
    return "Unknown stability";
  }

  const roundedDays = days < 10
    ? Math.round(days * 10) / 10
    : Math.round(days);
  return `${roundedDays}d stability`;
}

function getStatisticDisplayStatus(entry) {
  if (entry.status.key === "due") {
    return entry.status;
  }

  if (
    ["mastered", "mature"].includes(entry.knowledge?.key) ||
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

  return [
    ["all", "All"],
    ["mastered", `Mastered (${masteredCount})`],
    ["mature", `Mature (${matureCount})`],
    ["due", `Due (${dueCount})`],
    ["learning", "Learning"],
    ["new", "New"]
  ];
}

function filterSrsEntries(entries) {
  return entries.filter((entry) => {
    if (activeGrammarFilter === "due") {
      return entry.status.key === "due";
    }

    if (["mastered", "mature", "learning"].includes(activeGrammarFilter)) {
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
    `${results.good} successful, ${results.again} failed`
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
    ["mastered", "Mastered"],
    ["mature", "Mature"],
    ["learning-due", "Learning / due"],
    ["encountered", "Encountered"],
    ["new", "New"]
  ];

  header.className = "statistics-coverage";
  line.className = "statistics-coverage-line";
  title.textContent = label;
  value.textContent = `${encounteredCount} / ${totalCount}`;
  progress.className = "statistics-progress";
  progress.setAttribute("role", "img");
  progress.setAttribute(
    "aria-label",
    `${label}: ${progressBreakdown.mastered} mastered, ` +
      `${progressBreakdown.mature} mature, ` +
      `${progressBreakdown.learningDue} learning or due, ` +
      `${progressBreakdown.encountered} encountered, ${progressBreakdown.new} new`
  );
  legend.className = "statistics-progress-legend";

  for (const [key, stateLabel] of progressStates) {
    const countKey = key === "learning-due" ? "learningDue" : key;
    const count = progressBreakdown[countKey];
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

  detail.textContent = `${percentage}% coverage · ${totalEncounters} total encounters`;
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
  const dayFormatter = new Intl.DateTimeFormat(settings.userLanguage, { day: "numeric" });
  const titleFormatter = new Intl.DateTimeFormat(settings.userLanguage, {
    month: "short",
    day: "numeric"
  });

  section.className = "statistics-section review-activity";
  header.className = "statistics-section-header";
  heading.textContent = "Last 14 days";
  legend.className = "review-chart-legend";
  successLegend.className = "review-chart-success";
  successLegend.textContent = "Success";
  failureLegend.className = "review-chart-failure";
  failureLegend.textContent = "Failed";
  legend.append(successLegend, failureLegend);
  header.append(heading, legend);
  chart.className = "review-chart";
  chart.setAttribute("role", "img");
  chart.setAttribute(
    "aria-label",
    `${totals.good} successful and ${totals.again} failed reviews in the last 14 days`
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
    column.title = `${titleFormatter.format(date)}: ${day.good} successful, ${day.again} failed`;
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
  status.textContent = entry.status.key === "due" ? "Due now" : "Failed last time";
  details.append(status, createResultCounts(entry.results));
  description.append(pattern, meaning);
  item.append(description, details);
  return item;
}

function renderOverviewStatistics(model) {
  const { overview } = model;
  const dueDetail = overview.dueCount > 0
    ? "Ready for review"
    : overview.nextDue
      ? `Next: ${formatDueDate(overview.nextDue)}`
      : "No reviews scheduled";
  const fragment = document.createDocumentFragment();

  fragment.append(createStatisticsSummary([
    {
      key: "mastered",
      label: "Mastered",
      value: `${overview.knowledge.mastered} / ${overview.knowledge.total}`,
      detail: `${overview.knowledge.masteredByKind.grammar} grammar · ` +
        `${overview.knowledge.masteredByKind.kana} kana · ` +
        `${overview.knowledge.masteredByKind.vocabulary} vocabulary`
    },
    {
      key: "due",
      label: "Due now",
      value: String(overview.dueCount),
      detail: dueDetail
    },
    {
      key: "exercises",
      label: "Exercises completed",
      value: String(overview.exerciseCounts.total),
      detail: `${overview.exerciseCounts.grammar} grammar · ` +
        `${overview.exerciseCounts.hiragana} hiragana · ` +
        `${overview.exerciseCounts.katakana} katakana · ` +
        `${overview.exerciseCounts.vocabulary} vocabulary`
    },
    {
      key: "results",
      label: "Recent results",
      value: `✓ ${overview.recentResults.good}  × ${overview.recentResults.again}`,
      detail: overview.recentResultCount > 0 ? "Last 30 ratings" : "No ratings yet"
    },
    {
      key: "streak",
      label: "Study streak",
      value: `${overview.studyStreak} ${overview.studyStreak === 1 ? "day" : "days"}`,
      detail: "Consecutive active days"
    }
  ]));
  fragment.append(createReviewChart(overview.reviewDays));

  const attentionSection = document.createElement("section");
  const heading = document.createElement("h3");
  const attentionEntries = overview.needsAttention.slice(0, 5);

  attentionSection.className = "statistics-section attention-section";
  heading.textContent = "Needs attention";
  attentionSection.append(heading);

  if (attentionEntries.length === 0) {
    const empty = document.createElement("p");

    empty.className = "statistics-inline-empty";
    empty.textContent = overview.reviewedCount === 0
      ? "Complete and assess an exercise to begin scheduling reviews."
      : overview.dueCount > 0
        ? `${overview.dueCount} reviews are ready in their study sections.`
        : overview.nextDue
          ? `Nothing is due. Your next review is ${formatDueDate(overview.nextDue).toLowerCase()}.`
          : "Nothing needs attention right now.";
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
  const encounterText = entry.encounterCount === 1 ? "Seen once" : `Seen ${entry.encounterCount} times`;

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
  status.textContent = displayStatus.label;
  schedule.className = "grammar-schedule";
  schedule.textContent = entry.card
    ? `${formatStability(entry.card.stability)} · ${formatDueDate(entry.card.due)}`
    : "Not scheduled";
  lastReview.className = "grammar-last-review";
  lastReview.textContent = entry.lastReviewedAt
    ? `Last: ${formatShortDate(entry.lastReviewedAt)}`
    : "Not reviewed";
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
    "Grammar reviewed",
    reviewedCount,
    model.grammar.length,
    totalEncounters,
    globalThis.JlptN5Statistics.createProgressBreakdown(model.grammar)
  ));
  fragment.append(createChoiceControl(
    createSrsFilterChoices(model.grammar),
    activeGrammarFilter,
    "grammarFilter",
    "Grammar status"
  ));

  const entries = filterSrsEntries(model.grammar);

  if (entries.length === 0) {
    const empty = document.createElement("p");

    empty.className = "activity-empty";
    empty.textContent = "No grammar points match this filter.";
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
  const encounterText = entry.encounterCount === 1
    ? "Seen once"
    : `Seen ${entry.encounterCount} times`;

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
  status.textContent = displayStatus.label;
  schedule.className = "grammar-schedule";
  schedule.textContent = entry.card
    ? `${formatStability(entry.card.stability)} · ${formatDueDate(entry.card.due)}`
    : "Not scheduled";
  lastReview.className = "grammar-last-review";
  lastReview.textContent = entry.lastReviewedAt
    ? `Last: ${formatShortDate(entry.lastReviewedAt)}`
    : "Not reviewed";
  description.append(kana, romaji);
  details.append(status, createResultCounts(entry.results), schedule, lastReview);
  item.append(description, details);
  return item;
}

function renderKanaStatistics(model, kind) {
  const label = kind === "katakana" ? "Katakana" : "Hiragana";
  const entriesForKind = model[kind];
  const reviewedCount = entriesForKind.filter(({ card }) => card).length;
  const totalEncounters = entriesForKind.reduce((sum, entry) => {
    return sum + entry.encounterCount;
  }, 0);
  const fragment = document.createDocumentFragment();

  fragment.append(createCoverageHeader(
    `${label} reviewed`,
    reviewedCount,
    entriesForKind.length,
    totalEncounters,
    globalThis.JlptN5Statistics.createProgressBreakdown(entriesForKind)
  ));
  fragment.append(createChoiceControl(
    createSrsFilterChoices(entriesForKind),
    activeGrammarFilter,
    "grammarFilter",
    `${label} status`
  ));

  const entries = filterSrsEntries(entriesForKind);

  if (entries.length === 0) {
    const empty = document.createElement("p");

    empty.className = "activity-empty";
    empty.textContent = `No ${label.toLowerCase()} match this filter.`;
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
  const encounterText = entry.encounterCount === 1
    ? "Seen once"
    : `Seen ${entry.encounterCount} times`;

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
    entry.metadata.partOfSpeech,
    encounterText
  ].filter(Boolean).join(" · ");
  details.className = "grammar-statistic-details";
  status.className = "grammar-status";
  status.dataset.status = displayStatus.key;
  status.textContent = displayStatus.label;
  schedule.className = "grammar-schedule";
  schedule.textContent = entry.card
    ? `${formatStability(entry.card.stability)} · ${formatDueDate(entry.card.due)}`
    : "Not scheduled";
  lastReview.className = "grammar-last-review";
  lastReview.textContent = entry.lastReviewedAt
    ? `Last: ${formatShortDate(entry.lastReviewedAt)}`
    : "Not reviewed";
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
    "Vocabulary reviewed",
    reviewedCount,
    entries.length,
    model.vocabulary.totalEncounters,
    globalThis.JlptN5Statistics.createProgressBreakdown(entries)
  ));
  fragment.append(createChoiceControl(
    createSrsFilterChoices(entries),
    activeGrammarFilter,
    "grammarFilter",
    "Vocabulary status"
  ));

  const filteredEntries = filterSrsEntries(entries);

  if (filteredEntries.length === 0) {
    const empty = document.createElement("p");

    empty.className = "activity-empty";
    empty.textContent = "No vocabulary matches this filter.";
    fragment.append(empty);
  } else {
    const list = document.createElement("ul");

    list.className = "statistics-list grammar-statistics-list vocabulary-statistics-list";
    list.append(...filteredEntries.map(createVocabularyStatisticItem));
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
  count.textContent = `${entry.encounterCount} ${entry.encounterCount === 1 ? "time" : "times"}`;
  lastSeen.textContent = `Last: ${formatShortDate(entry.lastEncounteredAt)}`;

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
  const label = kind === "vocabulary" ? "Vocabulary encountered" : "Kanji encountered";
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
    [["recent", "Recent"], ["most", "Most seen"], ["least", "Least seen"]],
    activeExposureSort,
    "exposureSort",
    `${kind === "vocabulary" ? "Vocabulary" : "Kanji"} sorting`
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
    empty.textContent = `No ${kind} encountered yet.`;
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
  const model = globalThis.JlptN5Statistics.createStatisticsModel({
    grammarPoints: [...grammarPointById.values()],
    hiragana: [...new Map(
      [...hiraganaMetadata, ...pairedHiraganaMetadata].map((entry) => [entry.id, entry])
    ).values()],
    katakana: katakanaMetadata,
    vocabulary: [...vocabularyById.values()],
    kanji: [...kanjiById.values()],
    learningStats,
    srsData
  });

  if (activeStatKind === "overview") {
    renderOverviewStatistics(model);
  } else if (["hiragana", "katakana"].includes(activeStatKind)) {
    renderKanaStatistics(model, activeStatKind);
  } else if (activeStatKind === "vocabulary") {
    renderVocabularyStatistics(model);
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
      const ratingList = document.createElement("ul");
      const isKanaAttempt = ["hiragana", "katakana"].includes(attempt.section);
      const isVocabularyAttempt = attempt.section === "vocabulary";

      item.className = "history-attempt";
      time.dateTime = attempt.submittedAt;
      time.textContent = timeFormatter.format(attempt.date);
      sentence.className = "history-sentence";
      sentence.lang = isKanaAttempt
        ? attempt.direction === "romaji-to-kana" ? "en" : "ja"
        : isVocabularyAttempt && attempt.direction === "english-to-japanese"
          ? "en"
          : "ja";
      sentence.textContent = attempt.text;
      answer.className = "history-answer";
      answer.lang = isVocabularyAttempt && attempt.direction === "english-to-japanese"
        ? "ja"
        : "en";
      answerLabel.textContent = "Your answer:";
      answer.append(answerLabel, document.createTextNode(attempt.answer || "No answer"));
      ratingList.className = "history-grammar-ratings";

      if (isKanaAttempt || isVocabularyAttempt) {
        const reference = document.createElement("span");

        reference.className = "history-reference-answer";
        reference.lang = isVocabularyAttempt && attempt.direction === "english-to-japanese"
          ? "ja"
          : isKanaAttempt
            ? sentence.lang === "ja" ? "en" : "ja"
            : "en";
        reference.textContent = `Correct: ${attempt.solution}`;
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
          `${grammarPoint.name}: ${succeeded ? "succeeded" : "failed"}`
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
          `${rating.kana}: ${succeeded ? "succeeded" : "failed"}`
        );
        tag.title = metadata?.romaji || rating.kana;
        mark.className = "history-grammar-tag-mark";
        mark.setAttribute("aria-hidden", "true");
        mark.textContent = succeeded ? "✓" : "×";
        tag.append(mark, document.createTextNode(rating.kana));
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
          `${term}: ${succeeded ? "succeeded" : "failed"}`
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
  prepareHiraganaWords(entriesById);
  prepareKatakanaWords(entriesById);
  prepareVocabularyItems(entriesById);
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
  }

  if (newGrammarPointIds.length > 0) {
    const grammarGlosses = newGrammarPointIds.map((grammarPointId) => {
      const grammarPoint = grammarPointById.get(grammarPointId);

      return `${grammarPoint.pattern}: ${grammarPoint.meaning}`;
    });

    tokenElement.dataset.newGrammar = "";
    tokenElement.dataset.gloss = grammarGlosses.join("\n");
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

function renderPlainSentence(text, vocabularyHints = []) {
  sentenceElement.replaceChildren();
  sentenceElement.setAttribute("aria-label", text);
  characterIndex = 0;
  const hintsByWord = new Map(
    vocabularyHints.map((hint) => [hint.word.toLocaleLowerCase("en"), hint])
  );

  for (const segment of text.split(/(\s+|[.,!?;:'"]+)/)) {
    if (!segment) {
      continue;
    }

    if (/^\s+$/.test(segment)) {
      sentenceElement.append(document.createTextNode(segment));
      continue;
    }

    const phraseElement = document.createElement("span");
    const hint = hintsByWord.get(segment.toLocaleLowerCase("en"));
    const contentElement = hint ? document.createElement("span") : phraseElement;

    phraseElement.className = "phrase";

    if (hint) {
      contentElement.className = "token prompt-vocabulary-hint";
      contentElement.dataset.gloss = formatVocabularyHint(hint.vocabularyIds);
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
        ? "consonant doubling"
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
      ? "consonant doubling"
      : katakana === "ー"
        ? "long vowel"
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
        ? "consonant doubling"
        : kana === "ー"
          ? "long vowel"
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

function prepareVocabularyItems(entriesById) {
  if (vocabularyItems) {
    return vocabularyItems;
  }

  vocabularyItems = globalThis.JlptN5Vocabulary.createVocabularyPool([
    ...entriesById.values()
  ]);

  if (vocabularyItems.length === 0) {
    throw new Error("No N5 vocabulary is available for vocabulary exercises.");
  }

  return vocabularyItems;
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
    const availability = fetch(audioUrl, { method: "HEAD" })
      .then((response) => response.ok)
      .catch(() => false);

    speechAvailabilityByUrl.set(audioUrl, availability);
  }

  return speechAvailabilityByUrl.get(audioUrl);
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

function cancelAutoCorrect() {
  autoCorrectController?.abort();
  autoCorrectController = undefined;
}

function setKatakanaMeaningHintExpanded(expanded) {
  const isExpanded = Boolean(expanded);

  katakanaMeaningHint.classList.toggle("is-expanded", isExpanded);
  katakanaMeaningHint.setAttribute("aria-expanded", String(isExpanded));
  katakanaMeaningHint.setAttribute(
    "aria-label",
    isExpanded ? `Hide meaning: ${katakanaMeaning.textContent}` : "Reveal meaning"
  );
  katakanaMeaning.setAttribute("aria-hidden", String(!isExpanded));
}

function handleKatakanaMeaningHintClick() {
  setKatakanaMeaningHintExpanded(
    katakanaMeaningHint.getAttribute("aria-expanded") !== "true"
  );
}

function displayLesson(lesson) {
  const isKana = ["hiragana", "katakana"].includes(lesson.section);
  const isKatakana = lesson.section === "katakana";
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

  cancelAutoCorrect();
  hideControls();
  resetSpeechAudio();
  currentLesson = lesson;
  speechAvailable = false;
  autoPlayedLesson = undefined;
  exerciseSubmitted = false;
  grammarRatings = new Map();
  currentAttemptSubmittedAt = undefined;
  translationInput.disabled = false;
  solutionElement.classList.remove("is-visible");
  solutionElement.textContent = "";
  sentenceElement.classList.toggle("is-single-kana", isSingleKatakana);
  actionButton.textContent = lesson.id === introductionId ? "次へ" : "送信";
  setKanaInputMode(
    isProduction || isEnglishToJapanese
      ? "mixed"
      : expectsKana
        ? lesson.section
        : undefined
  );
  exerciseKindLabel.hidden = !isKana && !isVocabulary;
  kanaGuidance.hidden = !isKana || isSingleKatakana;
  vocabularyGuidance.hidden = !isVocabulary;
  productionGuidance.hidden = !isProduction;
  productionGrammarTargets.replaceChildren();
  kanaMeaning.hidden = isKatakana;
  katakanaMeaningHint.hidden = !isKatakana || isSingleKatakana;
  setKatakanaMeaningHintExpanded(false);

  if (isVocabulary) {
    const showReading = !isEnglishToJapanese && lesson.reading !== lesson.term;

    exerciseKindLabel.textContent = isEnglishToJapanese
      ? "English → Japanese"
      : "Japanese → English";
    vocabularyReading.hidden = !showReading;
    vocabularyReading.textContent = showReading ? lesson.reading : "";
    vocabularyGuidanceDivider.hidden = !showReading;
    vocabularyPartOfSpeech.textContent = lesson.partOfSpeech;
    sentenceElement.lang = isEnglishToJapanese ? "en" : "ja";
    translationInput.lang = isEnglishToJapanese ? "ja" : "en";
    translationInput.placeholder = isEnglishToJapanese
      ? "日本語で書いてください"
      : "Translate into English";
    translationInput.setAttribute(
      "aria-label",
      isEnglishToJapanese ? "Japanese answer" : "English translation"
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
    const scriptLabel = isKatakana ? "Katakana" : "Hiragana";
    const prompt = isRomajiToKana
      ? lesson.romaji
      : isHiraganaToKatakana
        ? lesson.hiragana
        : kanaValue;
    const showWrittenForm = Boolean(
      lesson.writtenForm && lesson.writtenForm !== kanaValue
    );

    exerciseKindLabel.textContent = isSingleKatakana
      ? "Single Katakana → Rōmaji"
      : isHiraganaToKatakana
        ? "Hiragana → Katakana"
        : isRomajiToKana
          ? `Rōmaji → ${scriptLabel}`
          : `${scriptLabel} → Rōmaji`;
    kanaWrittenForm.hidden = !showWrittenForm;
    kanaWrittenForm.textContent = showWrittenForm ? lesson.writtenForm : "";
    kanaGuidanceDivider.hidden = !showWrittenForm;
    kanaMeaning.textContent = isKatakana ? "" : lesson.meaning;
    katakanaMeaning.textContent = isKatakana ? lesson.meaning : "";
    sentenceElement.lang = isRomajiToKana ? "en" : "ja";
    translationInput.lang = expectsKana ? "ja" : "en";
    translationInput.placeholder = expectsKana
      ? `${isKatakana ? "カタカナ" : "ひらがな"}で書いてください`
      : "Write in rōmaji";
    translationInput.setAttribute(
      "aria-label",
      expectsKana
        ? `${isKatakana ? "カタカナ" : "ひらがな"}の回答`
        : "Rōmaji answer"
    );
    speakButton.hidden = !lesson.audio;
    const sentenceDrawDuration = renderPlainSentence(prompt);

    globalThis.JlptN5Stats.recordKanaEncounter(lesson);

    if (lesson.audio) {
      void updateSpeechAvailability(lesson);
    } else {
      setSpeakButtonState("unavailable");
    }

    revealControlsAfter(sentenceDrawDuration);
    return;
  }

  sentenceElement.lang = isProduction ? "en" : "ja";
  translationInput.lang = isProduction ? "ja" : "en";
  translationInput.placeholder = isProduction
    ? "日本語で書いてください"
    : "英語に訳してください";
  translationInput.setAttribute(
    "aria-label",
    isProduction ? "日本語の回答" : "英語の翻訳"
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
      translationInput.hidden = false;
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
      translationInput.hidden = false;
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
      translationInput.hidden = false;
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
  summary.textContent = result.correct ? "Correct" : "Check each part";
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
      ? `${part.pairedKana} to ${part.kana}`
      : part.kana;

    item.setAttribute("aria-label", `${partLabel}: ${succeeded ? "correct" : "incorrect"}`);
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
  actionButton.textContent = "次へ";
  actionButton.disabled = false;

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
  const isEnglishToJapanese = currentLesson.direction ===
    globalThis.JlptN5Vocabulary.directions.englishToJapanese;

  globalThis.JlptN5Srs.recordVocabularyReviews([{
    vocabularyId: currentLesson.vocabularyId,
    outcome: result.outcome
  }]);
  globalThis.JlptN5Stats.recordVocabularyAttempt(
    currentLesson,
    translationInput.value,
    result.outcome
  );
  void giveAnswerHaptic(result.correct);
  exerciseSubmitted = true;
  translationInput.disabled = true;
  answerRow.className = "solution-answer-row";
  answer.className = "solution-answer";
  answer.lang = isEnglishToJapanese ? "ja" : "en";
  answer.textContent = result.expectedAnswer;

  if (
    isEnglishToJapanese &&
    currentLesson.reading &&
    currentLesson.reading !== currentLesson.term
  ) {
    const reading = document.createElement("span");

    reading.className = "vocabulary-solution-reading";
    reading.lang = "ja";
    reading.textContent = currentLesson.reading;
    answer.append(reading);
  }

  answerRow.append(answer);
  summary.className = "solution-kana-summary solution-vocabulary-summary";
  summary.dataset.outcome = result.outcome;
  summary.textContent = result.correct ? "Correct" : "Reference answer";
  solutionElement.replaceChildren(answerRow, summary);
  actionButton.textContent = "次へ";
  actionButton.disabled = false;

  window.requestAnimationFrame(() => {
    solutionElement.classList.add("is-visible");
  });
}

function revealSolution() {
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

  const isProduction = getExerciseType(currentLesson) === "production";

  answer.className = "solution-answer";
  answer.lang = isProduction ? "ja" : "en";

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
    autoCorrectStatus.lang = "ja";
    autoCorrectStatus.dataset.state = "loading";
    autoCorrectStatus.textContent = "AIが答えを確認しています…";
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

  if (autoCorrectStatus) {
    grammarSection.append(autoCorrectStatus);
  }

  grammarSection.append(grammarList);
  solutionElement.replaceChildren(answerRow, grammarSection);
  actionButton.textContent = "次へ";
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
    status.textContent = "AIが評価しました。必要なら変更できます。";
  } catch (error) {
    if (error.name === "AbortError" || controller.signal.aborted) {
      return;
    }

    console.warn(error);
    status.dataset.state = "error";
    if (error.status === 401) {
      status.textContent = "APIキーを確認してください。手動で評価できます。";
    } else if (error.code === "max_output_tokens") {
      status.textContent = "AIの出力上限に達しました。手動で評価してください。";
    } else {
      status.textContent = "AIで確認できませんでした。手動で評価してください。";
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
}

function handleAction() {
  if (currentLesson.section === "vocabulary") {
    if (exerciseSubmitted) {
      showNextExercise();
    } else {
      revealVocabularySolution();
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
  if (
    event.key !== "Enter" ||
    event.isComposing ||
    !exerciseSubmitted ||
    actionButton.disabled ||
    settingsDialog.open ||
    activityDialog.open ||
    !profileMenu.hidden
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

  button.disabled = isLoading || isChecking || isUnavailable;
  button.classList.toggle("is-loading", isLoading);
  button.classList.toggle("no-audio", isUnavailable);
  button.classList.toggle("has-error", hasError);
  button.setAttribute("aria-busy", String(isLoading || isChecking));
  button.setAttribute("aria-label", label);
  button.title = label;
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
actionButton.addEventListener("click", handleAction);
translationInput.addEventListener("keydown", handleTranslationInputKeydown);
translationInput.addEventListener("input", handleTranslationInputResize);
katakanaMeaningHint.addEventListener("click", handleKatakanaMeaningHintClick);
solutionElement.addEventListener("click", handleGrammarRating);
speakButton.addEventListener("click", () => {
  void speakSentence(speakButton);
});
window.addEventListener("beforeunload", resetSpeechAudio);

async function configureNativeBehavior() {
  const native = globalThis.JlptN5Native;
  const app = native?.plugins?.app;

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
