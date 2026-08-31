import assert from "node:assert/strict";
import test from "node:test";
import {
  createSpeechRequestBody,
  createVocabularySpeechRequest,
  createVocabularyVoiceItems,
  formatVocabularyVoiceCoverage,
  inspectVocabularyVoiceFiles,
  parseVoiceGenerationArguments,
  processVoiceGenerationBatch,
  summarizeVocabularyVoiceCoverage
} from "../scripts/generate-voices.js";

test("voice generation is unlimited by default", () => {
  assert.deepEqual(parseVoiceGenerationArguments([]), {
    coverageOnly: false,
    generateAll: false,
    generationLimit: Number.POSITIVE_INFINITY,
    showHelp: false,
    target: "lessons"
  });
});

test("voice generation accepts small request limits", () => {
  assert.equal(parseVoiceGenerationArguments(["--limit", "1"]).generationLimit, 1);
  assert.equal(parseVoiceGenerationArguments(["--limit=2"]).generationLimit, 2);
  assert.equal(parseVoiceGenerationArguments(["--limit", "3"]).generationLimit, 3);
});

test("voice generation can safely force one exact item", () => {
  assert.deepEqual(
    parseVoiceGenerationArguments(["--id", "left-home-without-key", "--force"]),
    {
      coverageOnly: false,
      force: true,
      generateAll: false,
      generationLimit: Number.POSITIVE_INFINITY,
      itemId: "left-home-without-key",
      showHelp: false,
      target: "lessons"
    }
  );
  assert.equal(
    parseVoiceGenerationArguments([
      "--target=vocabulary",
      "--id=vocab-example"
    ]).itemId,
    "vocab-example"
  );
});

test("vocabulary voice generation requires an explicit spending boundary", () => {
  assert.throws(
    () => parseVoiceGenerationArguments(["--target", "vocabulary"]),
    /requires --limit COUNT or explicit --all/u
  );
  assert.deepEqual(
    parseVoiceGenerationArguments(["--target=vocabulary", "--limit", "3"]),
    {
      coverageOnly: false,
      generateAll: false,
      generationLimit: 3,
      showHelp: false,
      target: "vocabulary"
    }
  );
  assert.deepEqual(
    parseVoiceGenerationArguments(["--target", "vocabulary", "--all"]),
    {
      coverageOnly: false,
      generateAll: true,
      generationLimit: Number.POSITIVE_INFINITY,
      showHelp: false,
      target: "vocabulary"
    }
  );
  assert.deepEqual(
    parseVoiceGenerationArguments(["--target", "vocabulary", "--coverage"]),
    {
      coverageOnly: true,
      generateAll: false,
      generationLimit: Number.POSITIVE_INFINITY,
      showHelp: false,
      target: "vocabulary"
    }
  );
});

test("voice generation rejects unsafe limits and unknown options", () => {
  for (const arguments_ of [
    ["--limit"],
    ["--limit", "0"],
    ["--limit", "-1"],
    ["--limit", "1.5"],
    ["--limit", "nope"],
    ["--limit", "1", "--limit", "2"],
    ["--limit", "1", "--all"],
    ["--coverage", "--limit", "1"],
    ["--coverage"],
    ["--coverage", "--id", "one"],
    ["--force"],
    ["--id"],
    ["--id", "../unsafe"],
    ["--id", "one", "--id", "two"],
    ["--id", "one", "--force", "--force"],
    ["--target", "unknown", "--limit", "1"],
    ["--target", "lessons", "--target", "vocabulary", "--limit", "1"],
    ["--unknown"]
  ]) {
    assert.throws(() => parseVoiceGenerationArguments(arguments_));
  }
});

test("voice generation exposes command help", () => {
  assert.equal(parseVoiceGenerationArguments(["--help"]).showHelp, true);
  assert.equal(parseVoiceGenerationArguments(["-h"]).showHelp, true);
  assert.equal(
    parseVoiceGenerationArguments(["--target", "vocabulary", "--help"]).showHelp,
    true
  );
});

test("vocabulary voice items are core-first and use stable filenames", () => {
  const items = createVocabularyVoiceItems([
    {
      id: "vocab-supplemental",
      term: "試験",
      reading: "しけん",
      meaning: "exam",
      scope: "supplemental"
    },
    {
      id: "vocab-core",
      term: "雨",
      reading: "あめ",
      meaning: "rain",
      scope: "core"
    }
  ]);

  assert.deepEqual(items.map(({ id }) => id), ["vocab-core", "vocab-supplemental"]);
  assert.deepEqual(items.map(({ audio }) => audio), [
    "assets/voices/vocab/ame.m4a",
    "assets/voices/vocab/shiken.m4a"
  ]);
});

