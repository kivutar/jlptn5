import { readFile, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { XMLParser } from "fast-xml-parser";

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");
const curriculumPath = join(rootDirectory, "data", "source", "rikkyo-n5-kanji.json");
const vocabularyPath = join(rootDirectory, "data", "jlpt-n5-vocabulary.json");
const contextPath = join(rootDirectory, "data", "kanji-contexts.json");
const outputPath = join(rootDirectory, "data", "jlpt-n5-kanji.json");
const kanjidicUrl = "https://www.edrdg.org/kanjidic/kanjidic2.xml.gz";
const sourceArgumentIndex = process.argv.indexOf("--source");
const sourcePath = sourceArgumentIndex === -1
  ? undefined
  : process.argv[sourceArgumentIndex + 1];

if (sourceArgumentIndex !== -1 && !sourcePath) {
  throw new Error("--source needs a KANJIDIC2 XML or XML.GZ path.");
}

function asArray(value) {
  if (value === undefined) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function katakanaToHiragana(text) {
  return text.replace(/[ァ-ヶ]/g, (character) => {
    return String.fromCharCode(character.charCodeAt(0) - 0x60);
  });
}

function unique(values) {
  return [...new Set(values)];
}

function getNodeText(node) {
  return typeof node === "string" ? node : node?.["#text"];
}

function normalizeOnReading(reading) {
  return katakanaToHiragana(reading.replaceAll("-", ""));
}

function normalizeKunReading(reading) {
  return reading.replace(/^-/, "").split(".")[0].replace(/-$/, "");
}

function normalizeForComparison(text, foldVoicing) {
  const normalized = katakanaToHiragana(text).normalize("NFD");

  return (foldVoicing ? normalized.replace(/[\u3099\u309a]/g, "") : normalized)
    .normalize("NFC");
}

function createVocabularyForms(vocabulary) {
  return vocabulary.flatMap((entry) => [
    { surface: entry.term, reading: entry.reading },
    ...(entry.variants || []).map((surface) => ({ surface, reading: entry.reading })),
    ...(entry.inflections || [])
  ]);
}

function hasReadingEvidence(
  character,
  reading,
  fullKunReading,
  vocabularyForms,
  foldVoicing = false
) {
  const normalizedReading = normalizeForComparison(reading, foldVoicing);
  const normalizedFullKunReading = fullKunReading
    ? normalizeForComparison(fullKunReading, foldVoicing)
    : undefined;

  return vocabularyForms.some((form) => {
    if (!form.surface.includes(character)) {
      return false;
    }

    const wordReading = normalizeForComparison(form.reading, foldVoicing);

    if (normalizedFullKunReading && wordReading.includes(normalizedFullKunReading)) {
      return true;
    }

    const wordKanji = [...form.surface].filter((candidate) => /\p{Script=Han}/u.test(candidate));
    const characterIndex = wordKanji.indexOf(character);

    if (wordKanji.length === 1 && form.surface === character) {
      return wordReading === normalizedReading;
    }

    if (characterIndex === 0 && wordReading.startsWith(normalizedReading)) {
      return true;
    }

    if (
      characterIndex === wordKanji.length - 1 &&
      wordReading.endsWith(normalizedReading)
    ) {
      return true;
    }

    return normalizedReading.length >= 2 && wordReading.includes(normalizedReading);
  });
}

async function loadKanjidicXml() {
  if (sourcePath) {
    const contents = await readFile(sourcePath);
    return extname(sourcePath) === ".gz" ? gunzipSync(contents).toString("utf8") : contents.toString("utf8");
  }

  const response = await fetch(kanjidicUrl);

  if (!response.ok) {
    throw new Error(`KANJIDIC2 download failed with HTTP ${response.status}.`);
  }

  return gunzipSync(Buffer.from(await response.arrayBuffer())).toString("utf8");
}

const [curriculum, vocabulary, contexts, xml] = await Promise.all([
  readFile(curriculumPath, "utf8").then(JSON.parse),
  readFile(vocabularyPath, "utf8").then(JSON.parse),
  readFile(contextPath, "utf8").then(JSON.parse),
  loadKanjidicXml()
]);
const vocabularyForms = createVocabularyForms([...vocabulary, ...contexts]);
const parser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: true
});
const kanjidic = parser.parse(xml).kanjidic2;
const entriesByCharacter = new Map(
  kanjidic.character.map((entry) => [entry.literal, entry])
);
const result = [];
const seenCharacters = new Set();

for (const stage of curriculum) {
  for (const character of stage.characters) {
    if (seenCharacters.has(character)) {
      throw new Error(`${character} appears more than once in the Rikkyo curriculum.`);
    }

    const source = entriesByCharacter.get(character);

    if (!source) {
      throw new Error(`${character} is missing from KANJIDIC2.`);
    }

    const readingGroups = asArray(source.reading_meaning?.rmgroup);
    const readings = readingGroups.flatMap((group) => asArray(group.reading));
    const meanings = readingGroups
      .flatMap((group) => asArray(group.meaning))
      .filter((meaning) => typeof meaning === "string");
    const vocabularyMeaning = vocabulary.find((entry) => {
      return entry.scope === "core" && entry.term === character;
    })?.meaning;
    const allOnReadings = unique(readings
      .filter((reading) => reading?.["@_r_type"] === "ja_on")
      .map(getNodeText)
      .filter(Boolean)
      .map(normalizeOnReading));
    const kunReadingCandidates = readings
      .filter((reading) => reading?.["@_r_type"] === "ja_kun")
      .map(getNodeText)
      .filter(Boolean);
    const allKunReadings = unique(kunReadingCandidates.map(normalizeKunReading));
    let onReadings = allOnReadings.filter((reading) => {
      return hasReadingEvidence(character, reading, undefined, vocabularyForms, true);
    });
    let kunReadings = unique(kunReadingCandidates
      .filter((reading) => {
        const normalized = normalizeKunReading(reading);
        const fullReading = reading.replaceAll(".", "").replaceAll("-", "");
        return hasReadingEvidence(character, normalized, fullReading, vocabularyForms);
      })
      .map(normalizeKunReading));
    const codePoint = character.codePointAt(0).toString(16).padStart(4, "0");

    if (onReadings.length + kunReadings.length === 0) {
      onReadings = allOnReadings.slice(0, 1);

      if (onReadings.length === 0) {
        kunReadings = allKunReadings.slice(0, 1);
      }
    }

    if (meanings.length === 0 || onReadings.length + kunReadings.length === 0) {
      throw new Error(`${character} has incomplete KANJIDIC2 metadata.`);
    }

    seenCharacters.add(character);
    result.push({
      id: `kanji-${codePoint}`,
      character,
      meaning: vocabularyMeaning || meanings[0],
      stage: stage.stage,
      onReadings,
      kunReadings
    });
  }
}

await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(
  `Updated ${result.length} kanji from KANJIDIC2 ${kanjidic.header.date_of_creation}.`
);
