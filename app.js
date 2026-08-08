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
const phrases = [sentence.slice(0, 10), sentence.slice(10, 20), sentence.slice(20)];
let characterIndex = 0;

phrases.forEach((phrase) => {
  const phraseElement = document.createElement("span");
  phraseElement.className = "phrase";

  phrase.forEach(({ character, reading }) => {
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

    phraseElement.append(characterElement);
    characterIndex += 1;
  });

  sentenceElement.append(phraseElement);
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
