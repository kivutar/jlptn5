const introductionId = "introduction";
const exerciseTypes = new Set(["recognition", "production"]);
const requestedExerciseType = new URLSearchParams(window.location.search)
  .get("type");
const forcedExerciseType = exerciseTypes.has(requestedExerciseType)
  ? requestedExerciseType
  : undefined;
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
const openAiApiKeyInput = document.querySelector("#openai-api-key");
const aiAutoCorrectInput = settingsDialog.querySelector('[data-setting="aiAutoCorrect"]');
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
let currentAttemptSubmittedAt;
let settings = globalThis.JlptN5Settings.readSettings();
let openAiApiKey = globalThis.JlptN5Settings.readOpenAiApiKey();
let autoCorrectController;
let activeStatKind = "overview";
let activeGrammarFilter = "all";
let activeExposureSort = "recent";

function getExerciseType(lesson) {
  return lesson?.type || "recognition";
}

function getJapaneseText(lesson) {
  return getExerciseType(lesson) === "production" ? lesson.solution : lesson.text;
}

function setKanaInputEnabled(enabled) {
  const isEnabled = translationInput.hasAttribute("data-wanakana-id");

  if (enabled && !isEnabled) {
    globalThis.wanakana.bind(translationInput);
  } else if (!enabled && isEnabled) {
    globalThis.wanakana.unbind(translationInput);
  }
}

