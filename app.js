const introduction = {
  id: "introduction",
  text: "日本語能力試験N5のレッスンへようこそ。さあ、始めましょう。",
  speechText: "日本語能力試験、エヌごのレッスンへようこそ。さあ、始めましょう。",
  readings: {
    日本語: "にほんご",
    能力: "のうりょく",
    試験: "しけん",
    始め: "はじめ"
  }
};

const characterDelay = 65;
const fadeDuration = 180;
const sentenceElement = document.querySelector("#lesson-sentence");
const lessonStage = document.querySelector("#lesson-stage");
const speakButton = document.querySelector("#speak-button");
const nextButton = document.querySelector("#next-button");
const translationInput = document.querySelector("#translation-input");
const exerciseDataPromise = loadExerciseData();

let characterIndex = 0;
let currentLesson = introduction;
let previousExerciseId;
let lessonRequestId = 0;
let speechAudioPromise;
let speechAudioUrl;
let activeAudio;

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
  tokenElement.className = "token";

  if (token.category) {
    tokenElement.dataset.category = token.category;
  }

  if (token.reading && /\p{Script=Han}/u.test(token.surface)) {
    const ruby = document.createElement("ruby");
    const annotation = document.createElement("rt");

    for (const character of token.surface) {
      ruby.append(createCharacterElement(character));
    }

    annotation.textContent = token.reading;
    ruby.append(annotation);
    tokenElement.append(ruby);
  } else {
    for (const character of token.surface) {
      tokenElement.append(createCharacterElement(character));
    }
  }

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
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`${url} could not be loaded.`);
  }

  return response.json();
}

async function loadLessonTokens(text) {
  const body = await fetchJson("/api/tokenize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text })
  });

  return body.tokens;
}

async function loadExerciseData() {
  const [grammarPoints, exercises] = await Promise.all([
    fetchJson("/data/jlpt-n5-grammar.json"),
    fetchJson("/data/exercises.json")
  ]);
  const grammarPointIds = new Set(grammarPoints.map(({ id }) => id));
  const validExercises = exercises.filter((exercise) => {
    return (
      exercise.grammarPointIds.length >= 2 &&
      exercise.grammarPointIds.every((id) => grammarPointIds.has(id))
    );
  });

  if (validExercises.length === 0) {
    throw new Error("No exercise references at least two known grammar points.");
  }

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

function displayLesson(lesson, tokens) {
  resetSpeechAudio();
  currentLesson = lesson;
  const tokensWithReadings = tokens.map((token) => {
    return {
      ...token,
      reading: lesson.readings?.[token.surface] || token.reading
    };
  });

  renderSentence(lesson.text, tokensWithReadings);
  setSpeakButtonState("ready");
}

async function displayInitialLesson() {
  const requestId = ++lessonRequestId;

  try {
    const tokens = await loadLessonTokens(introduction.text);

    if (requestId === lessonRequestId) {
      displayLesson(introduction, tokens);
    }
  } catch (error) {
    console.error(error);

    if (requestId === lessonRequestId) {
      displayLesson(introduction, [{ surface: introduction.text }]);
    }
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
  nextButton.disabled = true;
  lessonStage.classList.add("is-leaving");

  try {
    const exercise = await pickNextExercise();
    const tokensPromise = loadLessonTokens(exercise.text);

    await waitForFadeOut();
    const tokens = await tokensPromise;

    if (requestId !== lessonRequestId) {
      return;
    }

    displayLesson(exercise, tokens);
    translationInput.value = "";
    translationInput.hidden = false;
    lessonStage.classList.remove("is-leaving");
    translationInput.focus({ preventScroll: true });
  } catch (error) {
    console.error(error);
    lessonStage.classList.remove("is-leaving");
  } finally {
    nextButton.disabled = false;
  }
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
  const response = await fetch("/api/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: currentLesson.speechText || currentLesson.text })
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || "Speech could not be loaded.");
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

nextButton.addEventListener("click", showNextExercise);
speakButton.addEventListener("click", speakSentence);
window.addEventListener("beforeunload", resetSpeechAudio);
displayInitialLesson();