test("vocabulary speech requests use the configured reading and lexical context", () => {
  const firstDay = createVocabularySpeechRequest({
    id: "first-day",
    term: "一日",
    reading: "ついたち",
    meaning: "first day of the month",
    partOfSpeech: "number"
  });
  const duration = createVocabularySpeechRequest({
    id: "one-day",
    term: "一日",
    reading: "いちにち",
    meaning: "one day (duration)",
    partOfSpeech: "number"
  });
  const counter = createVocabularySpeechRequest({
    id: "people-counter",
    term: "～人",
    reading: "～にん",
    meaning: "counter for people",
    partOfSpeech: "counter"
  });
  const metadata = JSON.parse(firstDay.messages[1].content);
  const body = createSpeechRequestBody(firstDay);

  assert.equal(firstDay.spokenText, "ついたち");
  assert.deepEqual(metadata, {
    spelling: "一日",
    reading: "ついたち",
    meaning: "first day of the month",
    partOfSpeech: "number"
  });
  assert.match(firstDay.messages[0].content, /Pronounce the value of reading exactly once/u);
  assert.notDeepEqual(firstDay.cacheSource, duration.cacheSource);
  assert.equal(counter.spokenText, "にん");
  assert.deepEqual(body.modalities, ["text", "audio"]);
  assert.deepEqual(body.audio, { voice: "marin", format: "wav" });
  assert.equal(body.messages, firstDay.messages);
  assert.equal(body.temperature, 0);
  assert.ok(firstDay.validationOptions.maximumDuration < 4);
  assert.ok(firstDay.validationOptions.maximumTrailingSilence < 0.5);
});

test("vocabulary voice coverage reports partial files without generating audio", () => {
  const vocabulary = [
    {
      id: "vocab-core",
      term: "雨",
      reading: "あめ",
      meaning: "rain",
      scope: "core",
      voiceSlug: "ame-rain"
    },
    {
      id: "vocab-supplemental",
      term: "試験",
      reading: "しけん",
      meaning: "exam",
      scope: "supplemental"
    },
    {
      id: "vocab-skipped",
      term: "飴",
      reading: "あめ",
      meaning: "candy",
      scope: "core",
      voiceSlug: "ame-candy",
      skipVoiceGeneration: true
    },
    {
      id: "vocab-invalid",
      term: "声",
      reading: "こえ",
      meaning: "voice",
      scope: "supplemental"
    }
  ];
  const summary = summarizeVocabularyVoiceCoverage(
    vocabulary,
    new Map([
      ["ame-rain.m4a", { size: 1536, valid: true }],
      ["koe.m4a", { size: 200, valid: false }]
    ])
  );

  assert.deepEqual(summary, {
    core: { available: 1, total: 2 },
    supplemental: { available: 0, total: 2 },
    available: 1,
    total: 4,
    missing: 1,
    invalid: 1,
    skipped: 1,
    bytes: 1536
  });
  assert.equal(formatVocabularyVoiceCoverage(summary), [
    "Vocabulary voice coverage:",
    "  Core: 1/2",
    "  Supplemental: 0/2",
    "  Total: 1/4",
    "  Missing: 1",
    "  Invalid: 1",
    "  Skipped: 1",
    "  Size: 1.5 KiB"
  ].join("\n"));
});

test("vocabulary coverage validates files instead of trusting their size", async () => {
  const vocabulary = [
    {
      id: "vocab-valid",
      term: "雨",
      reading: "あめ",
      meaning: "rain",
      scope: "core"
    },
    {
      id: "vocab-invalid",
      term: "声",
      reading: "こえ",
      meaning: "voice",
      scope: "core"
    },
    {
      id: "vocab-missing",
      term: "空",
      reading: "そら",
      meaning: "sky",
      scope: "core"
    }
  ];
  const validations = [];
  const warnings = [];
  const voiceFiles = await inspectVocabularyVoiceFiles(vocabulary, {
    voiceFileSizes: new Map([
      ["ame.m4a", 1000],
      ["koe.m4a", 900]
    ]),
    validateM4a: async (path, reading, options) => {
      validations.push({ path, reading, options });

      if (path.endsWith("koe.m4a")) {
        throw new Error("not valid audio");
      }
    },
    warn: (message) => warnings.push(message)
  });

  assert.deepEqual(voiceFiles, new Map([
    ["ame.m4a", { size: 1000, valid: true }],
    ["koe.m4a", { size: 900, valid: false }]
  ]));
  assert.deepEqual(validations.map(({ reading }) => reading), ["あめ", "こえ"]);
  assert.equal(validations.every(({ options }) => {
    return options.maximumTrailingSilence < 0.5;
  }), true);
  assert.deepEqual(warnings, [
    "Invalid vocabulary voice koe.m4a: not valid audio"
  ]);
});

test("the batch limit counts only newly generated voices", async () => {
  const prepared = [];
  const outcomes = new Map([
    ["existing", false],
    ["cached", false],
    ["missing-a", true],
    ["missing-b", true],
    ["missing-c", true]
  ]);
  const generatedVoiceCount = await processVoiceGenerationBatch(
    [...outcomes.keys()],
    2,
    async (lesson) => {
      prepared.push(lesson);
      return outcomes.get(lesson);
    }
  );

  assert.equal(generatedVoiceCount, 2);
  assert.deepEqual(prepared, ["existing", "cached", "missing-a", "missing-b"]);
});