if (!openAiApiKey && settings.aiAutoCorrect) {
  settings = globalThis.JlptN5Settings.writeSettings({ aiAutoCorrect: false });
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

function createCoverageHeader(label, encounteredCount, totalCount, totalEncounters) {
  const header = document.createElement("div");
  const line = document.createElement("div");
  const title = document.createElement("strong");
  const value = document.createElement("span");
  const progress = document.createElement("progress");
  const detail = document.createElement("p");
  const percentage = totalCount === 0 ? 0 : Math.round(encounteredCount / totalCount * 100);

  header.className = "statistics-coverage";
  line.className = "statistics-coverage-line";
  title.textContent = label;
  value.textContent = `${encounteredCount} / ${totalCount}`;
  progress.max = Math.max(totalCount, 1);
  progress.value = encounteredCount;
  progress.setAttribute("aria-label", `${label}: ${percentage}%`);
  detail.textContent = `${percentage}% coverage · ${totalEncounters} total encounters`;
  line.append(title, value);
  header.append(line, progress, detail);
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
    `${totals.good} successful and ${totals.again} failed grammar reviews in the last 14 days`
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
  const reviewedPercentage = overview.totalGrammarCount === 0
    ? 0
    : Math.round(overview.reviewedCount / overview.totalGrammarCount * 100);
  const dueDetail = overview.dueCount > 0
    ? "Ready for review"
    : overview.nextDue
      ? `Next: ${formatDueDate(overview.nextDue)}`
      : "No reviews scheduled";
  const fragment = document.createDocumentFragment();

  fragment.append(createStatisticsSummary([
    {
      key: "due",
      label: "Due now",
      value: String(overview.dueCount),
      detail: dueDetail
    },
    {
      key: "reviewed",
      label: "Grammar reviewed",
      value: `${overview.reviewedCount} / ${overview.totalGrammarCount}`,
      detail: `${reviewedPercentage}% of N5 grammar`
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
      ? "Complete an exercise and rate its grammar to begin scheduling reviews."
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
  status.dataset.status = entry.status.key;
  status.textContent = entry.status.label;
  schedule.className = "grammar-schedule";
  schedule.textContent = entry.card ? formatDueDate(entry.card.due) : "Not scheduled";
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
  const dueCount = model.grammar.filter(({ status }) => status.key === "due").length;
  const totalEncounters = model.grammar.reduce((sum, entry) => sum + entry.encounterCount, 0);
  const fragment = document.createDocumentFragment();

  fragment.append(createCoverageHeader(
    "Grammar reviewed",
    reviewedCount,
    model.grammar.length,
    totalEncounters
  ));
  fragment.append(createChoiceControl(
    [["all", "All"], ["due", `Due (${dueCount})`], ["learning", "Learning"], ["new", "New"]],
    activeGrammarFilter,
    "grammarFilter",
    "Grammar status"
  ));

  const entries = model.grammar.filter((entry) => {
    if (activeGrammarFilter === "due") {
      return entry.status.key === "due";
    }

    if (activeGrammarFilter === "learning") {
      return ["learning", "relearning"].includes(entry.status.key);
    }

    if (activeGrammarFilter === "new") {
      return !entry.card;
    }

    return true;
  });

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
    exposure.totalEncounters
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
    vocabulary: [...vocabularyById.values()],
    kanji: [...kanjiById.values()],
    learningStats,
    srsData
  });

  if (activeStatKind === "overview") {
    renderOverviewStatistics(model);
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

      item.className = "history-attempt";
      time.dateTime = attempt.submittedAt;
      time.textContent = timeFormatter.format(attempt.date);
      sentence.className = "history-sentence";
      sentence.lang = "ja";
      sentence.textContent = attempt.text;
      answer.className = "history-answer";
      answerLabel.textContent = "Your answer:";
      answer.append(answerLabel, document.createTextNode(attempt.answer || "No answer"));
      ratingList.className = "history-grammar-ratings";

      for (const rating of attempt.grammarRatings) {
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

  for (const segment of text.split(/(\s+|[.,!?;:]+)/)) {
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

function cancelAutoCorrect() {
  autoCorrectController?.abort();
  autoCorrectController = undefined;
}

function displayLesson(lesson) {
  const isProduction = getExerciseType(lesson) === "production";

  cancelAutoCorrect();
  hideControls();
  resetSpeechAudio();
  currentLesson = lesson;
  speechAvailable = false;
  autoPlayedLesson = undefined;
  exerciseSubmitted = false;
  grammarRatings = new Map();
  currentAttemptSubmittedAt = undefined;
  solutionElement.classList.remove("is-visible");
  solutionElement.textContent = "";
  actionButton.textContent = lesson.id === introductionId ? "次へ" : "送信";
  setKanaInputEnabled(isProduction);
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
  productionGuidance.hidden = !isProduction;
  productionGrammarTargets.replaceChildren();

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
    : renderSentence(lesson.text, lesson.tokens);

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
  cancelAutoCorrect();
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
  const stats = globalThis.JlptN5Stats.recordExerciseAttempt(
    currentLesson,
    translationInput.value
  );

  currentAttemptSubmittedAt = stats.exerciseHistory.at(-1)?.submittedAt;
  exerciseSubmitted = true;
  const answer = document.createElement("p");
  const grammarSection = document.createElement("details");
  const grammarSummary = document.createElement("summary");
  const grammarList = document.createElement("ul");
  const autoCorrectEnabled = settings.aiAutoCorrect && openAiApiKey;
  const autoCorrectStatus = autoCorrectEnabled ? document.createElement("p") : undefined;

  answer.className = "solution-answer";
  answer.lang = getExerciseType(currentLesson) === "production" ? "ja" : "en";
  answer.textContent = currentLesson.solution;
  grammarSection.className = "solution-grammar";
  grammarSection.open = true;
  grammarSummary.className = "solution-grammar-summary";
  grammarSummary.lang = "ja";
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

  grammarSummary.textContent = `文法を評価（0/${grammarList.childElementCount}）`;
  grammarSection.append(grammarSummary);

  if (autoCorrectStatus) {
    grammarSection.append(autoCorrectStatus);
  }

  grammarSection.append(grammarList);
  solutionElement.replaceChildren(answer, grammarSection);
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
  const grammarSummary = solutionElement.querySelector(".solution-grammar-summary");

  grammarSummary.textContent = ratedCount === totalCount
    ? `文法を評価済み（${ratedCount}/${totalCount}）`
    : `文法を評価（${ratedCount}/${totalCount}）`;
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
    status.textContent = error.status === 401
      ? "APIキーを確認してください。手動で評価できます。"
      : "AIで確認できませんでした。手動で評価してください。";
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
openAiApiKeyInput.addEventListener("input", handleSettingChange);
activityDialog.addEventListener("click", handleActivityBackdropClick);
activityDialog.addEventListener("close", () => profileMenuButton.focus());
activityDialog.querySelector(".stat-kind-control").addEventListener("click", handleStatKindClick);
statisticsContent.addEventListener("click", handleStatisticsContentClick);
actionButton.addEventListener("click", handleAction);
solutionElement.addEventListener("click", handleGrammarRating);
speakButton.addEventListener("click", speakSentence);
window.addEventListener("beforeunload", resetSpeechAudio);
applySettings();
displayInitialLesson();
