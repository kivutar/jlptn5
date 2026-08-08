const sentence = [
  { character: "日", reading: "に" },
  { character: "本", reading: "ほん" },
  { character: "語", reading: "ご" },
  { character: "能", reading: "のう" },
  { character: "力", reading: "りょく" },
  { character: "試", reading: "し" },
  { character: "験", reading: "けん" },
  { character: "N" },
  { character: "5" },
  { character: "の" },
  { character: "レ" },
  { character: "ッ" },
  { character: "ス" },
  { character: "ン" },
  { character: "へ" },
  { character: "よ" },
  { character: "う" },
  { character: "こ" },
  { character: "そ" },
  { character: "。" },
  { character: "さ" },
  { character: "あ" },
  { character: "、" },
  { character: "始", reading: "はじ" },
  { character: "め" },
  { character: "ま" },
  { character: "し" },
  { character: "ょ" },
  { character: "う" },
  { character: "。" }
];

const speechText =
  "日本語能力試験、エヌごのレッスンへようこそ。さあ、始めましょう。";
const characterDelay = 65;
const sentenceElement = document.querySelector("#lesson-sentence");
const speakButton = document.querySelector("#speak-button");
let characterIndex = 0;

function createCharacterElement({ character, reading }) {
  const characterElement = document.createElement("span");
  characterElement.className = "character";
  characterElement.style.setProperty("--delay", `${characterIndex * characterDelay}ms`);

  if (reading) {
    const ruby = document.createElement("ruby");
    const annotation = document.createElement("rt");

    ruby.append(character);
    annotation.textContent = reading;
    ruby.append(annotation);
    characterElement.append(ruby);
  } else {
    characterElement.textContent = character;
  }

  characterIndex += 1;
  return characterElement;
}

function renderSentence(tokens) {
  sentenceElement.replaceChildren();
  characterIndex = 0;

  let sentenceOffset = 0;
  let phraseElement = document.createElement("span");
  phraseElement.className = "phrase";

  for (const token of tokens) {
    const tokenElement = document.createElement("span");
    tokenElement.className = "token";

    if (token.category) {
      tokenElement.dataset.category = token.category;
    }

    for (const character of token.surface) {
      const characterData = sentence[sentenceOffset];

      if (!characterData || characterData.character !== character) {
        throw new Error("Tokenizer output does not match the lesson sentence.");
      }

      tokenElement.append(createCharacterElement(characterData));
      sentenceOffset += 1;
    }

    phraseElement.append(tokenElement);

    if (token.surface.endsWith("。")) {
      sentenceElement.append(phraseElement);
      phraseElement = document.createElement("span");
      phraseElement.className = "phrase";
    }
  }

  if (phraseElement.hasChildNodes()) {
    sentenceElement.append(phraseElement);
  }

  if (sentenceOffset !== sentence.length) {
    throw new Error("Tokenizer output does not cover the lesson sentence.");
  }
}

async function loadLessonTokens() {
  const text = sentence.map(({ character }) => character).join("");
  const response = await fetch("/api/tokenize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text })
  });

  if (!response.ok) {
    throw new Error("The lesson sentence could not be tokenized.");
  }

  const body = await response.json();
  return body.tokens;
}

loadLessonTokens()
  .then(renderSentence)
  .catch((error) => {
    console.error(error);
    renderSentence([{ surface: sentence.map(({ character }) => character).join("") }]);
  });

let speechAudioPromise;
let speechAudioUrl;

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
    body: JSON.stringify({ text: speechText })
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

    const audio = await speechAudioPromise;
    audio.currentTime = 0;
    await audio.play();
    setSpeakButtonState("ready");
  } catch (error) {
    console.error(error);
    setSpeakButtonState("error");
  }
}

speakButton.addEventListener("click", speakSentence);
window.addEventListener("beforeunload", () => {
  if (speechAudioUrl) {
    URL.revokeObjectURL(speechAudioUrl);
  }
});
