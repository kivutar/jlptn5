const introductionId = "introduction";
const characterDelay = 65;
const characterRevealDuration = 280;
const fadeDuration = 180;
const profileMenuContainer = document.querySelector(".profile-menu-container");
const profileMenuButton = document.querySelector("#profile-menu-button");
const profileMenu = document.querySelector("#profile-menu");
const profileMenuItems = [...profileMenu.querySelectorAll('[role="menuitem"]')];
const lessonElement = document.querySelector(".lesson");
const sentenceElement = document.querySelector("#lesson-sentence");
const lessonStage = document.querySelector("#lesson-stage");
const speakButton = document.querySelector("#speak-button");
const actionButton = document.querySelector("#action-button");
const translationInput = document.querySelector("#translation-input");
const solutionElement = document.querySelector("#solution");
const vocabularyDataPromise = loadVocabularyData();
const exerciseDataPromise = loadExerciseData();

let characterIndex = 0;
let currentLesson;
let grammarPointById = new Map();
let vocabularyById;
let previousExerciseId;
let lessonRequestId = 0;
let speechAudioPromise;
let speechAudioUrl;
let activeAudio;
let controlRevealTimer;
let exerciseSubmitted = false;

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

  if (["noun", "verb", "adjective"].includes(token.category) && vocabularyEntry) {
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

async function loadExerciseData() {
  const [grammarPoints, exercises, entriesById] = await Promise.all([
    fetchJson("data/jlpt-n5-grammar.json"),
    fetchJson("data/exercises.json"),
    vocabularyDataPromise
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
  const exercise = availableExercises[Math.floor(Math.random() * availableExercises.length)];

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

    if (!translationInput.hidden) {
      translationInput.focus({ preventScroll: true });
    }
  }, effectiveDelay);
}

function displayLesson(lesson) {
  hideControls();
  resetSpeechAudio();
  currentLesson = lesson;
  exerciseSubmitted = false;
  solutionElement.classList.remove("is-visible");
  solutionElement.textContent = "";
  actionButton.textContent = lesson.id === introductionId ? "次へ" : "送信";
  const sentenceDrawDuration = renderSentence(lesson.text, lesson.tokens);

  if (lesson.id !== introductionId) {
    globalThis.JlptN5Stats?.recordExerciseEncounter(lesson);
  }

  setSpeakButtonState("ready");
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
  exerciseSubmitted = true;
  const answer = document.createElement("p");
  const grammarSection = document.createElement("details");
  const grammarSummary = document.createElement("summary");
  const grammarList = document.createElement("ul");

  answer.className = "solution-answer";
  answer.textContent = currentLesson.solution;
  grammarSection.className = "solution-grammar";
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

    item.className = "solution-grammar-item";
    pattern.className = "solution-grammar-pattern";
    pattern.lang = "ja";
    pattern.textContent = grammarPoint.pattern;
    description.className = "solution-grammar-description";
    name.className = "solution-grammar-name";
    name.textContent = grammarPoint.name;
    meaning.className = "solution-grammar-meaning";
    meaning.textContent = grammarPoint.meaning;
    description.append(name, meaning);
    item.append(pattern, description);
    grammarList.append(item);
  }

  grammarSummary.textContent = `文法（${grammarList.childElementCount}）`;
  grammarSection.append(grammarSummary, grammarList);
  solutionElement.replaceChildren(answer, grammarSection);
  actionButton.textContent = "次へ";

  window.requestAnimationFrame(() => {
    solutionElement.classList.add("is-visible");
  });
}

function handleAction() {
  if (currentLesson.id === introductionId || exerciseSubmitted) {
    showNextExercise();
    return;
  }

  revealSolution();
}

function setSpeakButtonState(state) {
  const isLoading = state === "loading";
  const hasError = state === "error";
  const label = hasError ? "音声を再試行" : isLoading ? "音声を読み込み中" : "音声を再生";

  speakButton.disabled = isLoading;
  speakButton.classList.toggle("is-loading", isLoading);
  speakButton.classList.toggle("has-error", hasError);
  speakButton.setAttribute("aria-busy", String(isLoading));
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
profileMenu.addEventListener("click", () => closeProfileMenu(true));
profileMenuContainer.addEventListener("focusout", handleProfileMenuFocusOut);
document.addEventListener("pointerdown", handleOutsideProfileMenuClick);
actionButton.addEventListener("click", handleAction);
speakButton.addEventListener("click", speakSentence);
window.addEventListener("beforeunload", resetSpeechAudio);
displayInitialLesson();
