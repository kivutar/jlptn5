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

const sentenceElement = document.querySelector("#lesson-sentence");
const phrases = [sentence.slice(0, 10), sentence.slice(10, 20), sentence.slice(20)];
let characterIndex = 0;

phrases.forEach((phrase) => {
  const phraseElement = document.createElement("span");
  phraseElement.className = "phrase";

  phrase.forEach(({ character, reading }) => {
    const characterElement = document.createElement("span");
    characterElement.className = "character";
    characterElement.style.setProperty("--delay", `${characterIndex * 65}ms`);

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
